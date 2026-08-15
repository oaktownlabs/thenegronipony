# Calibration Bench Firmware (UNO R3)

This directory contains the first guarded firmware slice for an Elegoo/Arduino
UNO R3 (`ATmega328P`, 16 MHz). It drives one pump at a time, samples one HX711,
and speaks a compact newline-delimited protocol over USB serial.

It intentionally ships **unable to run a physical pump**. The device identity,
scale calibration, tare-stability threshold, and vessel-specific maximum liquid
mass are unknown until the actual bench is measured. Their defaults are explicit
commissioning gates, not sample data. `hello`, idle raw samples, and fault
handling remain available while those gates are closed.

## Pin and timing contract

| UNO R3 pin | Function | Firmware behavior |
| --- | --- | --- |
| D3 | Optional HX711 `RATE` | Input/high impedance by default. Set `HX711_RATE_PIN_CONNECTED` only after tracing the actual board; when enabled, firmware drives it low for 10 SPS. |
| D4 | HX711 `DOUT` | One signed 24-bit channel. |
| D5 | HX711 `PD_SCK` | Held low when idle; 25 pulses select channel A, gain 128. |
| D6 | Kamoer F/R transistor control | Assumes the reviewed external open-drain stage: HIGH grounds green F/R for forward, LOW releases it for reverse. |
| D7 | E-stop auxiliary loop | `INPUT_PULLUP`; a healthy normally-closed loop grounds the pin. HIGH, including a broken wire, fails off. |
| D8 | External control-watchdog heartbeat | Toggled by the main loop every 25 ms only while the E-stop sense is healthy and the state is neither `boot` nor `fault`. It is not a free-running PWM. A mandatory external pull-down and retriggerable monostable make reset, USB loss, a HIGH/LOW code stall, or a latched fault expire the K1 coil permit. This is not the E-stop. |
| D9 / OC1A | Kamoer `SP` | Timer1 hardware output at 20 kHz. |
| D10 / OC1B | Gikfun PWM | Timer1 hardware output at 20 kHz. |
| D11 | Gikfun direction | Assumes a reviewed PWM/DIR driver adapter, not a bare motor connection. |

Timer1 runs Fast PWM mode 14 with `ICR1=799` and no prescaler:
`16 MHz / (799 + 1) = 20 kHz`. Nonzero duty that rounds below one timer
count is clamped and reported as `tc=1`; 100% is a static HIGH and is reported
as `tc=800`. The Kamoer domain is restricted to 1100–10000 basis points.
Both compare outputs are detached and driven LOW on boot, stop, invalid input,
E-stop, watchdog, sensor fault, and every firmware fault. Hardware pull-downs,
the independent control inhibit, the pump-power E-stop, and separate physical
re-arm are still required; firmware is not their substitute.

D8 is deliberately not a motion command. A Schmitt inverter holds the external
`CD74HC123E` trailing-edge input HIGH while D8 is LOW at boot; every rising D8
edge then becomes a falling trigger. The one-shot Q output can only allow the
non-latching K1 control relay to remain energized. The timeout must be physically qualified and must
comfortably exceed the 50 ms full D8 cycle while remaining shorter than the
accepted external stop latency. The operator must still press the physical ARM
button while an independent circuit has observed both PWM/enable pins
continuously low. A code stall, fault, reset, or USB-power loss lets the pulse
expire and drops K1. Clearing a fault merely restarts the heartbeat; it does not
re-energize K1.

The HX711 path is deliberately limited to at most 10 reads per second in this
version. There is no 80 SPS capability claim or sample-block frame. Direct AVR
port I/O keeps the interrupt-disabled 25-pulse read shorter than one 250000-baud
character. The actual board's `RATE` strap must still be inspected.

## Commissioning gates

Edit `src/BenchConfig.h` only from recorded physical evidence:

1. replace `TNP_DEVICE_ID` with a unique identifier and set
   `DEVICE_ID_PROVISIONED=true`;
