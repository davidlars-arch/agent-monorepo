#!/usr/bin/env node

import { execFile } from "node:child_process";
import { appendFile, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { getLoopPaths, hasCurrentRunState, isRunnableQueuedGoal, readGoalQueue, writeJsonAtomically } from "@agent/loop-store";

const execFileAsync = promisify(execFile);
const root = process.env.PROJECT_LOOP_ROOT ? resolve(process.env.PROJECT_LOOP_ROOT) : process.cwd();
const { registryPath, statePath, reportPath, decisionsPath, goalQueuePath, currentRunPath, lockPath, usageStatusPath } = getLoopPaths(root);
const args = process.argv.slice(2);

const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const listOnly = flags.has("--list");
const allProjects = flags.has("--all");
const dryRun = flags.has("--dry-run");
const runBuild = flags.has("--build");
const forceDue = flags.has("--force");
const claimGoal = flags.has("--claim-goal");
const projectIds = valuesFor("--project");

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const state = await readState();
const usageStatus = await readUsageStatus();
let goalQueue = { version: 1, updatedAt: null, goals: [] };
const now = new Date();

if (listOnly) {
  console.log(renderList(registry));
  process.exit(0);
}

if (dryRun) {
  goalQueue = await readGoalQueue(goalQueuePath);
  const selected = selectProjects(registry.projects, state, now);
  const results = [];

  for (const project of selected) {
    results.push(await runProject(project));
  }

  console.log(renderReport({ now, selected, results, dryRun, runBuild }));
  console.log("Project controller dry run completed; no files written.");
  process.exit(0);
}

let lock;
try {
  lock = await open(lockPath, "wx");
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }, null, 2));
} catch {
  console.error(`Project controller lock exists at ${relative(lockPath)}. Another loop may be running.`);
  process.exit(1);
}

