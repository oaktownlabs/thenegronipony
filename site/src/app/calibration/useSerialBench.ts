import {
  type CompactSerialFrameV1,
  canonicalizeSerialFrame,
  type DeviceFrameV1,
  type SerialCanonicalContextV1,
} from '@shared/calibration';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveSample, TrialState } from './types';

const SERIAL_BAUD = 250_000;
const MAX_LINE_BYTES = 1_024;

type SerialStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';

interface ReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void>;
  releaseLock(): void;
}

interface WriterLike {
  write(data: Uint8Array): Promise<void>;
  releaseLock(): void;
}

interface SerialPortLike {
  readable: { getReader(): ReaderLike } | null;
  writable: { getWriter(): WriterLike } | null;
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
}

interface SerialApiLike {
  requestPort(): Promise<SerialPortLike>;
}

interface DeviceIdentity {
  deviceId: string;
  bootId: string;
  firmwareVersion: string;
  protocolVersion: string;
  loadCellCalibrated: boolean;
  loadCellCalibrationId: string | null;
  countsPerGramNumerator: number | null;
  countsPerGramDenominator: number | null;
  deviceIdentityProvisioned: boolean;
  configuredMassLimitMg: number | null;
}

interface SerialFrame {
  schema?: unknown;
  type?: unknown;
  kind?: unknown;
  deviceId?: unknown;
  bootId?: unknown;
  boot?: unknown;
  firmwareVersion?: unknown;
  protocolVersion?: unknown;
  deviceMs?: unknown;
  monotonicMs?: unknown;
  seq?: unknown;
  sequence?: unknown;
  rawAdc?: unknown;
  massMg?: unknown;
  dutyBasisPoints?: unknown;
  dutyBp?: unknown;
  flowUlPerSec?: unknown;
  pumpModelId?: unknown;
  state?: unknown;
  trialState?: unknown;
  samples?: unknown;
  v?: unknown;
  t?: unknown;
  dev?: unknown;
  fw?: unknown;
  proto?: unknown;
  ms?: unknown;
  raw?: unknown;
  mg?: unknown;
  duty?: unknown;
  pump?: unknown;
  lastn?: unknown;
}

const isTrialState = (value: unknown): value is TrialState =>
  typeof value === 'string' &&
  ['boot', 'idle', 'tare', 'armed', 'running', 'settling', 'complete', 'fault'].includes(value);

const isCompactSerialFrame = (frame: SerialFrame): frame is CompactSerialFrameV1 =>
  frame.v === 1 &&
  typeof frame.t === 'string' &&
  ['hello', 'hb', 'state', 's', 'fault', 'ack'].includes(frame.t) &&
  typeof frame.dev === 'string' &&
  typeof frame.boot === 'string' &&
  Number.isInteger(frame.seq) &&
  Number.isInteger(frame.ms);

const localSample = (frame: DeviceFrameV1, pumpCode: unknown): LiveSample | null => {
  if (frame.type !== 'sample') return null;
  return {
    receivedAt: Date.now(),
    deviceMs: frame.deviceMs,
    sequence: frame.seq,
    rawAdc: frame.rawAdc[0] ?? null,
    massMg: frame.massMg,
    dutyBasisPoints: frame.dutyBasisPoints,
    flowUlPerSec: null,
    pumpModelId:
      pumpCode === 'k' ? 'kamoer-kphm600-12b3b17' : pumpCode === 'g' ? 'gikfun-ae1207' : null,
    trialState: isTrialState(frame.state) ? frame.state : 'idle',
    simulated: false,
  };
};

const serialApi = (): SerialApiLike | null => {
  const candidate = navigator as Navigator & { serial?: SerialApiLike };
  return candidate.serial ?? null;
};

export interface UseSerialBenchOptions {
  canonicalContext?: SerialCanonicalContextV1;
  onFrame?: (frame: DeviceFrameV1) => void;
  onSample?: (sample: LiveSample) => void;
}

export type TerminalContextDecision = 'keep' | 'release' | 'await_fault_code';

/**
 * The AVR emits one context-bearing terminal state, then clears its local
 * trial. FAULT is followed immediately by a separate compact fault-code frame,
 * so its context must survive exactly one more frame.
 */
