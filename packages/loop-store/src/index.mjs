import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const goalLifecycleStatuses = ["draft", "refined", "approved", "running", "blocked", "satisfied", "archived"];
export const terminalGoalStatuses = ["done", "archived", "blocked"];
export const terminalRunnerStatuses = ["satisfied", "blocked", "failed", "passed", "merged"];

export function isGoalLifecycleStatus(value) {
  return goalLifecycleStatuses.includes(value);
}

export function getLoopPaths(root) {
  const controllerDir = join(root, "loops", "project-controller");
  return {
    controllerDir,
    registryPath: join(controllerDir, "projects.json"),
    statePath: join(controllerDir, "state.json"),
    reportPath: join(controllerDir, "latest-report.md"),
    decisionsPath: join(controllerDir, "decisions.jsonl"),
    runHistoryPath: join(controllerDir, "run-history.jsonl"),
    goalQueuePath: join(controllerDir, "goal-queue.json"),
    currentRunPath: join(controllerDir, "current-run.json"),
    lockPath: join(controllerDir, "LOCK"),
    usageStatusPath: join(root, "loops", "usage-status", "latest-status.json")
  };
}

export function resolveProjectRoot({ cwd = process.cwd(), configuredRoot = process.env.PROJECT_LOOP_ROOT } = {}) {
  const candidates = configuredRoot ? [resolve(configuredRoot)] : [cwd, resolve(cwd, "../..")];
  const found = candidates.find(isProjectRoot);
  if (!found) {
    throw new Error("Unable to resolve project root for loop store files.");
  }
  return found;
}

export function resolveRepoPath(root, path) {
  if (!path) {
    return "";
  }
  return String(path).startsWith("/") ? String(path) : resolve(root, path);
}

export async function readJsonFile(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

export async function readGoalQueue(queuePath) {
  const parsed = await readJsonFile(queuePath, null);
  return normalizeGoalQueue(parsed);
}

export function normalizeGoalQueue(value) {
  return {
    version: 1,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    goals: Array.isArray(value?.goals) ? value.goals : []
  };
}

export function validateQueuedGoalInput(body, { now = new Date().toISOString() } = {}) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Goal JSON is required." };
  }

  if (typeof body.id !== "string" || typeof body.title !== "string" || !body.id.trim() || !body.title.trim()) {
    return { ok: false, error: "Goal id and title are required." };
  }

  const lifecycleStatus = isGoalLifecycleStatus(body.lifecycleStatus) ? body.lifecycleStatus : "draft";
  const approvedToRun = body.approvedToRun === true && isApprovedLifecycle(lifecycleStatus);
  const estimate = clampInteger(Number(body.estimate ?? 8), 1, 21);
  const contract = sanitizeGoalContract(body.goalContract, body, estimate);
  const goal = {
    id: body.id.trim().slice(0, 80),
    title: body.title.trim().slice(0, 180),
    projectId: sanitizeIdentifier(body.projectId, "atlas-planner"),
    projectLabel: sanitizeString(body.projectLabel, 180) || "Atlas Planner",
    epicId: sanitizeIdentifier(body.epicId, "queued-goals"),
    epicLabel: sanitizeString(body.epicLabel, 180) || "Queued Goals",
    lifecycleStatus,
    approvedToRun,
    status: getTicketStatusForGoalLifecycle(lifecycleStatus, approvedToRun),
    estimate,
    summary: sanitizeString(body.summary, 1000),
    tags: sanitizeGoalTags(body.tags, approvedToRun, lifecycleStatus),
    description: sanitizeString(body.description, 12_000),
    goalContract: contract,
    subtasks: sanitizeSubtasks(body.subtasks),
    createdAt: sanitizeIsoDate(body.createdAt) ?? now,
    updatedAt: now
  };

  return { ok: true, goal };
}

export function updateGoalLifecycle(goal, lifecycleStatus, approvedToRunInput, { now = new Date().toISOString() } = {}) {
  if (!isGoalLifecycleStatus(lifecycleStatus)) {
    return null;
  }

  const approvedToRun = isApprovedLifecycle(lifecycleStatus) ? approvedToRunInput !== false : false;
  return {
    ...goal,
    lifecycleStatus,
    approvedToRun,
    status: getTicketStatusForGoalLifecycle(lifecycleStatus, approvedToRun),
    tags: sanitizeGoalTags(goal.tags, approvedToRun, lifecycleStatus),
    updatedAt: now
  };
}

export function isRunnableQueuedGoal(goal) {
  return (
    goal?.approvedToRun === true &&
    ["approved", "running"].includes(goal.lifecycleStatus) &&
    !terminalGoalStatuses.includes(goal.status)
  );
}

