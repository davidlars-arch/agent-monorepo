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
  const goalContract = makeGoalContract();

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
      "Agent worktree runner MVP",
      "--goal-contract-json",
      JSON.stringify(goalContract)
    ],
    { cwd: root }
  );

  const plan = JSON.parse(stdout);

  assert.equal(plan.ticketId, "AP-6");
  assert.equal(plan.runId, "run-ap-6");
  assert.equal(plan.branch, "worktree/ap-6");
  assert.equal(plan.base, "abc1234");
  assert.equal(plan.goalContract.statement, "Complete the durable contract handoff.");
  assert.equal(plan.goalContract.satisfactionLayers[0].label, "Queue preservation");
  assert.equal(plan.goalContract.verificationCommands[0].command, "npm run test:planner-agent-runner");
  assert.match(plan.worktreePath, /agent-monorepo-worktree-ap-6$/);
  assert.equal(plan.files.makerPrompt, "loops/project-controller/runs/run-ap-6/maker-prompt.md");
  await assert.rejects(readFile(join(root, "loops/project-controller/runs/run-ap-6/runner-state.json"), "utf8"));
});

test("runner creates a worktree and writes maker/checker handoff files", async () => {
  const root = await mkdtemp(join(tmpdir(), "planner-agent-runner-"));
  const worktreePath = join(tmpdir(), `planner-agent-runner-worktree-${Date.now()}`);
  const goalContract = makeGoalContract();

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
      "--goal-contract-json",
      JSON.stringify(goalContract),
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
  assert.equal(state.goalContract.safety.allowedPaths, "packages/loop-store/**, scripts/**");
  assert.match(makerPrompt, /Implement one bounded slice/);
  assert.match(makerPrompt, /Complete the durable contract handoff/);
  assert.match(makerPrompt, /Queue preservation: Queue stores structured layers/);
  assert.match(makerPrompt, /npm run test:planner-agent-runner/);
  assert.match(makerPrompt, /External actions: human-gated/);
  assert.match(checkerPrompt, /Do not mark the run satisfied from maker output alone/);
  assert.match(checkerPrompt, /"satisfactionLayers"/);
  assert.equal(evidence.status, "awaiting-maker");
  assert.equal(evidence.satisfactionLayers[0].layerId, "queue-preservation");
  assert.deepEqual(evidence.satisfactionLayers[0].proof, []);
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
  assert.equal(evidence.pullRequest.status, "ready");
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

test("runner runs configured PR command after checker satisfaction", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-pr-");

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-20",
      "--branch",
      "worktree/ap-20-runner-test",
      "--run-id",
      "run-ap-20",
      "--worktree-dir",
      worktreePath,
      "--maker-command",
      'node -e \'require("fs").writeFileSync("maker-output.txt", "done\\n")\'',
      "--checker-command",
      'node -e \'require("fs").existsSync("maker-output.txt") || process.exit(2)\'',
      "--pr-command",
      'node -e \'require("fs").writeFileSync("pr.txt", process.env.ATLAS_BRANCH); console.log("https://example.test/pr/20")\''
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-20/runner-state.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-20/evidence.json"), "utf8"));
  const prMarker = await readFile(join(worktreePath, "pr.txt"), "utf8");

  assert.equal(result.status, "satisfied");
  assert.equal(result.stage, "pr-created");
  assert.equal(state.stage, "pr-created");
  assert.equal(evidence.pullRequest.status, "created");
  assert.match(evidence.pullRequest.detail, /example\.test\/pr\/20/);
  assert.equal(evidence.events.at(-1).stage, "pr");
  assert.equal(prMarker, "worktree/ap-20-runner-test");
});

test("runner blocks when configured PR command fails", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-pr-block-");

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-20B",
      "--branch",
      "worktree/ap-20b-runner-test",
      "--run-id",
      "run-ap-20b",
      "--worktree-dir",
      worktreePath,
      "--maker-command",
      'node -e \'require("fs").writeFileSync("maker-output.txt", "done\\n")\'',
      "--checker-command",
      'node -e \'require("fs").existsSync("maker-output.txt") || process.exit(2)\'',
      "--pr-command",
      "node -e 'process.exit(5)'"
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-20b/runner-state.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-20b/evidence.json"), "utf8"));

  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "pr-blocked");
  assert.equal(state.status, "blocked");
  assert.equal(evidence.pullRequest.status, "blocked");
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

test("runner resume preserves the saved repair budget", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-resume-repair-");

  await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-9B",
      "--branch",
      "worktree/ap-9b-runner-test",
      "--run-id",
      "run-ap-9b",
      "--worktree-dir",
      worktreePath,
      "--max-repairs",
      "1"
    ],
    { cwd: root, timeout: 20_000 }
  );

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--resume",
      "--handoff-dir",
      "loops/project-controller/runs/run-ap-9b",
      "--maker-command",
      'node -e \'require("fs").writeFileSync("maker-output.txt", "resumed\\n")\'',
      "--checker-command",
      "node -e 'process.exit(3)'",
      "--repair-command",
      'node -e \'require("fs").appendFileSync("repair.log", `${process.env.ATLAS_REPAIR_ATTEMPT}\\n`)\''
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-9b/runner-state.json"), "utf8"));
  const repairLog = await readFile(join(worktreePath, "repair.log"), "utf8");

  assert.equal(result.status, "blocked");
  assert.equal(result.repairAttempts, 1);
  assert.equal(state.repairAttempts, 1);
  assert.equal(repairLog, "1\n");
});

