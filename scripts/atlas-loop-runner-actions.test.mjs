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
        goalContract: makeGoalContract(),
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
  assert.equal(result.currentRun.goalContract.statement, "Run the Atlas loop from the planner.");
  assert.match(result.currentRun.runnerCommand, /planner-agent-runner\.mjs/);
  assert.match(result.currentRun.runnerCommand, /--goal-contract-json/);
  assert.match(result.currentRun.runnerCommand, /--max-repairs '2'/);

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
  assert.deepEqual(calls[0].args.slice(0, 15), [
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
  assert.equal(calls[0].args[15], "--goal-contract-json");
  assert.equal(JSON.parse(calls[0].args[16]).statement, "Run the Atlas loop from the planner.");
  assert.deepEqual(calls[0].args.slice(17), ["--max-repairs", "2"]);
  assert.equal(calls[0].options.cwd, root);
});

test("runAtlasLoopRunnerAction passes configured maker checker and PR commands", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });
  await writeCurrentRun(root, {
    runnerCommands: {
      makerCommand: "make maker",
      checkerCommand: "make checker",
      repairCommand: "make repair",
      prCommand: "gh pr create --fill"
    }
  });

  const calls = [];
  const result = await runAtlasLoopRunnerAction(root, "start-current-run", {
    execRunner: async (file, args) => {
      calls.push({ file, args });
      return { stdout: "{\"status\":\"created\"}\n", stderr: "" };
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].args.slice(-8), [
    "--maker-command",
    "make maker",
    "--checker-command",
    "make checker",
    "--repair-command",
    "make repair",
    "--pr-command",
    "gh pr create --fill"
  ]);
});

test("runAtlasLoopRunnerAction syncs terminal runner state back to the queued goal", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "AP-16",
        title: "Add start and resume loop controls",
        lifecycleStatus: "running",
        approvedToRun: true,
        status: "in-progress",
        estimate: 5,
        summary: "Backend action route.",
        tags: ["goal", "approved-to-run"],
        description: "Claimed goal.",
        goalContract: makeGoalContract(),
        subtasks: [],
        createdAt: "2026-06-20T10:00:00.000Z",
        updatedAt: "2026-06-20T12:00:00.000Z"
      }
    ]
  });
  await writeCurrentRun(root);

  const result = await runAtlasLoopRunnerAction(root, "start-current-run", {
    execRunner: async () => {
      await mkdir(join(root, "loops/project-controller/runs/run-ap-16"), { recursive: true });
      await writeFile(
        join(root, "loops/project-controller/runs/run-ap-16/runner-state.json"),
        `${JSON.stringify(
          {
            version: 1,
            runId: "run-ap-16",
            worktreePath: root,
            status: "satisfied",
            stage: "checker-passed",
            updatedAt: "2026-06-20T13:00:00.000Z"
          },
          null,
          2
        )}\n`
      );
      return { stdout: "{\"status\":\"satisfied\"}\n", stderr: "" };
    }
  });

  const queue = JSON.parse(await readFile(join(root, "loops/project-controller/goal-queue.json"), "utf8"));
  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));

  assert.equal(result.ok, true);
  assert.equal(result.sync.status, "synced");
  assert.equal(result.goal.lifecycleStatus, "satisfied");
  assert.equal(queue.goals[0].lifecycleStatus, "satisfied");
  assert.equal(queue.goals[0].status, "done");
  assert.equal(currentRun.status, "satisfied");
  assert.equal(currentRun.stage, "checker-passed");
});

test("runAtlasLoopRunnerAction syncs failed terminal runner state as blocked", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "AP-16",
        title: "Add start and resume loop controls",
        lifecycleStatus: "running",
        approvedToRun: true,
        status: "in-progress",
        estimate: 5,
        summary: "Backend action route.",
        tags: ["goal", "approved-to-run"],
        description: "Claimed goal.",
        goalContract: makeGoalContract(),
        subtasks: [],
        createdAt: "2026-06-20T10:00:00.000Z",
        updatedAt: "2026-06-20T12:00:00.000Z"
      }
    ]
  });
  await writeCurrentRun(root);

  const result = await runAtlasLoopRunnerAction(root, "start-current-run", {
    execRunner: async () => {
      await mkdir(join(root, "loops/project-controller/runs/run-ap-16"), { recursive: true });
      await writeFile(
        join(root, "loops/project-controller/runs/run-ap-16/runner-state.json"),
        `${JSON.stringify({ version: 1, runId: "run-ap-16", worktreePath: root, status: "failed", stage: "maker-failed" })}\n`
      );
      const error = new Error("runner failed");
      error.code = 1;
      error.stdout = "";
      error.stderr = "runner failed";
      throw error;
    }
  });

  const queue = JSON.parse(await readFile(join(root, "loops/project-controller/goal-queue.json"), "utf8"));
  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));

  assert.equal(result.ok, false);
  assert.equal(queue.goals[0].lifecycleStatus, "blocked");
  assert.equal(queue.goals[0].status, "blocked");
  assert.equal(currentRun.status, "failed");
  assert.equal(currentRun.stage, "maker-failed");
});

test("runAtlasLoopRunnerAction resumes only when runner state exists", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });
  await writeCurrentRun(root, {
    runnerCommands: {
      makerCommand: "make maker",
      checkerCommand: "make checker",
      repairCommand: "make repair",
      prCommand: "gh pr create --fill"
    }
  });

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
    "loops/project-controller/runs/run-ap-16",
    "--maker-command",
    "make maker",
    "--checker-command",
    "make checker",
    "--repair-command",
    "make repair",
    "--pr-command",
    "gh pr create --fill"
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

async function writeCurrentRun(root, update = {}) {
  await writeFile(
    join(root, "loops/project-controller/current-run.json"),
    `${JSON.stringify(
      {
        version: 1,
        id: "run-ap-16",
        goalId: "AP-16",
        goalTitle: "Add start and resume loop controls",
        goalContract: makeGoalContract(),
        status: "running",
        stage: "claimed",
        claimedAt: "2026-06-20T12:00:00.000Z",
        updatedAt: "2026-06-20T12:00:00.000Z",
        baseCommit: "abc1234",
        branchName: "worktree/ap-16",
        worktreePath: "../agent-monorepo-ap-16",
        handoffDir: "loops/project-controller/runs/run-ap-16",
        ...update
      },
      null,
      2
    )}\n`
  );
}

function makeGoalContract() {
  return {
    statement: "Run the Atlas loop from the planner.",
    stopCondition: "Stop when the runner records checker-approved evidence.",
    scope: "Atlas Planner loop controls.",
    maxEstimate: 8,
    satisfactionLayers: [
      {
        id: "runner-start",
        label: "Runner start",
        criteria: "The runner can start from current-run state.",
        status: "pending",
        humanGated: false
      }
    ],
    verificationCommands: [
      {
        id: "runner-actions-test",
        label: "Runner actions tests",
        command: "node --test scripts/atlas-loop-runner-actions.test.mjs",
        required: true
      }
    ],
    safety: {
      maxIterations: 3,
      maxRepairAttempts: 2,
      tokenBudget: "Stay within current window.",
      timeBudget: "One bounded run.",
      allowedPaths: "apps/web/**, packages/loop-store/**, scripts/**",
      externalActionPolicy: "human-gated"
    }
  };
}