export async function hasCurrentRunState(currentRunPath) {
  try {
    JSON.parse(await readFile(currentRunPath, "utf8"));
    return true;
  } catch (error) {
    return error?.code !== "ENOENT";
  }
}

export async function readControllerLockSummary(lockPath, { now = new Date(), staleAfterMs = 30 * 60 * 1000 } = {}) {
  let rawLock;
  try {
    rawLock = await readFile(lockPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        exists: false,
        stale: false,
        removable: false,
        reason: "No controller lock is present."
      };
    }

    return {
      exists: true,
      stale: false,
      removable: false,
      reason: "Controller lock could not be read."
    };
  }

  const lockStat = await stat(lockPath).catch(() => null);
  const parsed = parseJsonObject(rawLock);
  const pid = Number(parsed?.pid);
  const startedAt = typeof parsed?.startedAt === "string" ? parsed.startedAt : "";
  const owner = typeof parsed?.owner === "string" ? parsed.owner : "";
  const startedTime = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const modifiedAgeMs = lockStat ? Math.max(0, now.getTime() - lockStat.mtime.getTime()) : null;
  const ageMs = Number.isFinite(startedTime) ? Math.max(0, now.getTime() - startedTime) : modifiedAgeMs;
  const pidRunning = Number.isInteger(pid) && pid > 0 ? isProcessRunning(pid) : null;
  const malformed = !parsed || !startedAt || !Number.isInteger(pid);
  const stale = (malformed && ageMs !== null && ageMs >= staleAfterMs) || (ageMs !== null && ageMs >= staleAfterMs && pidRunning === false);

  return {
    exists: true,
    stale,
    removable: stale,
    reason: getControllerLockReason({ malformed, ageMs, staleAfterMs, pidRunning }),
    owner,
    pid: Number.isInteger(pid) ? pid : null,
    startedAt,
    ageMs,
    modifiedAgeMs,
    pidRunning
  };
}

export function getCurrentRunRecoveryStatus(currentRun, runnerState) {
  if (!currentRun) {
    return {
      active: false,
      terminal: false,
      clearable: false,
      reason: "No current run is present."
    };
  }

  const runnerStatus = typeof runnerState?.status === "string" ? runnerState.status : "";
  const currentStatus = typeof currentRun?.status === "string" ? currentRun.status : "";
  const terminal = terminalRunnerStatuses.includes(runnerStatus) || terminalRunnerStatuses.includes(currentStatus);

  return {
    active: true,
    terminal,
    clearable: terminal,
    reason: terminal
      ? `Runner is terminal (${runnerStatus || currentStatus}); current-run can be cleared.`
      : "Current run is not terminal yet. Keep it until the runner reports satisfied, blocked, failed, passed, or merged.",
    runnerStatus,
    currentStatus,
    stage: typeof runnerState?.stage === "string" ? runnerState.stage : currentRun?.stage
  };
}

export async function claimNextAtlasPlannerGoal(root, { now = new Date(), readCommit = readCurrentCommit, goalId = "", projectId = "" } = {}) {
  const loopPaths = getLoopPaths(root);
  const lock = await acquireFileLock(loopPaths.lockPath, "atlas-loop-runner-api");
  if (!lock.ok) {
    return { ok: false, status: "busy", reason: "The project loop is busy. Try again after the current run finishes." };
  }

  try {
    const queue = await readGoalQueue(loopPaths.goalQueuePath);
    const queuedGoal = queue.goals.find((goal) => {
      if (!isRunnableQueuedGoal(goal)) {
        return false;
      }
      if (goalId && goal.id !== goalId) {
        return false;
      }
      if (projectId && (goal.projectId ?? "atlas-planner") !== projectId) {
        return false;
      }
      return true;
    });
    if (!queuedGoal) {
      return { ok: true, status: "idle", reason: "No approved Atlas Planner queued goal is ready to run." };
    }

    if (await hasCurrentRunState(loopPaths.currentRunPath)) {
      return { ok: true, status: "blocked", reason: "A current run already exists; clear or resume it before claiming another goal." };
    }

    const claimedAt = now.toISOString();
    const runId = `run-${queuedGoal.id.toLowerCase()}-${now.getTime().toString(36)}`;
    const baseCommit = await readCommit(root);
    const agentRun = buildAtlasAgentRunPlan({ runId, goal: queuedGoal, baseCommit });
    const claimedGoal = {
      ...queuedGoal,
      lifecycleStatus: "running",
      status: "in-progress",
      updatedAt: claimedAt
    };
    const nextQueue = {
      version: 1,
      updatedAt: claimedAt,
      goals: queue.goals.map((goal) => (goal.id === queuedGoal.id ? claimedGoal : goal))
    };
    const currentRun = buildCurrentAtlasRun({ runId, goal: claimedGoal, claimedAt, baseCommit, agentRun });

    await writeJsonAtomically(loopPaths.goalQueuePath, nextQueue);
    await writeJsonAtomically(loopPaths.currentRunPath, currentRun);

    return { ok: true, status: "claimed", currentRun, goal: claimedGoal };
  } finally {
    await releaseFileLock(loopPaths.lockPath, lock.file);
  }
}

