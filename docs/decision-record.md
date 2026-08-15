# Decision Record

This file tracks important project decisions. Add entries newest first.

## 2026-08-15 - Use a non-latching, edge-watched fail-off control chain

Status: Proposed construction baseline; electrical review and physical proof
remain mandatory

Context: USB can continue powering an Uno GPIO after pump power is removed, and
a static software permit does not detect code wedged HIGH or LOW. Releasing an
E-stop must not restart either pump. Generic relay/H-bridge descriptions were
not sufficient to buy or wire the bench.

Decision: Use Schneider `XB5AS8444` NC1 to remove the K1/K2 coil feed and its
isolated NC2 to report D7; Omron `MY4-GS-R DC12` as non-latching K1; Schneider
`LC1D09JD` as the measurement-gated K2 pump-bus disconnect; and Pololu DRV8874
carrier `#4035` in PH/EN mode for Gikfun. Gate all commands through
`SN74AHCT125N` with off-state pull-downs. Firmware toggles D8 every 25 ms from
the main loop; a `CD74HC123E` retriggerable one-shot drives the K1 coil sink and
expires if edges stop. A separate ARM button can pick up K1 only after D9/D10
have remained low through an independent RC/Schmitt delay. K1 must have no
manual test/latch lever.

Consequences: E-stop, USB loss, reset, firmware fault, and a HIGH/LOW main-loop
stall all have physical paths that drop control and require another ARM action.
Fuse amperages, DRV8874 VREF, wire sizes, K2 DC-use approval, timing windows,
thermal behavior, and release latency remain measurements, not catalog-title
assumptions. This is a custom fail-off prototype, not a certified safety or
functional-safety system.

## 2026-08-15 - Target the supplied Elegoo UNO R3 for the calibration bench

Status: Accepted for the Milestone 2 firmware baseline

Context: The physical controller is an Elegoo UNO R3 rather than the previously
assumed controller. The R3 uses a 16 MHz ATmega328P with 2 KB SRAM and no
onboard network interface. The Kamoer requires 10–30 kHz, 5 V PWM; the first
HX711 build needs only its as-received 10 SPS mode.

Options considered:

- Buy a different, newer 5 V controller.
- Use the supplied UNO R3 with an AVR-specific backend.
- Add embedded networking before the USB bench is qualified.

Decision: Use the supplied UNO R3. Configure Timer1 directly for 20 kHz fast
PWM on D9/OC1A for Kamoer and D10/OC1B for the Gikfun driver abstraction. Keep
Timer0 for the qualified device timebase. Use 250000-baud USB serial, fixed
small buffers with a 191-byte inbound limit, no Arduino `String`, monotonic host
command numbers, and a one-device EEPROM reset-session counter rather than
claiming random boot entropy. Acquire the HX711 on D4/D5 at 10 SPS and preserve
raw counts; do not invent a mass conversion or acknowledge a mass guard before
calibration is provisioned. Opening serial may reset the controller, so every
connection begins fail-off and requires a new handshake. Emit one final
context-bearing state for complete/fault/stop, then clear the local trial
context so continuing idle scale samples cannot make the browser spool infinite.

Consequences: The firmware becomes buildable on the hardware already owned,
but the 2 KB SRAM budget is a hard interface constraint. D9 and D10 share one
Timer1 frequency. Direct network transport is not a later firmware switch for
this board; it would require different hardware or an external adapter. The
actual USB bridge, timer output, line rate, device timebase, and optional HX711
80 SPS path remain physical qualification gates.

## 2026-08-14 - Bridge the first calibration bench through Web Serial

Status: Accepted

Context: The calibration controller must run bounded pump tests and stream
load-cell readings to the desktop readout and Cloudflare. A direct device
network path would require additional hardware plus embedded TLS, credential
provisioning, replay protection, and offline buffering before the physical rig
has been qualified. The desktop operator will already be present for water
tests.

Options considered:

- Arduino USB versioned serial stream to the calibration page through Web
  Serial.
- Direct HTTPS from a different network-capable controller or external adapter.
- A separately installed native serial daemon.

Decision: Use USB at 250000 baud and a Chromium Web Serial bridge for V1. Keep
control events and 10 SPS samples as compact, versioned NDJSON that fits the
UNO R3's fixed-buffer budget. The browser stores events in IndexedDB until
D1-projected acknowledgment and sends at-least-once idempotent batches. Keep the
cloud contract transport-neutral so another controller may implement it later.
The Arduino owns every stop deadline and watchdog; the public live page cannot
command pumps. An optional 80 SPS mode remains gated on the received HX711
`RATE` connection and a loss-free transport soak.

