# Open Questions and Owner Gates

These are the remaining physical and production gates after the Milestone 2
software slice. Product titles and simulated fixtures do not close them. The
owner has authorized the implementation to choose conservative defaults; only
evidence that requires received hardware, instruments, or external production
configuration remains open.

## Before Ordering or Wiring

- [ ] **Adam — received load-cell inspection:** the source is now identified as
  SazkJere `SJ18`, ASIN `B0B9Y584JR`, whose listing documents a four-wire cell.
  Provide clear photos of one received cell, its wires/label/loading arrow, and
  both sides and terminal labels of one received HX711 before wiring.
- [x] **Adam — controller inventory:** the supplied controller is an Elegoo
  UNO R3. The AVR Timer1, 250000-baud, and fixed-buffer backend is the Milestone
  2 target; physical USB/timing qualification remains below.
- [ ] **Adam — pump labels/connectors:** photograph both received pumps and the
  Kamoer cable/label so the exact suffix and wire count are confirmed.
- [ ] **Bench owner — vessel measurements:** use one Qesdaoxu nominal 100 mL
  cylinder from ASIN `B0BLHDVC1N`; record its empty mass, outer dimensions, and a
  conservative working fill line. Confirm platform + cylinder + commanded water
  mass stays below both the vessel cutoff and qualified cell working range. Its
  graduations are not the volume reference.
- [ ] **Bench owner — tools:** the WANPTEK `DPS3010U` closes the adjustable
  current-limited source selection. Confirm access to a separate inline current
  probe or meter, a multimeter, the specified Rice Lake accredited Class 4
  fit/check masses, the ThermoWorks `THS-222-215`, and an
  oscilloscope with probes rated for the possible signal voltage. A current
  meter does not replace current limiting, and a logic analyzer does not qualify
  an unknown analog voltage.
- [ ] **Bench owner — supply inspection:** photograph the received DPS3010U
  rear/rating label and controls. Verify protective-earth/certification marking,
  received input-voltage revision, output negative-to-earth relationship, 12 V
  accuracy, and CV/CC/OCP behavior with external instruments before connecting a
  pump. Do not use its USB/Type-C ports to power the Uno.

## Before the First Powered Pump Test

- [ ] Measure Kamoer and Gikfun startup and primed running current with the
  current-limited source and current probe. Do not deliberately stall either
  pump; validate the Gikfun driver current limit and fault path with an
  electrical dummy load. Then select each branch from its own legitimate
  startup/current-limit demand and select the shared feed for the firmware's
  one-pump-at-a-time envelope plus control-coil load, not from running current
  alone. Separately prove that no single command/fault path can energize both
  pumps; do not turn an unintended two-pump state into a sizing assumption.
- [ ] Verify Kamoer `SP` at 20 kHz and 0–5 V before connecting the pump.
- [ ] Scope the Kamoer `FG` wire and decide its input conditioning; leave it
  disconnected if not verified.
- [ ] Record the Elegoo board's USB bridge and VID/PID. Verify that opening the
  port resets to outputs-off, 250000-baud traffic is loss-free at the initial
  10 SPS rate, D9/OC1A and D10/OC1B are both 20 kHz, and neither output glitches
  during boot, reset, serial loss, or fault.
- [x] **Design selection — fail-off control baseline:** use Schneider
  `XB5AS8444` E-stop and `XB5AA31` ARM, Omron `MY4-GS-R DC12`/`PYFZ-14-E` K1,
  Schneider `LC1D09JD` K2 candidate, TI `SN74AHCT125N`/`SN74HC14N` command
  logic, and TI `CD74HC123E` D8 edge-loss watchdog. The exact construction
  netlist and no-manual-latch requirement are in the electronics BOM. This is a
  custom fail-off prototype, not a certified safety system.
- [ ] **Electrical reviewer — schematic release:** redraw the point-to-point
  netlist as a controlled schematic against the received socket/contact labels;
  check E-stop NC1 coil-feed interruption, isolated D7 NC2, K1 seal, one-shot
  reset/unused pins, command-gate polarity, PMODE/SLEEP sequencing, pull-downs,
  diode orientation, contactor suppression, and grounding before wiring.
- [ ] **Bench owner — external stop proof:** scope D8, the `CD74HC123E` Q output,
  K1/K2 coils, Kamoer SP, DRV8874 EN/SLEEP, and switched 12 V. Prove both a D8
  HIGH stall and LOW stall expire the one-shot, drop K1/K2, force outputs off,
  and require physical ARM. Also prove E-stop press, release, USB loss, reset,
  watchdog reset, and a broken enable/sense conductor cannot restart a pump.
