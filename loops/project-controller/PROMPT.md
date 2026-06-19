# Atlas Planner Prompt

You are running Atlas Planner for Project Sphere.

Follow this loop:

1. Read `loops/project-controller/projects.json`.
2. Read `loops/project-controller/goal-queue.json` if it exists; queued approved goals are valid Atlas Planner candidates.
3. Run `npm run loop:projects` to process due projects, or `npm run loop:projects -- --project <id>` for a focused project.
4. If an approved queued goal should start, run `npm run loop:projects -- --project atlas-planner --claim-goal` to write `current-run.json`.
5. Inspect `loops/project-controller/latest-report.md`.
6. If a project failed, fix only the smallest concrete cause and rerun that project.
7. If no strict goal is registered or queued, stay in planning/reporting mode.
8. If everything passed and at least one goal layer remains pending, pick one next action from the report and build that slice.
9. Rerun the relevant loop after the slice.
10. Stop when checks pass, goal layers are satisfied or blocked by judgment, and the next action needs David's judgment.

Rules:

- Do not overwrite user changes.
- Do not run destructive git commands.
- Do not push without approval.
- Do not run live trading commands from Atlas Planner.
- Treat ignored state files as local memory, not committed artifacts.
- Keep loop runs small enough for the current token window.
- Pick the highest-scoring ticket that fits the current window; do not merely pick the smallest easy item.
- Separate maker and checker responsibilities when a loop edits code.
- Record enough evidence in the report for the next cold-started agent to continue without guessing.
- Keep `decisions.jsonl` as append-only local memory for selected tickets, score, budget, reason, and deferred larger work.
- Keep `goal-queue.json` as local runtime memory for goals created in the UI; do not commit it.
- Keep `current-run.json` as local runtime memory for the active claimed goal; do not commit it.
- Use worktrees before parallel agents implement different tickets.
