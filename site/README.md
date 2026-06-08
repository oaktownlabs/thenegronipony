# Site

The public project site source and launch content lives here.

The site is a static React Router v7 app built with Vite and Tailwind CSS. The
root `wrangler.jsonc` config points Cloudflare at `site/build/client`.

## Commands

From the repository root:

- `pnpm dev` - run the local Vite dev server.
- `pnpm build` - build the static site.
- `pnpm typecheck` - generate React Router types and run TypeScript.
- `pnpm cloudflare:deploy` - build and deploy the static assets to Cloudflare.
- `pnpm cloudflare:preview` - build and upload a Cloudflare preview version.

## Content Shape

The current site is a placeholder scaffold for future milestone content:

- Build log
- Media
- BOM
- Calibration data
- CAD and fabrication files
- Firmware
- Powered by Codex narrative

Do not add hardware specs, material ratings, dimensions, food-path claims, or
safety claims until they are measured or otherwise validated.
