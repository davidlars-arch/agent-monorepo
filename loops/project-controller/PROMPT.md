# Atlas Planner Prompt

You are running Atlas Planner for Project Sphere.

Follow this loop:

1. Read `loops/project-controller/projects.json`.
2. Run `npm run loop:projects` to process due projects, or `npm run loop:projects -- --project <id>` for a focused project.
3. Inspect `loops/project-controller/latest-report.md`.
4. If a project failed, fix only the smallest concrete cause and rerun that project.
5. If everything passed, pick one next action from the report and build that slice.
6. Rerun the relevant loop after the slice.
7. Stop when checks pass and the next action needs David's judgment.

Rules:

- Do not overwrite user changes.
- Do not run destructive git commands.
- Do not push without approval.
- Do not run live trading commands from Atlas Planner.
- Treat ignored state files as local memory, not committed artifacts.
