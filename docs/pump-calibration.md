# Pump Calibration and Analysis Plan

Status: Proposed for Milestone 2 review. No measured pump results exist yet.

Calibration estimates delivered liquid from a particular physical pump,
tubing installation, liquid, head, voltage, temperature, and control command.
It does not turn a product listing into a universal flow constant.

The primary measurement is mass over monotonic time. Volume and volume flow are
derived from mass using the trial's recorded liquid density.

```text
flow_g_s  = robust_slope(mass_g, device_time_s)
flow_ml_s = flow_g_s / density_g_ml
```

Preserve raw ADC counts, firmware-computed mass, the density source, and all fit
inputs so a result can be recomputed later.

## Test Identity

Keep these concepts separate:

- **pump model** — `kamoer-kphm600-12b3b17` or `gikfun-ae1207`;
- **pump specimen** — the labelled physical unit on the bench;
- **machine channel** — one of the eventual three ingredient paths;
- **load-cell calibration** — the counts-to-mass model in force for a trial;
- **trial** — one setup and execution plan;
- **step** — one duty, direction, and repeat within a trial; and
- **sample** — one time-stamped raw observation.

A published curve belongs to a specimen/configuration. Model-level comparisons
may aggregate specimens only after between-specimen variation is measured.

## Recorded Setup

Every trial records:

- specimen and model IDs;
- firmware commit/version and protocol version;
- bench hardware revision and transport;
- load-cell calibration ID and HX711 sample mode;
- tube manufacturer/part, material, ID, OD, lot, installation date, and hours;
- inlet/outlet lengths, lift/head, nozzle height, and reservoir level;
- liquid name, density value and source, temperature, and batch identity when
  relevant;
- measured 12 V rail and PWM frequency;
- prime method and time since prime;
- duty plan, repeat order, warmup, collection, settle, and stop settings; and
- operator notes, photos, leaks, bubbles, drips, faults, and exclusions.

Missing setup fields remain null/blank. Do not backfill a plausible value.

## Test Sequence

### Phase A — scale qualification

Complete the reference-mass, zero, drift, hysteresis, and off-center checks in
[calibration-harness.md](calibration-harness.md). The load-cell calibration ID
created here is required by every pump trial.

### Phase B — start threshold discovery

Prime to waste, then test one pump at a time.

- Kamoer: probe 11%, 13%, 15%, and 20%, because its data sheet identifies
  0–10% as stopped and 11–100% as the control interval.
- Gikfun: begin with a coarse ascending sweep, then bracket its observed start
  and restart thresholds. Seller listings do not establish a PWM dead zone.
- Record whether a running pump can remain moving below the duty required to
  start from rest. That hysteresis is operationally important.

Do not extrapolate through the dead zone.

### Phase C — steady flow map

Initial duty points are 20%, 40%, 60%, 80%, and 100%, plus the threshold points
from Phase B. Express duty as both normalized basis points and the board-level
timer count; normalized duty is the comparison axis.

For every step:

1. confirm the cylinder is empty, stable, and tared;
2. capture at least two seconds of baseline;
3. start a bounded pump command;
4. discard the defined startup/warmup window from the steady-flow fit;
5. collect enough water to produce a useful mass change without approaching
   vessel or load-cell limits;
6. stop locally at the planned deadline;
7. continue sampling through a settle/tail window;
8. calculate robust mass-versus-time slope only over the stable region; and
9. retain all data, including steps later rejected from the published curve.

The Kamoer may require a much shorter collection duration than the Gikfun. Use
target mass with a hard maximum time rather than forcing identical durations.

Run at least three repeats per point; five is preferred for the final water
curve. Randomize the duty order after threshold discovery so tube warming,
reservoir head, and drift do not align with duty.

### Phase D — transient dose map

Cocktail ingredients often run for only a few seconds, so steady-state flow is
not sufficient. At useful duties, repeat bounded 1 s, 2 s, and 5 s commands and
measure:

- command-to-mass-change start latency;
- final delivered mass after settling;
- stop latency and post-stop tail/dribble mass;
- effect of a short reversal, if tested; and
- restart behavior after idle.

Treat reversal as a separate setting. It can reduce dripping while changing the
next dose through air ingestion or backlash.

### Phase E — holdout validation

Hold back at least one repeat per duty from curve fitting. Predict the holdout
flow and short-dose mass before inspecting the observed result. Publish:

- mean and standard deviation by duty;
- coefficient of variation;
- fit residuals and holdout error;
- accepted operating domain;
- monotonicity or nonlinearity flags; and
- start/stop/tail model where supported.

Do not publish a single `R²` as proof of accuracy.

### Phase F — ingredient and installed-path validation

Water establishes the bench. It does not establish Kahlúa, syrup, citrus, gin,
vermouth, or Campari behavior.

Ingredient work waits for food-path and alcohol safety review. When allowed,
record actual liquid density and repeat at least the selected operating duties.
Installed-machine validation must repeat after tube length, head, nozzle, or
power distribution changes.

## Analysis Rules

### Stable-flow estimator

Fit mass against device monotonic time over the accepted stable window. Use a
robust linear estimator or explicitly documented outlier-resistant regression,
not adjacent-sample derivatives. Flag:

- HX711 saturation or timeout;
- mass decrease while commanded forward;
- slope changes suggesting bubbles or a slipping tube;
- vibration-correlated oscillation;
- sequence gaps;
- unstable supply voltage;
- insufficient mass change; and
- a fit window that crosses startup or tail behavior.

The backend produces the final result. The page may show a clearly labelled
provisional slope while a step is running.

### Curve representation