try {
  goalQueue = await readGoalQueue(goalQueuePath);
  const selected = selectProjects(registry.projects, state, now);
  const results = [];

  for (const project of selected) {
    results.push(await runProject(project));
  }

  const nextState = updateState(state, results, now);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderReport({ now, selected, results, dryRun, runBuild }));
  await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  await appendPlannerDecisions(now, results);

  const failed = results.filter((result) => result.status === "failed");
  console.log(`Project controller wrote ${relative(reportPath)} and ${relative(statePath)}.`);
  if (selected.length === 0) {
    console.log("No projects due.");
  }
  if (failed.length > 0) {
    console.log(`Failed projects: ${failed.map((result) => result.id).join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await lock.close();
  await rm(lockPath, { force: true });
}

function valuesFor(flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return { version: 1, projects: {}, runs: [] };
  }
}

async function readUsageStatus() {
  try {
    return JSON.parse(await readFile(usageStatusPath, "utf8"));
  } catch {
    return null;
  }
}

function selectProjects(projects, currentState, at) {
  if (projectIds.length > 0) {
    const found = projects.filter((project) => projectIds.includes(project.id));
    const missing = projectIds.filter((id) => !found.some((project) => project.id === id));
    if (missing.length > 0) {
      throw new Error(`Unknown project id: ${missing.join(", ")}`);
    }
    return found;
  }

  if (allProjects) {
    return projects;
  }

  return projects.filter((project) => isDue(project, currentState, at));
}

function isDue(project, currentState, at) {
  if (forceDue) {
    return true;
  }

  const projectState = currentState.projects?.[project.id];
  if (projectState?.lastStatus === "planned") {
    return true;
  }

  const lastRunAt = projectState?.lastRunAt;
  if (!lastRunAt) {
    return true;
  }

  const cadenceHours = project.cadenceHours ?? registry.defaults?.cadenceHours ?? 24;
  const elapsedMs = at.getTime() - new Date(lastRunAt).getTime();
  return elapsedMs >= cadenceHours * 60 * 60 * 1000;
}

async function runProject(project) {
  const commands = commandsFor(project);
  const startedAt = new Date();
  const plannedTask = chooseTaskForWindow(project, usageStatus);
  const goalClaim = await maybeClaimQueuedGoal(project, plannedTask, startedAt);

  if (dryRun) {
    return {
      id: project.id,
      label: project.label,
      status: "planned",
      plannedTask,
      goalClaim,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      commands: commands.map((command) => ({ ...command, exitCode: null }))
    };
  }

  const commandResults = [];
  for (const command of commands) {
    const result = await run(command.cmd, command.args, {
      timeout: command.timeoutMs ?? project.timeoutMs ?? registry.defaults?.timeoutMs ?? 120_000
    });
    commandResults.push({ name: command.name, ...result });
    if (result.exitCode !== 0 && !project.allowFailure) {
      break;
    }
  }

  const failed = commandResults.some((command) => command.exitCode !== 0);
  return {
    id: project.id,
    label: project.label,
    status: failed && !project.allowFailure ? "failed" : failed ? "blocked" : "passed",
    plannedTask,
    goalClaim,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    commands: commandResults
  };
}

async function maybeClaimQueuedGoal(project, plannedTask, startedAt) {
  if (!claimGoal || project.id !== "atlas-planner" || !plannedTask?.tags?.includes("queued-goal")) {
    return null;
  }

  if (dryRun) {
    return null;
  }

  const queuedGoal = goalQueue.goals.find((goal) => goal.id === plannedTask.id);
  if (!queuedGoal || !isRunnableQueuedGoal(queuedGoal)) {
    return null;
  }

  if (await hasCurrentRunState(currentRunPath)) {
    return null;
  }

  const claimedAt = startedAt.toISOString();
  const runId = `run-${queuedGoal.id.toLowerCase()}-${startedAt.getTime().toString(36)}`;
  const baseCommit = await readCurrentCommit();
  const goalContract = contractForGoal(queuedGoal);
  const agentRun = buildAgentRunPlan({ runId, goal: queuedGoal, goalContract, plannedTask, baseCommit });
  const claimedGoal = {
    ...queuedGoal,
    lifecycleStatus: "running",
    status: "in-progress",
    updatedAt: claimedAt
  };
  const nextQueue = {
    version: 1,
    updatedAt: claimedAt,
    goals: goalQueue.goals.map((goal) => (goal.id === queuedGoal.id ? claimedGoal : goal))
  };
  goalQueue.updatedAt = nextQueue.updatedAt;
  goalQueue.goals = nextQueue.goals;

  const currentRun = {
    version: 1,
    id: runId,
    projectId: project.id,
    projectLabel: project.label,
    goalId: claimedGoal.id,
    goalTitle: claimedGoal.title,
    goalContract,
    status: "running",
    stage: "claimed",
    claimedAt,
    updatedAt: claimedAt,
    baseCommit,
    branchName: agentRun.branchName,
    worktreePath: agentRun.worktreePath,
    handoffDir: agentRun.handoffDir,
    runnerCommand: agentRun.command,
    runnerCommands: agentRun.runnerCommands,
    makerPromptPath: agentRun.makerPromptPath,
    checkerPromptPath: agentRun.checkerPromptPath,
    evidencePath: agentRun.evidencePath,
    selectedTask: {
      id: plannedTask.id,
      title: plannedTask.title,
      estimate: plannedTask.estimate,
      score: plannedTask.score,
      maxEstimate: plannedTask.maxEstimate,
      reason: plannedTask.reason
    },
    timeline: [
      { stage: "queued", status: "done", at: claimedAt, detail: "Goal was present in goal-queue.json." },
      { stage: "claimed", status: "done", at: claimedAt, detail: "Controller claimed the goal for the next run." },
      { stage: "prepare", status: "next", at: null, detail: "Run the agent runner command to create the branch, worktree, and handoff files." },
      { stage: "maker", status: "locked", at: null, detail: "Maker work starts after the handoff worktree exists." },
      { stage: "checker", status: "locked", at: null, detail: "Checker review starts only after maker evidence exists." }
    ]
  };

  await mkdir(dirname(goalQueuePath), { recursive: true });
  await writeJsonAtomically(goalQueuePath, nextQueue);
  await writeJsonAtomically(currentRunPath, currentRun);

  return {
    runId,
    goalId: claimedGoal.id,
    goalTitle: claimedGoal.title,
    stage: currentRun.stage,
    branchName: agentRun.branchName,
    worktreePath: agentRun.worktreePath,
    runnerCommand: agentRun.command,
    currentRunPath: relative(currentRunPath)
  };
}

function buildAgentRunPlan({ runId, goal, goalContract, plannedTask, baseCommit }) {
  const ticketSlug = sanitizeForBranch(plannedTask.id);
  const branchName = `worktree/${ticketSlug}`;
  const worktreePath = `../agent-monorepo-${ticketSlug}`;
  const handoffDir = join("loops", "project-controller", "runs", runId);
  const commandParts = [
    shellQuote("node"),
    shellQuote("scripts/planner-agent-runner.mjs"),
    "--ticket",
    shellQuote(plannedTask.id),
    "--branch",
    shellQuote(branchName),
    "--base",
    shellQuote(baseCommit),
    "--run-id",
    shellQuote(runId),
    "--goal-title",
    shellQuote(goal.title),
    "--goal-contract-json",
    shellQuote(JSON.stringify(goalContract)),
    "--worktree-dir",
    shellQuote(worktreePath),
    "--handoff-dir",
    shellQuote(handoffDir)
  ];
  const maxRepairAttempts = Number(goalContract.safety?.maxRepairAttempts);
  if (Number.isInteger(maxRepairAttempts) && maxRepairAttempts >= 0 && maxRepairAttempts <= 5) {
    commandParts.push("--max-repairs", shellQuote(String(maxRepairAttempts)));
  }
  const runnerCommands = getRunnerCommandConfig();
  addRunnerCommandArgs(commandParts, runnerCommands, shellQuote);
  const command = commandParts.join(" ");

  return {
    branchName,
    worktreePath,
    handoffDir,
    runnerCommands,
    command,
    makerPromptPath: join(handoffDir, "maker-prompt.md"),
    checkerPromptPath: join(handoffDir, "checker-prompt.md"),
    evidencePath: join(handoffDir, "evidence.json")
  };
}

function contractForGoal(goal) {
  const contract = goal.goalContract && typeof goal.goalContract === "object" ? goal.goalContract : {};
  return {
    statement: firstString(contract.statement, contract.outcome, goal.summary),
    stopCondition: firstString(contract.stopCondition),
    scope: firstString(contract.scope),
    maxEstimate: Number.isFinite(Number(contract.maxEstimate)) ? Number(contract.maxEstimate) : goal.estimate,
    satisfactionLayers: Array.isArray(contract.satisfactionLayers)
      ? contract.satisfactionLayers
      : Array.isArray(contract.layers)
        ? contract.layers
        : [],
    verificationCommands: Array.isArray(contract.verificationCommands)
      ? contract.verificationCommands
      : Array.isArray(contract.verification)
        ? contract.verification
        : [],
    safety: contract.safety && typeof contract.safety === "object" && !Array.isArray(contract.safety) ? contract.safety : {}
  };
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "")?.trim() ?? "";
}

async function readCurrentCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function commandsFor(project) {
  if (runBuild && project.buildCommands?.length) {
    return project.buildCommands;
  }
  return project.commands ?? [];
}

async function run(command, commandArgs, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeout ?? 120_000
    });
    return {
      command: [command, ...commandArgs].join(" "),
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      command: [command, ...commandArgs].join(" "),
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim()
    };
  }
}

function updateState(currentState, results, at) {
  const next = {
    version: 1,
    updatedAt: at.toISOString(),
    projects: { ...(currentState.projects ?? {}) },
    runs: [...(currentState.runs ?? [])]
  };

  for (const result of results) {
    if (dryRun || result.status === "planned") {
      continue;
    }

    next.projects[result.id] = {
      lastRunAt: result.finishedAt,
      lastStatus: result.status,
      lastCommandCount: result.commands.length,
      lastPlannedTask: result.plannedTask,
      lastGoalClaim: result.goalClaim
    };
  }

  next.runs.push({
    runAt: at.toISOString(),
    mode: runBuild ? "build" : "fast",
    dryRun,
    projects: results.map((result) => ({ id: result.id, status: result.status }))
  });
  next.runs = next.runs.slice(-25);
  return next;
}

function renderReport({ now, selected, results }) {
  return `# Atlas Planner Report

- **Run:** ${now.toISOString()}
- **Mode:** ${runBuild ? "build" : "fast"}
- **Dry run:** ${dryRun ? "yes" : "no"}
- **Token window:** ${usageStatusSummary(usageStatus)}
- **Selected projects:** ${selected.length === 0 ? "none" : selected.map((project) => `\`${project.id}\``).join(", ")}
- **Status:** ${reportStatus(results)}

## Next Controller Action

${nextControllerAction(selected, results)}

## Planner Decisions

${results.length === 0 ? "No planner decision was needed." : results.map(renderPlannerDecision).join("\n")}

## Durable Goal Queue

${renderGoalQueue()}

## Project Results

${results.length === 0 ? "No projects were due." : results.map(renderProjectResult).join("\n")}

## Registry Summary

${registry.projects
  .map((project) => `- \`${project.id}\` (${project.permission}): every ${project.cadenceHours ?? registry.defaults.cadenceHours}h; ${project.nextAction}`)
  .join("\n")}
`;
}

async function appendPlannerDecisions(at, results) {
  const decisions = results
    .filter((result) => result.plannedTask)
    .map((result) => ({
      recordedAt: at.toISOString(),
      mode: runBuild ? "build" : "fast",
      dryRun,
      projectId: result.id,
      projectLabel: result.label,
      status: result.status,
      goalClaim: result.goalClaim,
      selectedTicket: {
        id: result.plannedTask.id,
        title: result.plannedTask.title,
        status: result.plannedTask.status,
        estimate: result.plannedTask.estimate,
        score: result.plannedTask.score,
        scoreBreakdown: result.plannedTask.scoreBreakdown
      },
      tokenWindow: {
        shortWindowLeft: result.plannedTask.shortWindowLeft,
        maxEstimate: result.plannedTask.maxEstimate
      },
      reason: result.plannedTask.reason,
      skipped: result.plannedTask.skipped ?? []
    }));

  if (decisions.length === 0) {
    return;
  }

  await mkdir(dirname(decisionsPath), { recursive: true });
  await appendFile(decisionsPath, `${decisions.map((decision) => JSON.stringify(decision)).join("\n")}\n`);
}

function renderPlannerDecision(result) {
  if (!result.plannedTask) {
    return `- \`${result.id}\`: no registered ticket.`;
  }

  const skipped = result.plannedTask.skipped?.length
    ? ` Skipped larger work: ${result.plannedTask.skipped.map((ticket) => `\`${ticket.id}\` (${ticket.estimate} pts)`).join(", ")}.`
    : "";
  const claim = result.goalClaim
    ? ` Claimed goal run \`${result.goalClaim.runId}\` at \`${result.goalClaim.currentRunPath}\`.`
    : "";

  return `- \`${result.id}\`: selected \`${result.plannedTask.id}\` (${result.plannedTask.estimate} pts, score ${result.plannedTask.score}, max ${result.plannedTask.maxEstimate}). ${result.plannedTask.reason}${skipped}${claim}`;
}

