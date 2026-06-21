# Atlas Planner 100% Loop Readiness Plan

Status: in progress
Owner branch: `worktree/atlas-planner-ui-first-loop-readiness`

## Current State

The UI and runner plumbing are mostly in place, but the live Atlas Planner state is not seeded for the first loop.

Current readiness:

- Board seeded: ready
- Usage window known: ready
- Approved goal: missing
- Current run state: missing
- Runner evidence: missing
- Web runner execution: not proven for long OpenClaw runs
- Repeat-review gate: not yet explicit as a separate independent stage

The controller dry run confirms the blocker:

```sh
npm run loop:projects -- --project atlas-planner --dry-run --claim-goal
```

Result: no queued goals exist yet, so the controller cannot claim a first run.

## Definition Of 100%

Atlas Planner is at 100% first-loop readiness when all of these are true:

- A focused Atlas Planner goal exists in `loops/project-controller/goal-queue.json`.
- That goal is approved to run and scoped to `atlas-planner`.
- The controller can claim it into `loops/project-controller/current-run.json`.
- The runner can start or resume from the current run.
- Runner state and evidence are written under `loops/project-controller/runs/<run-id>/`.
- A review subagent can audit the produced diff/evidence.
- Any review findings are implemented.
- A second review subagent pass finds no merge-blocking issues.
- The UI/API runner path can start work without killing long OpenClaw commands at the request timeout.
- The exact first-loop command set is documented for claim, start/resume, runner commands, PR policy, and recovery.
- The run remains human-gated before external actions or merge.

## Execution Rules

Use one task branch/worktree per task.

For each task:

1. Create a dedicated worktree from the latest integration branch.
2. Implement only that task's scope.
3. Run the task-specific checks.
4. Commit the task branch locally.
5. Run a review subagent against the task result.
6. Implement every valid review finding in the same task worktree.
7. Run a second review subagent.
8. Repeat fix/review until the subagent reports no merge-blocking issues.
9. Merge the clean task branch into the integration branch.
10. Run integration checks before starting the next task.

Do not run multiple implementation tasks against the same files in parallel unless their write sets are disjoint.

## Task 1 - Seed The First Approved Goal

Worktree:

```sh
git worktree add ../agent-monorepo-atlas-loop-seed-goal worktree/atlas-loop-seed-goal
```

Goal:

- Create one approved Atlas Planner goal through the shared loop-store seed path.
- Ensure `goal-queue.json` is valid and repo-scoped to `atlas-planner`.
- Use a small, safe first-loop goal that exercises the runner without broad product scope.

Recommended first goal:

- Title: Verify Atlas Planner first-loop readiness
- Outcome: Atlas Planner can claim, start, and write evidence for one bounded local run.
- Scope: planner UI, project-controller state, runner handoff, docs only.
- Stop condition: stop after evidence proves claim/start/review wiring or records a concrete blocker.
- External actions: disabled or human-gated.

Checks:

```sh
npm run loop:seed-atlas-first-goal -- --dry-run
npm run loop:seed-atlas-first-goal
npm run loop:projects -- --project atlas-planner --dry-run --claim-goal
node --test scripts/project-loop.test.mjs
```

Review:

- Subagent verifies queue shape, approval state, scope, and safety settings.

## Task 2 - Claim Current Run

Worktree:

```sh
git worktree add ../agent-monorepo-atlas-loop-claim-current-run worktree/atlas-loop-claim-current-run
```

Goal:

- Claim the approved goal into `current-run.json`.
- Confirm the selected repo/project is respected.
- Confirm no existing current run is overwritten.

Checks:

```sh
npm run loop:projects -- --project atlas-planner --claim-goal
test -f loops/project-controller/current-run.json
node --test scripts/project-loop.test.mjs
```

Review:

- Subagent audits `current-run.json`, goal queue lifecycle, branch/worktree path, and handoff paths.

## Task 3 - Fix Web Runner Execution Model

Worktree:

```sh
git worktree add ../agent-monorepo-atlas-loop-web-runner-execution worktree/atlas-loop-web-runner-execution
```

Goal:

- Decide and implement the browser-safe execution model for `POST /api/atlas-loop-runner`.
- Avoid claiming the UI can run real OpenClaw work while the route caps execution at 60 seconds.
- Prefer an async/background runner action if feasible; otherwise make the UI explicitly hand off to CLI for long runs.
- Preserve the same-origin write guard and file lock behavior.

Checks:

```sh
npm run test:atlas-loop-runner
npm run typecheck -w @agent/web
npm run lint -w @agent/web
```

Review:

- Subagent audits timeout behavior, lock release behavior, UI affordance accuracy, and recovery after a runner process outlives a browser request.

## Task 4 - Configure First-Loop Runner Commands

Worktree:

```sh
git worktree add ../agent-monorepo-atlas-loop-command-policy worktree/atlas-loop-command-policy
```

Goal:

- Pin the exact command policy for the first loop.
- Configure or document `ATLAS_AGENT_COMMAND`, `ATLAS_MAKER_COMMAND`, `ATLAS_CHECKER_COMMAND`, and `ATLAS_PR_COMMAND`.
- Keep PR creation and merge human-gated unless explicitly enabled.
- Make repeat review a distinct command/stage, not just an implicit checker rerun.

Recommended first-loop command policy:

```sh
export ATLAS_AGENT_COMMAND='node scripts/atlas-openclaw-agent-command.mjs'
export ATLAS_OPENCLAW_TIMEOUT_SECONDS=900
unset ATLAS_PR_COMMAND
```

Checks:

```sh
npm run test:planner-agent-runner
npm run test:atlas-runner-wrappers
```

Review:

- Subagent audits command safety, prompt separation, PR policy, repeat-review independence, and whether the policy can be copied by an operator without guessing.

## Task 5 - Start Runner And Produce Evidence

Worktree:

```sh
git worktree add ../agent-monorepo-atlas-loop-runner-evidence worktree/atlas-loop-runner-evidence
```

Goal:

- Start the current run.
- Produce runner state and evidence files.
- Keep external actions disabled/human-gated.

Checks:

```sh
npm run planner:agent-runner -- --handoff-dir <current-run-handoff-dir>
npm run test:planner-agent-runner
npm run test:atlas-loop-runner
```

Review:

- Subagent checks runner state, evidence completeness, repair limits, checker findings, and satisfaction-layer proof.
- A second independent review subagent checks the same run evidence after fixes and must report no merge-blocking issues.

## Task 6 - Review UI Readiness Against Real State

Worktree:

```sh
git worktree add ../agent-monorepo-atlas-loop-readiness-ui worktree/atlas-loop-readiness-ui
```

Goal:

- Confirm the Atlas Planner UI moves from 40% to 80% after claim and to 100% after runner evidence exists.
- Fix any copy, state mapping, or empty-state mismatch found while using real state files.

Checks:

```sh
npm run typecheck -w @agent/web
npm run lint -w @agent/web
npm run build -w @agent/web
node --test apps/web/components/atlas-planner/planner-next-action.test.mjs
```

Review:

- Subagent audits the UI against actual state transitions and mobile/desktop screenshots.

## Task 7 - Final Integration And Human Gate

Worktree:

```sh
git worktree add ../agent-monorepo-atlas-loop-100-integration worktree/atlas-loop-100-integration
```

Goal:

- Merge the cleaned task branches into one integration branch.
- Run all relevant checks.
- Produce a final summary of what is ready, what was intentionally human-gated, and what command starts the next loop.

Checks:

```sh
npm run test:loop-controller
npm run test:planner-agent-runner
npm run test:atlas-loop-runner
npm run test:atlas-runner-wrappers
npm run typecheck -w @agent/web
npm run lint -w @agent/web
npm run build -w @agent/web
git diff --check
```

Review:

- First subagent: code and state review.
- Second subagent: operational dry-run review.
- Fix all valid findings and repeat until both are clean.

## Current Audit Findings

Latest independent audit found these remaining blockers:

- No live approved goal exists.
- No live current run exists to start/resume.
- No evidence artifact exists for the first loop.
- UI-triggered long OpenClaw runner execution is likely not viable with the current request timeout.
- Repeat review is still a prompt/config convention rather than a demonstrated independent gate.
- `ATLAS_PR_COMMAND` is intentionally not configured by default, so PR creation is a human-gated policy choice rather than proven automation.
- The operator path needs one copyable command set for goal creation, claim, start/resume, OpenClaw adapter, PR policy, and recovery.

## Stop Conditions

Stop and report instead of continuing if:

- The runner needs external credentials or a public action.
- The current run would overwrite active user work.
- A subagent finds a merge-blocking issue that requires David's product judgment.
- A check fails for a reason outside the task scope.

## Done Signal

The plan is complete when Atlas Planner shows 100% readiness with real state, checks pass, two review passes are clean, and David has a clear button/command path for the next loop.
