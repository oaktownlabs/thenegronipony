# Fluid System Plan

Status: Draft for Milestone 2.

The V1 fluid system uses three independent ingredient paths from bottle to
Nostril Nozzle. This keeps cleaning, calibration, and failure diagnosis simpler
than a shared manifold.

## V1 Assumptions

- Three upright 750 mL bottles sit in the sidecar.
- Each bottle has one intake tube dropped into the bottle.
- Each tube feeds one peristaltic dosing pump.
- Pump heads and serviceable tubing drain toward a removable wet tray; motor
  connectors and electrical sides remain behind a splash barrier or in a
  protected dry enclosure.
- Pump outlet tubes run through the umbilical to the horse/lake module.
- Tube ends remain separate until the Nostril Nozzle.
- The glass receives ingredients directly from the nostril pour point.
- Recipe mixing happens in the glass, not inside the machine.

## Pump Candidates Under Test

- Kamoer KPHM600-12B3B17: 12 V brushless, three rollers, B17 PharMed
  BPT tube, dedicated 5 V speed-control input.
- Gikfun AE1207: 12 V two-wire brushed dosing pump with seller-specified
  2 mm ID × 4 mm OD tube.

The bench compares one physical specimen of each model, primarily one at a time.
A later run with these two specimens together is only a partial supply-sag and
cross-vibration check; it does not validate the final three-channel power,
thermal, mechanical, tubing, or timing design. The bench does not yet choose the
three final machine pumps.

## Unknowns

- Gikfun startup and primed running current, safe driver fault-current limit,
  and actual start threshold. Deliberately stalling the small pump is not part of
  characterization.
- Kamoer startup and primed running current, plus final simultaneous-start and
  continuous-current budgets for the eventual three-channel machine.
- Tube material, inner diameter, outer diameter, and food/alcohol suitability.
- Whether either pump's tested tube size is appropriate for the final umbilical
  and target recipe timing.
- Whether tube ends should sit flush with the nozzle face or protrude slightly.
- Whether quick disconnects are worth the cleaning and leak tradeoffs.
- Final sidecar-to-horse umbilical connector strategy.

## Food-Path Notes

- Treat every wet component as food-path until proven otherwise.
- The Kamoer data sheet identifies its installed tube as PharMed BPT, but the
  complete installed path still needs review for the actual ingredients and
  cleaning process.
- The Gikfun listing does not establish food-contact or alcohol compatibility.
- Do not assume compatibility with ethanol, Campari, vermouth, citrus, cleaners,
  or repeated flushing without source material or testing.
- Prefer replaceable tubing and removable interfaces over bonded paths.
- Keep cleaning and dry-storage steps visible in every physical test.

## Calibration Implications

Each physical pump specimen, tube installation, liquid, head, and voltage gets
its own calibration provenance. Water curves are bench engineering evidence,
not measured gin, Campari, vermouth, citrus, coffee, or syrup curves. The horse
may be majestic, but density, viscosity, tube age, and head pressure still have
jurisdiction.

For three concurrent machine channels, the slowest ingredient dispense sets a
recipe's minimal time. That calculation must invert the measured curve for each
assigned channel; it must not scale an advertised maximum by raw PWM.
