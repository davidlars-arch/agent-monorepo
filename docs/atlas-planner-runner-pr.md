# Atlas Planner Agent Runner PR

This branch continues AP-6: Agent worktree runner MVP.

## What changed

- `npm run planner:agent-runner -- ...` creates an isolated git worktree for a selected ticket.
- The runner can execute a maker command, checker command, and optional bounded repair command.
- The runner writes local handoff files under `loops/project-controller/runs/<run-id>/`:
  - `runner-state.json`
  - `maker-prompt.md`
  - `checker-prompt.md`
  - `evidence.json`
- `runner-state.json` records the current stage, timeline, repair count, and blocked/satisfied state.
- `evidence.json` records command checks, outputs, failures, and checker blockers.
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

Optional harness demo:

```sh
npm run planner:agent-runner -- \
  --ticket AP-DEMO \
  --branch worktree/ap-demo \
  --run-id run-ap-demo \
  --maker-command 'node -e '"'"'require("fs").writeFileSync("maker-output.txt", "done\n")'"'"'' \
  --checker-command 'node -e '"'"'require("fs").existsSync("maker-output.txt") || process.exit(2)'"'"''
```

Repair-cap demo:

```sh
npm run planner:agent-runner -- \
  --ticket AP-REPAIR \
  --branch worktree/ap-repair \
  --run-id run-ap-repair \
  --maker-command 'node -e '"'"'require("fs").writeFileSync("maker-output.txt", "done\n")'"'"'' \
  --checker-command 'node -e '"'"'process.exit(3)'"'"'' \
  --repair-command 'node -e '"'"'require("fs").appendFileSync("repair.log", `${process.env.ATLAS_REPAIR_ATTEMPT}\n`)'"'"'' \
  --max-repairs 1
```

## Intentional limits

- The runner does not autonomously choose a maker/checker runtime yet; commands are explicit so the PR does not couple to one local agent CLI.
- Merge remains human-gated.
