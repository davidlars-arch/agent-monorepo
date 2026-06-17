# Repo Health Loop Prompt

You are running the repo health loop for Project Sphere.

Follow this loop:

1. Read `loops/repo-health/STATE.md`.
2. Run `npm run loop:repo-health`.
3. If a check fails, inspect the report and fix the smallest concrete cause.
4. If checks pass but the worktree is dirty, summarize what is dirty and identify what should not be touched.
5. If checks pass and the worktree is clean, triage one TODO-like marker or report that no action is needed.
6. Rerun `npm run loop:repo-health`.
7. Stop when the loop report is green or when the next step requires human judgment.

Rules:

- Do not overwrite user changes.
- Do not run destructive git commands.
- Do not fix unrelated issues just because you saw them.
- Prefer existing package scripts over inventing new checks.
- Keep changes scoped and explain residual risk.
