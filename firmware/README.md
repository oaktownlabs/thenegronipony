# Firmware

The guarded UNO R3 calibration-bench vertical slice now lives in
[calibration-bench](calibration-bench/). It ships with all evidence-dependent
commissioning values disabled and includes host-buildable state-machine and
protocol tests.

The calibration-bench controller is specified separately from the final horse
firmware in
[the calibration software plan](../docs/calibration-software.md). Its current
implementation location is `firmware/calibration-bench/`; it owns bounded pump steps, the
10 SPS load-cell stream, watchdogs, qualified timing, and the versioned USB
protocol. The UNO R3 slice makes no 80 SPS or compact-block capability claim;
that remains gated on the actual HX711 board and an end-to-end transport test.

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
