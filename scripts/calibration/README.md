# Calibration Scripts

Do not bake in pump constants until the hardware, tubing, and liquid are named
in source data. The implemented measured-data pipeline lives in the Worker and
is operated with `analysis-client.mjs`; it preserves rejected runs, reports fit
windows and uncertainty, validates holdouts, and requires separate review and
publication actions. See [the analysis contract](../../docs/calibration-analysis.md).

```sh
node scripts/calibration/analysis-client.mjs --help
```

The client does not fit local values or upload substitute measurements. It asks
the Access-protected API to analyze trials already stored through the durable
ingestion path.

The build-time recipe utility validates
`firmware/config/recipes.yaml` and creates the versioned, result-free recipe
catalog consumed by the calibration UI and Worker. A check mode regenerates the
artifact and fails on drift; it never invents flow rates or recipe durations.

## UNO R3 serial fixtures

`simulate_bench.py` is an intentionally isolated protocol simulator for browser
and ingestion development. Every frame carries `sim:true`, uses device ID
`SIMULATOR-NOT-CALIBRATION`, leaves `mg` null, and prints a warning to standard
error. It cannot produce a calibration result.

```sh
python3 scripts/calibration/simulate_bench.py --fixture
python3 scripts/calibration/simulate_bench.py < scripts/calibration/fixtures/host-commands.ndjson
```

`validate_protocol_fixture.py` checks the shipped host/device NDJSON fixtures,
including the 191-byte AVR command limit, sequencing, monotonic device fields,
simulated-data label, and finite context release after complete, fault, and
stop. Each terminal case has one context-bearing state followed by an anonymous
sample with null trial/step, pump none, and zero duty/timer count.

```sh
python3 scripts/calibration/validate_protocol_fixture.py \
  scripts/calibration/fixtures/host-commands.ndjson \
  scripts/calibration/fixtures/simulated-device.ndjson
```

These scripts exercise the wire shape; they do not replace the firmware's host
tests or an actual 250000-baud serial soak on the received Elegoo board.
