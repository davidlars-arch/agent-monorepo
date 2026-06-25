import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const openclawWrapperPath = resolve("scripts/atlas-openclaw-agent-command.mjs");
const prWrapperPath = resolve("scripts/atlas-gh-pr-command.mjs");

test("OpenClaw wrapper exits nonzero when JSON result is aborted", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-openclaw-wrapper-"));
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeExecutable(
    join(bin, "openclaw"),
    `#!/bin/sh
printf '%s\\n' '{"payloads":[{"text":"Request timed out"}],"meta":{"aborted":true}}'
exit 0
`
  );

  await assert.rejects(
    execFileAsync("node", [openclawWrapperPath], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        ATLAS_WORKTREE_PATH: root,
        ATLAS_OPENCLAW_TIMEOUT_SECONDS: "1"
      }
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Request timed out/);
      return true;
    }
  );
});

test("OpenClaw checker wrapper writes structured checker verdict artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-openclaw-checker-wrapper-"));
  const bin = join(root, "bin");
  const handoffDir = join(root, "handoff");
  await mkdir(bin);
  await mkdir(handoffDir);
  await writeExecutable(
    join(bin, "openclaw"),
    `#!/bin/sh
cat <<'JSON'
{"payloads":[{"text":"ATLAS_CHECKER_JSON_START\\n{\\"schemaVersion\\":\\"atlas-checker-verdict.v1\\",\\"runId\\":\\"run-openclaw-checker\\",\\"ticketId\\":\\"AP-OPENCLAW-CHECKER\\",\\"pass\\":true,\\"status\\":\\"passed\\",\\"blockingIssues\\":[],\\"nonBlockingIssues\\":[],\\"evidenceReviewed\\":[\\"handoff.json\\",\\"goal-contract.json\\",\\"evidence.json\\",\\"maker-result.json\\",\\"maker.log\\"],\\"recommendedNextAction\\":\\"human-review\\",\\"satisfactionLayers\\":[{\\"layerId\\":\\"checker-integration\\",\\"status\\":\\"satisfied\\",\\"proof\\":[\\"OpenClaw produced a structured verdict.\\"],\\"missing\\":[]}],\\"summary\\":\\"OpenClaw checker accepted the deterministic maker output.\\"}\\nATLAS_CHECKER_JSON_END"}]}
JSON
exit 0
`
  );

  const { stdout } = await execFileAsync("node", [openclawWrapperPath], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      ATLAS_STAGE: "checker",
      ATLAS_RUN_ID: "run-openclaw-checker",
      ATLAS_TICKET_ID: "AP-OPENCLAW-CHECKER",
      ATLAS_HANDOFF_DIR: handoffDir,
      ATLAS_WORKTREE_PATH: root,
      ATLAS_OPENCLAW_TIMEOUT_SECONDS: "1"
    }
  });

  const verdict = JSON.parse(await readFile(join(handoffDir, "checker-verdict.json"), "utf8"));
  const log = await readFile(join(handoffDir, "checker.log"), "utf8");

  assert.equal(verdict.schemaVersion, "atlas-checker-verdict.v1");
  assert.equal(verdict.pass, true);
  assert.equal(verdict.recommendedNextAction, "human-review");
  assert.match(stdout, /"status":"passed"/);
  assert.match(log, /OpenClaw checker accepted/);
});

test("GitHub PR wrapper pushes the runner branch before creating the PR", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-gh-pr-wrapper-"));
  const bin = join(root, "bin");
  const logPath = join(root, "calls.log");
  const evidencePath = join(root, "evidence.json");
  await mkdir(bin);
  await writeFile(evidencePath, '{"status":"checker-passed","checks":[],"findings":[]}\n');

  await writeExecutable(
    join(bin, "gh"),
    `#!/bin/sh
printf 'gh %s\\n' "$*" >> "${logPath}"
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  exit 1
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  printf '%s\\n' 'https://github.example/pr/1'
  exit 0
fi
exit 2
`
  );
  await writeExecutable(
    join(bin, "git"),
    `#!/bin/sh
printf 'git %s\\n' "$*" >> "${logPath}"
exit 0
`
  );

  const { stdout } = await execFileAsync("node", [prWrapperPath], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      ATLAS_BRANCH: "worktree/ap-pr-test",
      ATLAS_BASE: "abc1234",
      ATLAS_RUN_ID: "run-ap-pr-test",
      ATLAS_TICKET_ID: "AP-PR",
      ATLAS_EVIDENCE_PATH: evidencePath
    }
  });

  const log = await readFile(logPath, "utf8");
  assert.match(stdout, /github\.example\/pr\/1/);
  assert.match(log, /gh pr view worktree\/ap-pr-test/);
  assert.match(log, /git push -u origin worktree\/ap-pr-test/);
  assert.match(log, /gh pr create --base main --head worktree\/ap-pr-test/);
  assert.ok(log.indexOf("git push") < log.indexOf("gh pr create"));
});

async function writeExecutable(path, content) {
  await writeFile(path, content);
  await chmod(path, 0o755);
}