function renderGoalQueue() {
  if (goalQueue.goals.length === 0) {
    return "No queued goals yet. Create one from Atlas Planner to seed the runner.";
  }

  return goalQueue.goals
    .slice(0, 10)
    .map(
      (goal) =>
        `- \`${goal.id}\` (${goal.lifecycleStatus}, ${goal.status}, ${goal.estimate} pts): ${goal.title}${goal.approvedToRun ? " — approved" : ""}`
    )
    .join("\n");
}

function renderProjectResult(result) {
  const project = registry.projects.find((candidate) => candidate.id === result.id);
  return `### ${result.label}

- Project: \`${result.id}\`
- Status: ${result.status}
- Permission: ${project?.permission ?? registry.defaults.permission}
- Planned ticket: ${renderPlannedTask(result.plannedTask)}
- Goal claim: ${renderGoalClaim(result.goalClaim)}
- Next action: ${project?.nextAction ?? "No next action recorded."}
${renderGoalSummary(project?.goal)}

${result.commands.map(renderCommandResult).join("\n")}
`;
}

function renderGoalClaim(goalClaim) {
  if (!goalClaim) {
    return "none";
  }

  const runner = goalClaim.runnerCommand ? `; runner \`${goalClaim.runnerCommand}\`` : "";
  const branch = goalClaim.branchName ? `; branch \`${goalClaim.branchName}\`` : "";
  return `\`${goalClaim.goalId}\` claimed as \`${goalClaim.runId}\` (${goalClaim.stage}); state at \`${goalClaim.currentRunPath}\`${branch}${runner}`;
}

