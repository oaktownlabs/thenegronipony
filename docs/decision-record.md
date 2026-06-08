# Decision Record

This file tracks important project decisions. Add entries newest first.

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
