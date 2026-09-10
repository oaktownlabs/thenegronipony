# Architecture

This map describes the current main-branch planning skeleton, not the work in
unmerged site/calibration feature branches. Update it when those changes land.

## Physical and software boundaries

The project combines a horse sculpture and lake/glass interface with a separate
service sidecar for bottles, pumps, power, and electronics. Firmware owns
eventual dosing/control behavior; electronics/ and cad/ record the physical
implementation; data/ holds measured calibration evidence; site/ is the public
documentation/site surface. See [project plan](project-plan.md), root README.md,
and the directory READMEs for scope and outstanding hardware decisions.

Hardware specifications, food-path suitability, scan geometry, and dosing
accuracy remain evidence requirements, not assumptions. The planned physical
design must not be represented as a tested machine. Preserve the distinction
between source measurements and derived analysis.

## Development control plane

Codex implements and maintains plans. Claude independently reviews PRs in
GitHub Actions, with source exposed as data and no execution/edit tools.
Adam reviews available preview/evidence in Codex and owns merge decisions.
See [development workflow](development-workflow.md).

Keep the existing [decision record](decision-record.md) and
[project plan](project-plan.md) canonical. Put scoped multi-PR execution plans
in [plans/](plans/README.md), linked to the relevant project milestone.

