# Calibration Page Interface Plan

Status: Implemented Milestone 2 interface baseline; awaiting physical data and
production provisioning.

The supplied design archive was the visual starting point, not production code.
Its custom `x-dc` runtime and `support.js` do not ship. The implementation ports
the useful composition into the existing React Router application and binds
every value to an explicit API or serial state.

The exported archive screenshot is deliberately **not** embedded as an approved
reference asset. It contains hard-coded flow values, dead zones, curve shapes,
`R²`, recipe times, and adjectives such as “linear, honest”; all are
illustrative fiction. It also uses blue for liquid and active duty steps, which
conflicts with the color contract below. Do not link, ship, or use that image as
a visual-regression baseline. Reproduce only the archive's useful composition
and instrument character, with empty or provenance-backed states.

## Character

- A dark, stone-toned laboratory instrument that takes itself slightly too
  seriously.
- IBM Plex Serif for the project title and editorial moments; IBM Plex Mono for
  labels, units, timestamps, and numerals.
- Fine borders, engraved dividers, calibrated tick marks, small bolts, and one
  restrained analog meter.
- Dry institutional humor in secondary copy, never in safety or fault messages.
- No Victorian wallpaper, decorative pipe maze, brown “brass,” cyberpunk glow,
  or illegible steampunk typography.

## Color Contract

Use only Tailwind's stone palette plus `#0047AB`.

- Stone handles canvas, panels, borders, type, charts, pumps, cylinder, and
  inactive states.
- `#0047AB` appears only when live telemetry is demonstrably fresh.
- Do not use blue for the liquid, selected pump, buttons, chart series, links,
  or decorative highlights.
- Disconnected, connecting, and stalled connection states are grey. Every trial
  lifecycle label, including completed and never-run, is also grey even while
  the independent healthy-connection badge remains blue.
- Distinguish pumps with solid/dashed strokes, point shapes, direct labels, and
  typography rather than color.

The existing global site palette contains gold, vermouth, Campari, and lake
colors. `/calibration` requires a route-specific `CalibrationShell`, selected
before the generic site chrome in `site/src/app/root.tsx`. It must not render
`SiteHeader`, `PageIntro`, the gold pony mark, or the global gold/teal radial
background. Scope the shell, loading boundary, error boundary, links, controls,
and focus rings to stone plus cobalt so global tokens cannot leak into this
route.

## Live-State Definition

Connection health and trial lifecycle are independent view-model fields. A
completed trial does not make a healthy bench connection grey, and an open
socket does not make a stale connection healthy.

### Connection health

The page shows three link rows. Each row carries a source timestamp, its
negotiated/declared expected interval, and a continuously increasing age:

| Link | Operator source | Public viewer source |
| --- | --- | --- |
| `DEVICE` | Local monotonic arrival time of the last schema-valid serial sample or heartbeat | Durable view model's `latestDeviceEventReceivedAt` and expected heartbeat/sample interval |
| `CLOUD ACK` | Receipt of an idle bench acknowledgment (`durableAt`) or active `BatchAck` (`projectedAt`) containing the matching device frontier | Durable view model's `latestDurableAt`, durability scope, and last acknowledged device sequence |
| `VIEWER STREAM` | Local monotonic arrival time of the last WebSocket snapshot, delta, or heartbeat | Same WebSocket receive event in the public client |

For server timestamps, the initial age is derived from the snapshot's
`serverNow`, not the browser wall clock; thereafter it advances from the
browser's monotonic clock. For local events, record the monotonic receive time
directly. Never render a frozen `sampleAgeMs` supplied by an earlier payload.

For each link:

```text
stale_after_ms = max(3 * expected_interval_ms, 2000)
age_ms         = initial_age_ms + monotonic_time_since_receipt_ms
```

A missing timestamp or expected interval is `UNKNOWN`, never fresh by default.

