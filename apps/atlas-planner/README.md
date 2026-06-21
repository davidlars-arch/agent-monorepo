# Atlas Planner

Atlas Planner is the control surface for running bounded agent loops in this
monorepo.

The short version: it gives you an overview of work, turns selected work into an
approved goal contract, claims that goal into a current run, prepares an isolated
worktree runner, and records evidence so a human can decide whether to continue,
repair, open a PR, or stop.

It is not meant to be a blind autopilot. It is meant to make agent work repeatable
without removing the engineer from the loop.

## Distilled Model

Atlas Planner is built around one loop:

1. See the work.
2. Pick a bounded goal.
3. Write the contract.
4. Approve the run.
5. Claim the goal.
6. Create an isolated worktree.
7. Run maker/checker agents.
8. Record evidence.
9. Keep external actions human-gated.
10. Sync the result back into planner state.

The important idea is that a loop should be explicit. A good loop has scope,
budget, verification, memory, and a stop condition. Atlas Planner exists to make
those pieces visible instead of hiding them inside a long prompt.

## What Exists Today

Atlas Planner currently includes:

- A web planner surface inside the Atlas UI.
- A Kanban-style ticket model.
- Local planner ticket storage through a repo API.
- A goal composer for turning tickets into loop contracts.
- A durable approved-goal queue.
- A current-run file that records the active claimed run.
- A controller script that can score work and claim approved goals.
- A runner script that can create worktrees and handoff files.
- Maker/checker/repair command slots.
- Human-gated PR command support.
- Runtime state, reports, and decision logs.
- Tests for the planner package, loop controller, runner, and web runner route.

The system is past the mockup stage. The remaining gap is proving the full first
loop end-to-end with real runner evidence.

## Current Architecture

Atlas Planner spans several layers of the monorepo.

### Product UI

The planner UI lives mostly in:

```text
apps/web/components/atlas-planner-overview.tsx
apps/web/components/atlas-planner/activity-dashboard.tsx
apps/web/components/atlas-planner/atlas-run-flow.tsx
apps/web/components/atlas-planner/current-run-card.tsx
apps/web/components/atlas-planner/goal-composer.tsx
apps/web/components/atlas-planner/goal-composer-model.ts
apps/web/components/atlas-planner/kanban-board.tsx
apps/web/components/atlas-planner/loop-reliability-panel.tsx
apps/web/components/atlas-planner/overview-data.ts
apps/web/components/atlas-planner/ticket-editor.tsx
apps/web/components/atlas-planner/use-atlas-goals.ts
apps/web/components/atlas-planner/use-planner-tickets.ts
apps/web/components/atlas-planner/planner-next-action.ts
```

The UI answers practical loop questions:

- What work exists?
- What is ready to run?
- What is already claimed?
- What evidence exists?
- What should happen next?
- Is the loop safe to continue?

### Planner Package

The reusable planner logic lives in:

```text
apps/atlas-planner/src/index.ts
apps/atlas-planner/src/runs.ts
apps/atlas-planner/src/reporting.ts
```

This package defines:

- ticket statuses
- planner ticket models
- usage/token snapshot models
- loop goal models
- satisfaction layers
- planner decisions
- import/export helpers
- scoring logic
- run lifecycle helpers
- reporting summaries

The scoring model is intentionally more opinionated than "pick the easiest
ticket." It considers things like token fit, value, readiness, freshness, risk,
estimate size, and goal state.

### Web APIs

Atlas Planner uses Next.js API routes as the bridge between UI and local loop
state:

```text
apps/web/app/api/atlas-goals/route.ts
apps/web/app/api/atlas-loop-runner/route.ts
apps/web/app/api/atlas-run-recovery/route.ts
apps/web/app/api/planner/tickets/route.ts
apps/web/app/api/usage-status/route.ts
```

`/api/planner/tickets` reads and writes:

```text
planner/tickets.json
```

It uses revision checking and a lock file so multiple writes do not quietly
overwrite each other.

`/api/atlas-goals` reads and writes:

```text
loops/project-controller/goal-queue.json
```

It supports creating goals, reading queued goals, updating lifecycle state, and
approving goals for execution.

`/api/atlas-loop-runner` supports:

```text
claim-next-goal
start-current-run
resume-current-run
```

