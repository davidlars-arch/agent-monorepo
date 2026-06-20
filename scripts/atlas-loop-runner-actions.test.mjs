import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { claimNextAtlasPlannerGoal, runAtlasLoopRunnerAction } from "../packages/loop-store/src/index.mjs";

test("claimNextAtlasPlannerGoal claims the first approved queued goal", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "AP-16",
        title: "Add start and resume loop controls",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "in-progress",
        estimate: 5,
        summary: "Backend action route.",
        tags: ["goal", "approved-to-run"],
        description: "Claim me.",
        subtasks: [],
        createdAt: "2026-06-20T10:00:00.000Z",
        updatedAt: "2026-06-20T10:00:00.000Z"
      }
    ]
  });

  const result = await claimNextAtlasPlannerGoal(root, {
    now: new Date("2026-06-20T12:00:00.000Z"),
    readCommit: async () => "abc1234"
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "claimed");
  assert.equal(result.currentRun.goalId, "AP-16");
  assert.equal(result.currentRun.branchName, "worktree/ap-16");
  assert.equal(result.currentRun.worktreePath, "../agent-monorepo-ap-16");
  assert.match(result.currentRun.runnerCommand, /planner-agent-runner\.mjs/);

  const queue = JSON.parse(await readFile(join(root, "loops/project-controller/goal-queue.json"), "utf8"));
  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
  assert.equal(queue.goals[0].lifecycleStatus, "running");
  assert.equal(currentRun.id, result.currentRun.id);
  assert.match(currentRun.id, /^run-ap-16-/);
});

test("runAtlasLoopRunnerAction starts the current run with local runner args", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });
  await writeCurrentRun(root);

  const calls = [];
  const result = await runAtlasLoopRunnerAction(root, "start-current-run", {
    execRunner: async (file, args, options) => {
      calls.push({ file, args, options });
      return { stdout: "{\"status\":\"created\"}\n", stderr: "" };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, process.execPath);
  assert.deepEqual(calls[0].args, [
    "scripts/planner-agent-runner.mjs",
    "--ticket",
    "AP-16",
    "--branch",
    "worktree/ap-16",
    "--base",
    "abc1234",
    "--run-id",
    "run-ap-16",
    "--goal-title",
    "Add start and resume loop controls",
    "--worktree-dir",
    "../agent-monorepo-ap-16",
    "--handoff-dir",
    "loops/project-controller/runs/run-ap-16"
  ]);
  assert.equal(calls[0].options.cwd, root);
});

test("runAtlasLoopRunnerAction resumes only when runner state exists", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });
  await writeCurrentRun(root);

  const missingState = await runAtlasLoopRunnerAction(root, "resume-current-run", {
    execRunner: async () => {
      throw new Error("should not run");
    }
  });
  assert.equal(missingState.ok, false);
  assert.equal(missingState.status, "missing-runner-state");

  await mkdir(join(root, "loops/project-controller/runs/run-ap-16"), { recursive: true });
  await writeFile(
    join(root, "loops/project-controller/runs/run-ap-16/runner-state.json"),
    `${JSON.stringify({ version: 1, runId: "run-ap-16", worktreePath: root, status: "prepared", stage: "maker-handoff" })}\n`
  );

  const calls = [];
  const resumed = await runAtlasLoopRunnerAction(root, "resume-current-run", {
    execRunner: async (file, args) => {
      calls.push({ file, args });
      return { stdout: "{\"mode\":\"resume\"}\n", stderr: "" };
    }
  });

  assert.equal(resumed.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    "scripts/planner-agent-runner.mjs",
    "--resume",
    "--handoff-dir",
    "loops/project-controller/runs/run-ap-16"
  ]);
});

test("runAtlasLoopRunnerAction does not resume terminal runs", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });
  await writeCurrentRun(root);
  await mkdir(join(root, "loops/project-controller/runs/run-ap-16"), { recursive: true });
  await writeFile(
    join(root, "loops/project-controller/runs/run-ap-16/runner-state.json"),
    `${JSON.stringify({ version: 1, runId: "run-ap-16", worktreePath: root, status: "satisfied", stage: "checker-passed" })}\n`
  );

  const result = await runAtlasLoopRunnerAction(root, "resume-current-run", {
    execRunner: async () => {
      throw new Error("should not run");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "terminal-runner-state");
});

async function makeLoopRoot({ queuedGoals }) {
  const root = await mkdtemp(join(tmpdir(), "atlas-loop-runner-actions-"));
  await mkdir(join(root, "loops/project-controller"), { recursive: true });
  await writeFile(
    join(root, "loops/project-controller/goal-queue.json"),
    `${JSON.stringify({ version: 1, updatedAt: "2026-06-20T10:00:00.000Z", goals: queuedGoals }, null, 2)}\n`
  );
  return root;
}

async function writeCurrentRun(root) {
  await writeFile(
    join(root, "loops/project-controller/current-run.json"),
    `${JSON.stringify(
      {
        version: 1,
        id: "run-ap-16",
        goalId: "AP-16",
        goalTitle: "Add start and resume loop controls",
        status: "running",
        stage: "claimed",
        claimedAt: "2026-06-20T12:00:00.000Z",
        updatedAt: "2026-06-20T12:00:00.000Z",
        baseCommit: "abc1234",
        branchName: "worktree/ap-16",
        worktreePath: "../agent-monorepo-ap-16",
        handoffDir: "loops/project-controller/runs/run-ap-16"
      },
      null,
      2
    )}\n`
  );
}