The connection is healthy only when all links applicable to that viewer are
fresh, the serial/protocol handshake is valid where a serial connection is
present, and the latest device data frontier is durably acknowledged. An idle
firmware heartbeat must continue through persistence and WebSocket fan-out, so
health is measurable when no trial is active. A connected, idle bench therefore
shows the cobalt connection treatment alongside a separate stone `TRIAL IDLE`
label.

| Connection state | Color | Connection label |
| --- | --- | --- |
| No serial/device session | Stone grey | `BENCH DISCONNECTED` |
| Handshake or replay in progress | Stone grey | `CONNECTING TO BENCH` |
| Device fresh, durable acknowledgement unavailable | Stone grey | `LOCAL ONLY · UPLOAD QUEUED` |
| Any applicable link past its threshold | Stone grey | `STREAM STALLED` |
| All applicable links fresh and frontier durable | `#0047AB` | `BENCH CONNECTED · STREAM HEALTHY` |
| Transport or protocol fault | Stone grey with explicit text/icon | `BENCH LINK FAULT` |

The lifecycle label remains stone in every state: `TRIAL IDLE`, `TRIAL READY`,
`TRIAL RUNNING`, `TRIAL SETTLING`, `TRIAL COMPLETE`, `TRIAL ABORTED`, or
`SAFETY FAULT · PUMP OFF`. Thus `BENCH CONNECTED · STREAM HEALTHY` plus
`TRIAL IDLE` is a first-class good state, and trial completion never masquerades
as disconnection. The cobalt connection treatment is the only colored element.

## Desktop Composition

All primary components remain visible at once. No tabs, accordion sections,
view toggles, or carousels.

```text
+----------------------------------------------------------------------------+
| Oaktown Labs / Fluid Dynamics Division        serial / samples / LIVE STATE |
| THE NEGRONI PONY — PERISTALTIC THROUGHPUT ASSAY                            |
+--------------------------------------+-------------------------------------+
| LIVE COLLECTION                      | SPECIMENS                           |
| cylinder | duty gauge | readouts     | Kamoer card | Gikfun card           |
| step ladder + current quality        | actual model/specimen/provenance    |
| recent sample/step log               |                                     |
+--------------------------------------+-------------------------------------+
| FLOW RATE VS DUTY CYCLE              | POUR DURATION BY RECIPE             |
| measured points, uncertainty,        | six recipe cards, two pump results  |
| direct solid/dashed line labels      | or explicit missing-data reasons     |
+--------------------------------------+-------------------------------------+
| source trial / firmware / scale / liquid / tube / temperature / review     |
+----------------------------------------------------------------------------+
```

The public-readout reference acceptance viewport is exactly **1440 × 900 CSS
pixels at 100% zoom**. At that viewport the header, live instrument, sample
tape, both pump cards, flow comparison, six recipe cards, and footer are visible
together without a horizontal scrollbar or clipped panel. An authenticated
operator console remains on this same route and uses ordinary document
scrolling for its measured setup fields; it never hides data behind a tab,
toggle, accordion, carousel, or internally scrolling panel.

The public sample tape is deliberately bounded; retained history remains in the
durable record. The specimen panel contains exactly two cards. The flow plot
uses one fixed plot area. Recipe cards use a fixed 3 × 2 grid, with at most
three ingredient rows per card. Long IDs truncate visually but remain available
to assistive text and copy actions. Do not solve overflow with hidden tabs,
carousels, or scrollable subpanels.

At narrower widths, stack whole sections in the same order and allow document
scrolling without hiding any component. Increased text zoom may also reflow and
scroll; accessibility takes precedence outside the reference screenshot test.

### Data assembly

On direct navigation, fetch the versioned
`/api/v1/calibration/bootstrap?bench={configuredBenchId}` contract defined in
[calibration-software.md](calibration-software.md). It supplies bench presence,
the active/latest trial pointers, exactly two pump read models, and all six
recipe rows. Then join the bench-presence WebSocket; when `activeTrialId` is
non-null, also join that trial's ordered stream.

No active trial is a normal connected-idle state, not an error. The server
forbids multiple active trials for one bench. Local serial data may animate the
operator's current measurement before upload, but it must remain labelled
`LOCAL`/`PROVISIONAL` until its device frontier is projected and may not replace
the durable public comparison or recipe read models.