export async function runAtlasLoopRunnerAction(root, action, { timeoutMs = 25_000, execRunner = execFileAsync } = {}) {
  const loopPaths = getLoopPaths(root);
  const currentRun = await readJsonFile(loopPaths.currentRunPath, null);
  if (!currentRun?.id) {
    return { ok: false, status: "missing-current-run", reason: "No current run exists. Claim an approved goal first." };
  }

  const lock = await acquireFileLock(loopPaths.lockPath, "atlas-loop-runner-api");
  if (!lock.ok) {
    return { ok: false, status: "busy", reason: "The project loop is busy. Try again after the current run finishes." };
  }

  try {
    const recheckedRun = await readJsonFile(loopPaths.currentRunPath, null);
    if (!recheckedRun?.id || recheckedRun.id !== currentRun.id) {
      return { ok: false, status: "changed", reason: "Current run changed while the runner action was pending." };
    }

    const command = buildAtlasRunnerCommand(root, action, recheckedRun);
    if (!command.ok) {
      return command;
    }

    const startedAt = new Date().toISOString();
    try {
      const result = await execRunner(command.cmd, command.args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: timeoutMs
      });
      const sync = await syncTerminalAtlasRun(root, recheckedRun);
      return {
        ok: true,
        status: "completed",
        action,
        currentRun: sync.currentRun ?? recheckedRun,
        goal: sync.goal,
        sync,
        command: renderCommand(command),
        exitCode: 0,
        stdout: String(result.stdout ?? "").trim(),
        stderr: String(result.stderr ?? "").trim(),
        startedAt,
        finishedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        ok: false,
        status: error?.killed ? "timed-out" : "failed",
        action,
        currentRun: (await syncTerminalAtlasRun(root, recheckedRun)).currentRun ?? recheckedRun,
        command: renderCommand(command),
        exitCode: typeof error?.code === "number" ? error.code : 1,
        stdout: String(error?.stdout ?? "").trim(),
        stderr: String(error?.stderr ?? error?.message ?? "").trim(),
        startedAt,
        finishedAt: new Date().toISOString()
      };
    }
  } finally {
    await releaseFileLock(loopPaths.lockPath, lock.file);
  }
}

export async function prepareAtlasLoopRunnerHandoff(root, action) {
  const loopPaths = getLoopPaths(root);
  const currentRun = await readJsonFile(loopPaths.currentRunPath, null);
  if (!currentRun?.id) {
    return { ok: false, status: "missing-current-run", reason: "No current run exists. Claim an approved goal first." };
  }

  const command = buildAtlasRunnerCommand(root, action, currentRun);
  if (!command.ok) {
    return command;
  }

  return {
    ok: true,
    status: "handoff-required",
    action,
    currentRun,
    command: renderCommand(command),
    reason: "Run this command in a terminal or background worker; browser requests do not execute long OpenClaw runner jobs."
  };
}

