# The Negroni Pony — Open Source Execution Plan

## 1. Project Summary

**The Negroni Pony** is an open-source cocktail art machine from **Oaktown Labs**.

A metallic gold horse sculpture appears to drink from a lake. Guests place a rocks glass into the lake base, select a cocktail, press a physical button, and the horse dispenses the drink through its nostril using three dosing pumps.

The project is equal parts:

- Cocktail robot
- Sculpture modification
- Hardware prototype
- Fabrication project
- Open-source build
- Codex-driven software experiment
- Ridiculous party artifact
- Oaktown Labs flagship project

The tone is:

> Over-engineered fun with good taste.

The project should be beautiful, funny, competent, and absurd.

## 2. Core Hook

The simplest description:

> I’m turning a metallic gold horse into a cocktail robot called The Negroni Pony. It pours drinks through its nostril.

The more complete version:

> The Negroni Pony is an open-source, Codex-powered, three-pump cocktail art machine from Oaktown Labs. The physical world is hand-built; the software, docs, site, data tooling, and source-controlled execution workflow are driven by Codex.

## 3. Launch Strategy

Because Oaktown Labs starts with zero followers, the project should not rely on incremental early social traction.

Instead, the build should be completed privately while capturing all physical-world work as photos, videos, notes, calibration data, sketches, failures, and decisions.

Then the project launches as a complete artifact:

- Polished marketing site
- Full open-source repo
- Build log
- Short-form video series
- Calibration data
- CAD files
- PCB design
- Firmware
- Bill of materials
- Failure notes
- First-pour video
- Party-test footage
- “Powered by Codex” narrative

After launch, release videos weekly from a prepared content bank.

The launch experience should feel like discovering that someone quietly built an absurdly complete thing.

## 4. Project Goals

### Primary Goals

- Build a working three-pump cocktail art machine.
- Preserve and modify the original horse sculpture if possible.
- Dispense cocktails through the horse’s nostril.
- Support one-to-three ingredient recipes with explicit pump volumes.
- Use a physical recipe selector, small display, and large pour button.
- Put the rocks glass into the lake base.
- Make the lake glow theatrically.
- Document the complete process.
- Open-source the full project.
- Use Codex to drive all software, documentation, site, data, and repo work.
- Capture enough content for a complete public launch.

### Secondary Goals

- 3D scan the original sculpture before modification.
- Create a test-printable nostril section before drilling the original.
- Design a beautiful sidecar module for bottles, pumps, power, and electronics.
- Create a custom PCB after breadboard validation.
- Create a polished Oaktown Labs project page.
- Build a reusable Oaktown Labs project template.
- Explore future sale of prints, kits, commissions, or finished pieces.

### Non-Goals for V1

- Public alcohol service
- Commercial bar deployment
- Ice automation
- Garnish automation
- Stirring or shaking
- Carbonation
- Dairy, citrus pulp, juices, or sticky syrups
- More than three pumps
- Full production manufacturing
- Battery power as a blocker
- Camera eye as a blocker

## 5. V1 Product Definition

V1 is a two-piece portable countertop system.

### Piece 1: Horse / Lake Module

The horse/lake module is the hero object.

It includes:

- Metallic gold painted horse sculpture
- Solid lake base
- Rocks glass recess
- Nostril pour point
- Physical recipe selector
- Small screen
- Large pour button
- Lake/status lighting
- Umbilical connection to sidecar

The controls should live on the horse/lake module so the ritual centers on the horse.

### Piece 2: Sidecar Pump Module

The sidecar is the tasteful lab-equipment module.

It includes:

- Three visible upright 750 mL bottles
- Tubes dropped into bottles
- Three peristaltic dosing pumps
- Pump drivers
- Power supply
- Microcontroller and service electronics
- Tubing management
- Optional clear or smoked acrylic panels
- Optional brass hardware
- Optional Oaktown Labs maker’s mark

The sidecar should be beautiful enough to sit next to the sculpture on a counter.

## 6. Locked Decisions