## Panel Contracts

### Header and connection

Show:

- `OAKTOWN LABS · FLUID DYNAMICS DIVISION · {benchLabel}`, sourced from bench
  configuration (`BENCH —` when absent, never an invented bench number);
- `The Negroni Pony — Peristaltic Throughput Assay`;
- one deadpan subtitle, such as “Determining, with unnecessary rigour, how long
  a machine takes to pour a drink.”;
- serial port label when locally connected;
- durably stored sample count; and
- the live-state treatment defined above.

The public page omits operator identity. The protected operator session may show
the verified Access identity in a quiet diagnostic area.

### Live collection

Show the current specimen, trial ID, and state, then:

- an animated graduated-cylinder visualization driven by mass-derived volume;
- collected **mass** as the primary measurement;
- mass-derived volume with density provenance;
- commanded normalized duty and board timer count;
- elapsed device time;
- provisional flow explicitly labelled `PROVISIONAL` while running;
- current step/repeat and full planned ladder;
- HX711 sample rate, latest sample age, supply voltage when measured, and active
  quality/fault flags; and
- recent samples or completed steps, newest first.

The cylinder graphic is not a second sensor. Its caption says
`MASS-DERIVED VOLUME` and it does not imply visual meniscus detection.

### Specimens

Two cards are always present:

1. `Kamoer KPHM600-12B3B17`
2. `Gikfun AE1207`

Each includes:

- a small provenance-safe product photo supplied by the owner or a monochrome
  SVG illustration derived from the owned hardware;
- physical specimen label;
- verified voltage, tube, and control-interface metadata;
- advertised/reference flow clearly labelled as such;
- accepted measured maximum only when a published curve exists;
- start threshold, repeatability, and accepted duty domain when measured; and
- latest calibration date and source-trial link.

The product images found in the concept archive have no recorded licensing
provenance and should not be published without review. Photograph the owned
pumps or use the inline schematic illustration style.

### Flow comparison

- X axis: normalized duty percent; raw timer/PWM value appears on hover/detail.
- Y axis: flow in mL/s, derived from mass and recorded density.
- Plot individual accepted step points, repeat dispersion/uncertainty, and the
  accepted interpolation inside its tested domain.
- Use solid versus dashed strokes and different markers.
- Direct-label each line; avoid a color-only legend.
- Shade or annotate untested/dead-zone regions rather than extrapolating.
- Provide visible fit version, source trials, liquid, tube, and review status.

If only one pump has accepted data, show that curve and an explicit “not yet
calibrated” state for the other. Do not manufacture symmetry.

### Six recipe comparisons

`firmware/config/recipes.yaml` is the only authored recipe catalog.
`worker/scripts/generate-recipes.mjs`, exposed as
`pnpm calibration:recipes:generate`, validates the catalog and writes
`shared/calibration/recipe-catalog.generated.ts`. The generated module
contains recipe IDs, display names, stable order, target/ingredient volumes,
and units only. It never contains a duration, flow, curve, status, or fallback
result.

Generation fails on duplicate/unstable IDs, a recipe outside one to three
ingredients, non-positive or non-finite volumes, unsupported units, or a
declared target that does not reconcile within the file's display-rounding
tolerance. `pnpm calibration:recipes:check` regenerates in memory and fails if
the checked artifact differs, so YAML edits cannot leave the route stale. The page renders
its six card shells from this generated artifact even when every results API is
unavailable; API prediction records join to cards by recipe ID rather than
duplicating recipe names in UI code.

Always render these six recipes in canonical YAML order:

1. California Negroni
2. Pony Espresso Martini
3. Old Pal
4. Mare-garita
5. Moscow Mule
6. Kentucky Derby Julep

Each card shows ingredient volumes and two specimen-scoped comparison slots.
Each slot is headed by the exact model name but is bound to an explicit
`pumpSpecimenId` and `curveId`, both visible in compact form. A result may not be
looked up, cached, or joined by pump model alone. Until reviewed aggregation
across multiple physical units exists, do not present a single specimen's
prediction as a model-wide Kamoer or Gikfun claim.

