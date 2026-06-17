# Web Atlas Loop

## Purpose

Keep the Project Sphere atlas useful as the monorepo grows.

The loop watches the public web surface, the repo graph metadata, and the shared UI package. It should turn repo drift into one small next action instead of letting the atlas become a pretty lie with a build button.

## Cadence

- Fast run: after project structure changes, UI edits, or repo graph updates.
- Full run: before demo/release, using `--build`.

## Commands

```bash
npm run loop:web-atlas
npm run loop:web-atlas -- --build
```

## State

- `loops/web-atlas/STATE.md` is the persistent loop memory.
- `loops/web-atlas/latest-report.md` is overwritten on every run.

## Agent Contract

1. Read `loops/web-atlas/STATE.md`.
2. Run `npm run loop:web-atlas`.
3. If a check fails, fix the smallest concrete cause.
4. If checks pass, compare the graph snapshot with the repo shape and pick one atlas improvement.
5. Rerun the loop.
6. Stop when the report is green or the next action needs human taste/product judgment.

## Stop Condition

The loop is healthy when:

- `npm run loop:web-atlas` exits `0`.
- The report status is green.
- The next action is a scoped atlas improvement, not a failing check.

## Expansion Points

- Add Playwright screenshot assertions for the globe and detail panel.
- Add route discovery so new apps are detected automatically.
- Feed dbt project health metrics into the atlas once the analytics loop is live.
