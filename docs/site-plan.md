# Site Plan

This document defines the public site skeleton for The Negroni Pony.

## Purpose

The site should make the project feel like a complete open-source artifact:
beautiful, funny, competent, and absurd. It should explain the object, show the
build, publish useful files, and make the engineering discipline visible without
claiming facts that have not been measured.

## Architecture

- Static React app under `site/`.
- React Router v7 framework mode with SSR disabled.
- Vite for local dev and production builds.
- Tailwind CSS v4 through the Vite plugin.
- Root `wrangler.jsonc` for Cloudflare static assets deployment.
- Cloudflare Workers Builds runs `pnpm build` before its default production or
  preview deploy command.
- Cloudflare serves `site/build/client` with single-page-app fallback.

The site does not need SSR, server actions, API routes, authentication, or
runtime database access for Milestone 1.

Milestone 2 introduces a specific runtime need for calibration only. Preserve
the static SPA and `ssr: false`, then add Worker-first `/api/*` routes, deliberate
`/calibration` header handling, D1, per-bench presence and per-trial Durable
Objects, and Cloudflare Access on operator routes as specified in
[calibration-software.md](calibration-software.md). Ordinary assets remain
asset-first, remote PR previews are read-only, and staging/production bindings
remain isolated.

## Cloudflare Build Settings

Use the repository root as the Cloudflare project root so Wrangler is discovered
automatically.

- Root directory: `/`
- Build command: `pnpm build`
- Production deploy command: `npx wrangler deploy`
- Preview deploy command: `npx wrangler versions upload`
- Worker name in `wrangler.jsonc`: `the-negroni-pony`
- Preview URLs in `wrangler.jsonc`: enabled
- Static assets directory in `wrangler.jsonc`: `./site/build/client`

Workers Builds does not honor Wrangler custom build commands, so the build step
must be configured in the Worker's build settings. The default deploy commands
then discover the root `wrangler.jsonc` without extra flags.

## Current Pages

- `/` - project overview, current milestone status, launch-site section map.
- `/build-log` - placeholder for milestones, decisions, failures, and review links.
- `/calibration` - planned single-page bench operator/readout, live trial,
  measured pump comparison, and six recipe predictions. It remains a
  placeholder until the scoped calibration implementation PR.
- `/open-source` - placeholder for source files, CAD, firmware, BOM, and safety notes.
- `/media` - placeholder for hero assets, build media, and launch release queue.

## Future Content Sources

- `docs/decision-record.md` for accepted decisions.
- `docs/project-plan.md` for public project narrative and scope.
- `docs/risk-register.md` for visible food-path, alcohol, power, and tool-safety notes.
- `firmware/` for pump and UI control code.
- `cad/` for scans, Nostril Nozzle iterations, and fabrication files.
- `data/calibration/` for measured pump data once created.
- Captured photos and video from the media checklist.

## Content Guardrails

- Do not invent pump model, tubing material, dimensions, material ratings, or
  validated safety claims.
- Mark unmeasured or unknown details clearly.
- Keep food-path, alcohol, power, and tool-safety notes visible.
- Treat calibration data as a first-class artifact.
- Preserve the decision record as implementation changes.

## Milestone 1 Exit Criteria

- The site can run locally with `pnpm dev`.
- The site builds with `pnpm build`.
- Type generation and TypeScript checks pass with `pnpm typecheck`.
- Cloudflare deployment config exists at the repo root and points at the static
  build output.
- Placeholder pages exist for future launch content.
