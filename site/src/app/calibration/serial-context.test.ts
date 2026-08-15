import type { StateDeviceFrameV1 } from '@shared/calibration';
import { describe, expect, it } from 'vitest';
import { terminalContextDecision } from './useSerialBench';

const stateFrame = (state: 'idle' | 'complete' | 'fault'): StateDeviceFrameV1 => ({
  v: 1,
  type: 'state',
  deviceId: 'bench-01',
  bootId: '00000001',
  seq: 10,
  deviceMs: 1000,
  trialId: 'trial-01',
  state,
  expectedEventIntervalMs: 100,
  detail: '{}',
});

describe('terminal serial context release', () => {
  it('releases immediately after complete and stop-idle states', () => {
    expect(terminalContextDecision(stateFrame('complete'))).toBe('release');
    expect(terminalContextDecision(stateFrame('idle'))).toBe('release');
  });

  it('retains a fault context only until the following fault-code frame', () => {
    expect(terminalContextDecision(stateFrame('fault'))).toBe('await_fault_code');
    expect(
      terminalContextDecision({
        v: 1,
        type: 'fault',
        deviceId: 'bench-01',
        bootId: '00000001',
        seq: 11,
        deviceMs: 1001,
        trialId: 'trial-01',
        state: 'fault',
        expectedEventIntervalMs: 500,
        code: 'maximum_mass',
      }),
    ).toBe('release');
  });

  it('does not release ordinary active or anonymous frames', () => {
    const active: StateDeviceFrameV1 = { ...stateFrame('idle'), state: 'running' };
    expect(terminalContextDecision(active)).toBe('keep');
    expect(terminalContextDecision({ ...stateFrame('complete'), trialId: null })).toBe('keep');
  });
});
