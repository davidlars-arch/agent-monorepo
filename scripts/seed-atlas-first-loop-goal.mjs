#!/usr/bin/env node

import {
  acquireFileLock,
  getLoopPaths,
  readGoalQueue,
  releaseFileLock,
  resolveProjectRoot,
  validateQueuedGoalInput,
  writeJsonAtomically
} from "@agent/loop-store";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const now = new Date().toISOString();
const projectRoot = resolveProjectRoot();
const { goalQueuePath, lockPath } = getLoopPaths(projectRoot);

const validation = validateQueuedGoalInput(buildFirstLoopGoal(now), { now });
if (!validation.ok) {
  throw new Error(validation.error);
}

const goal = validation.goal;
const lock = await acquireFileLock(lockPath, "atlas-first-loop-seed");
if (!lock.ok) {
  throw new Error("The project loop is busy. Try again after the current run finishes.");
}

try {
  const queue = await readGoalQueue(goalQueuePath);
  const existing = queue.goals.find((candidate) => candidate.id === goal.id);
  if (existing && !force) {
    console.log(`${goal.id} already exists in ${goalQueuePath}. Pass --force to refresh it.`);
    process.exitCode = 0;
  } else {
    const goals = [goal, ...queue.goals.filter((candidate) => candidate.id !== goal.id)].slice(0, 50);
    const nextQueue = {
      version: 1,
      updatedAt: goal.updatedAt,
      goals
    };

    if (dryRun) {
      console.log(JSON.stringify({ ok: true, dryRun: true, goal, queueLength: goals.length }, null, 2));
    } else {
      await writeJsonAtomically(goalQueuePath, nextQueue);
      console.log(`Seeded ${goal.id} into ${goalQueuePath}.`);
    }
  }
} finally {
  await releaseFileLock(lockPath, lock.file);
}

function buildFirstLoopGoal(now) {
  const statement = "Atlas Planner can claim, start, and write evidence for one bounded local run.";
  const stopCondition = "Stop after evidence proves claim/start/review wiring or records a concrete blocker.";
  const scope =
    "loops/project-controller/**, docs/atlas-planner-100-loop-plan.md, scripts/planner-agent-runner.mjs, scripts/atlas-openclaw-agent-command.mjs, packages/loop-store/src/**, apps/web/app/api/atlas-loop-runner/**, apps/web/components/atlas-planner/**.";
  const safety = {
    maxIterations: 3,
    maxRepairAttempts: 2,
    tokenBudget: "Use the current daily/weekly usage window; stop before a broad refactor.",
    timeBudget: "Stop after one bounded readiness proof or 45 minutes without fresh approval.",
    allowedPaths: scope,
    externalActionPolicy: "human-gated"
  };
  const layers = [
    {
      id: "goal-contract",
      label: "Goal contract",
      criteria: "Goal statement, stop condition, scope, and safety gates are explicit.",
      status: "scaffolded",
      humanGated: false
    },
    {
      id: "claim-path",
      label: "Claim path",
      criteria: "The approved goal can be claimed into current-run.json without overwriting active work.",
      status: "pending",
      humanGated: false
    },
    {
      id: "runner-evidence",
      label: "Runner evidence",
      criteria: "The runner creates a handoff directory, runner-state.json, and evidence.json for this goal.",
      status: "pending",
      humanGated: false
    },
    {
      id: "independent-review",
      label: "Independent review",
      criteria: "A checker/review subagent audits the produced state and any findings are handled.",
      status: "pending",
      humanGated: false
    },
    {
      id: "human-gate",
      label: "Human gate",
      criteria: "PR creation, merge, and external actions remain disabled unless David explicitly approves them.",
      status: "pending",
      humanGated: true
    }
  ];
  const verificationCommands = [
    {
      id: "test-loop-controller",
      label: "Loop controller tests",
      command: "npm run test:loop-controller",
      required: true
    },
    {
      id: "test-atlas-loop-runner",
      label: "Atlas runner action tests",
      command: "npm run test:atlas-loop-runner",
      required: true
    },
    {
      id: "test-planner-agent-runner",
      label: "Planner agent runner tests",
      command: "npm run test:planner-agent-runner",
      required: true
    },
    {
      id: "test-atlas-runner-wrappers",
      label: "Runner wrapper tests",
      command: "npm run test:atlas-runner-wrappers",
      required: true
    }
  ];

  return {
    id: "GOAL-ATLAS-FIRST-LOOP",
    title: "Verify Atlas Planner first-loop readiness",
    lifecycleStatus: "approved",
    approvedToRun: true,
    status: "backlog",
    estimate: 3,
    projectId: "atlas-planner",
    projectLabel: "Atlas Planner",
    epicId: "planner-product",
    epicLabel: "Planner Product",
    summary: statement,
    tags: ["goal", "loop", "goal-approved", "approved-to-run"],
    description: renderDescription({ statement, stopCondition, scope, layers, verificationCommands, safety }),
    goalContract: {
      statement,
      stopCondition,
      scope,
      maxEstimate: 3,
      satisfactionLayers: layers,
      verificationCommands,
      safety
    },
    subtasks: [
      { id: "goal-claim", title: "Claim approved goal into current-run.json", done: false },
      { id: "goal-start", title: "Start or hand off runner without external actions", done: false },
      { id: "goal-evidence", title: "Record runner state and evidence artifacts", done: false },
      { id: "goal-review", title: "Run independent review and handle findings", done: false }
    ],
    createdAt: now,
    updatedAt: now
  };
}

function renderDescription({ statement, stopCondition, scope, layers, verificationCommands, safety }) {
  return [
    statement,
    "",
    `Stop condition: ${stopCondition}`,
    `Scope: ${scope}`,
    "Lifecycle: approved",
    "Max estimate: 3",
    "Approved to run: yes",
    "",
    "Refined satisfaction layers:",
    ...layers.map((layer) => `- [${layer.status}${layer.humanGated ? ", human-gated" : ""}] ${layer.label}: ${layer.criteria}`),
    "",
    "Verification:",
    ...verificationCommands.map((command) => `- [${command.required ? "required" : "optional"}] ${command.label}: ${command.command}`),
    "",
    "Safety:",
    "- Max first slice: 3 points",
    `- Max iterations: ${safety.maxIterations}`,
    `- Max repair attempts: ${safety.maxRepairAttempts}`,
    `- Token budget: ${safety.tokenBudget}`,
    `- Time budget: ${safety.timeBudget}`,
    `- Allowed paths: ${safety.allowedPaths}`,
    `- External actions: ${safety.externalActionPolicy}`
  ].join("\n");
}