- Project name: **The Negroni Pony**
- Brand: **Oaktown Labs**
- Voice: **over-engineered fun with good taste**
- Hero object: metallic gold horse sculpture
- Glass: rocks glass only for V1
- Glass placement: recess in lake base
- Pump count: three
- Bottle count: three
- Bottle orientation: upright
- Bottle visibility: visible labels
- Tube approach: tubes drop into bottles
- Sidecar distance: about 24 inches from horse
- UI location: horse/lake base
- UI controls: recipe selector, small screen, large pour button
- Lighting: in scope
- Scanning: scan before drilling
- First public account: Oaktown Labs
- Social strategy: build privately, launch complete, release prepared content weekly
- Software strategy: Codex-driven
- Open-source strategy: publish repo, docs, CAD, firmware, calibration data, and site

## 7. Open Decisions

- Exact horse material
- Exact pump model
- Exact tubing material and diameter
- Sidecar fabrication method
- Plug-in only vs rechargeable battery later
- Control electronics architecture
- Screen type and size
- Recipe selector hardware
- Pour button style
- Lake lighting method
- Glass recess construction method
- Nostril Nozzle geometry
- Nostril Nozzle material
- Whether the umbilical uses quick disconnects
- Exact Oaktown Labs visual identity
- Marketing site tech stack
- License selection
- Whether future replicas are sold as files, kits, commissions, or finished pieces

## 8. Design Principles

### 8.1 Optimize for the Ridiculous

Every milestone should ask:

> What is the most ridiculous version of this that is still tasteful?

Examples:

- Calibration data presented like serious lab science for a horse nose cocktail robot.
- A component named the **Nostril Nozzle**.
- A formal drilling plan for “nostril intervention.”
- A lake glow state machine.
- A **PONY POUR** button.
- A pump calibration chart for Campari.
- A PCB for a horse-based Negroni dispenser.
- A GitHub repo with professional engineering discipline for a deeply silly object.

### 8.2 Make the Joke Better by Taking the Engineering Seriously

The project is funny because the execution is real.

Do not make it sloppy. The more precise the docs, calibration, fabrication, firmware, and site are, the better the joke lands.

### 8.3 Separate Sculpture Magic from Machine Serviceability

The horse should be magical.

The sidecar should be serviceable.

Do not force the sculpture to hold bottles, pumps, or maintenance complexity.

### 8.4 Scan First, Drill Last

The original object may not survive modification. The project should treat it with respect.

Required sequence:

1. Photograph
2. Measure
3. Scan
4. Print/test nostril section
5. Drill test piece
6. Only then drill original

### 8.5 Food Path Simplicity

V1 should keep the fluid path simple.

Preferred V1 strategy:

- Three separate ingredient tubes
- Three separate pumps
- No internal mixing manifold
- Tubes remain separate to the nostril
- Removable Nostril Nozzle holds tube ends
- Cleaning and replacement are straightforward

### 8.6 Open Source Everything Useful

The public artifact should include:

- Firmware
- Site code
- Calibration scripts
- Calibration data
- BOM
- PCB files
- CAD files
- Laser files
- Assembly notes
- Drilling plan
- Scanning notes
- Build log
- Failure log
- Social media assets where appropriate

## 9. System Architecture

### 9.1 Fluid System

The fluid system uses three pumps and three bottles.

Initial recipes are tracked in `docs/recipes.md` and
`firmware/config/recipes.yaml`.

All initial recipes target a 200 ml pour.

V1 recipe constraints:

- One-to-three pumpable ingredients per recipe
- No dairy
- No citrus pulp
- Juices, sour mix, syrups, espresso, and carbonated mixers require validation
  before they are treated as reliable party-mode ingredients
- No ice automation
- No stirring
- No shaking

Initial recipe catalog:

| Recipe | Ratio | Target Pour |
|---|---|---:|
| California Negroni | 6 St. George Gin / 5 Antica Formula Vermouth / 3 Bruto Americano | 200 ml |
| Pony Espresso Martini | 2 Hanger One Vodka / 1 Kahlua / 1 Espresso | 200 ml |
| Old Pal | 1 Michter's Rye / 1 Antica Formula Vermouth / 1 Bruto Americano | 200 ml |
| Mare-garita | 6 Mescal / 4 Grand Marnier / 3 Sour mix | 200 ml |
| Moscow Mule | 2 Hanger One Vodka / 4 Ginger beer / 1 Lime juice | 200 ml |
| Kentucky Derby Julep | 4 Woodford Reserve / 1 Syrup | 200 ml |

### 9.2 Electronics System

Likely architecture:

