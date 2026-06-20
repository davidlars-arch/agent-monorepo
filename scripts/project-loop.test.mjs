import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { validateQueuedGoalInput } from "../packages/loop-store/src/index.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = resolve("scripts/project-loop.mjs");

test("queued goal validation preserves the full goal contract", () => {
  const validation = validateQueuedGoalInput(
    {
      id: "GOAL-CONTRACT",
      title: "Preserve contract",
      projectId: "repo-health",
      projectLabel: "Repo Health",
      epicId: "repo-safety",
      epicLabel: "Repo Safety",
      lifecycleStatus: "approved",
      approvedToRun: true,
      estimate: 5,
      summary: "Statement fallback.",
      goalContract: makeGoalContract()
    },
    { now: "2026-06-20T10:00:00.000Z" }
  );

  assert.equal(validation.ok, true);
  assert.equal(validation.goal.projectId, "repo-health");
  assert.equal(validation.goal.projectLabel, "Repo Health");
  assert.equal(validation.goal.epicId, "repo-safety");
  assert.equal(validation.goal.epicLabel, "Repo Safety");
  assert.equal(validation.goal.status, "backlog");
  assert.equal(validation.goal.goalContract.statement, "Complete the durable contract handoff.");
  assert.equal(validation.goal.goalContract.stopCondition, "Stop when runner prompts and evidence contain the contract.");
  assert.equal(validation.goal.goalContract.scope, "Loop store, project loop, and runner handoff only.");
  assert.equal(validation.goal.goalContract.satisfactionLayers[0].criteria, "Queue stores structured layers.");
  assert.equal(validation.goal.goalContract.verificationCommands[0].command, "npm run test:loop-controller");
  assert.equal(validation.goal.goalContract.safety.allowedPaths, "packages/loop-store/**, scripts/**");
});

test("approved queued goals are selected before ordinary planner tickets", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-1",
        title: "Queued approved goal",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "backlog",
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

test("--claim-goal selects approved queued work even when the usage window can fit a larger ticket", async () => {
  const root = await makeLoopRoot({
    registry: makeRegistryWithLargeActiveTicket(),
    usageStatus: {
      recordedAt: "2026-06-19T20:00:00.000Z",
      model: "gpt-5-codex",
      context: "large",
      currentTokens: "12000",
      shortWindow: "94% left",
      weekly: "80% left"
    },
    queuedGoals: [
      {
        id: "GOAL-FIRST",
        title: "First loop goal",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "backlog",
        estimate: 3,
        summary: "Claim this before normal board work.",
        tags: ["goal", "loop", "approved-to-run"],
        description: "First loop goal.",
        goalContract: makeGoalContract(),
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });

  const { stdout } = await runController(root, ["--dry-run", "--project", "atlas-planner", "--claim-goal"]);

  assert.match(stdout, /selected `GOAL-FIRST`/);
  assert.doesNotMatch(stdout, /selected `AP-6`/);
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
        status: "backlog",
        estimate: 3,
        summary: "A queued goal should be claimed.",
        tags: ["goal", "loop", "approved-to-run"],
        description: "Claimable goal.",
        goalContract: makeGoalContract(),
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
  assert.equal(queue.goals[0].goalContract.statement, "Complete the durable contract handoff.");
  assert.equal(currentRun.goalId, "GOAL-CLAIM");
  assert.equal(currentRun.goalContract.statement, "Complete the durable contract handoff.");
  assert.equal(currentRun.goalContract.satisfactionLayers[0].label, "Queue preservation");
  assert.equal(currentRun.goalContract.verificationCommands[0].command, "npm run test:loop-controller");
  assert.equal(currentRun.goalContract.safety.externalActionPolicy, "human-gated");
  assert.equal(currentRun.stage, "claimed");
  assert.equal(currentRun.branchName, "worktree/goal-claim");
  assert.equal(currentRun.worktreePath, "../agent-monorepo-goal-claim");
  assert.match(currentRun.runnerCommand, /scripts\/planner-agent-runner\.mjs/);
  assert.match(currentRun.runnerCommand, /--goal-contract-json/);
  assert.match(currentRun.runnerCommand, /--max-repairs '2'/);
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

test("--claim-goal claims queued goals for their owning project", async () => {
  const root = await makeLoopRoot({
    registry: makeRegistryWithRepoHealth(),
    queuedGoals: [
      {
        id: "GOAL-REPO",
        title: "Repo-owned goal",
        projectId: "repo-health",
        projectLabel: "Repo Health",
        epicId: "repo-safety",
        epicLabel: "Repo Safety",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "backlog",
        estimate: 3,
        summary: "A queued goal should belong to repo health.",
        tags: ["goal", "loop", "approved-to-run"],
        description: "Repo-owned goal.",
        goalContract: makeGoalContract(),
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });

  await runController(root, ["--project", "repo-health", "--claim-goal"]);

  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");

  assert.equal(currentRun.goalId, "GOAL-REPO");
  assert.equal(currentRun.projectId, "repo-health");
  assert.equal(currentRun.projectLabel, "Repo Health");
  assert.match(report, /Goal claim: `GOAL-REPO` claimed/);
});

test("--claim-goal can claim an already-running queued goal without current-run state", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-RUNNING",
        title: "Running goal without run state",
        lifecycleStatus: "running",
        approvedToRun: true,
        status: "in-progress",
        estimate: 3,
        summary: "A running queued goal should still be claimable if current-run is missing.",
        tags: ["goal", "loop", "goal-running", "approved-to-run"],
        description: "Running goal.",
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });

  await runController(root, ["--project", "atlas-planner", "--claim-goal"]);

  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");

  assert.equal(currentRun.goalId, "GOAL-RUNNING");
  assert.match(report, /Goal claim: `GOAL-RUNNING` claimed/);
});

test("--claim-goal does not overwrite an existing current-run state", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-ACTIVE",
        title: "Active running goal",
        lifecycleStatus: "running",
        approvedToRun: true,
        status: "in-progress",
        estimate: 3,
        summary: "A running queued goal with active state should not be reclaimed.",
        tags: ["goal", "loop", "goal-running", "approved-to-run"],
        description: "Active goal.",
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });
  await writeFile(
    join(root, "loops/project-controller/current-run.json"),
    `${JSON.stringify(
      {
        version: 1,
        id: "run-existing",
        goalId: "GOAL-ACTIVE",
        status: "running",
        stage: "maker"
      },
      null,
      2
    )}\n`
  );

  await runController(root, ["--project", "atlas-planner", "--claim-goal"]);

  const currentRun = JSON.parse(await readFile(join(root, "loops/project-controller/current-run.json"), "utf8"));
  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");

  assert.equal(currentRun.id, "run-existing");
  assert.doesNotMatch(report, /Goal claim: `GOAL-ACTIVE` claimed/);
});

test("--claim-goal does not overwrite malformed current-run state", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-MALFORMED",
        title: "Running goal with malformed run state",
        lifecycleStatus: "running",
        approvedToRun: true,
        status: "in-progress",
        estimate: 3,
        summary: "A malformed current run file should still block reclaiming.",
        tags: ["goal", "loop", "goal-running", "approved-to-run"],
        description: "Malformed current run guard.",
        subtasks: [],
        createdAt: "2026-06-19T20:00:00.000Z",
        updatedAt: "2026-06-19T20:00:00.000Z"
      }
    ]
  });
  await writeFile(join(root, "loops/project-controller/current-run.json"), "{");

  await runController(root, ["--project", "atlas-planner", "--claim-goal"]);

  const currentRun = await readFile(join(root, "loops/project-controller/current-run.json"), "utf8");
  const report = await readFile(join(root, "loops/project-controller/latest-report.md"), "utf8");

  assert.equal(currentRun, "{");
  assert.doesNotMatch(report, /Goal claim: `GOAL-MALFORMED` claimed/);
});

