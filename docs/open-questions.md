# Open Questions and Owner Gates

These items cannot be answered safely from product titles or design concepts.
They do not block review of the Milestone 2 plan, but the named gate must close
before the affected work begins.

## Before Ordering or Wiring

- [ ] **Adam — load-cell identification:** provide the original kit link or
  clear photos of one cell, its wire count/colors/label, and both sides of one
  HX711 board.
- [ ] **Adam — controller inventory:** confirm whether an Arduino is already on
  hand. The plan selects an UNO R4 WiFi; using another board requires a reviewed
  5 V interface and timer/PWM backend.
- [ ] **Adam — pump labels/connectors:** photograph both received pumps and the
  Kamoer cable/label so the exact suffix and wire count are confirmed.
- [ ] **Bench owner — vessel:** choose the graduated cylinder, record capacity
  and empty mass, and confirm platform + vessel + maximum water stays inside the
  load-cell working range.
- [ ] **Bench owner — tools:** confirm access to a current-limited 12 V bench
  supply, a separate inline current probe or meter, a multimeter, reference
  masses with stated tolerances, a reference thermometer/contact probe, and an
  oscilloscope with probes rated for the possible signal voltage. A current
  meter does not replace current limiting, and a logic analyzer does not qualify
  an unknown analog voltage.

## Before the First Powered Pump Test

- [ ] Measure Kamoer and Gikfun startup and primed running current with the
  current-limited source and current probe. Do not deliberately stall either
  pump; validate the Gikfun driver current limit and fault path with an
  electrical dummy load. Then select the H-bridge limit, branch fuses, wire
  gauge, and supply from the allowed simultaneous startup/current-limit demand
  and continuous load, not running current alone.
- [ ] Verify Kamoer `SP` at 20 kHz and 0–5 V before connecting the pump.
- [ ] Scope the Kamoer `FG` wire and decide its input conditioning; leave it
  disconnected if not verified.
- [ ] Select the exact emergency stop, power distribution, protection parts,
  and enclosure/splash shield. Its DC-rated power contacts must remove pump
  power, and mechanically linked auxiliary contacts must hardware-inhibit the
  pump-side Kamoer `SP` and H-bridge commands while USB remains powered, with a
  separate contact or isolated state sense for the Arduino event input.
- [ ] Select and verify a separate physical re-arm circuit. Releasing the
  emergency stop must leave control inhibited until firmware is `IDLE`, command
  outputs are physically low, and the operator deliberately re-arms the bench.
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
- [ ] Verify commanded 1 s, 2 s, 5 s, and 60 s pump-output intervals on an
  oscilloscope; record timebase error/jitter and set the allowed error from the
  total flow-uncertainty budget.
- [ ] Identify the thermometer/contact probe and its accuracy; record water
  temperature at the start and end of each trial and use the corresponding
  density.

## Before Cloudflare Implementation

- [ ] **Adam — access policy:** confirm which identity/email should be allowed
  to create and mutate trials through Cloudflare Access.
- [ ] **Adam — public boundary:** confirm that current/historical calibration
  reads may be public while all mutations remain private.
- [ ] Provision separate staging and production D1 databases, Durable Object
  namespaces, Access audiences, and secrets; decide whether R2 archive is
  included in the first cloud slice.
- [ ] Enforce the selected deployment boundary: ordinary remote PR previews are
  read-only, writable automated tests use local Cloudflare bindings, and only
  the explicitly deployed staging environment may exercise remote mutations.
- [ ] Confirm the production hostname that owns `/calibration` and `/api/v1/*`.

## Before UI Implementation

- [ ] Photograph the two owned pumps on a neutral background, or approve
  monochrome SVG illustrations. Product photos in the concept archive have no
  recorded public-use provenance.
- [ ] Confirm desktop Chromium is acceptable for the protected operator
  workflow. Read-only viewers are not browser-limited by Web Serial.
- [ ] Review the dark stone/IBM Plex concept, one-page composition, and
  stone-plus-`#0047AB` live-state contract.
- [ ] Confirm whether current-trial data is public immediately or only after a
  trial is completed/reviewed.

## Before Ingredient Testing

- [ ] Select and document food-contact/alcohol-compatible tubing, fittings,
  nozzle, reservoir interfaces, and cleaning method for each path.
- [ ] Enclose/isolate the Gikfun brushed motor and power electronics and complete
  a vapor/fire/spill assessment.
- [ ] Record density sources or measurements for each ingredient.
- [ ] Decide which pump model/specimen and operating duty policy will be used on
  each of the eventual three machine channels.

## Deliberately Deferred

- Direct Wi-Fi upload from the UNO R4.
- Remote pump control.
- Automatic D1 raw-sample deletion.
- Model-level aggregation across multiple physical specimens.
- Commercial or public alcohol-service readiness.
