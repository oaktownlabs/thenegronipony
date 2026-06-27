# Fluid System Plan

Status: Draft for Milestone 2.

The V1 fluid system uses three independent ingredient paths from bottle to
Nostril Nozzle. This keeps cleaning, calibration, and failure diagnosis simpler
than a shared manifold.

## V1 Assumptions

- Three upright 750 mL bottles sit in the sidecar.
- Each bottle has one intake tube dropped into the bottle.
- Each tube feeds one peristaltic dosing pump.
- Pump outlet tubes run through the umbilical to the horse/lake module.
- Tube ends remain separate until the Nostril Nozzle.
- The glass receives ingredients directly from the nostril pour point.
- Recipe mixing happens in the glass, not inside the machine.

## Unknowns

- Exact pump model.
- Pump voltage, current draw, and driver requirements.
- Tube material, inner diameter, outer diameter, and food/alcohol suitability.
- Whether tube ends should sit flush with the nozzle face or protrude slightly.
- Whether quick disconnects are worth the cleaning and leak tradeoffs.
- Final sidecar-to-horse umbilical connector strategy.

## Food-Path Notes

- Treat every wet component as food-path until proven otherwise.
- Do not assume compatibility with ethanol, Campari, vermouth, citrus, cleaners,
  or repeated flushing without source material or testing.
- Prefer replaceable tubing and removable interfaces over bonded paths.
- Keep cleaning and dry-storage steps visible in every physical test.

## Calibration Implications

Each pump/tube/liquid combination gets its own calibration row set. The machine
should not assume that water, gin, Campari, and vermouth flow identically. The
horse may be majestic, but viscosity still has jurisdiction.