Long runner work is intentionally handled as command handoff instead of being
kept alive inside an HTTP request. The API can return the command that should be
run by a terminal/background process. Synchronous mode exists only for short,
bounded runs.

`/api/atlas-run-recovery` exposes recovery operations for stale locks and
terminal current runs.

### Durable Loop Store

Shared filesystem and runtime behavior lives in:

```text
packages/loop-store/src/index.mjs
packages/loop-store/src/index.d.ts
```

This package is the spine of the runtime. It handles:

- locating project-controller paths
- reading and writing JSON atomically
- file locks
- queued-goal validation
- claiming the next runnable goal
- creating `current-run.json`
- building runner commands
- preparing runner handoffs
- syncing terminal runner state back into the goal queue
- stale lock and current-run recovery checks

The UI and scripts should keep going through this package instead of each doing
their own ad hoc file handling.

### Controller

The project loop controller is defined by:

```text
scripts/project-loop.mjs
loops/project-controller/LOOP.md
loops/project-controller/PROMPT.md
loops/project-controller/projects.json
```

The main command is:

```bash
npm run loop:projects
```

Useful variants:

```bash
npm run loop:projects -- --list
npm run loop:projects -- --all
npm run loop:projects -- --project atlas-planner
npm run loop:projects -- --project atlas-planner --claim-goal
npm run loop:projects -- --all --build
```

The controller performs the heartbeat role:

1. Read the loop registry.
2. Read usage status.
3. Read the goal queue.
4. Score available work.
5. Optionally claim an approved goal.
6. Write state, report, and decision logs.
7. Stop when work is done, blocked, unsafe, or needs a human.

### Runner

The runner layer is defined by:

```text
scripts/planner-agent-runner.mjs
scripts/atlas-openclaw-agent-command.mjs
scripts/atlas-gh-pr-command.mjs
```

`planner-agent-runner.mjs` owns the isolated worktree execution path. It can:

- create a git worktree
- write maker/checker prompts
- write initial evidence files
- run maker commands
- run checker commands
- run bounded repair attempts
- record structured blockers
- prepare a PR through a human-gated command
- resume from an existing handoff directory

Expected handoff files include:

```text
runner-state.json
maker-prompt.md
checker-prompt.md
evidence.json
```

The runner is intentionally split from the controller. The controller decides
what should run. The runner creates the isolated environment and records what
happened.

## Runtime State Files

Committed control files:

```text
loops/project-controller/LOOP.md
loops/project-controller/PROMPT.md
loops/project-controller/projects.json
```

Ignored runtime state:

```text
loops/project-controller/state.json
loops/project-controller/latest-report.md
loops/project-controller/decisions.jsonl
loops/project-controller/goal-queue.json
loops/project-controller/current-run.json
loops/project-controller/LOCK
loops/project-controller/runs/**
planner/tickets.json
planner/LOCK
```

These files are local memory. They let the loop continue across runs without
forcing every detail into model context.

## Goal Contracts

A goal is the unit of loop execution. It should be narrower than a project and
more structured than a prompt.

A useful goal contains:

- a clear title
- a statement of what success means
- a stop condition
- allowed scope
- estimate/budget
- satisfaction layers
- verification commands
- safety settings
- approval state

Common lifecycle states:

```text
draft
refined
approved
running
blocked
satisfied
archived
```

Common loop stages:

```text
idea
refine
score
branch
maker
checker
repair
pr
merge
sync
```

Default satisfaction layers include:

```text
goal-contract
budgeted-selection
maker-checker
evidence-memory
human-gate
```

This is the "contract" part of Atlas Planner. The loop should not merely say
"go build the thing." It should say what is allowed, what is enough, what proves
it, and when to stop.

## End-to-End Flow

The intended loop works like this:

1. Tickets exist in the planner board.
2. Usage status gives the loop a token/runway picture.
3. The planner scores available tickets.
4. A human or agent creates a goal from a ticket.
5. The goal is refined into a contract.
6. The goal receives satisfaction layers.
7. The goal receives verification commands.
8. The goal receives safety settings.
9. The goal is approved to run.
10. The controller claims the approved goal.
11. The controller writes `current-run.json`.
12. A runner command is generated.
13. The UI shows the active run and handoff command.
14. The runner creates a git worktree.
15. The runner writes maker/checker prompts.
16. The maker agent does the work.
17. The checker agent reviews independently.
18. Repair runs only within the configured repair budget.
19. Evidence is written.
20. Runner state becomes satisfied, blocked, or failed.
21. Terminal state syncs back to goal/current-run state.
22. Optional PR creation remains human-gated.
23. The human reviews before merge.
24. Planner ticket state updates.
25. The next loop can begin.

