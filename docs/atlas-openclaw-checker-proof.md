# Atlas OpenClaw Checker Proof

This is the committed proof summary for the OpenClaw checker path. Raw runner state under `loops/**/runs/` stays ignored because it contains local worktree paths, command strings, logs, and other machine-specific runtime details.

## Sanitized Evidence Shape

- Run id: `run-ap-openclaw-checker`
- Ticket id: `AP-OPENCLAW-CHECKER`
- Checker adapter: `scripts/atlas-openclaw-agent-command.mjs`
- Required checker verdict schema: `atlas-checker-verdict.v1`
- Accepted pass fields: `pass: true`, `status: "passed"`, empty `blockingIssues`, and `recommendedNextAction: "human-review"`
- Reviewed artifacts: `handoff.json`, `goal-contract.json`, `events.jsonl`, `evidence.json`, `maker-result.json`, and `maker.log`
- Required satisfaction layers: `queue-preservation` and `runner-proof`
- Runtime proof output: `checker-verdict.json` plus `evidence.json.hashes.checkerVerdict`

## Committed Regression Coverage

- `scripts/atlas-runner-wrapper.test.mjs` verifies that the OpenClaw wrapper extracts `atlas-checker-verdict.v1` JSON and writes `checker-verdict.json`.
- `scripts/planner-agent-runner.test.mjs` verifies that the runner accepts the OpenClaw checker wrapper verdict and records the checker verdict hash.
- `scripts/planner-agent-runner.test.mjs` also verifies that schema-less checker pass output such as `{ "status": "passed" }` is blocked and cannot satisfy the run.

## Local Verification

The proof path is covered by:

```sh
npm run test:planner-agent-runner
npm run test:atlas-runner-wrappers
npm run test:atlas-loop-runner
```

The committed proof is intentionally a sanitized summary rather than copied live runtime memory.
