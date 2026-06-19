# Atlas Planner Loop Control PR Notes

## Purpose

This branch turns Atlas Planner into a control surface for strict, budget-aware agent loops. It does not make the system fully autonomous yet. The goal is to define a loop goal, persist it to local runtime state, let the controller select it safely, and record enough evidence for a later maker/checker loop.

## What is included

- Token-aware planner decision logic.
- Usage status snapshot job.
- Create Goal UI with lifecycle, satisfaction layers, verification commands, safety settings, decision preview, run timeline, evidence sources, and merge gates.
- Durable local goal queue at `loops/project-controller/goal-queue.json`.
- Current claimed run state at `loops/project-controller/current-run.json`.
- Controller support for queued approved goals.
- `--claim-goal` support to move an approved queued goal into `running` and write `current-run.json`.
- Tests for planner scoring, reporting helpers, queued-goal selection, and goal claiming.

## Runtime state

These files are intentionally ignored and should not be committed:

- `loops/**/state.json`
- `loops/**/latest-report.md`
- `loops/**/decisions.jsonl`
- `loops/**/goal-queue.json`
- `loops/**/current-run.json`
- `loops/**/latest-status.json`
- `loops/**/LOCK`

## How to try it

Open the planner directly:

```bash
http://192.168.1.96:3000/?open=loops&goal=create
```

Create a goal and approve it to run. The UI writes the goal to:

```bash
loops/project-controller/goal-queue.json
```

Claim the selected queued goal:

```bash
npm run loop:projects -- --project atlas-planner --claim-goal
```

Inspect:

```bash
loops/project-controller/latest-report.md
loops/project-controller/current-run.json
```

## Verification

Run:

```bash
npm run test -w @agent/atlas-planner
npm run test:loop-controller
npm run typecheck -w @agent/web
npm run lint -w @agent/web
npm run build -w @agent/web
```

## Explicitly not included yet

- No autonomous maker agent.
- No checker subagent loop.
- No worktree creation.
- No GitHub PR creation.
- No automated merge.
- No external messaging or ticket updates.

Those should be separate PRs. This branch establishes the control plane and local runtime memory only.

## Review focus

- Runtime state safety and ignored-file boundaries.
- Whether approved queued goals are prioritized correctly.
- Whether `--claim-goal` mutates only expected local runtime files.
- Whether UI approval language is clear enough to avoid accidental autonomous work.
- Whether the branch should be split before merge.