export const terminalContextDecision = (frame: DeviceFrameV1): TerminalContextDecision => {
  if (frame.type === 'fault' && frame.trialId !== null) return 'release';
  if (frame.type !== 'state' || frame.trialId === null) return 'keep';
  if (frame.state === 'fault') return 'await_fault_code';
  if (frame.state === 'complete' || frame.state === 'idle') return 'release';
  return 'keep';
};

export function useSerialBench({
  canonicalContext,
  onFrame,
  onSample,
}: UseSerialBenchOptions = {}) {
  const [status, setStatus] = useState<SerialStatus>(() =>
    typeof navigator !== 'undefined' && serialApi() ? 'disconnected' : 'unsupported',
  );
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [lastSequence, setLastSequence] = useState<number | null>(null);
  const [benchState, setBenchState] = useState<TrialState>('boot');
  const [lastCommandAck, setLastCommandAck] = useState<{
    id: string | null;
    ok: boolean;
    code: string;
  } | null>(null);
  const [faultCode, setFaultCode] = useState<string | null>(null);
  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReaderLike | null>(null);
  const disposedRef = useRef(false);
  const onFrameRef = useRef(onFrame);
  const onSampleRef = useRef(onSample);
  const commandSequenceRef = useRef(0);
  const canonicalContextRef = useRef(canonicalContext);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    onFrameRef.current = onFrame;
    onSampleRef.current = onSample;
    canonicalContextRef.current = canonicalContext;
  }, [canonicalContext, onFrame, onSample]);

  const writeFrame = useCallback(async (command: Record<string, unknown>) => {
    const port = portRef.current;
    if (!port?.writable) throw new Error('The bench serial link is not writable.');
    const writer = port.writable.getWriter();
    try {
      const payload = `${JSON.stringify(command)}\n`;
      if (payload.length > 191)
        throw new Error('The host command exceeds the firmware line limit.');
      await writer.write(new TextEncoder().encode(payload));
    } finally {
      writer.releaseLock();
    }
  }, []);

  const enqueueFrame = useCallback(
    (frame: Record<string, unknown>) => {
      const queued = writeQueueRef.current.then(() => writeFrame(frame));
      writeQueueRef.current = queued.catch(() => undefined);
      return queued;
    },
    [writeFrame],
  );

  const send = useCallback(
    async (
      type: 'hb' | 'tare' | 'run' | 'stop' | 'clear',
      fields: Record<string, unknown> = {},
    ) => {
      const n = commandSequenceRef.current + 1;
      commandSequenceRef.current = n;
      await enqueueFrame({ v: 1, t: type, id: `${type}-${n.toString(36)}`, n, ...fields });
    },
    [enqueueFrame],
  );

  const readLoop = useCallback(async (port: SerialPortLike) => {
    if (!port.readable) throw new Error('The bench serial link is not readable.');
    const reader = port.readable.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let pending = '';
    let awaitingTerminalFaultCode = false;

    try {
      while (!disposedRef.current) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        if (pending.length > MAX_LINE_BYTES * 4) {
          pending = '';
          throw new Error('The device sent an oversized serial frame.');
        }

        let newline = pending.indexOf('\n');
        while (newline >= 0) {
          const line = pending.slice(0, newline).trim();
          pending = pending.slice(newline + 1);
          newline = pending.indexOf('\n');
          if (!line) continue;
          if (line.length > MAX_LINE_BYTES) throw new Error('The device sent an oversized line.');

          let frame: SerialFrame;
          try {
            frame = JSON.parse(line) as SerialFrame;
          } catch {
            continue;
          }
          if (!isCompactSerialFrame(frame)) continue;
          if (awaitingTerminalFaultCode && frame.t !== 'fault') {
            canonicalContextRef.current = {
              ...canonicalContextRef.current,
              trialId: null,
            };
            awaitingTerminalFaultCode = false;
          }
          let canonical: DeviceFrameV1;
          try {
            canonical = canonicalizeSerialFrame(frame, canonicalContextRef.current);
          } catch {
            continue;
          }
          setLastFrameAt(Date.now());
          setLastSequence(canonical.seq);
          onFrameRef.current?.(canonical);

          const contextDecision = terminalContextDecision(canonical);
          if (contextDecision === 'await_fault_code') {
            awaitingTerminalFaultCode = true;
          } else if (contextDecision === 'release') {
            canonicalContextRef.current = {
              ...canonicalContextRef.current,
              trialId: null,
            };
            awaitingTerminalFaultCode = false;
          }

          if ('state' in canonical) setBenchState(canonical.state);
          if (canonical.type === 'command_ack') {
            setLastCommandAck({
              id: canonical.commandId ?? null,
              ok: canonical.code === undefined,
              code: canonical.code ?? 'ok',
            });
          }
          if (canonical.type === 'fault') setFaultCode(canonical.code ?? 'unknown_fault');
          else if ('state' in canonical && canonical.state !== 'fault') setFaultCode(null);

          if (canonical.type === 'hello') {
            commandSequenceRef.current = canonical.lastAcceptedCommandNumber;
            setIdentity({
              deviceId: canonical.deviceId,
              bootId: canonical.bootId,
              firmwareVersion: canonical.firmwareVersion,
              protocolVersion: canonical.protocolVersion,
              loadCellCalibrated: canonical.loadCellCalibrated,
              loadCellCalibrationId: canonical.loadCellCalibrationId,
              countsPerGramNumerator: canonical.countsPerGramNumerator,
              countsPerGramDenominator: canonical.countsPerGramDenominator,
              deviceIdentityProvisioned: canonical.deviceIdentityProvisioned,
              configuredMassLimitMg: canonical.configuredMassLimitMg,
            });
          }

          const sample = localSample(canonical, 'pump' in frame ? frame.pump : null);
          if (sample) onSampleRef.current?.(sample);
        }
      }
    } finally {
      reader.releaseLock();
      readerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    disposedRef.current = true;
    try {
      if (portRef.current?.writable) {
        await send('stop');
      }
    } catch {
      // Firmware watchdog is the final authority if the disconnect is abrupt.
    }
    try {
      await readerRef.current?.cancel();
    } catch {
      // The port may already have vanished.
    }
    try {
      await portRef.current?.close();
    } catch {
      // The operating system may already have closed the port.
    }
    portRef.current = null;
    setIdentity(null);
    setLastSequence(null);
    setBenchState('boot');
    setLastCommandAck(null);
    setFaultCode(null);
    setStatus(serialApi() ? 'disconnected' : 'unsupported');
  }, [send]);

  const connect = useCallback(async () => {
    const api = serialApi();
    if (!api) {
      setStatus('unsupported');
      return;
    }
    setStatus('connecting');
    setLastError(null);
    disposedRef.current = false;
    try {
      const port = await api.requestPort();
      await port.open({ baudRate: SERIAL_BAUD, bufferSize: 65_536 });
      portRef.current = port;
      setStatus('connected');
      void readLoop(port).catch((error: unknown) => {
        if (disposedRef.current) return;
        setLastError(
          error instanceof Error ? error.message : 'The serial link stopped unexpectedly.',
        );
        setStatus('error');
      });
      await enqueueFrame({ v: 1, t: 'hello', id: 'host-hello' });
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'The serial port could not be opened.');
      setStatus('error');
    }
  }, [enqueueFrame, readLoop]);

  const setTrialContext = useCallback((trialId: string | null) => {
    canonicalContextRef.current = { ...canonicalContextRef.current, trialId };
  }, []);

  useEffect(() => {
    if (status !== 'connected' || !identity) return;
    const timer = window.setInterval(() => {
      void send('hb').catch(() => {
        // The read loop and the firmware watchdog own disconnect handling.
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [identity, send, status]);

  useEffect(
    () => () => {
      disposedRef.current = true;
      void readerRef.current?.cancel();
    },
    [],
  );

  return {
    status,
    identity,
    lastError,
    lastFrameAt,
    lastSequence,
    benchState,
    lastCommandAck,
    faultCode,
    connect,
    disconnect,
    send,
    setTrialContext,
    baudRate: SERIAL_BAUD,
  };
}
