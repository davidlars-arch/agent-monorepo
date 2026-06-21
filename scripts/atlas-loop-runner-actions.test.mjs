import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  claimNextAtlasPlannerGoal,
  prepareAtlasLoopRunnerHandoff,
  runAtlasLoopRunnerAction,
  syncTerminalAtlasRun
} from "../packages/loop-store/src/index.mjs";

test("claimNextAtlasPlannerGoal claims the first approved queued goal", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "AP-16",
        title: "Add start and resume loop controls",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "backlog",
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

test("claimNextAtlasPlannerGoal can claim a specific repo goal", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-ATLAS",
        title: "Atlas goal",
        projectId: "atlas-planner",
        projectLabel: "Atlas Planner",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "backlog",
        estimate: 5,
        summary: "Do not claim me for the repo board.",
        tags: ["goal", "approved-to-run"],
        description: "Atlas goal.",
        goalContract: makeGoalContract(),
        subtasks: [],
        createdAt: "2026-06-20T10:00:00.000Z",
        updatedAt: "2026-06-20T10:00:00.000Z"
      },
      {
        id: "GOAL-REPO",
        title: "Repo goal",
        projectId: "repo-health",
        projectLabel: "Repo Health",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "backlog",
        estimate: 3,
        summary: "Claim me for the repo board.",
        tags: ["goal", "approved-to-run"],
        description: "Repo goal.",
        goalContract: makeGoalContract(),
        subtasks: [],
        createdAt: "2026-06-20T10:00:00.000Z",
        updatedAt: "2026-06-20T10:00:00.000Z"
      }
    ]
  });

  const result = await claimNextAtlasPlannerGoal(root, {
    now: new Date("2026-06-20T12:00:00.000Z"),
    readCommit: async () => "abc1234",
    goalId: "GOAL-REPO",
    projectId: "repo-health"
  });

  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));

  assert.equal(result.ok, true);
  assert.equal(result.status, "claimed");
  assert.equal(result.currentRun.goalId, "GOAL-REPO");
  assert.equal(result.currentRun.projectId, "repo-health");
  assert.equal(currentRun.goalId, "GOAL-REPO");
  assert.equal(currentRun.projectId, "repo-health");
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

test("prepareAtlasLoopRunnerHandoff returns the runner command without executing it", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });
  await writeCurrentRun(root);

  const result = await prepareAtlasLoopRunnerHandoff(root, "start-current-run");

  assert.equal(result.ok, true);
  assert.equal(result.status, "handoff-required");
  assert.equal(result.currentRun.goalId, "AP-16");
  assert.match(result.command, /scripts\/planner-agent-runner\.mjs/);
  assert.match(result.command, /'--ticket' 'AP-16'/);
  assert.match(result.reason, /terminal or background worker/);
});