- Controller in sidecar
- Pump drivers in sidecar
- Power supply in sidecar
- Low-voltage control/screen/lighting lines to horse module
- Physical controls on horse/lake base
- Optional local web UI for admin

Public controls:

- Recipe selector
- Small screen
- Large pour button
- Lighting states

Admin functions:

- Prime Pump A
- Prime Pump B
- Prime Pump C
- Flush all lines
- Calibrate pumps
- Edit recipe ratios
- View pour count
- Run lighting test
- Enable/disable party mode

### 9.3 Mechanical System

#### Horse / Lake Module

Mechanical tasks:

- Determine material
- Scan object
- Design rocks glass recess
- Design tube routing
- Design Nostril Nozzle
- Drill nostril
- Route tubing
- Add lighting
- Add controls
- Preserve visual quality

#### Sidecar Module

Mechanical tasks:

- Hold three upright bottles
- Route dip tubes cleanly
- Mount three pumps
- Protect electronics
- Provide service access
- Manage umbilical
- Support transport
- Look excellent

Candidate sidecar materials:

- Black acrylic
- Smoked acrylic
- Clear acrylic
- Brass standoffs/screws
- Plywood/acrylic hybrid
- 3D-printed brackets
- Laser-cut panels

## 10. The Nostril Nozzle

The component that routes the three tubes through the horse nostril is named:

> **The Nostril Nozzle**

This is non-negotiable.

Recommended V1 design:

- Removable insert or ferrule
- Holds three separate tubes
- Hides rough drilled edge
- Allows tube replacement
- Avoids internal mixing
- Can be prototyped with 3D printing
- Can later be upgraded to brass, black Delrin, stainless, or another appropriate material

Open visual options:

- Tubes flush with nostril
- Tubes protruding slightly
- Black insert
- Brass insert
- Decorative nostril ring
- Hidden cartridge

V1 recommendation:

> Three separate tubes held by a removable black or brass ferrule, terminating near-flush or protruding slightly from the nostril.

## 11. Lighting

Lighting is part of V1.

Lighting should support the ritual.

Candidate states:

| State | Behavior |
|---|---|
| Off | System powered down |
| Ready | Warm lake glow |
| Recipe selected | Gentle pulse |
| Pouring | Theatrical glow/pulse |
| Done | Brief celebratory shimmer |
| Cleaning | Cool/utility animation |
| Error | Distinct warning pulse |
| Refill/check line | Bottle-specific prompt if supported |

Lighting should help the social video without making the object tacky.

## 12. Power Strategy

V1 recommendation:

> Use plug-in power first. Design for possible battery later.

Reasoning:

- Pumps draw meaningful current.
- Lighting adds load.
- Battery adds charging/safety/enclosure complexity.
- Reliability matters more than cordless operation for V1.
- A battery module can be a later sidecar upgrade.

## 13. Scanning Plan

The original sculpture must be scanned before drilling.

Goals:

- Preserve the original geometry.
- Capture nostril area.
- Capture base/lake area.
- Create a working mesh for CAD reference.
- Print a nostril-region test piece.
- Test drilling and nozzle insertion before modifying the original.

Tasks:

- [ ] Clean object gently.
- [ ] Photograph object from all angles.
- [ ] Capture full iPhone photogrammetry scan.
- [ ] Capture close-up face/nostril scan.
- [ ] Capture lake/base scan.
- [ ] Archive raw outputs.
- [ ] Clean working mesh.
- [ ] Extract nostril region.
- [ ] Print nostril test piece.
- [ ] Drill printed test piece.
- [ ] Fit Nostril Nozzle prototype.

Deliverables:

- `scans/raw/`
- `scans/processed/`
- `cad/nostril-test-piece/`
- `docs/scanning-plan.md`
- `docs/scan-results.md`

## 14. Calibration Strategy

Calibration should be treated as a major content and engineering artifact.

Preferred approach:

- Dispense into a cup on a scale.
- Measure grams dispensed over time.
- Repeat multiple times.
- Calculate flow rate per pump.
- Store pump calibration constants.
- Re-test with actual ingredients.
- Track calibration data in source control.

Data to capture:

- Pump ID
- Tubing ID
- Liquid
- Voltage
- Run duration
- Mass dispensed
- Calculated g/sec
- Trial number
- Notes
- Ambient conditions if useful

Deliverables:

