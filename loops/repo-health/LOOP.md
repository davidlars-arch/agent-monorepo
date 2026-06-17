# Repo Health Loop

## Purpose

Keep Project Sphere from silently rotting while agents make frequent changes.

The loop discovers repo health signals, writes durable state, and gives the next agent one concrete action. It is deliberately boring. Boring loops are the ones that do not bankrupt you or quietly rewrite half the repo like an overcaffeinated idiot.

## Cadence

- Fast run: every morning, or before handing work to another agent.
- Full run: before merge/release, using `--build`.

## Commands

```bash
npm run loop:repo-health
npm run loop:repo-health -- --build
```

## State

- `loops/repo-health/STATE.md` is the persistent loop memory.
- `loops/repo-health/latest-report.md` is overwritten on every run.

## Agent Contract

1. Read `STATE.md`.
2. Run `npm run loop:repo-health`.
3. Fix at most one concrete issue unless the user asks for a wider sweep.
4. Rerun the loop.
5. Leave a short note in the final response with the check result and any unresolved item.

## Stop Condition

The loop is healthy when:

- `npm run loop:repo-health` exits `0`.
- The report has a green check status.
- The next action is discovery/triage, not a failing check.

## Expansion Points

- Add GitHub issue discovery once this repo has stable issues.
- Add a second verifier agent for PR-ready changes.
- Add a scheduled automation that runs this prompt daily and sends findings to triage.
