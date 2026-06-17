# Atlas Planner Loop

## Purpose

Coordinate the project loops in this monorepo from one Atlas Planner registry.

This loop decides which project is due, selects a ticket that fits the current token window, runs the matching child loop or check commands, records local state, and produces one compact report. It is the planner layer above the individual loops.

## Cadence

- Automatic run: every heartbeat/cron window once scheduling is enabled.
- Manual run: when handing work to an agent or choosing the next build slice.
- Full run: before demos, releases, or push decisions, using `--all --build`.

## Commands

```bash
npm run loop:projects
npm run loop:projects -- --list
npm run loop:projects -- --all
npm run loop:projects -- --project web-atlas
npm run loop:projects -- --all --build
```

## State

- `loops/project-controller/projects.json` is the committed project registry.
- `loops/project-controller/state.json` is ignored local state.
- `loops/project-controller/latest-report.md` is the latest ignored local report.
- `loops/project-controller/LOCK` prevents overlapping controller runs.

## Agent Contract

1. Read `loops/project-controller/projects.json`.
2. Run `npm run loop:projects -- --list` if you need the current registry.
3. Run `npm run loop:projects` for due work, or `--project <id>` for a focused loop.
4. If a project fails, inspect the report and fix the smallest concrete cause.
5. If projects pass, use each project's next action as the next build slice.
6. Do not enable external actions from this loop without fresh approval.

## Stop Condition

Atlas Planner is healthy when:

- It exits `0`.
- No project checks fail.
- `latest-report.md` names a concrete next action or says nothing is due.

## Expansion Points

- Add a scheduler once Atlas Planner has proven stable.
- Add real child loops for crypto tax, crypto trader, RPG, and analytics.
- Add priority scoring from issue trackers or product docs.
- Add notification delivery after scheduled runs.
