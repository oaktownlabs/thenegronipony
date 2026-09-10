# Independent code review rollout

Status: approved for implementation by Adam in the Codex interview on 2026-09-10.
Account login/credentials are Adam-owned. Live activation remains unverified.

## Outcome and acceptance

Implement the process in ../development-workflow.md in all five repositories:
Serenity, ChatLFT, smeepsadamsfinancials, Grifterbots, and The Negroni Pony.
Adam explicitly approves requirements before implementation, works in the
original Codex task, owns merges, and archives the task himself.

Claude reviews every PR and revision using a subscription-approved model.
Codex alone changes code. Reviews cover correctness, security, requirements,
verification, and consequential architecture; linting exclusively owns style.
Escalate after two rounds of unresolved disagreement. Maintain architecture,
decisions, and multi-PR execution plans. Attempt preview repair and escalate
unresolved failures. Five-minute native heartbeats run only while waiting for
CI/Claude and stop before asking Adam or handing off.

## PR breakdown and dependencies

One scoped PR per repository adds root instructions, review policy, controller,
workflow/tests, and documentation links. The implementations share equivalent
review logic and process documentation; local architecture and decision paths
are repository-specific. No new shared repository or Linear dependency.

1. Serenity: introduce the common process and automation against current main.
2. ChatLFT: add root instructions, preserving docs/EXECPLAN.md and scoped rules.
3. Financial model: stack on codex/initial-setup (PR #1), because main currently
   has no app files; preserve existing privacy/modeling instructions.
4. Grifterbots: preserve paper-only trading and evidence invariants.
5. The Negroni Pony: preserve the existing decision record and project plan;
   current main is the planning skeleton, not the later calibration branches.

Each PR can be assessed independently. Activation requires the workflow on the
trusted/default branch, subscription authentication, selected model, and GitHub
review/check permissions. Code preparation does not depend on the login step.

## Non-goals

Do not change application behavior, deploy production, provision databases,
alter account credentials, merge PRs, or migrate unmerged feature branches.
Do not claim preview infrastructure or Claude authentication has been verified.
Do not change architectural/product decisions during this process rollout.

## Verification plan

Test verdict validation, real review payloads, current head/base binding, races,
incomplete/error handling, source path isolation, and credential/tool isolation.
Validate workflow YAML and run relevant existing formatting/privacy checks.
No app runtime changes are planned, so a full application rebuild is not the
primary evidence for this rollout. After Adam configures credentials, verify
the full workflow and heartbeat against a real PR before marking activation done.

## Progress

- [x] Requirements approved and repository baselines inspected.
- [x] Process, reviewer boundaries, and account activation steps specified.
- [x] Repository changes and local contract tests complete.
- [x] PR opened with local verification evidence.
- [ ] Adam's subscription and model configuration verified.
- [ ] Workflow merged/activated and full live loop verified.
- [ ] Heartbeat verified to stop when waiting on Adam.

## Local verification evidence

- Twelve controller contract tests pass, including stale reviews, changed PR
  requirements, concurrent pushes, malformed results, missing source, unexpected
  model selection, secret isolation, and private/symlink/binary file exclusion.
- Both workflow files pass actionlint 1.7.12; controller and tests pass Biome.
- Local controller tests ran on Node 24.3.0; the Actions test job uses Node 22.
- Pinned Claude Code 2.1.267 installs and exposes the required CLI flags.
- No live model call was made; subscription authentication, real review quality,
  and the full Actions/heartbeat loop remain explicit activation gates.

## Decisions and discoveries

- GitHub's publisher posts the model's validated verdict as a real PR review,
  using github-actions[bot]; Claude itself has no write tools or GitHub token.
- Use Claude Code CLI in the job to keep source execution and result publishing
  outside the model. This is a GitHub Actions deployment of Claude Code, with
  subscription OAuth; it does not require the general-purpose Claude action.
- Require an explicit model selection because "best" may incur usage credits.
- Approval is tied to both captured head and base, with a post-publication
  recheck. Branch rules must require the explicit head-commit review check.
- Financial PR #1 must land before the financial workflow can be activated.

## Open questions and remaining gates

Rollout PRs: [Serenity #287](https://github.com/oaktownlabs/serenity/pull/287),
[ChatLFT #8](https://github.com/oaktownlabs/chatlft/pull/8),
[financial model #6](https://github.com/oaktownlabs/smeepsadamsfinancials/pull/6),
[Grifterbots #1](https://github.com/oaktownlabs/grifterbots/pull/1), and
[The Negroni Pony #27](https://github.com/oaktownlabs/thenegronipony/pull/27).

Adam owns login and account/model eligibility. Required-check/ruleset activation
and live review/heartbeat evidence remain pending. Escalate blockers in Codex,
with no heartbeat while awaiting Adam. Record rollout PR URLs and actual test
results here as they become available.