- `data/calibration/*.csv`
- `docs/pump-calibration.md`
- `scripts/calibration/`
- Calibration charts for the site

Ridiculous content opportunity:

> The horse demands calibrated Campari.

## 15. Repository Structure

```text
negroni-pony/
  README.md
  LICENSE
  AGENTS.md

  docs/
    project-plan.md
    decision-record.md
    risk-register.md
    object-assessment.md
    scanning-plan.md
    scan-results.md
    fluid-system.md
    pump-calibration.md
    electronics-plan.md
    firmware-plan.md
    sidecar-design.md
    glass-recess-plan.md
    nozzle-design.md
    drilling-plan.md
    integration-plan.md
    cleaning-plan.md
    safety-notes.md
    launch-plan.md
    content-plan.md
    codex-workflow.md

  firmware/
    README.md
    src/
    tests/

  electronics/
    README.md
    breadboard/
    kicad/
    bom.csv
    assembly-notes.md

  cad/
    README.md
    sidecar/
    nostril-nozzle/
    nostril-test-piece/
    glass-recess/
    mounts/

  laser/
    acrylic-panels/
    templates/

  scans/
    raw/
    processed/
    exports/

  data/
    calibration/
    pours/

  scripts/
    calibration/
    bom/
    media/

  site/
    README.md
    src/
    public/
    content/

  media/
    reference/
    scanning/
    pump-tests/
    calibration/
    sidecar/
    nozzle/
    drilling/
    first-pour/
    party-test/
    launch/
```

## 16. Codex Workflow

This project should be explicitly built as a Codex-driven open-source workflow.

### Principle

Physical work is done by humans.

All source-controlled digital work should be delegated to Codex where practical:

- Docs
- Firmware
- Tests
- Calibration scripts
- Data visualization
- Site
- Build log formatting
- PCB documentation
- BOM tooling
- Issue creation
- PR summaries
- Release notes
- Social draft generation

### Public Claim

The project may use a claim like:

> No source-controlled code was hand-written. The physical world was built by humans; the software, docs, site, scripts, and repo workflow were driven by Codex and reviewed by Oaktown Labs.

This claim should only be used if it remains true.

### Human Review Rule

Codex may generate work, but Oaktown Labs owns the result.

Every Codex-generated change must be reviewed before merge.

### Suggested `AGENTS.md` Themes

- Optimize for clarity, safety, and maintainability.
- Prefer small files and small functions.
- Include tests for firmware logic where possible.
- Keep docs practical and buildable.
- Never invent hardware specs; mark unknowns clearly.
- Preserve decision records.
- Update docs when implementation changes.
- Treat calibration data as a first-class artifact.
- Keep the voice tasteful, funny, and technically serious.

## 17. Milestone Plan

### Milestone 0 — Repo and Planning Skeleton

#### Goal

Create the source-controlled home for the project.

#### Tasks

- [ ] Create GitHub repo.
- [ ] Add README.
- [ ] Add project plan.
- [ ] Add decision record.
- [ ] Add risk register.
- [ ] Add AGENTS.md.
- [ ] Add initial directory structure.
- [ ] Add issue templates.
- [ ] Add media capture checklist.
- [ ] Add first Codex task list.

#### Deliverables

- Repo exists.
- Markdown docs exist.
- Codex has clear instructions.
- Oaktown Labs project has a canonical source of truth.

#### Media Capture

- Screenshot repo creation.
- Record short intro video: “This is our first Oaktown Labs project.”
- Capture the horse reveal separately.

### Milestone 1 — Website Design and Launch Narrative

#### Goal

Begin with the end in mind by designing the public project page, content
structure, and launch narrative before the next lab session.

#### Tasks

- [ ] Define Oaktown Labs site direction.
- [ ] Design The Negroni Pony project page structure.
- [ ] Draft homepage and project-page copy.
- [ ] Define build-log content types.
- [ ] Define recipe, calibration, CAD, firmware, and media sections.
- [ ] Create placeholder page content for current known facts.
- [ ] Identify missing media required for launch.
- [ ] Create a site implementation plan.

#### Deliverables

- `site/`
- `site/content/negroni-pony/`
- `docs/site-plan.md`
- Initial project-page copy
- Launch narrative outline

#### Media Capture Planning

- Hero video requirements.
- Horse reveal shot list.
- Calibration chart concepts.
- “Powered by Codex” section requirements.
- Open-source artifact checklist.