export async function syncTerminalAtlasRun(root, currentRun) {
  if (!currentRun?.handoffDir || !currentRun?.goalId) {
    return { ok: true, status: "skipped", reason: "Current run is missing handoff or goal id." };
  }

  const loopPaths = getLoopPaths(root);
  const runnerStatePath = resolveRepoPath(root, join(currentRun.handoffDir, "runner-state.json"));
  const runnerState = await readJsonFile(runnerStatePath, null);
  const runnerStatus = typeof runnerState?.status === "string" ? runnerState.status : "";
  if (!terminalRunnerStatuses.includes(runnerStatus)) {
    return { ok: true, status: "non-terminal", runnerStatus };
  }

  const evidencePath = resolveRepoPath(root, currentRun.evidencePath ?? join(currentRun.handoffDir, "evidence.json"));
  const evidence = await readJsonFile(evidencePath, null);
  const updatedAt = typeof runnerState.updatedAt === "string" ? runnerState.updatedAt : new Date().toISOString();
  const lifecycleStatus = getGoalLifecycleForRunnerStatus(runnerStatus);
  const queue = await readGoalQueue(loopPaths.goalQueuePath);
  let syncedGoal = null;
  const nextGoals = queue.goals.map((goal) => {
    if (goal.id !== currentRun.goalId) {
      return goal;
    }
    syncedGoal = syncGoalForTerminalRunner(goal, {
      lifecycleStatus,
      runnerStatus,
      runnerState,
      evidence,
      now: updatedAt
    });
    return syncedGoal;
  });

  const nextCurrentRun = {
    ...currentRun,
    status: runnerStatus,
    stage: typeof runnerState.stage === "string" ? runnerState.stage : currentRun.stage,
    updatedAt,
    runnerStatus,
    runnerUpdatedAt: updatedAt,
    runnerCommands: getRunnerCommandsFromState(runnerState, currentRun.runnerCommands),
    maxRepairs: Number.isInteger(runnerState.maxRepairs) ? runnerState.maxRepairs : currentRun.maxRepairs,
    repairAttempts: Number.isInteger(runnerState.repairAttempts) ? runnerState.repairAttempts : currentRun.repairAttempts,
    timeline: buildSyncedCurrentRunTimeline(currentRun.timeline, runnerState, runnerStatus, updatedAt),
    humanGate: getHumanGateForRunnerStatus(runnerStatus, evidence),
    humanReview: buildPendingHumanReview(currentRun, runnerState, runnerStatus, evidence, updatedAt)
  };

  if (syncedGoal) {
    await writeJsonAtomically(loopPaths.goalQueuePath, {
      version: 1,
      updatedAt,
      goals: nextGoals
    });
  }
  await writeJsonAtomically(loopPaths.currentRunPath, nextCurrentRun);
  await writePendingReviewRecord(root, currentRun, nextCurrentRun.humanReview);
  await appendRunHistory(loopPaths.runHistoryPath, nextCurrentRun, syncedGoal, evidence);

  return { ok: true, status: "synced", runnerStatus, lifecycleStatus, goal: syncedGoal, currentRun: nextCurrentRun };
}

function syncGoalForTerminalRunner(goal, { lifecycleStatus, runnerStatus, runnerState, evidence, now }) {
  const synced = updateGoalLifecycle(goal, lifecycleStatus, lifecycleStatus === "satisfied", { now });
  if (!synced) {
    return goal;
  }

  const nextGoal = {
    ...synced,
    goalContract: syncGoalContractLayers(synced.goalContract, evidence),
    subtasks: syncGoalSubtasks(synced.subtasks, { runnerStatus, runnerState, evidence })
  };

  return {
    ...nextGoal,
    description: renderSyncedGoalDescription(nextGoal)
  };
}

function syncGoalContractLayers(goalContract, evidence) {
  if (!goalContract || !Array.isArray(goalContract.satisfactionLayers)) {
    return goalContract;
  }

  const evidenceLayers = Array.isArray(evidence?.satisfactionLayers) ? evidence.satisfactionLayers : [];
  const byId = new Map(
    evidenceLayers
      .map((layer) => [firstString(layer.layerId, layer.id, layer.label), layer])
      .filter(([key]) => Boolean(key))
  );

  return {
    ...goalContract,
    satisfactionLayers: goalContract.satisfactionLayers.map((layer) => {
      const key = firstString(layer.id, layer.layerId, layer.label);
      const proof = key ? byId.get(key) : null;
      if (!proof?.status) {
        return layer;
      }

      return {
        ...layer,
        status: proof.status
      };
    })
  };
}

function syncGoalSubtasks(subtasks, { runnerStatus, runnerState, evidence }) {
  if (!Array.isArray(subtasks) || subtasks.length === 0) {
    return subtasks ?? [];
  }

  const terminal = terminalRunnerStatuses.includes(runnerStatus);
  const checks = Array.isArray(evidence?.checks) ? evidence.checks : [];
  const hasEvidence = Boolean(evidence?.status);
  const hasChecker = checks.some((check) => check?.stage === "checker") || String(runnerState?.stage ?? "").includes("checker");

  return subtasks.map((subtask) => {
    const id = typeof subtask?.id === "string" ? subtask.id : "";
    if (id === "goal-claim") {
      return { ...subtask, done: true };
    }
    if (id === "goal-start") {
      return { ...subtask, done: terminal || hasEvidence };
    }
    if (id === "goal-evidence") {
      return { ...subtask, done: hasEvidence };
    }
    if (id === "goal-review") {
      return { ...subtask, done: hasChecker };
    }
    return subtask;
  });
}