Begin with measured points. Monotone interpolation is allowed only when repeats
support a monotonic response within measurement uncertainty over the accepted
duty domain. If accepted points are materially non-monotonic, do not “repair”
them with a forced monotone fit: investigate and repeat the affected steps, then
publish a pointwise/segmented accepted domain or withhold the curve. Compare a
simple linear fit only as a diagnostic. Do not force both pump models into the
same equation, bridge a dead zone, or extrapolate below start threshold or above
the highest tested duty.

Every published curve stores:

- source trial and step IDs;
- algorithm version;
- accepted/rejected points and reasons;
- fit domain and parameters;
- uncertainty by duty;
- holdout metrics; and
- review status: `provisional`, `accepted`, or `superseded`.

### Recipe pour time

Recipes live in `firmware/config/recipes.yaml`. For each ingredient, select an
accepted curve from the physical pump specimen/configuration assigned to that
channel, plus a validated duty inside that curve's accepted domain:

```text
flow_i(d_i) = accepted_curve_i.interpolate(d_i)

steady_time_i(d_i) = required_volume_i / flow_i(d_i)

ingredient_time_i(d_i) = steady_time_i(d_i)
                       + measured_transient_correction_i(
                           d_i,
                           required_volume_i
                         )

recipe_time = max_i(ingredient_time_i for each assigned recipe ingredient)
```

The correction is a signed, measured start/stop/tail time equivalent from the
short-dose map; it is not an assumed constant added after taking the maximum.
If that correction has not been validated, publish `required_volume / flow` only
as a `STEADY-FLOW-ONLY ENGINEERING ESTIMATE`. Where an empirical short-dose
model has been validated, invert that dose model for the requested volume
instead of applying the steady-flow approximation.

The slowest concurrently poured ingredient sets the drink time. A fastest-pour
policy selects the highest validated safe duty for each assigned specimen and
path, not an advertised maximum or raw 100% PWM. A synchronized-finish policy
may invert an accepted curve to find a target **flow**, never to turn a volume
directly into time. That inversion is valid only when the accepted response is
monotonic within uncertainty and the target flow is inside the measured domain;
otherwise the result is unavailable. If different specimens, models, duties,
liquids, or installed paths are assigned to channels, calculate every
ingredient with its actual assignment.

Every recipe result stores and displays its curve-source `pumpSpecimenId` and
`curveId`. A model name may head the comparison column, but a curve from one
physical Kamoer or Gikfun is not a model-wide result. An installed-path result
requires the actual channel specimens; a hypothetical same-type design using a
single source specimen's curve remains a specimen-scoped engineering estimate.

The page must distinguish:

- water-derived engineering estimate;
- ingredient-specific estimate;
- installed-path validated estimate; and
- unavailable because a required curve does not exist.

It is invalid to assume the pump is linear, scale a 100% listing by raw PWM,
and call the resulting recipe time measured.

## Trial Acceptance

A step may be retained but excluded from a published curve. Store both
`quality_flags` and the reviewer decision.

Initial acceptance checks:

- correct trial, specimen, load-cell, firmware, and setup provenance;
- no safety or firmware fault;
- no unresolved sample gaps in the fit window;
- stable pre-run zero and plausible final settled mass;
- sufficient sample count and mass span;
- fit residual and repeatability inside the limits established after the first
  qualification set; and
- visual notes/photos do not show leaks, bubbles, tube movement, or contact with
  the scale.

Numerical repeatability limits remain open until the first qualification data
shows what the actual rig can achieve.

## Data Artifacts

The empty templates under `data/calibration/` document portable exports:

- `pump-trials-template.csv` — one row per trial;
- `pump-step-results-template.csv` — one row per test step; and
- `pump-samples-template.csv` — raw time-series observations.

The D1 schema and live protocol are defined in
[calibration-software.md](calibration-software.md). Raw archives include a
manifest, events, samples, row counts, and SHA-256 hashes.

## First Water Matrix

| Set | Pump | Purpose | Duties | Repeats |
| --- | --- | --- | --- | ---: |
| A | Kamoer | start threshold | 11%, 13%, 15%, 20% | 3 |
| B | Kamoer | steady curve | 20%, 40%, 60%, 80%, 100% in randomized order | 5 |
| C | Gikfun | discover start/restart threshold | coarse sweep, then bracket observed threshold | 3 |
| D | Gikfun | steady curve | 20%, 40%, 60%, 80%, 100%, excluding non-running points | 5 |
| E | Both, separately | short-dose behavior | selected low/mid/high operating duties; 1 s, 2 s, 5 s | 5 |
| F | Both, separately | holdout | withheld repeat at each published point | 1+ |
| G | Both together, later | partial supply-sag and cross-vibration check only | selected operating duty | 3 |

Primary calibration remains one pump at a time. The simultaneous two-pump test
is only a partial stress check; it neither validates the eventual three-channel
power system nor replaces isolated curves.

## Media and Review Evidence

- wide fixture photo with wet/dry boundary visible;
- pump label and specimen ID;
- load-cell mount and cable clearance;
- fixed outlet air gap;
- oscilloscope capture of Kamoer 20 kHz `SP`;
- emergency-stop test;
- live page during one accepted and one deliberately interrupted trial;
- curve with repeats and uncertainty, not only a polished trend line; and
- recipe table showing missing-data states before all curves exist.

## References

- [Kamoer KPHM600 data sheet](https://m.media-amazon.com/images/I/914PeMOVWiL.pdf)
- [Peristaltic pump flow-calibration guidance](https://www.lambda-instruments.com/peristaltic-pumps/user-manual/3-peristaltic-pump-flow-calibration/)
- [NIST mass and water-density reference](https://www.nist.gov/system/files/documents/iaao/Mass_Francisco-Garcia.pdf)
- [HX711 data sheet](https://cdn.sparkfun.com/datasheets/Sensors/ForceFlex/hx711_english.pdf)