function renderGoalSummary(goal) {
  if (!goal) {
    return "- Goal: no strict goal registered.";
  }

  const counts = goal.layers.reduce(
    (summary, layer) => ({
      ...summary,
      [layer.status]: (summary[layer.status] ?? 0) + 1
    }),
    { pending: 0, scaffolded: 0, satisfied: 0, blocked: 0 }
  );

  return `- Goal: ${goal.title}
- Goal stop condition: ${goal.stopCondition}
- Goal layers: ${goal.layers.length}; satisfied ${counts.satisfied}; scaffolded ${counts.scaffolded}; pending ${counts.pending}; blocked ${counts.blocked}
${goal.layers.map((layer) => `  - ${layer.status}: ${layer.label} - ${layer.criteria[0]}`).join("\n")}`;
}

function chooseTaskForWindow(project, currentUsageStatus) {
  const tickets = flattenTickets(project);
  if (tickets.length === 0) {
    return null;
  }

  const shortWindowLeft = parseFirstPercent(currentUsageStatus?.shortWindow);
  const maxEstimate = estimateBudgetForWindow(shortWindowLeft);
  const candidates = tickets
    .filter((ticket) => ticket.status !== "done" && ticket.status !== "blocked")
    .map((ticket) => {
      const scoreBreakdown = getPlannerScoreBreakdown(ticket, project, maxEstimate);
      return {
        ...ticket,
        score: scoreBreakdown.total,
        scoreBreakdown,
        reason: getPlannerScoreReason(ticket, scoreBreakdown, maxEstimate),
        shortWindowLeft,
        maxEstimate
      };
    })
    .sort((left, right) => right.score - left.score || right.estimate - left.estimate || left.id.localeCompare(right.id));

  const selected = candidates[0] ?? tickets.find((ticket) => ticket.status !== "done") ?? tickets[0];
  const selectedBreakdown = selected.scoreBreakdown ?? getPlannerScoreBreakdown(selected, project, maxEstimate);

  return {
    ...selected,
    score: selected.score ?? selectedBreakdown.total,
    scoreBreakdown: selectedBreakdown,
    reason: selected.reason ?? getPlannerScoreReason(selected, selectedBreakdown, maxEstimate),
    shortWindowLeft,
    maxEstimate,
    skipped: tickets
      .filter((ticket) => ticket.status !== "done" && ticket.status !== "blocked" && ticket.estimate > maxEstimate)
      .sort((left, right) => right.estimate - left.estimate || left.id.localeCompare(right.id))
      .slice(0, 4)
      .map((ticket) => ({ id: ticket.id, title: ticket.title, estimate: ticket.estimate }))
  };
}