test("--dry-run --claim-goal is read-only and does not write current-run state", async () => {
  const root = await makeLoopRoot({
    queuedGoals: [
      {
        id: "GOAL-DRY",
        title: "Dry-run claimable goal",
        lifecycleStatus: "approved",
        approvedToRun: true,
        status: "backlog",
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
  assert.equal(queue.goals[0].status, "backlog");
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

async function makeLoopRoot({ queuedGoals, registry = makeRegistry(), usageStatus = null }) {
  const root = await mkdtemp(join(tmpdir(), "project-loop-"));
  await mkdir(join(root, "loops/project-controller"), { recursive: true });
  await mkdir(join(root, "loops/usage-status"), { recursive: true });
  await writeFile(
    join(root, "loops/project-controller/projects.json"),
    `${JSON.stringify(registry, null, 2)}\n`
  );
  await writeFile(
    join(root, "loops/project-controller/goal-queue.json"),
    `${JSON.stringify({ version: 1, updatedAt: "2026-06-19T20:00:00.000Z", goals: queuedGoals }, null, 2)}\n`
  );
  await writeFile(
    join(root, "loops/usage-status/latest-status.json"),
    `${JSON.stringify(
      usageStatus ?? {
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

function makeRegistryWithRepoHealth() {
  const registry = makeRegistry();
  return {
    ...registry,
    projects: [
      ...registry.projects,
      {
        id: "repo-health",
        label: "Repo Health",
        area: ".",
        cadenceHours: 24,
        permission: "build-local",
        nextAction: "Keep the repo green.",
        commands: [{ name: "noop", cmd: "node", args: ["--version"] }],
        epics: [
          {
            id: "repo-safety",
            label: "Repo Safety",
            tickets: []
          }
        ]
      }
    ]
  };
}

function makeRegistryWithLargeActiveTicket() {
  const registry = makeRegistry();
  return {
    ...registry,
    projects: registry.projects.map((project) =>
      project.id !== "atlas-planner"
        ? project
        : {
            ...project,
            epics: project.epics.map((epic) => ({
              ...epic,
              tickets: [
                {
                  id: "AP-6",
                  title: "Agent worktree runner MVP",
                  status: "in-progress",
                  estimate: 21,
                  summary: "Large active work should not steal a claim-goal run.",
                  tags: ["loop-engineering"]
                }
              ]
            }))
          }
    )
  };
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
        id: "loop-controller",
        label: "Loop controller tests",
        command: "npm run test:loop-controller",
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
