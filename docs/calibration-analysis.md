# Measured-data analysis and publication

This pipeline converts **durably completed physical trials** into a reviewable
flow-curve draft. It does not invent points, interpolate missing duty levels,
use advertised flow as evidence, or publish automatically. A named operator
must accept the evidence hash and then explicitly select the curve for the
public comparison.

## Evidence boundary

A draft is scoped to one physical `pumpSpecimenId`, not merely a product model.
Every source trial must be complete and must identify the same specimen and
model. Analysis reads samples only through the trial's durable published
frontier. The load-cell calibration's independent-check residual is carried
into point uncertainty.

The setup profile records:

- normalized liquid name and measured density/temperature;
- physical tube ID;
- inlet/outlet lengths, lift, and nozzle height;
- PWM frequency; and
- observed supply-voltage and temperature ranges.

For the initial water-only bench, the UI derives atmospheric-pressure pure-water
density from the operator-recorded temperature with the published
[UNESCO 1981 equation](https://www.hec.usace.army.mil/confluence/wqetm/reservoir-hydraulics/equation-of-state).
The recorded temperature and source string remain part of every trial; the
analyzer never substitutes a default room temperature.

Trials may be combined into one specimen curve only when the liquid, physical
tube ID, geometry, and PWM fields match exactly. Their supply spread may be at
most 100 mV and their
temperature spread at most 1 C. Those values are a predeclared V1 comparison
policy, not claims about pump insensitivity. Change the method version and rerun
analysis if physical qualification shows tighter limits are necessary.

## Deterministic V1 method

Method ID: `mass-slope-holdout-v1`.

For every planned step, the analyzer:

1. selects motor-on samples with the planned duty and a measured mass;
2. removes the planned warm-up interval and takes the planned collection
   interval;
3. requires at least eight points over at least 70% of the planned collection
   window (and at least 500 ms);
4. fits mass against device time with ordinary least squares;
5. converts the mass slope to volume using that trial's recorded liquid
   density; and
6. combines the 95% regression slope interval with the independent load-cell
   residual over the measured time span.

A run fails rather than being silently dropped if it contains a device fault,
has non-increasing time, non-positive flow, insufficient coverage, or R squared
below 0.98. V1 publishes forward-direction runs only; reverse-flow evidence
requires a separately reviewed method version and curve contract.

At each duty, runs are ordered by trial creation time, trial ID, and step index.
The final valid run is the holdout. At least two earlier runs train the point.
The point uncertainty combines within-run uncertainty and the 95% interval of
repeat variation. The holdout must be within the larger of 5% or the combined
point/holdout uncertainty. Publishing also requires at least three distinct
duty points and rejects a statistically significant decrease in flow as duty
increases.

Even failed evidence creates an inspectable **draft** when it is safely scoped.
Its `quality.publicationEligible` is false and its issues explain why. The
review endpoint cannot accept such a draft.

## Operator API

All routes below are inside the existing Cloudflare Access boundary. Production
uses Access identity; local development may use the explicitly configured local
operator token. Public routes never expose review identity or raw analysis
evidence.

```text
POST /api/v1/operator/calibration-curves/drafts
GET  /api/v1/operator/calibration-curves/{curveId}
POST /api/v1/operator/calibration-curves/{curveId}/review
POST /api/v1/operator/calibration-curves/{curveId}/publish
```

Create or idempotently retrieve a draft:

```json
{
  "schema": "tnp.calibration.curve-draft.create.v1",
  "sourceTrialIds": ["tr_..."]
}
```

Accept or reject it after independent inspection. `expectedEvidenceHash`
prevents a reviewer from approving evidence other than what they inspected.
Reasons are mandatory and stored in the immutable review audit row.

```json
{
  "schema": "tnp.calibration.curve-review.v1",
  "decision": "accept",
  "expectedEvidenceHash": "64 lowercase hex characters",
  "reason": "Independent review notes, at least eight characters."
}
```

Acceptance alone does not change the public comparison. Publishing is a second
explicit action:

```json
{
  "schema": "tnp.calibration.curve-publish.v1",
  "expectedEvidenceHash": "64 lowercase hex characters",
  "reason": "Why this tested specimen and setup are the public selection."
}
```

Publishing selects this exact curve and physical specimen for its pump-model
slot. The public read model does not search for the latest curve by model. It
loads the explicit selections and returns `setup_mismatch` instead of recipe
times when the two selected setup profiles are incompatible. Cross-pump
compatibility requires the same liquid, measured path geometry/head, and PWM,
plus supply and temperature within the stated tolerances. Each pump retains its
own explicit tube ID; different pump-specific tube IDs do not by themselves
invalidate the comparison. Recipe estimates
carry the curve's stored `estimateClass`; they do not infer evidence class from
the liquid name.

## CLI

The client sends no measurements of its own; it only invokes the authenticated
workflow against stored trials.

```sh
export CALIBRATION_API_BASE=https://your-calibration-origin.example
export CF_ACCESS_CLIENT_ID=service-token-client-id
export CF_ACCESS_CLIENT_SECRET=service-token-client-secret

node scripts/calibration/analysis-client.mjs draft --trial tr_abc --trial tr_def
node scripts/calibration/analysis-client.mjs get --curve curve_abc
node scripts/calibration/analysis-client.mjs review --curve curve_abc \
  --decision accept --evidence HASH --reason "Independent evidence review complete"
node scripts/calibration/analysis-client.mjs publish --curve curve_abc \
  --evidence HASH --reason "Matched specimen and setup selected for comparison"
```

For local Wrangler development, set `CALIBRATION_LOCAL_TOKEN` instead of the
two Access service-token variables. Never place either credential in source
control, a browser bundle, or a public deployment.

## Physical acceptance work still required

Passing this software gate is necessary, not sufficient. Before accepting the
first real curve, inspect the mass traces, verify tare and vessel behavior,
repeat the independent scale check, confirm the recorded supply and geometry,
and perform a separate timed-delivery check against a reference mass. If the
holdout or external check fails, reject the draft and retain it as evidence;
do not adjust thresholds after looking at the result without issuing a new
method version.
