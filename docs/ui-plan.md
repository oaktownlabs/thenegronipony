# UI Plan

Status: Draft for Milestone 6.

The horse/lake module should make the ritual obvious: choose a recipe, place the
rocks glass, press PONY POUR, watch the lake glow, receive an absurdly serious
drink from a nostril.

## Controls

- Recipe selector: hardware unknown.
- Small screen: hardware unknown.
- Pour button: hardware unknown; label may be PONY POUR.
- Service controls for prime/flush: placement unknown.

## State Table

| State | Screen | Button | Lighting |
| --- | --- | --- | --- |
| `idle` | Project name or selected recipe prompt | Disabled | Slow lake glow |
| `recipe_selected` | Recipe name and volume | Enabled | Warm ready glow |
| `pouring` | Pour progress | Disabled | Animated pour pulse |
| `done` | Done message | Disabled briefly | Brief shimmer |
| `priming` | Prime in progress | Disabled | Utility pulse |
| `flushing` | Flush in progress | Disabled | Cool utility pulse |
| `error` | Short fault message | Disabled | Red fault blink |

## Open Questions

- Selector type: rotary encoder, buttons, or other.
- Screen type and dimensions.
- Pour button diameter, voltage, illumination, and mounting depth.
- Whether service modes are hidden, physical, or menu-driven.
- Exact placement on the lake/base module.

## Safety/Use Notes

- The pour button must not start a pour from an ambiguous state.
- Prime and flush should be visually distinct from a drink pour.
- Error messages should favor actionable labels over jokes.

