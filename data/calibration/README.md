# Calibration Data

Calibration data is a first-class project artifact.

The empty templates define portable exports for the cloud-backed calibration
system:

- `pump-trials-template.csv` — one row per trial and physical setup;
- `pump-step-results-template.csv` — one row per duty/repeat result; and
- `pump-samples-template.csv` — raw time-series observations.

Keep raw observations even when they are ugly; rejected trials often explain
the actual machine better than the polished chart. Missing values stay blank.
Product-listing rates never populate measured columns.

Database migrations and immutable NDJSON exports will be added with the
Cloudflare implementation. Do not add illustrative data rows to production
artifacts.
