# Codex implementation and independent Claude review

Accepted by Adam in the Codex requirements interview on 2026-09-10.
Applies to Serenity, ChatLFT, the household financial model, Grifterbots, and
The Negroni Pony. This document defines the shared development process;
repository-specific architecture and data protections remain in force.

## Requirements and authority

Adam's interface is the original Codex task. Interview him to resolve behavior,
scope, exclusions, and acceptance criteria. Write the agreement and wait for
his explicit go-ahead before implementation. His approval persists; do not ask
again for ordinary work inside the agreed scope. Escalate material scope changes.

Codex implements, tests, changes documentation, opens PRs, and responds to
feedback. Claude independently reviews and never edits code or documentation.
Adam alone decides whether to merge, then archives the Codex task. Neither
agent merges or enables automatic merge. No Linear dependency.

Use the strongest current appropriate model available within the chosen account
and budget. Record the actual model used. Do not silently fall back to a weaker
model or separate API billing. Check model availability at setup and periodically
as models change; model names in a historical plan are not a perpetual default.

## Living documentation

Keep the repository's architecture document accurate about current components,
interfaces, data flow, authorization, deployment boundaries, and known gaps.
Keep its decision log with dated entries: context, alternatives, decision,
consequences, and status. Preserve prior decisions; supersede them explicitly.

For multi-PR features, write an execution plan under docs/plans/ before coding.
Include the approved requirements, exclusions, acceptance criteria, ordered PR
slices, dependencies, verification strategy, progress, decisions, and open
questions. Link the plan and current slice in every PR. Claude checks each PR
against that slice and the overall plan. Update progress in each implementation
PR; do not claim later slices are complete. Existing canonical product plans
remain canonical and should link to the scoped plan.

A small fix can keep its plan and acceptance criteria in the PR description.
Update architecture and decisions when warranted, without producing a document
for every cosmetic edit.

## Review and iteration

Every PR receives review, including drafts, dependency/bot PRs, and fixup pushes.
A new revision invalidates readiness until reviewed. Claude reviews correctness,
security, requirements, verification, and consequential architectural choices.
Architecture findings must explain concrete impact and a remedy. All style
preferences belong exclusively to automated linting/formatting, never Claude.

Codex evaluates findings, implements justified changes, reruns relevant checks,
and pushes. If disagreeing, reply with evidence and request another review.
One disagreement round is Codex's reasoned challenge plus Claude's response on
the same unresolved finding. After TWO such rounds, stop that dispute and
escalate in the original Codex task with the finding, both positions, evidence,
and a recommended resolution. Ordinary agreed fixes and infrastructure retries
are not disagreement rounds. Do not dismiss Claude's verdict to manufacture
approval or let the agents argue indefinitely.

The workflow posts APPROVE, REQUEST_CHANGES, or COMMENT (incomplete), with the
reviewed head and base commits, and creates the commit-scoped "Claude review"
check. Only a complete, blocker-free result succeeds. A failure, missing output,
partial source, stale result, or missing credential must never imply approval.
The GitHub review is posted by github-actions[bot] and explicitly labeled as
Claude's independent review. That bot must not author the implementation PR;
GitHub does not allow self-approval.

To re-review after a reasoned response or updated verification without a push,
Codex posts a PR comment starting with /claude-review, followed by its evidence.
Repository writers may also dispatch "Claude Review" with a PR number. Do not
trigger reviews from Claude's own review submissions. A comment containing the
phrase later in the body does not trigger a review.

## Five-minute heartbeat in Codex

While waiting on CI or Claude, use Codex's native scheduled follow-up in the
ORIGINAL task at a five-minute interval. Do not implement an infinite sleep loop,
a new task per poll, or a separate cloud authoring agent.

Persist compact checkpoint information in the task: repository, PR, current head
and base, last processed review/check IDs, disputed findings and round counts,
and whether the state is implementing, waiting-on-CI, waiting-on-Claude,
waiting-on-Adam, or done. Each wake first checks compact GitHub metadata.
If unchanged, return promptly without re-reading diffs or re-reviewing code.
Fetch detailed feedback only on a changed revision/check/review. Scheduled wakes
still use some model tokens; this is not a zero-token polling guarantee.

Create or resume the heartbeat only while actually waiting on CI/Claude. Pause
or delete it BEFORE returning control to Adam, including final handoff, a
disagreement, unresolved preview failure, exhausted quota, or a login problem.
There is NO heartbeat while waiting on Adam. Resume after his reply if needed.
Stop on merge or closure. Do not archive the task for him.