function renderSyncedGoalDescription(goal) {
  const contract = goal.goalContract;
  if (!contract) {
    return sanitizeString(goal.description, 12_000);
  }

  const lines = [
    contract.statement || goal.summary || goal.title,
    "",
    `Stop condition: ${contract.stopCondition || "Not specified."}`,
    `Scope: ${contract.scope || "Not specified."}`,
    `Lifecycle: ${goal.lifecycleStatus}`,
    `Max estimate: ${contract.maxEstimate ?? goal.estimate}`,
    `Approved to run: ${goal.approvedToRun ? "yes" : "no"}`,
    "",
    "Refined satisfaction layers:"
  ];

  for (const layer of Array.isArray(contract.satisfactionLayers) ? contract.satisfactionLayers : []) {
    const status = layer.status || "pending";
    const gate = layer.humanGated === true ? ", human-gated" : "";
    lines.push(`- [${status}${gate}] ${layer.label || layer.id}: ${layer.criteria || "No criteria supplied."}`);
  }

  lines.push("", "Verification:");
  for (const command of Array.isArray(contract.verificationCommands) ? contract.verificationCommands : []) {
    const required = command.required === true ? "required" : "optional";
    lines.push(`- [${required}] ${command.label || command.id}: ${command.command}`);
  }

  if (contract.safety) {
    lines.push("", "Safety:");
    lines.push(`- Max first slice: ${contract.maxEstimate ?? goal.estimate} points`);
    lines.push(`- Max iterations: ${contract.safety.maxIterations}`);
    lines.push(`- Max repair attempts: ${contract.safety.maxRepairAttempts}`);
    lines.push(`- Token budget: ${contract.safety.tokenBudget}`);
    lines.push(`- Time budget: ${contract.safety.timeBudget}`);
    lines.push(`- Allowed paths: ${contract.safety.allowedPaths}`);
    lines.push(`- External actions: ${contract.safety.externalActionPolicy}`);
  }

  return sanitizeString(lines.join("\n"), 12_000);
}

function getRunnerCommandsFromState(runnerState, fallback = {}) {
  return {
    agentCommand: stringEnv(runnerState?.agentCommand) || stringEnv(fallback.agentCommand),
    makerCommand: stringEnv(runnerState?.makerCommand) || stringEnv(fallback.makerCommand),
    checkerCommand: stringEnv(runnerState?.checkerCommand) || stringEnv(fallback.checkerCommand),
    repairCommand: stringEnv(runnerState?.repairCommand) || stringEnv(fallback.repairCommand),
    prCommand: stringEnv(runnerState?.prCommand) || stringEnv(fallback.prCommand)
  };
}

function buildSyncedCurrentRunTimeline(currentTimeline, runnerState, runnerStatus, updatedAt) {
  const retained = Array.isArray(currentTimeline)
    ? currentTimeline.filter((event) => ["queued", "claimed"].includes(event?.stage))
    : [];
  const runnerTimeline = Array.isArray(runnerState?.timeline)
    ? runnerState.timeline.filter((event) => event && typeof event.stage === "string")
    : [];
  const next = [...retained, ...runnerTimeline];

  if (["satisfied", "passed", "merged"].includes(runnerStatus)) {
    next.push({
      stage: "human-review",
      status: "next",
      at: null,
      detail: "Checker passed with evidence. Human review is required before external actions or merge."
    });
  } else {
    next.push({
      stage: "human-review",
      status: "blocked",
      at: updatedAt,
      detail: "Terminal runner state needs human inspection before another run is claimed."
    });
  }

  return next;
}

function getHumanGateForRunnerStatus(runnerStatus, evidence) {
  const satisfied = ["satisfied", "passed", "merged"].includes(runnerStatus);
  return {
    required: true,
    status: satisfied ? "pending-review" : "needs-review",
    recommendedNextAction: satisfied ? "human-review" : "inspect-blocker",
    externalActions: evidence?.pullRequest?.status ?? "human-gated"
  };
}

function buildPendingHumanReview(currentRun, runnerState, runnerStatus, evidence, updatedAt) {
  return {
    schemaVersion: "atlas-human-review.v1",
    runId: currentRun.id,
    goalId: currentRun.goalId,
    required: true,
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    decision: null,
    recommendedNextAction: ["satisfied", "passed", "merged"].includes(runnerStatus) ? "human-review" : "inspect-blocker",
    runnerStatus,
    runnerStage: typeof runnerState.stage === "string" ? runnerState.stage : currentRun.stage,
    evidencePath: currentRun.evidencePath ?? (currentRun.handoffDir ? join(currentRun.handoffDir, "evidence.json") : ""),
    checkerVerdictPath: currentRun.handoffDir ? join(currentRun.handoffDir, "checker-verdict.json") : "",
    externalActions: {
      prCreation: evidence?.pullRequest?.status === "created" ? "created" : "disabled",
      merge: "disabled",
      push: "disabled"
    },
    createdAt: updatedAt
  };
}