### Milestone 2 — Calibration Harness Design

Status: In review via Milestone 2 PR. The plan now covers the physical bench,
guarded firmware, USB bridge, Cloudflare ingestion/storage/realtime service,
measured-only UI, and integrated acceptance. Physical-part identification,
food-path selection, and external Cloudflare configuration remain explicit
owner gates.

#### Goal

Design the pump calibration workflow and bench harness before returning to the
lab.

#### Tasks

- [x] Select pump candidates.
- [ ] Select tubing candidates.
- [x] Define calibration fixture requirements.
- [x] Define bottle, tube, pump, cup, and scale layout.
- [x] Define calibration CSV schema.
- [x] Draft calibration procedure.
- [x] Draft repeatability and anti-drip test procedure.
- [x] Draft flush and cleaning validation procedure.
- [x] Identify parts or tools needed before lab calibration.
- [x] Define proposed wiring, motor control, power protection, and interlocks.
- [x] Define guarded calibration firmware and versioned serial protocol.
- [x] Define browser bridge and offline/retry behavior.
- [x] Define Cloudflare Worker, D1, Durable Object, authorization, and deployment plan.
- [x] Define the single-page live readout and measured-only states.
- [x] Define end-to-end automated and hardware-in-loop acceptance.
- [ ] Close the owner gates in `docs/open-questions.md`.
- [x] Plan calibration photos and video shots.

#### Deliverables

- `docs/fluid-system.md`
- `docs/calibration-system-plan.md`
- `docs/pump-calibration.md`
- `docs/calibration-harness.md`
- `docs/calibration-software.md`
- `docs/calibration-ui.md`
- `docs/open-questions.md`
- `data/calibration/`
- `scripts/calibration/`
- Trial, step-result, and raw-sample data templates
- Calibration-screen visual contract derived from the supplied archive, with
  fictional values and product photos lacking verified publication rights
  excluded

#### Media Capture Planning

- Scale calibration setup.
- Pump and tubing layout.
- Anti-drip test framing.
- “The horse demands calibration” chart concept.

### Milestone 3 — Pump Bench Calibration

#### Goal

Implement the instrumented calibration system, compare the Kamoer and Gikfun
specimens with real water data, and establish evidence suitable for choosing
the eventual three machine channels.

#### Entry Criteria

- Calibration harness plan complete.
- Pump candidates selected and received hardware identified.
- Scale and test vessels available.
- Calibration data schema ready.
- Food-path tubing is not required for the first water-only qualification.
- Cloudflare owner gates are closed or the run is explicitly local-only.

#### Tasks

- [ ] Build bench rig.
- [ ] Implement and dry-test guarded calibration firmware.
- [ ] Implement the Web Serial bridge and local spool.
- [ ] Implement authenticated Cloudflare ingest, D1 storage, bench presence,
  and per-trial live fanout.
- [ ] Implement the measured-only `/calibration` page from the approved concept.
- [ ] Pass synthetic, reconnect, duplicate, abort, and deployment tests.
- [ ] Qualify the load-cell platform with reference masses.
- [ ] Run water tests.
- [ ] Run alcohol-safe fluid tests.
- [ ] Test recipe ingredients.
- [ ] Measure flow rates.
- [ ] Test repeatability.
- [ ] Test anti-drip pump reversal.
- [ ] Test tube priming.
- [ ] Test flush process.
- [ ] Record calibration data.
- [ ] Generate first calibration charts.
- [ ] Publish reviewed curves and six recipe engineering estimates with provenance.

#### Deliverables

- Completed calibration datasets in `data/calibration/`
- `firmware/calibration-bench/`
- `worker/` and D1 migrations
- Production calibration API and live page
- Calibration scripts in `scripts/calibration/`
- First calibration charts
- `docs/pump-calibration.md` updated with results

#### Media Capture

- First pump running.
- Three pumps running together.
- Scale calibration setup.
- Ingredient calibration data.
- Anti-drip failures.
- “This is how much engineering it takes to make a horse sneeze a cocktail.”

### Milestone 4 — Object Assessment, Scanning, and Filming Plan

#### Goal

Measure, film, and digitally preserve the original horse before modification.

#### Tasks

