# Lighting Plan

Status: Draft for Milestone 6.

Lake lighting is both status display and theater. It should support the machine
state without turning the sculpture into a nightclub unless the horse has earned
it.

## Lighting States

| State | Behavior | Purpose |
| --- | --- | --- |
| Idle | Slow low-intensity glow | Shows the machine is alive. |
| Ready | Warm steady glow | Indicates a pour can start. |
| Pouring | Gentle moving pulse | Reinforces active dispense. |
| Done | Brief celebratory shimmer | Marks completed pour. |
| Service | Cool utility pulse | Distinguishes prime/flush from drinks. |
| Error | Red blink | Requires human attention. |

## Unknowns

- LED type and voltage.
- Diffuser material.
- Waterproofing/splash protection.
- Controller interface.
- Whether lighting lives entirely in the horse/lake module or crosses the
  umbilical.

## Physical Notes

- Keep lighting electronics isolated from spills.
- Do not assume the lake material can be drilled, heated, or solvent-bonded.
- Prototype brightness before final mounting so the glass remains visible.