async function writePendingReviewRecord(root, currentRun, humanReview) {
  if (!currentRun?.handoffDir || !humanReview) {
    return;
  }

  const reviewPath = resolveRepoPath(root, join(currentRun.handoffDir, "review.json"));
  await writeJsonAtomically(reviewPath, humanReview);
}

async function appendRunHistory(runHistoryPath, currentRun, goal, evidence) {
  await mkdir(dirname(runHistoryPath), { recursive: true });
  await appendFile(
    runHistoryPath,
    `${JSON.stringify({
      schemaVersion: "atlas-run-history.v1",
      runId: currentRun.id,
      goalId: currentRun.goalId,
      goalTitle: currentRun.goalTitle,
      status: currentRun.status,
      stage: currentRun.stage,
      runnerStatus: currentRun.runnerStatus,
      goalLifecycleStatus: goal?.lifecycleStatus ?? null,
      evidencePath: currentRun.evidencePath ?? null,
      humanReviewStatus: currentRun.humanReview?.status ?? null,
      findings: Array.isArray(evidence?.findings) ? evidence.findings.length : 0,
      syncedAt: currentRun.updatedAt
    })}\n`
  );
}

export function buildAtlasRunnerCommand(root, action, currentRun) {
  if (action === "start-current-run") {
    if (terminalRunnerStatuses.includes(currentRun?.status)) {
      return { ok: false, status: "terminal-current-run", reason: "Current run is terminal; clear it before starting another runner." };
    }

    const missing = ["goalId", "branchName", "baseCommit", "id", "goalTitle", "worktreePath", "handoffDir"].filter(
      (key) => !currentRun?.[key]
    );
    if (missing.length > 0) {
      return { ok: false, status: "invalid-current-run", reason: `Current run is missing: ${missing.join(", ")}.` };
    }

    const runnerStatePath = resolveRepoPath(root, join(currentRun.handoffDir, "runner-state.json"));
    if (existsSync(runnerStatePath)) {
      return { ok: false, status: "runner-state-exists", reason: "Runner state already exists; use resume-current-run." };
    }

    const args = [
      "scripts/planner-agent-runner.mjs",
      "--ticket",
      currentRun.goalId,
      "--branch",
      currentRun.branchName,
      "--base",
      currentRun.baseCommit,
      "--run-id",
      currentRun.id,
      "--goal-title",
      currentRun.goalTitle,
      "--worktree-dir",
      currentRun.worktreePath,
      "--handoff-dir",
      currentRun.handoffDir
    ];
    if (currentRun.goalContract) {
      args.push("--goal-contract-json", JSON.stringify(currentRun.goalContract));
    }
    const maxRepairAttempts = Number(currentRun.goalContract?.safety?.maxRepairAttempts);
    if (Number.isInteger(maxRepairAttempts) && maxRepairAttempts >= 0) {
      args.push("--max-repairs", String(Math.min(5, maxRepairAttempts)));
    }
    addRunnerCommandArgs(args, currentRun.runnerCommands ?? getRunnerCommandConfig());

    return {
      ok: true,
      cmd: process.execPath,
      args
    };
  }

  if (action === "resume-current-run") {
    if (!currentRun?.handoffDir) {
      return { ok: false, status: "invalid-current-run", reason: "Current run is missing a handoff directory." };
    }
    if (terminalRunnerStatuses.includes(currentRun?.status)) {
      return { ok: false, status: "terminal-current-run", reason: "Current run is terminal; clear it before resuming." };
    }

    const runnerStatePath = resolveRepoPath(root, join(currentRun.handoffDir, "runner-state.json"));
    if (!existsSync(runnerStatePath)) {
      return { ok: false, status: "missing-runner-state", reason: "Runner state does not exist yet; start the current run first." };
    }

    const runnerState = parseJsonObject(readFileSync(runnerStatePath, "utf8"));
    if (terminalRunnerStatuses.includes(runnerState?.status)) {
      return { ok: false, status: "terminal-runner-state", reason: "Runner state is terminal; clear current-run before starting new work." };
    }

    const args = ["scripts/planner-agent-runner.mjs", "--resume", "--handoff-dir", currentRun.handoffDir];
    addRunnerCommandArgs(args, currentRun.runnerCommands ?? getRunnerCommandConfig());

    return {
      ok: true,
      cmd: process.execPath,
      args
    };
  }

  return { ok: false, status: "unsupported-action", reason: "Unsupported Atlas loop runner action." };
}

