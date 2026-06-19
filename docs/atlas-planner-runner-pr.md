# Atlas Planner Agent Runner PR

This branch continues AP-6: Agent worktree runner MVP.

## What changed

- `npm run planner:agent-runner -- ...` creates an isolated git worktree for a selected ticket.
- The runner can execute a maker command, checker command, and optional bounded repair command.
- The runner can also execute a shared `--agent-command` adapter. The adapter receives stage-specific env vars such as `ATLAS_STAGE`, `ATLAS_PROMPT_PATH`, `ATLAS_HANDOFF_DIR`, `ATLAS_EVIDENCE_PATH`, and `ATLAS_REPAIR_ATTEMPT`.
- Checker output can be structured JSON. Blocker findings are recorded into `evidence.json` even when the checker process exits `0`.
- Existing handoffs can be resumed with `--resume --handoff-dir ...` so the first command can prepare and later commands can execute without recreating the worktree.
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

Shared agent adapter demo:

```sh
npm run planner:agent-runner -- \
  --ticket AP-AGENT \
  --branch worktree/ap-agent \
  --run-id run-ap-agent \
  --agent-command 'openclaw agent --local --message {prompt}'
```

The command template can use these shell-quoted placeholders:

- `{prompt}`
- `{promptPath}`
- `{stage}`
- `{handoffDir}`
- `{evidencePath}`
- `{worktreePath}`
- `{ticketId}`
- `{runId}`
- `{repairAttempt}`

Checker agents should print JSON when they block a run:

```json
{
  "status": "blocked",
  "findings": [
    {
      "severity": "blocker",
      "summary": "The diff is missing verification evidence.",
      "file": "scripts/example.mjs",
      "line": 12,
      "recommendation": "Run the focused test and record it in evidence.json."
    }
  ]
}
```

Resume demo after running the normal prepare command:

```sh
npm run planner:agent-runner -- \
  --resume \
  --handoff-dir loops/project-controller/runs/<run-id> \
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

- The runner still keeps merge human-gated and does not auto-open or auto-merge PRs.