- [ ] Create art measurement plan.
- [ ] Create filming and shot plan for the sculpture.
- [ ] Photograph horse and lake base.
- [ ] Measure object.
- [ ] Inspect underside and seams.
- [ ] Identify likely material.
- [ ] Capture full-object scan.
- [ ] Capture nostril close-up scan.
- [ ] Capture lake/base scan.
- [ ] Archive raw scan files.
- [ ] Create cleaned working mesh.
- [ ] Extract nostril test section.
- [ ] Create scan notes.

#### Deliverables

- `docs/object-assessment.md`
- `docs/scanning-plan.md`
- `docs/scan-results.md`
- `docs/art-measurement-plan.md`
- `docs/filming-plan.md`
- `scans/raw/`
- `scans/processed/`
- `cad/nostril-test-piece/`

#### Media Capture

- Hero shots of the gold horse.
- Close-up nostril shots.
- Base and lake detail shots.
- Measurement setup.
- “Before we drill the horse’s nose, we scan the horse.”
- Screen recording of scan processing.
- Bad scan results if funny.

### Milestone 5 — Firmware Breadboard Prototype

#### Goal

Control the three pumps reliably with recipe logic.

#### Tasks

- [ ] Select controller.
- [ ] Wire pump drivers.
- [ ] Add recipe model.
- [ ] Add pump calibration constants.
- [ ] Add pour sequence.
- [ ] Add prime mode.
- [ ] Add flush mode.
- [ ] Add anti-drip mode.
- [ ] Add state machine for UI.
- [ ] Add serial/debug logging.
- [ ] Add tests where practical.

#### Deliverables

- `firmware/`
- `docs/firmware-plan.md`
- `docs/electronics-plan.md`

#### Media Capture

- Breadboard overview.
- Button triggers pump.
- First software-controlled recipe pour.
- Terminal/debug output if visually interesting.
- “Powered by Codex” workflow clips.

### Milestone 6 — Horse Base UI and Lighting Prototype

#### Goal

Prototype the user-facing controls and lake glow.

#### Tasks

- [ ] Select recipe selector.
- [ ] Select small screen.
- [ ] Select pour button.
- [ ] Prototype lake lighting.
- [ ] Define UI states.
- [ ] Test controls off-sculpture.
- [ ] Decide control placement on base.
- [ ] Decide wiring route to sidecar.
- [ ] Prototype visual layout.

#### Deliverables

- `docs/ui-plan.md`
- `docs/lighting-plan.md`
- `firmware/ui/`
- UI state table

#### Media Capture

- Button glamour shot.
- Lake glow tests.
- Recipe selector tests.
- “PONY POUR” label experiments.
- Serious UI for unserious purpose.

### Milestone 7 — Nostril Nozzle Prototype

#### Goal

Design and validate the tube interface before drilling the original.

#### Tasks

- [ ] Design first Nostril Nozzle.
- [ ] Print or fabricate test insert.
- [ ] Print nostril-region test piece.
- [ ] Drill printed nostril section.
- [ ] Fit three tubes.
- [ ] Test flush vs protruding tubes.
- [ ] Test drip behavior.
- [ ] Test red liquid pour.
- [ ] Choose V1 nozzle geometry.
- [ ] Document learnings.

#### Deliverables

- `cad/nostril-nozzle/`
- `cad/nostril-test-piece/`
- `docs/nozzle-design.md`
- `docs/nozzle-test-results.md`

#### Media Capture

- First Nostril Nozzle reveal.
- Tube protrusion test.
- Red liquid test.
- Dad-joke title card: “Nostril Nozzle R&D.”
- Failure closeups.

### Milestone 8 — Sidecar Design and Fabrication

#### Goal

Build the tasteful lab-equipment sidecar.

#### Tasks

- [ ] Define sidecar layout.
- [ ] Mock bottle positions.
- [ ] Mock pump positions.
- [ ] Decide material approach.
- [ ] Design bottle holders.
- [ ] Design pump deck.
- [ ] Design electronics bay.
- [ ] Design tubing paths.
- [ ] Design umbilical strain relief.
- [ ] Fabricate first sidecar.
- [ ] Mount pumps and bottles.
- [ ] Run water test.

#### Deliverables

- `docs/sidecar-design.md`
- `cad/sidecar/`
- `laser/acrylic-panels/`
- `electronics/breadboard/`

#### Media Capture