function flattenTickets(project) {
  const registryTickets = (project.epics ?? []).flatMap((epic) =>
    (epic.tickets ?? []).map((ticket) => ({
      ...ticket,
      epicId: epic.id,
      epicLabel: epic.label,
      projectId: project.id,
      projectLabel: project.label
    }))
  );

  if (project.id !== "atlas-planner") {
    return registryTickets;
  }

  return [...queuedGoalTickets(project), ...registryTickets];
}

function queuedGoalTickets(project) {
  return goalQueue.goals
    .filter(isRunnableQueuedGoal)
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      estimate: goal.estimate,
      summary: goal.summary,
      tags: [...(goal.tags ?? []), "queued-goal"],
      epicId: "queued-goals",
      epicLabel: "Queued Goals",
      projectId: project.id,
      projectLabel: project.label
    }));
}

function sanitizeForBranch(value) {
  const sanitized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);

  return sanitized || "planner-ticket";
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function getRunnerCommandConfig(env = process.env) {
  return {
    agentCommand: stringEnv(env.ATLAS_AGENT_COMMAND),
    makerCommand: stringEnv(env.ATLAS_MAKER_COMMAND),
    checkerCommand: stringEnv(env.ATLAS_CHECKER_COMMAND),
    repairCommand: stringEnv(env.ATLAS_REPAIR_COMMAND),
    prCommand: stringEnv(env.ATLAS_PR_COMMAND)
  };
}

