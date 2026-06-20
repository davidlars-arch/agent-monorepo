import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

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
  if (lifecycleStatus === "approved" || lifecycleStatus === "running" || approvedToRun) {
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

function sanitizeString(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
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
