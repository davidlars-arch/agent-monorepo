# Atlas Planner Agent Runner PR

This branch continues AP-6: Agent worktree runner MVP.

## What changed

- `npm run planner:agent-runner -- ...` creates an isolated git worktree for a selected ticket.
- The runner writes local handoff files under `loops/project-controller/runs/<run-id>/`:
  - `runner-state.json`
  - `maker-prompt.md`
  - `checker-prompt.md`
  - `evidence.json`
- `npm run loop:projects -- --project atlas-planner --claim-goal` now records the runner branch, worktree, handoff directory, and exact runner command in `current-run.json`.
- Atlas Planner shows the claimed run's branch, worktree, handoff directory, and runner command in the Current Run panel.

## Demo

1. Create and approve a goal in Atlas Planner.
2. Claim it:

   ```sh
   npm run loop:projects -- --project atlas-planner --claim-goal
   ```

3. Copy the `runnerCommand` from `loops/project-controller/current-run.json` or the Current Run panel.
4. Run that command from the repo root.
5. Inspect the generated worktree and handoff files under `loops/project-controller/runs/<run-id>/`.

## Intentional limits

- The runner does not autonomously spawn maker/checker agents yet.
- The checker prompt is generated, but a human or agent still has to run the review.
- Merge remains human-gated.
