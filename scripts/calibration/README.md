# Calibration Scripts

Future scripts in this directory should turn raw calibration CSV files into
reviewable summaries, charts, and firmware constants.

Do not bake in pump constants until the hardware, tubing, and liquid are named
in source data.

The first analysis implementation should share schemas and pure calculation
code with the Cloudflare service. It must preserve rejected runs, report fit
windows and uncertainty, validate holdout steps, and generate portable
manifest/CSV/NDJSON exports. A result is not publishable merely because a chart
can draw it.

The first build-time utility is planned as `generate-recipes.ts`. It validates
`firmware/config/recipes.yaml` and creates the versioned, result-free recipe
catalog consumed by the calibration UI and Worker. A check mode regenerates the
artifact and fails on drift; it never invents flow rates or recipe durations.