A slot is one of:

- measured ingredient-specific prediction;
- water-derived engineering estimate;
- installed-path validated result; or
- `—` with the missing curve/liquid/setup named.

Because up to three machine channels pour concurrently, the slowest assigned
ingredient sets the minimal recipe duration. Show the limiting ingredient,
curve-source specimen, calibration curve, liquid/path basis, and estimate
class. If any required assignment cannot resolve to an accepted curve for the
named specimen and setup, show `—` and the missing dependency. Never label a
water-derived time as the cocktail's measured pour time.

### Provenance footer

Keep a compact but accessible provenance strip visible:

- pump model and specimen;
- trial/curve IDs;
- firmware and analysis versions;
- load-cell calibration;
- liquid and density source;
- tube and installed geometry;
- temperature and supply voltage when measured;
- sample/step counts; and
- provisional/accepted/superseded review state.

## Operator Controls

The page remains a single composition. For an Access-authorized operator, an
always-visible bench strip adds:

- `CONNECT BENCH`;
- verified pump specimen and liquid/setup fields;
- `TARE`;
- reviewed test plan summary;
- guarded `START TRIAL`;
- dominant `STOP PUMP`; and
- export/retry diagnostics.

These are actions, not alternative views. The public read-only page shows the
same data panels without mutation controls.

Start remains disabled until:

- serial hello and supported firmware are valid;
- physical stop reports released;
- scale is stable and a current tare exists;
- selected specimen and test setup are complete;
- cloud trial creation and local spool both succeed; and
- every planned step is inside firmware safety limits.

`STOP PUMP` remains enabled whenever serial is open, regardless of cloud state.

## Empty, Simulation, and Error States

- Production starts empty and uses `—`, `NOT YET CALIBRATED`, or a specific
  missing-data reason.
- A simulator is allowed for automated tests and preview review only when the
  entire page carries a persistent `SIMULATED DATA · NOT A CALIBRATION` banner.
- Simulated records use isolated local test bindings or the explicitly deployed
  staging environment; ordinary PR previews and production remain unwritable,
  and simulated records cannot be published as accepted curves.
- Rejected trials remain inspectable with their fault/quality reasons.
- A failed WebSocket does not erase the last persisted snapshot; it greys the
  status and shows its age.

## Motion and Accessibility

- Gauge and cylinder motion interpolate between real samples; they do not imply
  extra measurements.
- Respect `prefers-reduced-motion` and remove needle jitter/bubbles.
- Connection, pump, and quality differences always have text in addition to
  shape/pattern.
- Use semantic tables for recent samples and recipe data.
- Keep units adjacent to values and never encode status by color alone.
- Maintain keyboard access and visible focus for every operator action.

## UI Acceptance Tests

- all six recipe names render from the canonical recipe configuration;
- the generated recipe artifact is in sync with YAML and contains no result
  values;
- both exact pump model names and specimen states render;
- no hard-coded flow, linearity, threshold, or recipe result appears in
  production bundles;
- source timestamps continue aging between messages and cross their negotiated
  fresh/stale thresholds correctly;
- healthy idle, running, completed, and faulted lifecycle fixtures do not alter
  connection health, and connected idle renders blue;
- blue appears only in the healthy connection treatment;
- in the public readout, live cylinder, gauge, sample log, curve, specimen
  cards, and recipe cards are simultaneously visible without clipped panels at
  exactly 1440 × 900;
- `/calibration` uses the route-specific stone/cobalt shell with no global gold,
  lake, vermouth, Campari, pony-mark, or radial-background treatment;
- single-pump, partial-liquid, rejected, completed, disconnected, and no-data
  fixtures all have honest layouts;
- reconnect snapshot/replay does not double-count points;
- unsupported Web Serial affects operator controls but not public viewing; and
- direct navigation to `/calibration` works in a Cloudflare preview.
