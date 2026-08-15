import { describe, expect, it } from 'vitest';
import { deriveStreamHealth } from './health';
import { EMPTY_PRESENCE } from './types';

describe('deriveStreamHealth', () => {
  const now = Date.parse('2026-08-15T12:00:00.000Z');

  it('requires fresh device, durable, and viewer frontiers for cobalt live state', () => {
    const health = deriveStreamHealth(
      {
        ...EMPTY_PRESENCE,
        producerLeasePresent: true,
        expectedEventIntervalMs: 1_000,
        latestDeviceEventReceivedAt: '2026-08-15T11:59:59.000Z',
        latestDurableAt: '2026-08-15T11:59:59.200Z',
      },
      now - 500,
      now,
    );

    expect(health.state).toBe('connected');
  });

  it('does not call an idle socket healthy without an end-to-end frontier', () => {
    const health = deriveStreamHealth(
      { ...EMPTY_PRESENCE, producerLeasePresent: true },
      now - 100,
      now,
    );

    expect(health.state).toBe('stale');
  });

  it('marks a fully absent bench offline', () => {
    expect(deriveStreamHealth(EMPTY_PRESENCE, null, now).state).toBe('offline');
  });
});
