import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = resolve("scripts/planner-agent-runner.mjs");

test("dry run prints the worktree and handoff plan without writing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "planner-agent-runner-dry-"));

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--dry-run",
      "--ticket",
      "AP-6",
      "--branch",
      "worktree/ap-6",
      "--base",
      "abc1234",
      "--run-id",
      "run-ap-6",
      "--goal-title",
      "Agent worktree runner MVP"
    ],
    { cwd: root }
  );

  const plan = JSON.parse(stdout);

  assert.equal(plan.ticketId, "AP-6");
  assert.equal(plan.runId, "run-ap-6");
  assert.equal(plan.branch, "worktree/ap-6");
  assert.equal(plan.base, "abc1234");
  assert.match(plan.worktreePath, /agent-monorepo-worktree-ap-6$/);
  assert.equal(plan.files.makerPrompt, "loops/project-controller/runs/run-ap-6/maker-prompt.md");
  await assert.rejects(readFile(join(root, "loops/project-controller/runs/run-ap-6/runner-state.json"), "utf8"));
});

test("runner creates a worktree and writes maker/checker handoff files", async () => {
  const root = await mkdtemp(join(tmpdir(), "planner-agent-runner-"));
  const worktreePath = join(tmpdir(), `planner-agent-runner-worktree-${Date.now()}`);

  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "runner@example.test"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Runner Test"], { cwd: root });
  await writeFile(join(root, "README.md"), "# Runner test\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-6",
      "--branch",
      "worktree/ap-6-runner-test",
      "--run-id",
      "run-ap-6",
      "--goal-title",
      "Agent worktree runner MVP",
      "--worktree-dir",
      worktreePath
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-6/runner-state.json"), "utf8"));
  const makerPrompt = await readFile(join(root, "loops/project-controller/runs/run-ap-6/maker-prompt.md"), "utf8");
  const checkerPrompt = await readFile(join(root, "loops/project-controller/runs/run-ap-6/checker-prompt.md"), "utf8");
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-6/evidence.json"), "utf8"));

  assert.equal(result.status, "created");
  assert.equal(state.status, "prepared");
  assert.equal(state.stage, "maker-handoff");
  assert.equal(state.worktreePath, worktreePath);
  assert.match(makerPrompt, /Implement one bounded slice/);
  assert.match(checkerPrompt, /Do not mark the run satisfied from maker output alone/);
  assert.equal(evidence.status, "awaiting-maker");
});
