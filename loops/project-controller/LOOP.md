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
npm run loop:projects -- --project atlas-planner --claim-goal
npm run loop:projects -- --all --build
```

## State

- `loops/project-controller/projects.json` is the committed project registry.
- `loops/project-controller/state.json` is ignored local state.
- `loops/project-controller/latest-report.md` is the latest ignored local report.
- `loops/project-controller/decisions.jsonl` is an ignored append-only planner decision log.
- `loops/project-controller/goal-queue.json` is the ignored durable queue written by the Atlas Planner Create Goal UI.
- `loops/project-controller/current-run.json` is the ignored active run claim written by `--claim-goal`.
- `loops/project-controller/LOCK` prevents overlapping controller runs.

## Agent Contract

1. Read `loops/project-controller/projects.json`.
2. Run `npm run loop:projects -- --list` if you need the current registry.
3. Run `npm run loop:projects` for due work, or `--project <id>` for a focused loop.
4. If a project fails, inspect the report and fix the smallest concrete cause.
5. If projects pass, use each project's next action as the next build slice.
6. Do not enable external actions from this loop without fresh approval.

## Reliability Contract

- Do not run autonomous implementation without a strict goal block: statement, stop condition, and layered satisfaction criteria.
- Treat the controller as the heartbeat: it discovers due work and writes a report before implementation starts.
- Use isolated worktrees before parallel implementation agents edit the same repo.
- Put durable project rules in loop markdown or skills, not in one-off chat prompts.
- Keep external connectors explicit; opening PRs, tickets, or messages is a separate approved step.
- Split maker and checker work. The agent that edits code should not be the only verifier.
- Use `state.json` and `latest-report.md` as the loop memory spine across cold starts.
- Append every selected ticket decision to `decisions.jsonl` with the score, budget, reason, and deferred larger work.
- Treat queued goals from `goal-queue.json` as first-class Atlas Planner candidates once they are approved to run.
- Use `--claim-goal` to move the selected approved queued goal to `running` and write `current-run.json`; do this before maker/checker work starts.
- Prefer the highest-scoring ticket that fits the current token window; defer larger work instead of half-doing it.
- Continue looping only while at least one goal layer remains pending and the next ticket fits the current token window.

## Runner Commands

Atlas runner commands are configured through environment variables so external actions stay explicit:

- `ATLAS_AGENT_COMMAND` runs for maker, checker, and repair when stage-specific commands are not set.
- `ATLAS_MAKER_COMMAND`, `ATLAS_CHECKER_COMMAND`, and `ATLAS_REPAIR_COMMAND` override individual stages.
- `ATLAS_PR_COMMAND` runs only after checker satisfaction and must never merge.
- `ATLAS_PR_BASE` can override the GitHub PR base branch; it defaults to `main`.
- `node scripts/atlas-openclaw-agent-command.mjs` is the local OpenClaw maker/checker/repair wrapper.
- `node scripts/atlas-gh-pr-command.mjs` is the GitHub PR wrapper; it creates or reports a PR and stops before merge.

## Stop Condition

Atlas Planner is healthy when:

- It exits `0`.
- No project checks fail.
- `latest-report.md` names a concrete next action or says nothing is due.
- The verification step is independent enough to catch maker mistakes.
- The next action either fits the token window or is explicitly deferred.
- Registered strict goal layers are satisfied, or the report states which layer remains pending and why.

## Expansion Points

- Add a scheduler once Atlas Planner has proven stable.
- Add real child loops for crypto tax, crypto trader, RPG, and analytics.
- Add priority scoring from issue trackers or product docs.
- Add notification delivery after scheduled runs.