2. derive `TARE_STABILITY_SPAN_COUNTS` from recorded zero-load data;
3. set a durable `TNP_SCALE_CALIBRATION_ID`, the signed rational
   `SCALE_COUNTS_PER_GRAM_NUMERATOR / SCALE_COUNTS_PER_GRAM_DENOMINATOR`, and
   `SCALE_CALIBRATION_PROVISIONED=true`; and
4. set `MAXIMUM_CONFIGURED_LIQUID_MASS_MG` below the measured safe fill of the
   actual vessel and fixture.

The conversion is exact integer arithmetic:

```text
massMg = (rawAdc - tareRaw) * 1000
         * SCALE_COUNTS_PER_GRAM_DENOMINATOR
         / SCALE_COUNTS_PER_GRAM_NUMERATOR
```

The numerator may be negative when increasing load decreases raw counts. Until
all scale fields are provisioned, samples carry `mg:null` and a physical `run`
is rejected with `scale_uncalibrated`. A configured factor is still insufficient
without a fresh successful tare, a provisioned device ID, and a nonzero reviewed
mass limit. `limitmg:0` in `hello` means “unknown,” never a measured zero limit.

The runtime tare zero appears as `zero` in state frames. Cloud records should
link that per-trial raw zero to the calibration ID, rational coefficients,
reference-mass observations, independent check mass, and firmware version.

## State and fault behavior

The pure logic core implements:

```text
BOOT -> IDLE -> TARE -> ARMED -> RUNNING -> SETTLING -> COMPLETE
                    \-------------------------------> FAULT
```

- `run` is accepted only from `ARMED` after the configured motor-off dead time.
- A run is bounded by `warm + collect`, `hard`, the local maximum mass, HX711
  readiness/saturation, E-stop, and the 1500 ms host-heartbeat watchdog.
- The motor is off throughout `TARE`, `ARMED`, `SETTLING`, `COMPLETE`, and
  `FAULT`.
- `stop` immediately returns any non-fault state to `IDLE`.
- `clear` is accepted only from `FAULT` or `COMPLETE`, only with a healthy
  E-stop. Nothing resumes automatically.
- A natural completion emits one `state:"complete"` frame with the finished
  trial/step/pump context, then releases that context. A fault transition emits
  a context-bearing `state:"fault"` frame followed by the fault-code frame,
  then releases it. An accepted `stop` likewise preserves its trial through the
  final acknowledgment/state transition. Subsequent 10 SPS samples continue for
  bench observability but use `trial:null`, `step:null`, `pump:"none"`,
  `duty:0`, and `tc:0`, so a host spool has a finite trial tail.
- The MCU watchdog resets the controller after roughly two seconds of a wedged
  main loop. A watchdog reset boots with outputs off and enters
  `mcu_watchdog` fault until an explicit clear.

## Serial protocol

Transport is exact **250000 8N1**, UTF-8 NDJSON. The maximum inbound line is
191 bytes excluding CR/LF. The parser uses a 192-byte fixed array, accepts no
escapes or unknown/duplicate fields, and never allocates a `String`. Identifiers
may contain only `A-Z`, `a-z`, `0-9`, `-`, `_`, `.`, and `:`. Command IDs are at
most 16 characters and trial IDs at most 24.

`hello` is unsequenced and discovers the current command high-water:

```json
{"v":1,"t":"hello","id":"h1"}
```

Every other command requires `n == lastn + 1`:

The numbers in these wire-format examples are illustrative parser values only.
They are not measurements, commissioning values, safe limits, or recommended
pump commands, and the shipped firmware gates prevent this example `run` from
energizing hardware.

```json
{"v":1,"t":"hb","id":"h2","n":1}
{"v":1,"t":"tare","id":"t1","n":2,"trial":"trial-1","stable":1000,"wait":10000}
{"v":1,"t":"run","id":"r1","n":3,"trial":"trial-1","step":0,"pump":"k","dir":"f","duty":5000,"warm":0,"collect":5000,"settle":1000,"hard":7000,"maxmg":80000}
{"v":1,"t":"stop","id":"s1","n":4}
{"v":1,"t":"clear","id":"c1","n":5}
```