test("prepareAtlasLoopRunnerHandoff validates resume state before returning a command", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });
  await writeCurrentRun(root);

  const result = await prepareAtlasLoopRunnerHandoff(root, "resume-current-run");

  assert.equal(result.ok, false);
  assert.equal(result.status, "missing-runner-state");
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
        description: "Claimed goal.\nLifecycle: approved\nApproved to run: yes",
        goalContract: makeGoalContract(),
        subtasks: [
          { id: "goal-claim", title: "Claim approved goal into current-run.json", done: false },
          { id: "goal-start", title: "Start or hand off runner without external actions", done: false },
          { id: "goal-evidence", title: "Record runner state and evidence artifacts", done: false },
          { id: "goal-review", title: "Run independent review and handle findings", done: false }
        ],
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
            maxRepairs: 0,
            repairAttempts: 0,
            makerCommand: "node scripts/atlas-smoke-maker.mjs",
            checkerCommand: "node scripts/atlas-smoke-checker.mjs",
            repairCommand: "",
            prCommand: "",
            timeline: [
              { stage: "prepare", status: "done", at: "2026-06-20T12:01:00.000Z", detail: "Worktree and handoff files were created." },
              { stage: "maker", status: "done", at: "2026-06-20T12:02:00.000Z", detail: "Maker command passed." },
              { stage: "checker", status: "done", at: "2026-06-20T13:00:00.000Z", detail: "Checker command passed." }
            ],
            updatedAt: "2026-06-20T13:00:00.000Z"
          },
          null,
          2
        )}\n`
      );
      await writeFile(
        join(root, "loops/project-controller/runs/run-ap-16/evidence.json"),
        `${JSON.stringify(
          {
            version: 1,
            runId: "run-ap-16",
            status: "checker-passed",
            repairAttempts: 0,
            maxRepairs: 0,
            checks: [
              { stage: "maker", command: "node scripts/atlas-smoke-maker.mjs", exitCode: 0, startedAt: "2026-06-20T12:01:30.000Z", finishedAt: "2026-06-20T12:02:00.000Z", repairAttempt: 0 },
              { stage: "checker", command: "node scripts/atlas-smoke-checker.mjs", exitCode: 0, startedAt: "2026-06-20T12:59:00.000Z", finishedAt: "2026-06-20T13:00:00.000Z", repairAttempt: 0 }
            ],
            findings: [],
            satisfactionLayers: [
              { layerId: "runner-start", label: "Runner start", status: "satisfied", proof: ["Runner reached checker-passed."], missing: [] }
            ],
            pullRequest: {
              status: "ready",
              detail: "Local evidence passed; PR remains human gated."
            }
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
  const review = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-16/review.json"), "utf8"));
  const runHistory = await readFile(join(root, "loops/project-controller/run-history.jsonl"), "utf8");

  assert.equal(result.ok, true);
  assert.equal(result.sync.status, "synced");
  assert.equal(result.goal.lifecycleStatus, "satisfied");
  assert.equal(queue.goals[0].lifecycleStatus, "satisfied");
  assert.equal(queue.goals[0].status, "done");
  assert.equal(queue.goals[0].approvedToRun, false);
  assert.equal(queue.goals[0].goalContract.satisfactionLayers[0].status, "satisfied");
  assert.equal(queue.goals[0].subtasks.every((subtask) => subtask.done), true);
  assert.match(queue.goals[0].description, /Lifecycle: satisfied/);
  assert.match(queue.goals[0].description, /Approved to run: no/);
  assert.doesNotMatch(queue.goals[0].description, /Lifecycle: approved/);
  assert.doesNotMatch(queue.goals[0].description, /Approved to run: yes/);
  assert.equal(currentRun.status, "satisfied");
  assert.equal(currentRun.stage, "checker-passed");
  assert.equal(currentRun.maxRepairs, 0);
  assert.equal(currentRun.repairAttempts, 0);
  assert.equal(currentRun.runnerCommands.makerCommand, "node scripts/atlas-smoke-maker.mjs");
  assert.equal(currentRun.runnerCommands.checkerCommand, "node scripts/atlas-smoke-checker.mjs");
  assert.equal(currentRun.timeline.some((event) => event.stage === "prepare" && event.status === "next"), false);
  assert.equal(currentRun.timeline.some((event) => event.stage === "maker" && event.status === "locked"), false);
  assert.equal(currentRun.timeline.some((event) => event.stage === "checker" && event.status === "locked"), false);
  assert.deepEqual(
    currentRun.timeline.slice(-4).map((event) => `${event.stage}:${event.status}`),
    ["prepare:done", "maker:done", "checker:done", "human-review:next"]
  );
  assert.equal(currentRun.humanGate.status, "pending-review");
  assert.equal(currentRun.humanGate.recommendedNextAction, "human-review");
  assert.equal(currentRun.humanGate.externalActions, "ready");
  assert.equal(currentRun.humanReview.status, "pending");
  assert.equal(currentRun.humanReview.reviewedBy, null);
  assert.equal(currentRun.humanReview.externalActions.prCreation, "disabled");
  assert.equal(review.schemaVersion, "atlas-human-review.v1");
  assert.equal(review.status, "pending");
  assert.equal(review.decision, null);
  assert.match(runHistory, /"runId":"run-ap-16"/);
  assert.match(runHistory, /"humanReviewStatus":"pending"/);
  assert.equal(runHistory.trim().split(/\r?\n/).length, 1);

  const approvedReview = {
    ...review,
    status: "approved",
    reviewedBy: "David",
    reviewedAt: "2026-06-20T12:30:00.000Z",
    decision: "approve-pr-creation"
  };
  await writeFile(join(root, "loops/project-controller/runs/run-ap-16/review.json"), `${JSON.stringify(approvedReview, null, 2)}\n`);

  const resync = await syncTerminalAtlasRun(root, currentRun);
  const resyncedCurrentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
  const resyncedReview = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-16/review.json"), "utf8"));
  const resyncedRunHistory = await readFile(join(root, "loops/project-controller/run-history.jsonl"), "utf8");

  assert.equal(resync.status, "synced");
  assert.equal(resyncedCurrentRun.humanReview.status, "approved");
  assert.equal(resyncedCurrentRun.humanReview.reviewedBy, "David");
  assert.equal(resyncedCurrentRun.humanReview.decision, "approve-pr-creation");
  assert.equal(resyncedReview.status, "approved");
  assert.equal(resyncedReview.reviewedBy, "David");
  assert.equal(resyncedRunHistory.trim().split(/\r?\n/).length, 1);
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
  const review = JSON.parse(await readFile(join(root, "loops/project-controller/runs/run-ap-16/review.json"), "utf8"));
  const runHistory = await readFile(join(root, "loops/project-controller/run-history.jsonl"), "utf8");

  assert.equal(result.ok, false);
  assert.equal(queue.goals[0].lifecycleStatus, "blocked");
  assert.equal(queue.goals[0].status, "blocked");
  assert.equal(currentRun.status, "failed");
  assert.equal(currentRun.stage, "maker-failed");
  assert.equal(currentRun.humanGate.status, "needs-review");
  assert.equal(currentRun.humanReview.status, "pending");
  assert.equal(currentRun.humanReview.recommendedNextAction, "inspect-blocker");
  assert.equal(review.status, "pending");
  assert.equal(review.recommendedNextAction, "inspect-blocker");
  assert.match(runHistory, /"runId":"run-ap-16"/);
  assert.match(runHistory, /"status":"failed"/);
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
