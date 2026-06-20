import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export const goalLifecycleStatuses = ["draft", "refined", "approved", "running", "blocked", "satisfied", "archived"];
export const terminalGoalStatuses = ["done", "archived", "blocked"];

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