Consequences: The first bench has no embedded cloud credential and continues a
safe bounded test during an Internet interruption. The operator path requires a
supported desktop Chromium browser and an explicit port-selection gesture.
Read-only viewing works in ordinary modern browsers.

## 2026-08-14 - Add a Worker, D1, and calibration Durable Objects

Status: Superseded by the 2026-08-15 single-coordinator decision below

Context: Milestone 1 intentionally needed only static assets. Realtime,
authenticated calibration ingestion, durable samples, idempotent retry, and live
fanout are now concrete runtime requirements.

Options considered:

- Keep the site static and store trials only in local CSV files.
- Poll a D1-backed Worker without a realtime coordinator.
- Use one Worker with D1, a presence object per bench, and a Durable Object per
  active trial.

Decision: Preserve the static React Router SPA and root deployment convention,
then add Worker-first `/api/*` routes and deliberate `/calibration` header
handling, D1 as the canonical query store, a `BenchCoordinator` for connected-idle
presence, and one SQLite-backed `TrialCoordinator` per trial. The trial object
uses an alarm-drained outbox and broadcasts only a contiguous D1-projected
frontier. Protect `/api/v1/operator/*` with Cloudflare Access, validate JWTs
inside the Worker, and require a hashed trial-scoped producer lease. Keep remote
PR previews read-only and staging/production bindings isolated.

Consequences: The earlier static-site decision remains valid for rendering and
asset delivery, while the real runtime need is served at the same hostname.
Implementation adds migrations, authorization configuration, Worker/DO tests,
and production release gates. An event is broadcast only after durable storage.

## 2026-08-15 - Use one SQLite coordinator per physical bench

Status: Accepted

Context: Connected-idle truth, the one-active-trial invariant, producer-session
leases, trial replay, and final trial transitions all concern the same physical
bench. Splitting those rules between a presence object and per-trial objects
would create two coordination authorities and a handoff race around trial start
and completion.

Options considered:

- Keep the proposed presence object plus one Durable Object per trial.
- Use D1 alone for presence, ingest ordering, and live fanout.
- Use one named SQLite Durable Object per bench, with trial journals and scoped
  WebSocket streams inside it.

Decision: Use one `BenchCoordinator` named by `benchId`. It owns producer
presence, enforces one active trial, journals idempotent batches, projects the
contiguous durable frontier to D1, and serves both bench-scoped and
trial-scoped hibernatable WebSockets. D1 remains the canonical public query
store; the Durable Object remains the live coordination authority.

Consequences: Trial creation and completion are serialized with bench presence,
and `/calibration` can truthfully show a connected but idle bench without a
second object. A single busy bench has one coordination bottleneck, which is the
desired physical constraint for V1. Horizontal scale comes from naming another
object for each additional bench, not for each test.

## 2026-08-14 - Publish measured-only calibration results

Status: Accepted

Context: The supplied visual prototype contains simulated flow curves,
thresholds, linearity scores, and recipe durations. They are useful layout
fixtures but can be mistaken for actual bench evidence.

Options considered:

- Seed production with plausible demonstration data.
- Show the concept's values until physical tests replace them.
- Keep production results empty until source trials pass review.

Decision: Production shows explicit missing-data states until measured trials
produce reviewed curves. Simulation is allowed only in tests and isolated
previews with a persistent `SIMULATED DATA · NOT A CALIBRATION` label.

Consequences: Partial comparisons are honest and less visually convenient. Each
flow point and recipe prediction must link to pump specimen, trial, firmware,
load-cell calibration, liquid, tube, setup, and analysis version.

## 2026-08-01 - Build static assets in Cloudflare Workers Builds

Status: Amended by the 2026-08-15 safe-default environment decision below

Context: Cloudflare's default production and preview deploy commands discover
the root `wrangler.jsonc`, but the React site must be compiled before Wrangler
can upload `site/build/client`. Workers Builds does not honor custom build
commands declared inside `wrangler.jsonc`.

Options considered:

- Configure `pnpm build` as the Workers Builds build command and retain
  Cloudflare's default deploy commands.
- Replace both Cloudflare deploy commands with package scripts that build and
  deploy in one command.
