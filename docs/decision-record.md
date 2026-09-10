# Decision Record

## 2026-09-10 — Independent Claude review, Codex implementation

Status: accepted by Adam in the requirements interview.

Context: Adam wants to specify behavior and assess results in Codex while agents
handle implementation and independent technical review.

Decision: Codex owns every code/document change; Claude reviews every PR and
revision, including architecture, with all style delegated to linting. Adam owns
merges. Two rounds of unresolved disagreement escalate to Adam. Five-minute
Codex heartbeats run only while waiting on CI/Claude, never while awaiting Adam.
Maintain architecture, decision logs, and execution plans for multi-PR work.

Alternatives considered: manual code review by Adam; a local Claude daemon;
a separate issue tracker; API-billed agents. The selected workflow runs Claude
Code in GitHub Actions with subscription OAuth and an explicit eligible model.

Consequences: independent review remains dependent on account eligibility and
successful verification. Failed/incomplete/stale reviews block readiness.
Previews must be checked, repaired where possible, and escalated if unresolved.
Documentation and operating details: [development workflow](development-workflow.md).
Account setup and live activation are pending, not proven by the code rollout.

This file tracks important project decisions. Add entries newest first.

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