The shape is:

```text
ticket -> goal contract -> approved queue -> claimed run -> worktree runner
       -> maker/checker -> evidence -> human gate -> synced planner state
```

## Current First-Loop State

The current first-loop target is:

```text
GOAL-ATLAS-FIRST-LOOP
Verify Atlas Planner first-loop readiness
```

Its contract is:

```text
Atlas Planner can claim, start, and write evidence for one bounded local run.
```

Its stop condition is:

```text
Stop after evidence proves claim/start/review wiring or records a concrete blocker.
```

At the time this README was written, the system had enough machinery to claim a
run and produce a runner command. The remaining proof point is a completed runner
handoff with evidence under:

```text
loops/project-controller/runs/<run-id>/
```

That means the project is at "real control plane with unproven full execution,"
not "fully autonomous loop runner."

## Important Markdown Files

`apps/atlas-planner/README.md`

This file. Product and runtime overview.

`docs/atlas-planner-100-loop-plan.md`

The readiness checklist for proving the first real Atlas Planner loop. Some
items may become stale as runtime state changes, but the checklist captures the
right standard: goal, claim, runner evidence, independent review, and human gate.

`docs/atlas-planner-loop-pr.md`

Documents the goal queue and loop-contract work: token-aware planner decisions,
goal lifecycle, satisfaction layers, safety settings, durable goal queue, and
current-run claim path.

`docs/atlas-planner-runner-pr.md`

Documents the runner work: isolated worktrees, maker/checker/repair command
slots, shared agent command adapter, runner state, handoff files, and PR gate.

`loops/project-controller/LOOP.md`

The controller operating manual. It defines commands, state files, reliability
rules, runner environment variables, and stop conditions.

`loops/project-controller/PROMPT.md`

The controller prompt. It tells the loop how to read state, claim goals, stay
inside safety boundaries, write evidence, and stop cleanly.

`loops/*/LOOP.md` and `loops/*/PROMPT.md`

Project-specific loop definitions for areas such as repo health, web Atlas,
usage status, crypto tax, and crypto trader testing.

## Commands

Run the web app:

```bash
npm run dev
```

Seed the first Atlas goal:

```bash
npm run loop:seed-atlas-first-goal
```

Run the controller:

```bash
npm run loop:projects
```

Claim an approved Atlas Planner goal:

```bash
npm run loop:projects -- --project atlas-planner --claim-goal
```

Run the planner agent runner:

```bash
npm run planner:agent-runner -- <runner args>
```

The full runner command is generated into:

```text
loops/project-controller/current-run.json
```

Run key tests:

```bash
npm run test:loop-controller
npm run test:atlas-loop-runner
npm run test:planner-agent-runner
npm run test:atlas-runner-wrappers
npm run test -w @agent/atlas-planner
```

Run common web checks:

```bash
npm run typecheck -w @agent/web
npm run lint -w @agent/web
npm run build -w @agent/web
```

## What Still Needs To Be Ironed Out

The main remaining work is not more UI theory. It is proving that a small
bounded goal can run all the way through the machinery.

Open items:

- Produce real runner evidence for `GOAL-ATLAS-FIRST-LOOP`.
- Confirm the handoff files are written under `loops/project-controller/runs/`.
- Decide whether `planner/tickets.json` is local-only state or committed seed
  data.
- Keep this README and the older docs in sync as runtime behavior changes.
- Make the repeat-review gate explicit instead of relying on convention.
- Decide the normal maker/checker command configuration.
- Keep PR creation human-gated, but make the setup easier to understand.
- Make stale current-run recovery obvious in the UI.
- Clarify UI states for claimed, handed off, running, blocked, satisfied, and
  ready for human review.

## Design Opinion

Atlas Planner should stay boring in the right places.

The valuable thing is not that an agent can run forever. The valuable thing is
that every run has a contract, a scope, a budget, a checker, evidence, and a
human gate. If those pieces stay visible, loops can become useful engineering
infrastructure instead of a very expensive way to create mystery code.

