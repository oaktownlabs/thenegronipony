import type { BenchState, DeviceFrameV1, PumpModelId } from './types';

export const SERIAL_PROTOCOL_V1 = {
  schema: 'tnp.serial.v1',
  baud: 250000,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  maxInboundLineBytes: 191,
  sampleRateHz: 10,
  expectedSampleIntervalMs: 100,
  heartbeatIntervalMs: 500,
  flagBits: {
    motorOn: 1 << 0,
    massAvailable: 1 << 1,
    emergencyStopUnhealthy: 1 << 2,
  },
} as const;

type CompactPumpCode = 'none' | 'k' | 'g';

interface CompactBaseV1 {
  v: 1;
  dev: string;
  boot: string;
  seq: number;
  ms: number;
}

export type CompactSerialFrameV1 =
  | (CompactBaseV1 & {
      t: 'hello';
      fw: string;
      baud: 250000;
      hz: 10;
      lastn: number;
      scale: 0 | 1;
      cal: string | null;
      caln: number | null;
      cald: number | null;
      idok: 0 | 1;
      limitmg: number;
    })
  | (CompactBaseV1 & {
      t: 'hb';
      state: BenchState;
      lastn: number;
    })
  | (CompactBaseV1 & {
      t: 'state';
      state: BenchState;
      trial: string | null;
      step: number | null;
      pump: CompactPumpCode;
      duty: number;
      zero: number | null;
    })
  | (CompactBaseV1 & {
      t: 's';
      trial: string | null;
      step: number | null;
      state: BenchState;
      pump: CompactPumpCode;
      raw: number;
      mg: number | null;
      duty: number;
      tc: number;
      flags: number;
    })
  | (CompactBaseV1 & {
      t: 'fault';
      state: 'fault';
      code: string;
    })
  | (CompactBaseV1 & {
      t: 'ack';
      id: string;
      n: number;
      ok: 0 | 1;
      dup: 0 | 1;
      lastn: number;
      state: BenchState;
      code: string;
    });

export interface SerialCanonicalContextV1 {
  /** Current trial, used for compact heartbeats/acks that omit it on the wire. */
  trialId?: string | null;
  /** Physical specimen identities selected by the operator for compact pump codes. */
  pumpSpecimenIds?: Partial<Record<'k' | 'g', string>>;
}

const MODEL_BY_PUMP_CODE: Record<'k' | 'g', PumpModelId> = {
  k: 'kamoer-kphm600-12b3b17',
  g: 'gikfun-ae1207',
};