- Sidecar sketches.
- Laser cutting.
- Acrylic/brass assembly.
- Bottle lineup.
- Tubing routing.
- Sidecar glamour shot.

### Milestone 9 — Glass Recess Prototype

#### Goal

Create the rocks glass placement system in the lake base.

#### Tasks

- [ ] Select target rocks glass.
- [ ] Measure glass base diameter.
- [ ] Prototype removable recess/insert.
- [ ] Align under nostril.
- [ ] Test splash behavior.
- [ ] Test wipe-down.
- [ ] Decide whether to cut original base.
- [ ] Finalize V1 recess approach.

#### Deliverables

- `docs/glass-recess-plan.md`
- `cad/glass-recess/`

#### Media Capture

- Glass placement tests.
- Lake recess sketches.
- Pour alignment tests.
- Absurdly serious “glass landing zone” language.

### Milestone 10 — Drill the Original

#### Goal

Modify the original horse for the real pour path.

#### Entry Criteria

- Scan complete.
- Nostril test piece complete.
- Nozzle tested.
- Drill strategy documented.
- Acceptance of risk confirmed.

#### Tasks

- [ ] Mask nostril area.
- [ ] Mark drill path.
- [ ] Drill pilot hole.
- [ ] Step up gradually.
- [ ] Inspect after every step.
- [ ] Fit Nostril Nozzle.
- [ ] Route tubes.
- [ ] Test with water.
- [ ] Document results.

#### Deliverables

- `docs/drilling-plan.md`
- `docs/drilling-results.md`

#### Media Capture

- High-drama drilling setup.
- “Will the horse survive?”
- First hole.
- Nozzle fit.
- First water-through-nostril moment.

### Milestone 11 — Integrated Prototype

#### Goal

Connect horse, sidecar, UI, lighting, pumps, and firmware.

#### Tasks

- [ ] Connect sidecar to horse.
- [ ] Route 24-inch umbilical.
- [ ] Connect controls and lighting.
- [ ] Run water-only test.
- [ ] Run colored-water test.
- [ ] Run actual Negroni test.
- [ ] Test cleaning cycle.
- [ ] Test 10-pour run.
- [ ] Test transport/setup/breakdown.
- [ ] Document failure modes.

#### Deliverables

- `docs/integration-plan.md`
- `docs/integration-results.md`
- `docs/cleaning-plan.md`
- `data/pours/`

#### Media Capture

- First full-system setup.
- First water pour.
- First red pour.
- First real Negroni.
- Cleaning reality.
- “This should not work, but it does.”

### Milestone 12 — PCB Design

#### Goal

Replace breadboard wiring with a cleaner, reproducible board.

#### Tasks

- [ ] Freeze electronics requirements.
- [ ] Create schematic.
- [ ] Select connectors.
- [ ] Add pump driver circuits.
- [ ] Add power protection.
- [ ] Add control/screen/light connections.
- [ ] Add debug/programming access.
- [ ] Layout PCB.
- [ ] Review design.
- [ ] Order prototype boards.
- [ ] Assemble board.
- [ ] Smoke test.
- [ ] Run pump load test.
- [ ] Document bring-up.

#### Deliverables

- `electronics/kicad/`
- `electronics/bom.csv`
- `electronics/assembly-notes.md`
- `docs/pcb-bringup.md`

#### Media Capture

- PCB design screenshots.
- Board arrival.
- Soldering/assembly.
- Smoke test.
- “Yes, we made a PCB for the horse.”

### Milestone 13 — Launch Package

#### Goal

Prepare the public release as a complete artifact.

#### Tasks

- [ ] Finalize README.
- [ ] Finalize build docs.
- [ ] Finalize media assets.
- [ ] Finalize launch video.
- [ ] Finalize weekly video release queue.
- [ ] Finalize social captions.
- [ ] Finalize site.
- [ ] Finalize repo license.
- [ ] Finalize open-source release notes.
- [ ] Publish site.
- [ ] Publish repo.
- [ ] Release first video.
- [ ] Begin weekly posting cadence.

#### Deliverables

- Public site
- Public repo
- Launch video
- Weekly content queue
- Mailing list capture
- First Oaktown Labs social post

## 18. Content Strategy

### 18.1 Build Privately, Publish Deliberately

Do not depend on live audience growth during the build.

Instead:

- Capture everything.
- Edit later.
- Build a launch library.
- Release once the project has a satisfying payoff.
- Post weekly after launch.
- Let the site be the complete proof of work.

### 18.2 Content Categories

#### The Premise

- Gold horse
- Cocktail robot
- Nose pour
- Oaktown Labs
- Over-engineered fun

#### The Engineering

- Pump selection
- Calibration
- Tubing
- Firmware
- PCB
- Power
- UI
- Lighting

#### The Fabrication

- Scanning
- Nozzle
- Drilling
- Sidecar
- Glass recess
- Assembly

#### The Ridiculous

- Nostril Nozzle
- PONY POUR button
- Campari calibration
- Horse survives drilling
- Horse demands maintenance
- Professional docs for nonsense

#### The Codex Story

- Project planned in Markdown
- Codex creates repo structure
- Codex writes firmware
- Codex writes calibration scripts
- Codex builds the site
- Codex helps draft docs
- Human builds physical world
- Human reviews and merges

### 18.3 Weekly Release Sequence

After launch, release one primary post per week.

Recommended order:

1. The reveal: gold horse cocktail robot
2. Scan before drilling
3. Pump bench tests
4. Calibration data
5. Nostril Nozzle R&D
6. Sidecar design
7. Lake glow and PONY POUR button
8. Drilling the original
9. First water pour
10. First red pour
11. First real Negroni
12. PCB for a horse
13. Full open-source walkthrough
14. First party test
15. What failed
16. What V2 should be

### 18.4 Required Capture Checklist for Every Physical Step

For every physical-world milestone, capture:

- 10–20 still photos
- 3–5 short vertical clips
- 1 horizontal overview clip
- Close-up of the weirdest detail
- One “failure or uncertainty” clip
- One “this is more serious than it should be” clip
- Notes on what happened
- Notes on what should happen next

## 19. Open Source Release

Potential license choices:

- MIT for software
- CERN Open Hardware License for hardware
- Creative Commons license for docs/media/CAD, depending on intent

License selection is an explicit later task.

The release should make clear:

- This is an art/maker project.
- It is not a certified commercial appliance.
- Builders are responsible for food safety, electrical safety, and alcohol laws.
- The project does not include alcohol sales or service rights.
- Use at your own risk.
- Clean and validate all food-contact materials.

## 20. First Codex Task List

These are the first tasks to hand to Codex.

### Task 1 — Create Repo Skeleton

Create the directory structure described in `docs/project-plan.md`. Add placeholder README files where useful. Do not implement firmware yet.

### Task 2 — Create AGENTS.md

Create an `AGENTS.md` that instructs agents to prioritize clarity, safety, small changes, accurate documentation, and explicit unknowns. Include rules for updating decision records.

### Task 3 — Create Risk Register

Create `docs/risk-register.md` with risks grouped by:

- Food safety
- Electrical safety
- Sculpture damage
- Pump accuracy
- Cleaning
- Social/brand
- Open-source/legal
- Transport

### Task 4 — Create Site Skeleton

Create a simple Oaktown Labs static site with a placeholder Negroni Pony project page, mailing list placeholder, and build-log structure.

### Task 5 — Create Calibration Harness Plan

Create a CSV schema for pump calibration data, a Markdown doc explaining how
calibration runs should be recorded, and a bench-harness plan for pump layout,
scale placement, vessels, tubing, and media capture.

### Task 6 — Create Art Measurement and Media Capture Templates

Create templates for build notes, shot lists, sculpture measurement, filming,
and milestone retrospectives.

## 21. Definition of Done for V1

V1 is done when:

- The horse is scanned.
- The original is modified or a working equivalent is used.
- A rocks glass sits in the lake base.
- Three bottles sit upright in the sidecar.
- Three pumps dispense through the horse nostril.
- The system can pour a Negroni.
- The lake lights during the ritual.
- The physical controls work.
- Calibration data exists.
- Cleaning procedure is documented.
- The repo contains docs, firmware, data, and build notes.
- The site showcases the full project.
- The launch content package is ready.
- The project is open-source.
- The result is ridiculous.

## 22. Project Motto

> Over-engineered fun with good taste.

Secondary mottos:

> The horse demands calibration.

> No hand-written code, just hand-drilled nostrils.

> Serious engineering for deeply unserious outcomes.

> Oaktown Labs: making things nobody asked for, properly.
