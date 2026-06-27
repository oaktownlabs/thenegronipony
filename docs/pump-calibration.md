# Pump Calibration Plan

Status: Draft for Milestone 2.

Calibration turns pump runtime into delivered volume for each pump, tube setup,
and liquid. The first useful output is a dataset that can survive review later,
not a heroic single number scribbled on painter's tape.

## CSV Schema

Store raw trials in `data/calibration/pump-trials-template.csv`.

| Column | Required | Notes |
| --- | --- | --- |
| `trial_id` | Yes | Stable identifier, such as `m3-water-p1-001`. |
| `date` | Yes | ISO date. |
| `operator` | Yes | Person running the test. |
| `pump_id` | Yes | `pump_1`, `pump_2`, or `pump_3` until hardware labels exist. |
| `pump_model` | No | Unknown until selected. |
| `tube_material` | No | Unknown until selected. |
| `tube_inner_diameter_mm` | No | Measured or vendor-specified. |
| `liquid` | Yes | Water, gin, Campari, vermouth, flush solution, etc. |
| `target_volume_ml` | Yes | Intended dispense volume. |
| `run_time_ms` | Yes | Pump-on duration. |
| `reverse_time_ms` | No | Anti-drip reverse duration, if tested. |
| `mass_before_g` | No | Scale reading before dispense. |
| `mass_after_g` | No | Scale reading after dispense. |
| `measured_volume_ml` | Yes | Measured volume or mass-derived volume. |
| `temperature_c` | No | Useful when available. |
| `primed` | Yes | `true` or `false`. |
| `notes` | No | Leaks, bubbles, drips, or horse-related indignities. |

## Procedure Outline

1. Confirm the scale is stable and zeroed.
2. Confirm the tube path is primed.
3. Run at least five trials for each pump/liquid/target-volume combination.
4. Record raw measurements immediately.
5. Repeat with anti-drip reversal settings after baseline flow is known.
6. Mark bad trials explicitly instead of deleting them.
7. Photograph the bench setup before changing tube routing.

## Initial Targets

- 10 mL, 25 mL, and 50 mL water tests.
- Negroni ingredient tests after water behavior is understood.
- Repeatability target is intentionally open until the pump and measurement
  tools are selected.

