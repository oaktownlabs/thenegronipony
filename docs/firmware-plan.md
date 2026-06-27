# Firmware Plan

Status: Draft for Milestone 5.

Firmware V1 controls three pumps, recipe selection, prime/flush service modes,
anti-drip reversal, debug logging, and the user-facing state machine.

## Current Repo Implementation

- `firmware/config/recipes.yaml` stores draft recipe volumes.
- `firmware/src/pour-plan.ts` models recipe-to-pump timing in TypeScript so the
  sequencing logic can be tested before controller hardware is selected.
- `firmware/tests/pour-plan.test.ts` covers pour sequencing, anti-drip steps,
  missing calibration, and prime/flush service plans.

## Hardware Boundary

The current code is not microcontroller firmware yet. It is a testable logic
model intended to migrate into the selected controller environment after Adam
confirms the electronics architecture.

## Required Firmware States

- `idle`
- `recipe_selected`
- `ready`
- `pouring`
- `priming`
- `flushing`
- `done`
- `error`

## Open Questions

- Controller platform.
- Pump driver hardware.
- Display library and screen type.
- Recipe selector input style.
- Large pour button wiring.
- Lighting control interface.
- Debug/programming transport.

