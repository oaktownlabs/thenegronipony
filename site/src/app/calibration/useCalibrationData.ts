import type { BenchStreamFrameV1, DeviceFrameV1, TrialStreamFrameV1 } from '@shared/calibration';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEmptyBootstrap } from './fallback';
import { deriveStreamHealth } from './health';
import type { CalibrationBootstrap, LiveSample, Presence } from './types';

const BENCH_ID = 'bench-01';

type ApiState = 'loading' | 'ready' | 'unavailable';

const isBootstrap = (value: unknown): value is CalibrationBootstrap => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CalibrationBootstrap>;
  return (
    candidate.schema === 'tnp.calibration.bootstrap.v1' &&
    candidate.benchId === BENCH_ID &&
    Array.isArray(candidate.pumps) &&
    candidate.pumps.length === 2 &&
    Array.isArray(candidate.recipes) &&
    candidate.recipes.length === 6
  );
};

const isBenchFrame = (value: unknown): value is BenchStreamFrameV1 => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BenchStreamFrameV1>;
  return candidate.schema === 'tnp.calibration.bench-stream.v1' && candidate.benchId === BENCH_ID;
};

const isTrialFrame = (value: unknown, trialId: string): value is TrialStreamFrameV1 => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TrialStreamFrameV1>;
  return (
    candidate.schema === 'tnp.calibration.stream.v1' &&
    candidate.trialId === trialId &&
    Array.isArray(candidate.events)
  );
};

