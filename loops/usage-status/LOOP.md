# Usage Status Loop

## Purpose

Write the cheap local usage snapshot that Atlas Planner reads from `loops/usage-status/latest-status.json`.

This loop must not call an LLM. It should either preserve the last known values or accept explicit environment values from a trusted source.

## Command

```bash
npm run usage:status
USAGE_SHORT_WINDOW="48% left" USAGE_WEEKLY="80% left" npm run usage:status
npm run usage:status -- --show
npm run usage:status -- --force
```

## State

- `loops/usage-status/latest-status.json` is ignored local state.
- The JSON shape matches `UsageStatusSnapshot` in `@agent/atlas-planner`.

## Cost Rule

Usage updates are boring I/O. Do not spend agent turns or model tokens trying to infer account usage.

The updater has a 30-minute freshness guard by default. If a snapshot is newer than that, it exits without rewriting unless `--force` is passed or explicit `USAGE_*` values are provided. Use `USAGE_STATUS_MIN_AGE_MINUTES` to tune this for local automation.

Do not schedule this every two minutes through an agent. Prefer task-finished hooks, app startup when stale, or a 30-60 minute cron.

## Stop Condition

The loop is healthy when:

- `latest-status.json` exists.
- Atlas Planner can read it.
- Unknown live usage still produces a conservative planner fallback.