export async function acquireFileLock(lockPath, owner = "loop-store") {
  try {
    await mkdir(dirname(lockPath), { recursive: true });
    const file = await open(lockPath, "wx");
    await file.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), owner }, null, 2));
    return { ok: true, file };
  } catch {
    return { ok: false };
  }
}

export async function releaseFileLock(lockPath, file) {
  await file.close();
  await rm(lockPath, { force: true });
}

export async function writeJsonAtomically(path, value) {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tempPath, path);
}

export function getTicketStatusForGoalLifecycle(lifecycleStatus, approvedToRun) {
  if (lifecycleStatus === "blocked") {
    return "blocked";
  }
  if (lifecycleStatus === "satisfied" || lifecycleStatus === "archived") {
    return "done";
  }
  if (lifecycleStatus === "running") {
    return "in-progress";
  }
  return "backlog";
}

export function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildAtlasAgentRunPlan({ runId, goal, baseCommit }) {
  const ticketSlug = sanitizeForBranch(goal.id);
  const branchName = `worktree/${ticketSlug}`;
  const worktreePath = `../agent-monorepo-${ticketSlug}`;
  const handoffDir = join("loops", "project-controller", "runs", runId);
  const commandParts = [
    shellQuote("node"),
    shellQuote("scripts/planner-agent-runner.mjs"),
    "--ticket",
    shellQuote(goal.id),
    "--branch",
    shellQuote(branchName),
    "--base",
    shellQuote(baseCommit),
    "--run-id",
    shellQuote(runId),
    "--goal-title",
    shellQuote(goal.title),
    "--worktree-dir",
    shellQuote(worktreePath),
    "--handoff-dir",
    shellQuote(handoffDir)
  ];
  if (goal.goalContract) {
    commandParts.push("--goal-contract-json", shellQuote(JSON.stringify(goal.goalContract)));
  }
  const maxRepairAttempts = Number(goal.goalContract?.safety?.maxRepairAttempts);
  if (Number.isInteger(maxRepairAttempts) && maxRepairAttempts >= 0) {
    commandParts.push("--max-repairs", shellQuote(String(Math.min(5, maxRepairAttempts))));
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

function buildCurrentAtlasRun({ runId, goal, claimedAt, baseCommit, agentRun }) {
  return {
    version: 1,
    id: runId,
    projectId: goal.projectId ?? "atlas-planner",
    projectLabel: goal.projectLabel ?? "Atlas Planner",
    goalId: goal.id,
    goalTitle: goal.title,
    goalContract: goal.goalContract,
    status: "claimed",
    stage: "claimed",
    claimedAt,
    updatedAt: claimedAt,
    baseCommit,
    branchName: agentRun.branchName,
    worktreePath: agentRun.worktreePath,
    handoffDir: agentRun.handoffDir,
    runnerCommands: agentRun.runnerCommands,
    runnerCommand: agentRun.command,
    makerPromptPath: agentRun.makerPromptPath,
    checkerPromptPath: agentRun.checkerPromptPath,
    evidencePath: agentRun.evidencePath,
    selectedTask: {
      id: goal.id,
      title: goal.title,
      estimate: goal.estimate,
      reason: "Approved Atlas Planner queued goal."
    },
    timeline: [
      { stage: "queued", status: "done", at: claimedAt, detail: "Goal was present in goal-queue.json." },
      { stage: "claimed", status: "done", at: claimedAt, detail: "Controller claimed the goal for the next run." },
      { stage: "prepare", status: "next", at: null, detail: "Run the agent runner command to create the branch, worktree, and handoff files." },
      { stage: "maker", status: "locked", at: null, detail: "Maker work starts after the handoff worktree exists." },
      { stage: "checker", status: "locked", at: null, detail: "Checker review starts only after maker evidence exists." }
    ]
  };
}

async function readCurrentCommit(root) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: root });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function renderCommand(command) {
  return [command.cmd, ...command.args].map(shellQuote).join(" ");
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

export function summarizeMemoryValue(value) {
  if (typeof value === "string") {
    return value.slice(0, 80);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (value && typeof value === "object") {
    return `${Object.keys(value).length} keys`;
  }
  return "empty";
}

function getControllerLockReason({ malformed, ageMs, staleAfterMs, pidRunning }) {
  if (malformed && ageMs !== null && ageMs >= staleAfterMs) {
    return "Controller lock is malformed and can be cleared after inspection.";
  }
  if (malformed) {
    return "Controller lock is malformed but recent; leave it in place in case it is being written.";
  }
  if (pidRunning === true) {
    return "Controller lock owner process is still running.";
  }
  if (ageMs === null) {
    return "Controller lock age is unknown.";
  }
  if (ageMs >= staleAfterMs && pidRunning === false) {
    return "Controller lock is stale and the owner process is not running.";
  }
  return "Controller lock is recent; leave it in place.";
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function isProjectRoot(candidate) {
  if (!existsSync(join(candidate, "loops/project-controller/projects.json")) || !existsSync(join(candidate, "apps/web/package.json"))) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8"));
    const webPackageJson = JSON.parse(readFileSync(join(candidate, "apps/web/package.json"), "utf8"));
    return packageJson.name === "project-sphere" && Array.isArray(packageJson.workspaces) && webPackageJson.name === "@agent/web";
  } catch {
    return false;
  }
}

function isApprovedLifecycle(lifecycleStatus) {
  return lifecycleStatus === "approved" || lifecycleStatus === "running";
}

function getGoalLifecycleForRunnerStatus(runnerStatus) {
  if (runnerStatus === "satisfied" || runnerStatus === "passed" || runnerStatus === "merged") {
    return "satisfied";
  }
  return "blocked";
}

function sanitizeString(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

function sanitizeIdentifier(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const sanitized = value.trim().slice(0, 120);
  return /^[A-Za-z0-9._-]+$/.test(sanitized) ? sanitized : fallback;
}

function sanitizeGoalTags(value, approvedToRun, lifecycleStatus) {
  const baseTags = Array.isArray(value) ? value.filter((tag) => typeof tag === "string") : [];
  const tags = baseTags
    .map((tag) => tag.trim().toLowerCase().slice(0, 40))
    .filter((tag) => tag && tag !== "approved-to-run" && !tag.startsWith("goal-"));
  tags.push(`goal-${lifecycleStatus}`);
  if (approvedToRun) {
    tags.push("approved-to-run");
  }
  return Array.from(new Set(tags)).slice(0, 12);
}

function sanitizeSubtasks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 20)
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 80) : `subtask-${index + 1}`,
      title: typeof item.title === "string" ? item.title.trim().slice(0, 240) : "Untitled subtask",
      done: item.done === true
    }));
}

