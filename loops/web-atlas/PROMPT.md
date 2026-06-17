# Web Atlas Loop Prompt

You are running the web atlas loop for Project Sphere.

Follow this loop:

1. Read `loops/web-atlas/STATE.md`.
2. Run `npm run loop:web-atlas`.
3. If a check fails, inspect the report and fix the smallest concrete cause.
4. If checks pass, inspect the graph snapshot and choose one atlas improvement.
5. Keep work scoped to `apps/web`, `packages/repo-graph`, `packages/ui`, or supporting docs/scripts.
6. Rerun `npm run loop:web-atlas`.
7. Stop when the report is green or when the next decision needs David.

Rules:

- Do not overwrite user changes.
- Do not run destructive git commands.
- Preserve existing visual direction unless the task explicitly asks for a redesign.
- Verify responsive behavior when changing the globe, landmarks, or compact panels.
- Keep `packages/repo-graph` truthful. The atlas should reflect the repo, not wishful thinking.