export function useCalibrationData(simulationEnabled: boolean) {
  const [bootstrap, setBootstrap] = useState<CalibrationBootstrap>(createEmptyBootstrap);
  const [apiState, setApiState] = useState<ApiState>('loading');
  const [viewerReceivedAt, setViewerReceivedAt] = useState<number | null>(null);
  const [latestSample, setLatestSample] = useState<LiveSample | null>(null);
  const [recentSamples, setRecentSamples] = useState<LiveSample[]>([]);
  const [now, setNow] = useState(Date.now());
  const reconnectAttempt = useRef(0);

  const acceptLocalSample = useCallback((sample: LiveSample) => {
    setLatestSample(sample);
    setRecentSamples((current) => [...current.slice(-11), sample]);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (simulationEnabled) {
      const startedAt = performance.now();
      let sequence = 0;
      const timer = window.setInterval(() => {
        const elapsedMs = performance.now() - startedAt;
        const phase = (elapsedMs % 18_000) / 18_000;
        const dutyBasisPoints = phase < 0.15 ? 0 : Math.round(2_500 + phase * 6_500);
        const massMg = phase < 0.15 ? 0 : Math.round((phase - 0.15) * 72_000);
        const timestamp = new Date().toISOString();
        sequence += 1;
        const presence: Presence = {
          producerLeasePresent: true,
          producerLastSeenAt: timestamp,
          expectedEventIntervalMs: 250,
          deviceId: 'simulator-not-hardware',
          bootId: 'simulation-session',
          latestDeviceEventReceivedAt: timestamp,
          latestDurableAt: timestamp,
          durabilityScope: 'bench_do',
          lastDurablyAcknowledgedDeviceSeq: sequence,
          latestProjectedAt: timestamp,
          lastProjectedDeviceSeq: sequence,
          publishedStreamSeq: sequence,
        };
        setBootstrap((current) => ({
          ...current,
          serverNow: timestamp,
          presence,
          activeTrialId: 'SIMULATION-ONLY',
        }));
        setLatestSample({
          receivedAt: Date.now(),
          deviceMs: Math.round(elapsedMs),
          sequence,
          rawAdc: null,
          massMg,
          dutyBasisPoints,
          flowUlPerSec: null,
          pumpModelId: phase < 0.58 ? 'kamoer-kphm600-12b3b17' : 'gikfun-ae1207',
          trialState: dutyBasisPoints === 0 ? 'tare' : 'running',
          simulated: true,
        });
        setRecentSamples((current) => [
          ...current.slice(-11),
          {
            receivedAt: Date.now(),
            deviceMs: Math.round(elapsedMs),
            sequence,
            rawAdc: null,
            massMg,
            dutyBasisPoints,
            flowUlPerSec: null,
            pumpModelId: phase < 0.58 ? 'kamoer-kphm600-12b3b17' : 'gikfun-ae1207',
            trialState: dutyBasisPoints === 0 ? 'tare' : 'running',
            simulated: true,
          },
        ]);
        setViewerReceivedAt(Date.now());
        setApiState('ready');
      }, 250);
      return () => window.clearInterval(timer);
    }

    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/v1/calibration/bootstrap?bench=${BENCH_ID}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Bootstrap returned ${response.status}`);
        const body: unknown = await response.json();
        if (!isBootstrap(body)) throw new Error('Bootstrap schema did not validate');
        setBootstrap(body);
        setViewerReceivedAt(Date.now());
        setApiState('ready');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setApiState('unavailable');
      }
    };
    void load();
    return () => controller.abort();
  }, [simulationEnabled]);

  useEffect(() => {
    const trialId = bootstrap.activeTrialId;
    if (simulationEnabled || !trialId || typeof WebSocket === 'undefined') return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;
    let disposed = false;

    const acceptEvent = (event: DeviceFrameV1, provisionalFlowUlPerSec: number | null) => {
      if (event.type !== 'sample') return;
      const pumpModelId =
        bootstrap.pumps.find((pump) => pump.selectedSpecimenId === event.pumpSpecimenId)
          ?.pumpModelId ?? null;
      acceptLocalSample({
        receivedAt: Date.now(),
        deviceMs: event.deviceMs,
        sequence: event.seq,
        rawAdc: event.rawAdc[0] ?? null,
        massMg: event.massMg,
        dutyBasisPoints: event.dutyBasisPoints,
        flowUlPerSec: provisionalFlowUlPerSec,
        pumpModelId,
        trialState: event.state,
        simulated: false,
      });
    };

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/v1/trials/${encodeURIComponent(trialId)}/live`,
      );
      socket.addEventListener('open', () => {
        attempt = 0;
      });
      socket.addEventListener('message', (message) => {
        try {
          const body: unknown = JSON.parse(String(message.data));
          if (!isTrialFrame(body, trialId)) return;
          for (const event of body.events) acceptEvent(event, body.latest.provisionalFlowUlPerSec);
          setViewerReceivedAt(Date.now());
        } catch {
          // Invalid public frames are ignored and cannot mutate operator state.
        }
      });
      socket.addEventListener('close', () => {
        if (disposed) return;
        const delay = Math.min(15_000, 500 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close(1000, 'trial changed');
    };
  }, [acceptLocalSample, bootstrap.activeTrialId, bootstrap.pumps, simulationEnabled]);

  useEffect(() => {
    if (simulationEnabled || typeof WebSocket === 'undefined') return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(
        `${protocol}//${window.location.host}/api/v1/benches/${BENCH_ID}/live`,
      );
      socket.addEventListener('open', () => {
        reconnectAttempt.current = 0;
      });
      socket.addEventListener('message', (event) => {
        try {
          const body: unknown = JSON.parse(String(event.data));
          if (!isBenchFrame(body)) return;
          setBootstrap((current) => ({
            ...current,
            serverNow: body.serverNow,
            presence: body.presence,
            activeTrialId: body.activeTrialId,
            latestCompletedTrialId: body.latestCompletedTrialId,
          }));
          setViewerReceivedAt(Date.now());
        } catch {
          // Ignore invalid public frames. They never alter operator state.
        }
      });
      socket.addEventListener('close', () => {
        if (disposed) return;
        const delay = Math.min(15_000, 500 * 2 ** reconnectAttempt.current);
        reconnectAttempt.current += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close(1000, 'route closed');
    };
  }, [simulationEnabled]);

  const health = useMemo(
    () => deriveStreamHealth(bootstrap.presence, viewerReceivedAt, now),
    [bootstrap.presence, viewerReceivedAt, now],
  );

  return { bootstrap, apiState, health, latestSample, recentSamples, acceptLocalSample };
}
