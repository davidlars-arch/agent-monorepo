import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("runner executes maker and checker commands and records passing evidence", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-exec-");

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-7",
      "--branch",
      "worktree/ap-7-runner-test",
      "--run-id",
      "run-ap-7",
      "--worktree-dir",
      worktreePath,
      "--maker-command",
      'node -e \'require("fs").writeFileSync("maker-output.txt", "done\\n")\'',
      "--checker-command",
      'node -e \'require("fs").existsSync("maker-output.txt") || process.exit(2)\''
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-7/runner-state.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-7/evidence.json"), "utf8"));

  assert.equal(result.status, "satisfied");
  assert.equal(result.stage, "checker-passed");
  assert.equal(state.status, "satisfied");
  assert.equal(state.stage, "checker-passed");
  assert.equal(evidence.status, "checker-passed");
  assert.equal(evidence.checks.length, 2);
  assert.deepEqual(
    evidence.checks.map((check) => check.stage),
    ["maker", "checker"]
  );
});

test("runner stops after bounded repair attempts and records checker blockers", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-repair-");

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-8",
      "--branch",
      "worktree/ap-8-runner-test",
      "--run-id",
      "run-ap-8",
      "--worktree-dir",
      worktreePath,
      "--maker-command",
      'node -e \'require("fs").writeFileSync("maker-output.txt", "done\\n")\'',
      "--checker-command",
      "node -e 'process.exit(3)'",
      "--repair-command",
      'node -e \'require("fs").appendFileSync("repair.log", `${process.env.ATLAS_REPAIR_ATTEMPT}\\n`)\'',
      "--max-repairs",
      "1"
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-8/runner-state.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-8/evidence.json"), "utf8"));
  const repairLog = await readFile(join(worktreePath, "repair.log"), "utf8");

  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "checker-blocked");
  assert.equal(result.repairAttempts, 1);
  assert.equal(state.status, "blocked");
  assert.equal(state.repairAttempts, 1);
  assert.equal(evidence.status, "checker-blocked");
  assert.equal(evidence.repairAttempts, 1);
  assert.equal(evidence.findings.filter((finding) => finding.stage === "checker").length, 2);
  assert.equal(repairLog, "1\n");
});

test("runner resumes an existing handoff without recreating the worktree", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-resume-");

  await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-9",
      "--branch",
      "worktree/ap-9-runner-test",
      "--run-id",
      "run-ap-9",
      "--worktree-dir",
      worktreePath
    ],
    { cwd: root, timeout: 20_000 }
  );

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--resume",
      "--handoff-dir",
      "loops/project-controller/runs/run-ap-9",
      "--maker-command",
      'node -e \'require("fs").writeFileSync("maker-output.txt", "resumed\\n")\'',
      "--checker-command",
      'node -e \'require("fs").readFileSync("maker-output.txt", "utf8").includes("resumed") || process.exit(4)\''
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-9/runner-state.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-9/evidence.json"), "utf8"));

  assert.equal(result.mode, "resume");
  assert.equal(result.status, "satisfied");
  assert.equal(result.worktreePath, worktreePath);
  assert.equal(state.stage, "checker-passed");
  assert.equal(evidence.status, "checker-passed");
  assert.equal(evidence.checks.length, 2);
});

async function createGitFixture(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const worktreePath = await mkdtemp(join(tmpdir(), `${prefix}worktree-`));
  await rm(worktreePath, { force: true, recursive: true });

  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "runner@example.test"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Runner Test"], { cwd: root });
  await writeFile(join(root, "README.md"), "# Runner test\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "initial"], { cwd: root });

  return { root, worktreePath };
}