Suggested heartbeat instruction:

> Check this task's tracked PR and current head/base against its checkpoint.
> If CI or Claude has changed, address actionable feedback inside the approved
> scope and update the checkpoint. If unchanged, stop this wake promptly. Use
> the two-round disagreement rule. If Adam's input is needed or the work is ready
> for him, pause this heartbeat before reporting in this task. Never merge.
> Never poll while waiting on Adam.

Local scheduled follow-ups require the computer on and Codex running. Claude's
GitHub-hosted review is independent of the Mac. If the native scheduler is
unavailable, report that limitation rather than claiming a heartbeat is running.

## Verification, previews, and handoff

Run the repository's existing lint/typecheck/test/build checks appropriate to
the change. Maintain regression evidence for changed behavior. Do not substitute
a model's approval for passing CI. For web features, verify a real preview URL,
affected routes, and relevant authenticated/unauthenticated behavior. Include
screenshots or reports where useful and bind evidence to the reviewed revision.

Make a best effort to fix missing/broken previews. If unable, escalate to Adam
with the failure, attempted fixes, and available evidence. Mark it as an
escalation, not a ready-to-merge handoff. Follow repository data/privacy rules:
never publish household finances, health records, or secrets in screenshots,
artifacts, logs, or public previews. Private evidence can remain in Codex, with
a sanitized PR summary that says what was checked and what Claude could access.

Final handoff in Codex includes PR links, what changed, acceptance evidence,
latest review and CI status, preview/screenshots where applicable, and explicit
limitations. Adam may give feedback entirely in Codex; Codex carries relevant
context back to the PR and repeats verification/review after changes.

## Activation and implementation

The workflow runs Claude Code inside a GitHub-hosted Linux job using the
CLAUDE_CODE_OAUTH_TOKEN repository secret. Set CLAUDE_REVIEW_MODEL to an explicit
model ID confirmed to fit Adam's subscription and included usage. Newest/best
aliases can route to separately billed usage credits; do not select them blindly.
Disable paid usage overflow in the account if subscription-only spending is
required. No Anthropic API key or automatic API fallback is configured.

Claude Code is pinned to 2.1.267. Update the pin and model intentionally after
checking current documentation and account eligibility. The job records the
requested model and reported models. Source retrieval runs before the model;
only trusted workflow scripts execute. PR source is read as plain files, without
symlinks, hooks, dependencies, or build scripts. Claude runs in safe mode with
Read/Glob/Grep only, empty MCP settings, and no GitHub token. A deterministic
publisher validates the result and submits the review on the captured commit.
Changed head/base or a failed/incomplete run cannot turn the current check green.

The job times out after 25 minutes; Claude has 18 minutes and 40 tool turns.
These operational limits do not count as disagreement rounds. Large snapshots
or missing evidence produce a visible failure/incomplete verdict. Split the PR
or escalate instead of approving an unreviewed remainder. Raw model transcripts
and source snapshots are not uploaded as artifacts.

Before activation:
1. Merge the workflow code into the trusted base/default branch. The first
   rollout PR cannot bootstrap its own privileged workflow.
2. Adam supplies the subscription secret and explicit model variable in each
   repository; repository secrets remain separate from application secrets.
3. Enable GitHub Actions' permission to create/approve PRs in repository/org
   settings. The official Claude GitHub App is not required by this CLI workflow.
4. Require "Claude review" alongside existing CI checks and enable dismissal of
   stale approvals and up-to-date branches in branch protection/rulesets. Codex
   must re-request review if the base advances after approval. Do not require the
   pull_request_target workflow's base-commit result in place of the explicit
   head-commit check.
5. Exercise approval, request-changes, a new push, incomplete/failing review,
   comment re-review, and the Codex heartbeat's stop-on-Adam behavior.
6. Review existing open PRs using workflow dispatch after activation.

Run local contract tests with:
`node --test .github/review/review.contract.mjs`.
The tests use synthetic test fixtures only; passing them proves controller
behavior, not live Claude authentication or the quality of an actual review.

Sources: [Claude CLI](https://code.claude.com/docs/en/cli-reference),
[subscription authentication](https://code.claude.com/docs/en/authentication),
[model configuration](https://code.claude.com/docs/en/model-config),
[Codex scheduled follow-ups](https://learn.chatgpt.com/docs/automations).