function sanitizeGoalContract(value, fallback, estimate) {
  const source = value && typeof value === "object" ? value : {};
  const statement = sanitizeString(source.statement ?? source.outcome ?? fallback.summary, 4000);
  const stopCondition = sanitizeString(source.stopCondition ?? fallback.stopCondition, 2000);
  const scope = sanitizeString(source.scope ?? fallback.scope, 4000);
  const maxEstimate = clampInteger(Number(source.maxEstimate ?? fallback.estimate ?? estimate), 1, 21);

  return {
    statement,
    stopCondition,
    scope,
    maxEstimate,
    satisfactionLayers: sanitizeSatisfactionLayers(source.satisfactionLayers ?? source.layers),
    verificationCommands: sanitizeVerificationCommands(source.verificationCommands ?? source.verification),
    safety: sanitizeSafetySettings(source.safety)
  };
}

function sanitizeSatisfactionLayers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 20)
    .map((item, index) => ({
      id: sanitizeString(item.id, 80) || `layer-${index + 1}`,
      label: sanitizeString(item.label ?? item.title, 160) || `Layer ${index + 1}`,
      criteria: sanitizeString(item.criteria, 2000),
      status: sanitizeLayerStatus(item.status),
      humanGated: item.humanGated === true
    }));
}

function sanitizeVerificationCommands(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 20)
    .map((item, index) => ({
      id: sanitizeString(item.id, 80) || `verify-${index + 1}`,
      label: sanitizeString(item.label ?? item.name, 160) || `Verification ${index + 1}`,
      command: sanitizeString(item.command, 1000),
      required: item.required !== false
    }))
    .filter((item) => item.command);
}

function sanitizeSafetySettings(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    maxIterations: clampInteger(Number(source.maxIterations ?? 6), 1, 20),
    maxRepairAttempts: clampInteger(Number(source.maxRepairAttempts ?? 3), 0, 5),
    tokenBudget: sanitizeString(source.tokenBudget, 1000),
    timeBudget: sanitizeString(source.timeBudget, 1000),
    allowedPaths: sanitizeString(source.allowedPaths, 2000),
    externalActionPolicy: sanitizeExternalActionPolicy(source.externalActionPolicy)
  };
}

function sanitizeLayerStatus(value) {
  return ["pending", "scaffolded", "satisfied", "blocked"].includes(value) ? value : "pending";
}

function sanitizeExternalActionPolicy(value) {
  return ["disabled", "pr-only", "human-gated", "auto-merge"].includes(value) ? value : "human-gated";
}

function sanitizeIsoDate(value) {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
