# Firmware

Controller code and tests will live here after the electronics architecture is
selected.

The calibration-bench controller is specified separately from the final horse
firmware in
[the calibration software plan](../docs/calibration-software.md). Its planned
location is `firmware/calibration-bench/`; it owns bounded pump steps, the
10/80 SPS load-cell stream, watchdogs, qualified timing, and the versioned USB
protocol with compact transient sample blocks.

The initial recipe configuration lives at
[config/recipes.yaml](config/recipes.yaml).

Known V1 responsibilities:

- Recipe model.
- Pump calibration constants.
- Pour sequence.
- Prime and flush modes.
- Anti-drip behavior.
- UI and lighting state machine.
- Debug logging.

No pump starts automatically after boot, reset, reconnect, or fault.