const integer = (value: unknown, name: string, min: number, max: number): number => {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}`);
  }
  return Number(value);
};

const base = (frame: CompactBaseV1) => ({
  v: 1 as const,
  deviceId: frame.dev,
  bootId: frame.boot,
  seq: integer(frame.seq, 'seq', 0, Number.MAX_SAFE_INTEGER),
  deviceMs: integer(frame.ms, 'ms', 0, 0xffffffff),
});

const specimenFor = (
  pump: Exclude<CompactPumpCode, 'none'>,
  context: SerialCanonicalContextV1,
): string => {
  const specimenId = context.pumpSpecimenIds?.[pump];
  if (!specimenId) {
    throw new TypeError(
      `No specimen identity supplied for compact pump ${pump} (${MODEL_BY_PUMP_CODE[pump]})`,
    );
  }
  return specimenId;
};

/**
 * Expands the firmware's bounded compact NDJSON into the sole canonical event
 * shape used by IndexedDB, hashing, HTTP ingest, D1, and live WebSockets.
 */
export function canonicalizeSerialFrame(
  frame: CompactSerialFrameV1,
  context: SerialCanonicalContextV1 = {},
): DeviceFrameV1 {
  const common = base(frame);

  switch (frame.t) {
    case 'hello':
      if (frame.baud !== SERIAL_PROTOCOL_V1.baud || frame.hz !== SERIAL_PROTOCOL_V1.sampleRateHz) {
        throw new TypeError('Unsupported serial baud or sample rate');
      }
      if (
        frame.scale === 1 &&
        (!frame.cal ||
          frame.caln === null ||
          frame.caln === 0 ||
          frame.cald === null ||
          frame.cald <= 0)
      ) {
        throw new TypeError(
          'Provisioned scale is missing its calibration identity or coefficients',
        );
      }
      return {
        ...common,
        type: 'hello',
        firmwareVersion: frame.fw,
        hardwareRevision: 'arduino-uno-r3',
        protocolVersion: 'tnp.serial.v1',
        capabilities: frame.scale === 1 ? ['hx711', 'load-cell-calibrated'] : ['hx711'],
        serialBaud: SERIAL_PROTOCOL_V1.baud,
        acquisitionModes: ['steady_10_sps'],
        lastAcceptedCommandNumber: integer(frame.lastn, 'lastn', 0, 0xffffffff),
        loadCellCalibrated: frame.scale === 1,
        loadCellCalibrationId: frame.cal,
        countsPerGramNumerator:
          frame.caln === null ? null : integer(frame.caln, 'caln', -0x7fffffff, 0x7fffffff),
        countsPerGramDenominator:
          frame.cald === null ? null : integer(frame.cald, 'cald', 1, 0x7fffffff),
        deviceIdentityProvisioned: frame.idok === 1,
        configuredMassLimitMg:
          frame.limitmg === 0 ? null : integer(frame.limitmg, 'limitmg', 1, 1_000_000),
      };

    case 'hb':
      return {
        ...common,
        type: 'heartbeat',
        trialId: context.trialId ?? null,
        state: frame.state,
        expectedEventIntervalMs: SERIAL_PROTOCOL_V1.heartbeatIntervalMs,
        lastAcceptedCommandNumber: integer(frame.lastn, 'lastn', 0, 0xffffffff),
      };

    case 'state':
      return {
        ...common,
        type: 'state',
        // STOP preserves the AVR trial through its final IDLE state. The
        // context fallback also protects compatible terminal frames that omit
        // the identifier while the browser is still sealing the record.
        trialId: frame.trial ?? context.trialId ?? null,
        state: frame.state,
        expectedEventIntervalMs: SERIAL_PROTOCOL_V1.expectedSampleIntervalMs,
        detail: JSON.stringify({
          stepIndex: frame.step === null ? null : integer(frame.step, 'step', 0, 1024),
          pumpSpecimenId: frame.pump === 'none' ? null : specimenFor(frame.pump, context),
          dutyBasisPoints: integer(frame.duty, 'duty', 0, 10000),
          tareRaw: frame.zero === null ? null : integer(frame.zero, 'zero', -0x800000, 0x7fffff),
        }),
      };

    case 's': {
      const idleSample = frame.trial === null && frame.pump === 'none' && frame.step === null;
      const boundTrialSample =
        frame.trial !== null &&
        frame.pump !== 'none' &&
        frame.step !== null &&
        (frame.state === 'running' || frame.state === 'settling' || frame.state === 'fault');
      const quiescentTrialSample =
        frame.trial !== null &&
        frame.pump === 'none' &&
        frame.step === null &&
        ['tare', 'armed', 'fault'].includes(frame.state);
      if (!idleSample && !boundTrialSample && !quiescentTrialSample) {
        throw new TypeError('Compact sample trial, step, and pump fields disagree');
      }
      const flags = integer(frame.flags, 'flags', 0, 0x07);
      const massAvailable = (flags & SERIAL_PROTOCOL_V1.flagBits.massAvailable) !== 0;
      if (massAvailable !== (frame.mg !== null)) {
        throw new TypeError('Compact sample mass flag and mg value disagree');
      }
      if (
        quiescentTrialSample &&
        ((flags & SERIAL_PROTOCOL_V1.flagBits.motorOn) !== 0 || frame.duty !== 0 || frame.tc !== 0)
      ) {
        throw new TypeError('A quiescent trial sample cannot report an energized pump');
      }
      if (
        boundTrialSample &&
        (frame.state === 'settling' || frame.state === 'fault') &&
        ((flags & SERIAL_PROTOCOL_V1.flagBits.motorOn) !== 0 || frame.tc !== 0)
      ) {
        throw new TypeError('A settling or fault sample cannot report an energized pump');
      }
      return {
        ...common,
        type: 'sample',
        trialId: frame.trial,
        stepIndex: frame.step === null ? null : integer(frame.step, 'step', 0, 1024),
        state: frame.state,
        pumpSpecimenId: frame.pump === 'none' ? null : specimenFor(frame.pump, context),
        acquisitionMode: 'steady_10_sps',
        expectedSampleIntervalMs: SERIAL_PROTOCOL_V1.expectedSampleIntervalMs,
        dutyBasisPoints: integer(frame.duty, 'duty', 0, 10000),
        dutyTimerCount: integer(frame.tc, 'tc', 0, 800),
        motorOn: (flags & SERIAL_PROTOCOL_V1.flagBits.motorOn) !== 0,
        rawAdc: [integer(frame.raw, 'raw', -0x800000, 0x7fffff)],
        massMg: frame.mg === null ? null : integer(frame.mg, 'mg', -1_000_000, 1_000_000),
        tachCount: null,
        supplyMv: null,
        faults:
          (flags & SERIAL_PROTOCOL_V1.flagBits.emergencyStopUnhealthy) !== 0
            ? ['emergency_stop_unhealthy']
            : [],
      };
    }

    case 'fault':
      return {
        ...common,
        type: 'fault',
        trialId: context.trialId ?? null,
        state: 'fault',
        expectedEventIntervalMs: SERIAL_PROTOCOL_V1.heartbeatIntervalMs,
        code: frame.code,
      };

    case 'ack':
      return {
        ...common,
        type: 'command_ack',
        trialId: context.trialId ?? null,
        state: frame.state,
        expectedEventIntervalMs: SERIAL_PROTOCOL_V1.heartbeatIntervalMs,
        commandId:
          frame.id.length <= 16
            ? frame.id
            : (() => {
                throw new TypeError('command id exceeds 16 bytes');
              })(),
        code: frame.ok === 1 ? undefined : frame.code,
        detail: JSON.stringify({
          commandNumber: integer(frame.n, 'n', 0, 0xffffffff),
          duplicate: frame.dup === 1,
        }),
        lastAcceptedCommandNumber: integer(frame.lastn, 'lastn', 0, 0xffffffff),
      };
  }
}
