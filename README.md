# The Negroni Pony

The Negroni Pony is an open-source cocktail art machine from Oaktown Labs.

A metallic gold horse sculpture appears to drink from a lake. Guests place a
rocks glass into the lake base, select a cocktail, press a physical button, and
the horse dispenses the drink through its nostril using three dosing pumps.

The project is equal parts sculpture modification, hardware prototype,
fabrication project, open-source build, and Codex-driven software experiment.
The tone is over-engineered fun with good taste.

## V1 Scope

- One-to-three ingredient cocktail dispensing with recipe volumes tracked in
  `firmware/config/recipes.yaml`.
- Rocks-glass placement in the lake base.
- Recipe selector, small screen, large pour button, and theatrical lake/status
  lighting on the horse/lake module.
- Separate sidecar module for bottles, pumps, power, electronics, and service
  access.
- Scanning before any irreversible sculpture modification.
- Open-source docs, firmware, CAD, calibration data, site, scripts, and build
  notes.

The initial recipe catalog is documented in [docs/recipes.md](docs/recipes.md).

## Current Status

Milestone 0 is the repo and planning skeleton. The canonical project plan lives
at [docs/project-plan.md](docs/project-plan.md).

## Repository Map

- `docs/` - project plans, decision records, risks, build notes, and process docs.
- `firmware/` - controller code and tests once hardware choices are made.
- `electronics/` - breadboard notes, PCB files, BOM, and assembly notes.
- `cad/` - mechanical models for the sidecar, Nostril Nozzle, glass recess, and mounts.
- `laser/` - laser-cut panel files and fabrication templates.
- `scans/` - raw, processed, and exported sculpture scans.
- `data/` - calibration and pour datasets.
- `scripts/` - calibration, BOM, and media utilities.
- `site/` - public project site source and content.
- `media/` - reference photos, build footage, launch assets, and test media.

## Safety

This is a prototype art machine, not a commercial bar product. Alcohol,
electronics, food-contact materials, rotating pumps, tools, and sculpture
modification all require care. Unknown hardware specs should stay marked as
unknown until verified.

## License

MIT. See [LICENSE](LICENSE).
