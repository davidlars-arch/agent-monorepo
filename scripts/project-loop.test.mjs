import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptPath = resolve("scripts/project-loop.mjs");

test("approved queued goals are selected before ordinary planner tickets", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-1",
        title: "Queued approved goal",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "in-progress",
        estimate: 3,
        summary: "A queued goal should win.",
        tags: ["goal", "loop", "approved-to-run"],
        description: "Queued goal.",
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });

  await runController(root, ["--project", "atlas-planner"]);

  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");
  assert.match(report, /selected `GOAL-1`/);
  assert.match(report, /Durable Goal Queue/);
});

test("unapproved queued goals are visible but not selected for runner work", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-DRAFT",
        title: "Queued draft goal",
        lifecycleStatus: "draft",
        approvedToRun: false,
        status: "backlog",
        estimate: 3,
        summary: "A draft queued goal must not run.",
        tags: ["goal", "loop", "goal-draft"],
        description: "Draft goal.",
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });

  await runController(root, ["--project", "atlas-planner"]);

  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");
  assert.match(report, /selected `AP-ACTIVE`/);
  assert.match(report, /`GOAL-DRAFT` \(draft, backlog, 3 pts\)/);
});

test("--claim-goal writes current-run state and moves the queued goal to running", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-CLAIM",
        title: "Claimable goal",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "in-progress",
        estimate: 3,
        summary: "A queued goal should be claimed.",
        tags: ["goal", "loop", "approved-to-run"],
        description: "Claimable goal.",
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });

  await runController(root, ["--project", "atlas-planner", "--claim-goal"]);

  const queue = JSON.parse(await readFile(join(root, "loops/project-controller/goal-queue.json"), "utf8"));
  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");

  assert.equal(queue.goals[0].lifecycleStatus, "running");
  assert.equal(queue.goals[0].status, "in-progress");
  assert.equal(currentRun.goalId, "GOAL-CLAIM");
  assert.equal(currentRun.stage, "claimed");
  assert.equal(currentRun.branchName, "worktree/goal-claim");
  assert.equal(currentRun.worktreePath, "../agent-monorepo-goal-claim");
  assert.match(currentRun.runnerCommand, /scripts\/planner-agent-runner\.mjs/);
  assert.equal(currentRun.handoffDir, `loops/project-controller/runs/${currentRun.id}`);
  assert.equal(currentRun.makerPromptPath, `loops/project-controller/runs/${currentRun.id}/maker-prompt.md`);
  assert.equal(currentRun.checkerPromptPath, `loops/project-controller/runs/${currentRun.id}/checker-prompt.md`);
  assert.equal(currentRun.evidencePath, `loops/project-controller/runs/${currentRun.id}/evidence.json`);
  assert.equal(currentRun.timeline[2].stage, "prepare");
  assert.equal(currentRun.timeline[3].stage, "maker");
  assert.match(report, /Goal claim: `GOAL-CLAIM` claimed/);
  assert.match(report, /branch `worktree\/goal-claim`/);
  assert.match(report, /planner-agent-runner\.mjs/);
});

test("--dry-run --claim-goal is read-only and does not write current-run state", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-DRY",
        title: "Dry-run claimable goal",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "in-progress",
        estimate: 3,
        summary: "A queued goal should be planned but not claimed.",
        tags: ["goal", "loop", "approved-to-run"],
        description: "Claimable goal.",
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });

  const { stdout } = await runController(root, ["--dry-run", "--project", "atlas-planner", "--claim-goal"]);

  const queue = JSON.parse(await readFile(join(root, "loops/project-controller/goal-queue.json"), "utf8"));

  assert.equal(queue.goals[0].lifecycleStatus, "approved");
  assert.equal(queue.goals[0].status, "in-progress");
  assert.match(stdout, /selected `GOAL-DRY`/);
  assert.match(stdout, /Project controller dry run completed; no files written\./);
  assert.doesNotMatch(stdout, /Goal claim: `GOAL-DRY` claimed/);
  await assert.rejects(readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
  await assert.rejects(readFile(join(root, "loops/project-controller/latest-report.md"), "utf8"));
  await assert.rejects(readFile(join(root, "loops/project-controller/state.json"), "utf8"));
  await assert.rejects(readFile(join(root, "loops/project-controller/decisions.jsonl"), "utf8"));
});

test("--claim-goal without a queued goal does not write current-run", async () => {
  const root = await makeLoopRoot({ queuedGoals: [] });

  await runController(root, ["--project", "atlas-planner", "--claim-goal"]);

  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");
  assert.doesNotMatch(report, /Goal claim: `GOAL-/);
  await assert.rejects(readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
});

async function makeLoopRoot({ queuedGoals }) {
  const root = await mkdtemp(join(tmpdir(), "project-loop-"));
  await mkdir(join(root, "loops/project-controller"), { recursive: true });
  await mkdir(join(root, "loops/usage-status"), { recursive: true });
  await writeFile(
    join(root, "loops/project-controller/projects.json"),
    `${JSON.stringify(makeRegistry(), null, 2)}\n`
  );
  await writeFile(
    join(root, "loops/project-controller/goal-queue.json"),
    `${JSON.stringify({ version: 1, updatedAt: "2026-06-19T20:00:00.000Z", goals: queuedGoals }, null, 2)}\n`
  );
  await writeFile(
    join(root, "loops/usage-status/latest-status.json"),
    `${JSON.stringify(
      {
        recordedAt: "2026-06-19T20:00:00.000Z",
        model: "gpt-5-codex",
        context: "small",
        currentTokens: "12000",
        shortWindow: "50% left",
        weekly: "80% left"
      },
      null,
      2
    )}\n`
  );
  return root;
}

async function runController(root, args) {
  return execFileAsync("node", [scriptPath, ...args], {
    cwd: resolve("."),
    env: { ...process.env, PROJECT_LOOP_ROOT: root },
    timeout: 20_000
  });
}

function makeRegistry() {
  return {
    defaults: {
      cadenceHours: 24,
      permission: "build-local",
      timeoutMs: 120000
    },
    projects: [
      {
        id: "atlas-planner",
        label: "Atlas Planner",
        area: "planner",
        cadenceHours: 24,
        permission: "build-local",
        nextAction: "Build the next bounded loop slice.",
        commands: [{ name: "noop", cmd: "node", args: ["--version"] }],
        epics: [
          {
            id: "planner-product",
            label: "Planner Product",
            tickets: [
              {
                id: "AP-ACTIVE",
                title: "Existing active planner task",
                status: "in-progress",
                estimate: 8,
                summary: "This should lose to an approved queued goal.",
                tags: ["loop-engineering"]
              }
            ]
          }
        ]
      }
    ]
  };
}