test("runner adapter uses stage env vars and records structured checker findings", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-agent-");
  const agentCommand = [
    "node -e '",
    'const fs = require("fs");',
    'if (process.env.ATLAS_STAGE === "maker") { fs.writeFileSync("maker-output.txt", "agent done\\n"); process.exit(0); }',
    'if (process.env.ATLAS_STAGE === "checker") { console.log(JSON.stringify({ status: "blocked", findings: [{ severity: "blocker", summary: "Missing verification evidence", file: "maker-output.txt", line: 1, recommendation: "Record the checker evidence." }] })); process.exit(0); }',
    "process.exit(7);",
    "'"
  ].join("");

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-10",
      "--branch",
      "worktree/ap-10-runner-test",
      "--run-id",
      "run-ap-10",
      "--worktree-dir",
      worktreePath,
      "--agent-command",
      agentCommand
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-10/runner-state.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-10/evidence.json"), "utf8"));

  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "checker-blocked");
  assert.equal(state.status, "blocked");
  assert.equal(evidence.status, "checker-blocked");
  assert.deepEqual(
    evidence.checks.map((check) => check.stage),
    ["maker", "checker"]
  );
  assert.equal(evidence.events[1].exitCode, 0);
  assert.equal(evidence.events[1].structuredStatus, "blocked");
  assert.equal(evidence.findings[0].summary, "Missing verification evidence");
  assert.equal(evidence.findings[0].severity, "blocker");
  assert.equal(evidence.findings[0].file, "maker-output.txt");
});

test("runner records structured checker satisfaction layer proof", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-layer-proof-");
  const agentCommand = [
    "node -e '",
    'const fs = require("fs");',
    'if (process.env.ATLAS_STAGE === "maker") { fs.writeFileSync("maker-output.txt", "agent done\\n"); process.exit(0); }',
    'if (process.env.ATLAS_STAGE === "checker") { console.log(JSON.stringify({ status: "passed", satisfactionLayers: [{ layerId: "queue-preservation", label: "Queue preservation", status: "satisfied", proof: ["Queue contains goalContract."], missing: [] }, { layerId: "runner-proof", label: "Runner proof", status: "satisfied", proof: ["Evidence contains layer proof."], missing: [] }], findings: [] })); process.exit(0); }',
    "process.exit(7);",
    "'"
  ].join("");

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-11",
      "--branch",
      "worktree/ap-11-runner-test",
      "--run-id",
      "run-ap-11",
      "--worktree-dir",
      worktreePath,
      "--goal-contract-json",
      JSON.stringify(makeGoalContract()),
      "--agent-command",
      agentCommand
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-11/evidence.json"), "utf8"));

  assert.equal(result.status, "satisfied");
  assert.equal(evidence.satisfactionLayers[0].layerId, "queue-preservation");
  assert.equal(evidence.satisfactionLayers[0].status, "satisfied");
  assert.deepEqual(evidence.satisfactionLayers[0].proof, ["Queue contains goalContract."]);
});

test("runner blocks when checker layer proof is missing or blocked", async () => {
  const { root, worktreePath } = await createGitFixture("planner-agent-runner-layer-block-");
  const agentCommand = [
    "node -e '",
    'const fs = require("fs");',
    'if (process.env.ATLAS_STAGE === "maker") { fs.writeFileSync("maker-output.txt", "agent done\\n"); process.exit(0); }',
    'if (process.env.ATLAS_STAGE === "checker") { console.log(JSON.stringify({ status: "passed", satisfactionLayers: [{ layerId: "queue-preservation", label: "Queue preservation", status: "blocked", proof: [], missing: ["Queue evidence missing"] }], findings: [] })); process.exit(0); }',
    "process.exit(7);",
    "'"
  ].join("");

  const { stdout } = await execFileAsync(
    "node",
    [
      scriptPath,
      "--ticket",
      "AP-12",
      "--branch",
      "worktree/ap-12-runner-test",
      "--run-id",
      "run-ap-12",
      "--worktree-dir",
      worktreePath,
      "--goal-contract-json",
      JSON.stringify(makeGoalContract()),
      "--agent-command",
      agentCommand
    ],
    { cwd: root, timeout: 20_000 }
  );

  const result = JSON.parse(stdout);
  const state = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-12/runner-state.json"), "utf8"));
  const evidence = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-12/evidence.json"), "utf8"));

  assert.equal(result.status, "blocked");
  assert.equal(result.stage, "checker-blocked");
  assert.equal(state.status, "blocked");
  assert.equal(evidence.status, "checker-blocked");
  assert.equal(evidence.satisfactionLayers[0].status, "blocked");
  assert.deepEqual(evidence.satisfactionLayers[0].missing, ["Queue evidence missing"]);
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

function makeGoalContract() {
  return {
    statement: "Complete the durable contract handoff.",
    stopCondition: "Stop when runner prompts and evidence contain the contract.",
    scope: "Loop store, project loop, and runner handoff only.",
    maxEstimate: 5,
    satisfactionLayers: [
      {
        id: "queue-preservation",
        label: "Queue preservation",
        criteria: "Queue stores structured layers.",
        status: "pending",
        humanGated: false
      },
      {
        id: "runner-proof",
        label: "Runner proof",
        criteria: "Evidence has a structured place for layer proof.",
        status: "pending",
        humanGated: true
      }
    ],
    verificationCommands: [
      {
        id: "planner-runner",
        label: "Planner runner tests",
        command: "npm run test:planner-agent-runner",
        required: true
      }
    ],
    safety: {
      maxIterations: 4,
      maxRepairAttempts: 2,
      tokenBudget: "Stay inside the current window.",
      timeBudget: "One focused run.",
      allowedPaths: "packages/loop-store/**, scripts/**",
      externalActionPolicy: "human-gated"
    }
  };
}