`pump` is `k` or `g`; `dir` is `f` or `r`. All numbers are unsigned decimal
integers. A command's `n` advances even when its semantic request is rejected,
and the rejection is cached. An exact retry of the last command returns the
cached acknowledgment with `dup:1` and cannot repeat an action. An older,
skipped, exhausted, or same-`n`/changed-payload command fails off with
`command_sequence`. The semantic fingerprint is 32-bit FNV-1a over parsed
fields, so harmless JSON field order and whitespace changes do not alter it.

All device frames share:

```json
{"v":1,"t":"TYPE","dev":"DEVICE","boot":"00000001","seq":1,"ms":42}
```

The EEPROM-backed `boot` value is a monotonic reset-session counter rendered as
eight hexadecimal digits. It is not random and is not globally unique. It is
unique only for one provisioned device while EEPROM is preserved; EEPROM erase
or replacement must create a new provenance epoch. Eight checksummed rotating
EEPROM slots make an interrupted update fall back to the previous counter.

Rendered uncommissioned frames look like:

```json
{"v":1,"t":"hello","dev":"tnp-bench-unprovisioned","boot":"00000001","seq":1,"ms":42,"fw":"0.1.0-avr","baud":250000,"hz":10,"lastn":0,"scale":0,"cal":null,"caln":null,"cald":null,"idok":0,"limitmg":0}
{"v":1,"t":"state","dev":"tnp-bench-unprovisioned","boot":"00000001","seq":2,"ms":42,"state":"idle","trial":null,"step":null,"pump":"none","duty":0,"zero":null}
{"v":1,"t":"s","dev":"tnp-bench-unprovisioned","boot":"00000001","seq":3,"ms":140,"trial":null,"step":null,"state":"idle","pump":"none","raw":-123456,"mg":null,"duty":0,"tc":0,"flags":0}
{"v":1,"t":"hb","dev":"tnp-bench-unprovisioned","boot":"00000001","seq":4,"ms":500,"state":"idle","lastn":0}
{"v":1,"t":"ack","dev":"tnp-bench-unprovisioned","boot":"00000001","seq":5,"ms":510,"id":"h2","n":1,"ok":1,"dup":0,"lastn":1,"state":"idle","code":"ok"}
{"v":1,"t":"fault","dev":"tnp-bench-unprovisioned","boot":"00000001","seq":6,"ms":900,"state":"fault","code":"e_stop"}
```

`ok` and `dup` are integers `0|1`. Sample `flags` are: bit 0 motor on, bit 1
mass available, and bit 2 E-stop unhealthy. `raw` is one signed HX711 count;
the browser expands it to canonical `rawAdc:[raw]`. `mg:null` is unavailable,
not zero. `tc` is the applied Timer1 period count. Device `hb` is emitted every
500 ms even while idle. Sequence numbers apply only to device frames and begin
at one on every boot.

## Build and test

Open `CalibrationBench.ino` in Arduino IDE with board **Arduino Uno**, or compile
with an installed AVR core:

```sh
arduino-cli compile --fqbn arduino:avr:uno firmware/calibration-bench
```

The state machine, strict parser, normalized command fingerprint, monotonic
command gate, mocked hardware adapters, and a host-side sketch syntax check run
without installing Arduino libraries:

```sh
make -C firmware/calibration-bench/tests clean test
```

The mocks are not an AVR target compile. These tests do not validate pin
voltage, Timer1 waveform, actual UART clock, HX711 timing/noise, watchdog reset,
E-stop wiring, external `CD74HC123E` timing/release, or flash/SRAM footprint. A
real `arduino:avr:uno` compile plus those dry-bench and oscilloscope gates remain
mandatory before connecting either pump.