function addRunnerCommandArgs(parts, runnerCommands, quote = (value) => value) {
  if (runnerCommands.agentCommand) {
    parts.push("--agent-command", quote(runnerCommands.agentCommand));
  }
  if (runnerCommands.makerCommand) {
    parts.push("--maker-command", quote(runnerCommands.makerCommand));
  }
  if (runnerCommands.checkerCommand) {
    parts.push("--checker-command", quote(runnerCommands.checkerCommand));
  }
  if (runnerCommands.repairCommand) {
    parts.push("--repair-command", quote(runnerCommands.repairCommand));
  }
  if (runnerCommands.prCommand) {
    parts.push("--pr-command", quote(runnerCommands.prCommand));
  }
}

function stringEnv(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function getPlannerScoreBreakdown(ticket, project, maxEstimate) {
  const tags = ticket.tags ?? [];
  const fit =
    ticket.estimate <= maxEstimate
      ? 40 + Math.round((ticket.estimate / Math.max(1, maxEstimate)) * 30)
      : -40 - (ticket.estimate - maxEstimate) * 8;
  const baseValue = tags.some((tag) => ["loop-engineering", "reliability", "usage", "evidence", "goal"].includes(tag))
    ? 8
    : 0;
  const queueValue = (tags.includes("queued-goal") ? 18 : 0) + (tags.includes("approved-to-run") ? 18 : 0);
  const value = baseValue + queueValue;
  const readiness =
    (ticket.summary ? 8 : 0) +
    ((project.commands?.length ?? 0) > 0 ? 6 : 0) +
    (tags.length > 0 ? 3 : 0);
  const freshness = ticket.status === "in-progress" ? 20 : ticket.status === "review" ? 14 : 4;
  const riskyText = `${project.permission ?? ""} ${tags.join(" ")} ${ticket.title}`.toLowerCase();
  const risk =
    (riskyText.includes("live trading") || riskyText.includes("migration") || riskyText.includes("auth") ? -24 : 0) +
    (ticket.estimate > maxEstimate ? -12 : 0);
  const total = fit + value + readiness + freshness + risk;

  return { fit, value, readiness, freshness, risk, total };
}

function getPlannerScoreReason(ticket, breakdown, maxEstimate) {
  const fitText =
    ticket.estimate <= maxEstimate
      ? `uses ${ticket.estimate}/${maxEstimate} points`
      : `needs ${ticket.estimate}/${maxEstimate} points`;
  const statusText =
    ticket.status === "in-progress"
      ? "continues active work"
      : ticket.status === "review"
        ? "keeps review moving"
        : "starts backlog work";

  return `${ticket.id} scored ${breakdown.total}: ${fitText}, ${statusText}, value ${breakdown.value}, readiness ${breakdown.readiness}, risk ${breakdown.risk}.`;
}

function estimateBudgetForWindow(percentLeft) {
  if (percentLeft === undefined) {
    return 8;
  }
  if (percentLeft >= 70) {
    return 21;
  }
  if (percentLeft >= 45) {
    return 13;
  }
  if (percentLeft >= 25) {
    return 8;
  }
  if (percentLeft >= 12) {
    return 5;
  }
  return 3;
}

function parseFirstPercent(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.match(/(\d+(?:\.\d+)?)%/);
  if (!match) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round(Number.parseFloat(match[1]))));
}