- Commit generated Vite output so deployment does not need a build step.

Decision: Use the repository root as the Cloudflare root directory, run
`pnpm build` as the Workers Builds build command, and retain the default
`npx wrangler deploy` and `npx wrangler versions upload` deploy commands. Keep
the root package scripts self-contained for manual deployment. Enable preview
URLs explicitly in `wrangler.jsonc` so pull-request previews do not depend on
inherited dashboard state.

Consequences: Each pull-request branch can compile the static site before
Cloudflare uploads a preview version. The build command remains a Cloudflare
Workers Builds setting rather than Wrangler configuration, while
`wrangler.jsonc` remains the source of truth for the Worker name and static
asset directory.

## 2026-08-15 - Make the default Worker upload read-only and resource-free

Status: Accepted

Context: Workers Builds uses `wrangler versions upload` without an environment
flag for ordinary pull-request previews. The former root configuration carried
unprovisioned production D1 and Durable Object bindings, so even a preview
upload depended on resources that do not exist yet and widened the blast radius
of an accidental default deployment.

Decision: Keep the root Worker name `the-negroni-pony`, but make its runtime
read-only and omit D1, Durable Object, and declarative Durable Object exports.
Keep the explicit `preview` environment equally read-only and resource-free,
and retain writable local bindings in `env.local`. Put production bindings,
Access settings, and mutation enablement only in `env.production`, whose
explicit name remains the existing `the-negroni-pony` service. Manual and
connected production deploys must pass `--env production`; the default PR
version upload intentionally passes no environment flag.

Consequences: A default Workers Builds preview can bundle and upload the full
site/API code without access to calibration storage or mutation coordination.
Production writes cannot be enabled by config inheritance or an unqualified
Wrangler command. Before production deployment, the owner must provision real
resources, fill the production-only values, and update the connected Worker
production deploy command to `pnpm exec wrangler deploy --env production`.

## 2026-06-08 - Use static React Router site on Cloudflare

Status: Accepted

Context: The public project site needs to be deployable at the end of
Milestone 1 and should follow the proven Serenity app shape where practical.
The Negroni Pony repository is not a monorepo and the site does not need SSR,
API routes, authentication, or a runtime database for the launch skeleton.

Options considered:

- React Router v7 with Vite, SSR disabled, Tailwind, and Wrangler static assets.
- A plain Vite React single-page app without React Router framework config.
- A server-rendered React Router app with a Cloudflare Worker.

Decision: Use React Router v7 framework mode with `ssr: false`, Vite, Tailwind
CSS v4, and Wrangler static assets deployment to Cloudflare. Keep site source
and Vite/React Router config in `site/`, while package dependencies, scripts,
and `wrangler.jsonc` live at the repo root so Cloudflare can find deployment
configuration by default.

Consequences: The site can be built as static assets for Cloudflare and can grow
route-by-route as future milestones add content. Server routes and SSR-specific
Cloudflare Worker code are intentionally out of scope until a real need appears.
The Worker name is `the-negroni-pony` to match the Cloudflare Workers Builds
service/check name.

## 2026-06-08 - Move site and calibration planning before lab work

Status: Accepted

Context: Adam will be away from the lab for a week, so the next work should
prioritize tasks that can be done without physical access while still improving
the project direction.

Decision: Move website design and launch narrative to Milestone 1, calibration
harness design to Milestone 2, lab pump calibration to Milestone 3, and object
assessment/scanning/filming to Milestone 4.

Consequences: The project begins with the intended public artifact and uses the
away-from-lab window to plan the calibration rig. Physical sculpture measurement,
filming, scanning, and actual calibration resume when lab access is available.

## 2026-06-08 - Establish Milestone 0 repo skeleton

Status: Accepted

Context: The repository exists and needs a canonical planning foundation before
hardware, fabrication, firmware, calibration, and launch work begin.

Decision: Add README, project plan, decision record, risk register, Codex
instructions, initial directory structure, issue templates, media capture
checklist, and first Codex task list.

Consequences: Future work has a stable place to land. Open questions remain
visible instead of being guessed.

## 2026-06-08 - Use MIT license

Status: Accepted

Context: The repository was initialized with an MIT license for an open-source
project.

Decision: Keep MIT as the initial software/documentation license unless later
hardware, CAD, media, or brand assets require more specific licensing.

Consequences: Downstream reuse is straightforward, but hardware-specific and
media licensing may need explicit clarification before public launch.
