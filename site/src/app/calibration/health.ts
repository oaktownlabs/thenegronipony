import type { Presence, StreamHealth } from './types';

const parseAge = (timestamp: string | null, now: number): number | null => {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;
};

export function deriveStreamHealth(
  presence: Presence,
  viewerReceivedAt: number | null,
  now = Date.now(),
): StreamHealth {
  const deviceAgeMs = parseAge(presence.latestDeviceEventReceivedAt, now);
  const durableAgeMs = parseAge(presence.latestDurableAt, now);
  const viewerAgeMs = viewerReceivedAt === null ? null : Math.max(0, now - viewerReceivedAt);
  const expected = presence.expectedEventIntervalMs ?? 1_000;
  const healthyWindow = Math.max(3_000, expected * 3);
  const staleWindow = Math.max(12_000, expected * 10);
  const ages = [deviceAgeMs, durableAgeMs, viewerAgeMs];
  const allFresh = ages.every((age) => age !== null && age <= healthyWindow);

  if (presence.producerLeasePresent && allFresh) {
    return {
      state: 'connected',
      label: 'BENCH CONNECTED',
      deviceAgeMs,
      durableAgeMs,
      viewerAgeMs,
    };
  }

  const hasRecentSignal = ages.some((age) => age !== null && age <= staleWindow);
  return {
    state: hasRecentSignal ? 'stale' : 'offline',
    label: hasRecentSignal ? 'STREAM STALE' : 'BENCH OFFLINE',
    deviceAgeMs,
    durableAgeMs,
    viewerAgeMs,
  };
}

export function formatAge(ageMs: number | null): string {
  if (ageMs === null) return '—';
  if (ageMs < 1_000) return `${Math.round(ageMs)} ms`;
  if (ageMs < 60_000) return `${(ageMs / 1_000).toFixed(1)} s`;
  return `${Math.floor(ageMs / 60_000)}m ${Math.floor((ageMs % 60_000) / 1_000)}s`;
}