function usageStatusSummary(currentUsageStatus) {
  if (!currentUsageStatus) {
    return "No usage snapshot available; defaulting to Fibonacci budget 8.";
  }

  const percentLeft = parseFirstPercent(currentUsageStatus.shortWindow);
  const budget = estimateBudgetForWindow(percentLeft);
  return `${currentUsageStatus.shortWindow} -> max ticket estimate ${budget}`;
}

function renderPlannedTask(task) {
  if (!task) {
    return "No ticket registered.";
  }

  return `\`${task.id}\` ${task.title} (${task.epicLabel}, ${task.estimate} pts, max ${task.maxEstimate}) - ${task.reason}`;
}

function renderCommandResult(command) {
  if (command.exitCode === null) {
    return `- Planned: \`${command.cmd} ${(command.args ?? []).join(" ")}\``;
  }

  const output = [command.stdout, command.stderr].filter(Boolean).join("\n\n");
  return `- ${command.exitCode === 0 ? "Passed" : "Failed"} \`${command.name}\`: \`${command.command}\` (exit ${command.exitCode})${command.exitCode === 0 || !output ? "" : `\n\n${codeBlock(tail(output, 80))}`}`;
}

function reportStatus(results) {
  if (results.length === 0) {
    return "idle";
  }
  if (results.some((result) => result.status === "failed")) {
    return "failed";
  }
  if (results.some((result) => result.status === "blocked")) {
    return "blocked";
  }
  if (results.every((result) => result.status === "planned")) {
    return "planned";
  }
  return "green";
}

function nextControllerAction(selected, results) {
  if (selected.length === 0) {
    return "No projects are due. Use `--force`, `--all`, or `--project <id>` to override.";
  }

  const failed = results.find((result) => result.status === "failed");
  if (failed) {
    return `Fix the failing \`${failed.id}\` command before starting new build work.`;
  }

  const blocked = results.find((result) => result.status === "blocked");
  if (blocked) {
    return `Resolve the blocker for \`${blocked.id}\` or keep it in plan-only mode.`;
  }

  const first = selected[0];
  return first.nextAction ?? "Pick the highest-priority passed project and build one small slice.";
}

function renderList(projectRegistry) {
  return projectRegistry.projects
    .map((project) => `${project.id}\t${project.permission}\tevery ${project.cadenceHours ?? projectRegistry.defaults.cadenceHours}h\t${project.area}`)
    .join("\n");
}

function codeBlock(value) {
  return `\`\`\`\n${value}\n\`\`\``;
}

function relative(path) {
  return path.replace(`${root}/`, "");
}

function tail(value, lines) {
  return value.split("\n").slice(-lines).join("\n");
}