- [ ] **Bench owner — measured protection values:** select F0/FC/FK/FG 297-series
  ampere values, wire/ferrules, DRV8874 VREF resistor, thermal treatment, and K2
  final DC-use acceptance from legitimate startup/running and driver-input
  inrush measurements plus the published time-current/thermal curves. Validate
  the current-limit path with an electrical dummy load; do not deliberately
  stall a pump.
- [ ] **Bench owner — enclosure layout:** prove the Hammond `PCJ12106CCLF` and
  `PCJR1109` fit the received DIN hardware, contactor, driver, bend radii,
  separation, glands, heat load, and wet/dry mounting before drilling.
- [ ] Approve a wet/dry layout in which pump electrical sides/connectors and the
  HX711 are protected and cannot sit below a reservoir, tube, nozzle, vessel, or
  spill path.
- [ ] Review the final wiring diagram against the actual driver breakout and
  HX711 pin labels.

## Before the First Calibration Run

- [ ] Predeclare the HX711 sample mode, filter, zero-RMS calculation, calibration
  residual statistic, test window, reference-mass tolerances, and independent
  check-mass gate.
- [ ] Trace the actual HX711 module's `RATE` connection and verify that 10 SPS
  and 80 SPS can be selected without fighting a board-level hard strap. If 80
  SPS is unavailable, replace/review the module before short transient tests.
- [ ] Calibrate raw HX711 counts against the approved reference masses and
  provision the reviewed factor/offset before enabling physical pump runs that
  claim a mass cutoff. Until then, `massMg` remains null and the firmware must
  report the scale as uncalibrated rather than pretending `maximumMassMg` is
  enforced.
- [ ] Verify commanded 1 s, 2 s, 5 s, and 60 s pump-output intervals on an
  oscilloscope; record timebase error/jitter and set the allowed error from the
  total flow-uncertainty budget.
- [ ] Identify the thermometer/contact probe and its accuracy; record water
  temperature at the start and end of each trial and use the corresponding
  density.

## Before Cloudflare Production Deployment

- [x] **Access-policy baseline:** writes are private. Start with the verified
  Oaktown Labs operator identity (`adamrneary@gmail.com`) as the only allowed
  human operator; adding identities is an explicit Access policy change.
- [x] **Public boundary:** the owner confirmed that current and historical
  calibration data may be public while all mutations remain private. Public
  trial reads may include raw measurement samples and the state of rejected or
  aborted runs. Operator identity, private review notes, lease material, and
  ingest diagnostics remain private.
- [ ] Provision separate staging and production D1 databases, Durable Object
  namespaces, Access audiences, and secrets. R2 archive is deliberately
  deferred until the first physical trial proves raw volume and export needs.
- [ ] Enforce the selected deployment boundary: ordinary remote PR previews are
  read-only, writable automated tests use local Cloudflare bindings, and only
  the explicitly deployed staging environment may exercise remote mutations.
- [x] **Hostname baseline:** serve `/calibration` and `/api/v1/*` from the same
  `the-negroni-pony` Worker origin. Set `ALLOWED_ORIGIN` to the final deployed
  origin before enabling mutations; a later custom hostname does not change the
  API shape.

## UI Decisions Closed for Milestone 2

- [x] Use provenance-safe monochrome SVG pump illustrations until owner-made
  photographs are available. Product photos in the concept archive do not ship.
- [x] Use desktop Chromium for the protected Web Serial operator workflow.
  Read-only viewers are not browser-limited by Web Serial.
- [x] Use the approved dark stone/IBM Plex, one-page instrument composition,
  with `#0047AB` reserved for the verified healthy connection state.
- [x] Current-trial durable read models are public immediately, including the
  approved public trial samples. Mutation, operator-setup, analysis, and review
  endpoints remain private.

## Before Ingredient Testing

- [ ] Select and document food-contact/alcohol-compatible tubing, fittings,
  nozzle, reservoir interfaces, and cleaning method for each path.
- [ ] Enclose/isolate the Gikfun brushed motor and power electronics and complete
  a vapor/fire/spill assessment.
- [ ] Record density sources or measurements for each ingredient.
- [ ] Decide which pump model/specimen and operating duty policy will be used on
  each of the eventual three machine channels.

## Deliberately Deferred

- Direct network upload from a different controller or external adapter; the
  UNO R3 has no onboard Wi-Fi.
- Remote pump control.
- Automatic D1 raw-sample deletion.
- Model-level aggregation across multiple physical specimens.
- Commercial or public alcohol-service readiness.
