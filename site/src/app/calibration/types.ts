import type {
  BenchPresenceV1,
  BenchState,
  CalibrationBootstrapV1,
  PumpReadModelV1,
  RecipePredictionV1,
  MissingReason as SharedMissingReason,
} from '@shared/calibration';

export type TrialState = BenchState;
export type MissingReason = SharedMissingReason;
export type Presence = BenchPresenceV1;
export type PumpReadModel = PumpReadModelV1;
export type RecipePrediction = RecipePredictionV1;
export type CalibrationBootstrap = CalibrationBootstrapV1;
export type CurvePoint = NonNullable<PumpReadModelV1['acceptedCurve']>['points'][number];

export interface LiveSample {
  receivedAt: number;
  deviceMs: number;
  sequence: number;
  rawAdc: number | null;
  massMg: number | null;
  dutyBasisPoints: number;
  flowUlPerSec: number | null;
  pumpModelId: string | null;
  trialState: TrialState;
  simulated: boolean;
}

export interface StreamHealth {
  state: 'connected' | 'stale' | 'offline';
  label: string;
  deviceAgeMs: number | null;
  durableAgeMs: number | null;
  viewerAgeMs: number | null;
}

export const EMPTY_PRESENCE: Presence = {
  producerLeasePresent: false,
  producerLastSeenAt: null,
  expectedEventIntervalMs: null,
  deviceId: null,
  bootId: null,
  latestDeviceEventReceivedAt: null,
  latestDurableAt: null,
  durabilityScope: null,
  lastDurablyAcknowledgedDeviceSeq: null,
  latestProjectedAt: null,
  lastProjectedDeviceSeq: null,
  publishedStreamSeq: null,
};
