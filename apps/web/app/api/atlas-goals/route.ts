import { existsSync, readFileSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type QueuedGoal = {
  id: string;
  title: string;
  lifecycleStatus: string;
  approvedToRun: boolean;
  status: string;
  estimate: number;
  summary: string;
  tags: string[];
  description: string;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  createdAt: string;
  updatedAt: string;
};

type GoalQueue = {
  version: 1;
  updatedAt: string;
  goals: QueuedGoal[];
};

const allowedLifecycleStatuses = new Set(["draft", "approved"]);
const projectRoot = resolveProjectRoot();
const controllerDir = join(projectRoot, "loops/project-controller");
const queuePath = join(controllerDir, "goal-queue.json");
const lockPath = join(controllerDir, "LOCK");

export async function GET() {
  return NextResponse.json(await readGoalQueue());
}

export async function POST(request: Request) {
  const accessError = validateWriteAccess(request);
  if (accessError) {
    return accessError;
  }

  const body = (await request.json().catch(() => null)) as Partial<QueuedGoal> | null;
  const validation = validateGoalInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const goal = validation.goal;
  const lock = await acquireQueueLock();
  if (!lock.ok) {
    return NextResponse.json({ error: "The project loop is busy. Try again after the current run finishes." }, { status: 409 });
  }

  try {
    const queue = await readGoalQueue();
    const withoutCurrent = queue.goals.filter((candidate) => candidate.id !== goal.id);
    const nextQueue: GoalQueue = {
      version: 1,
      updatedAt: goal.updatedAt,
      goals: [goal, ...withoutCurrent].slice(0, 50)
    };

    await mkdir(dirname(queuePath), { recursive: true });
    await writeJsonAtomically(queuePath, nextQueue);

    return NextResponse.json({ ok: true, goal, queueLength: nextQueue.goals.length });
  } finally {
    await releaseQueueLock(lock.file);
  }
}

function validateGoalInput(body: Partial<QueuedGoal> | null): { ok: true; goal: QueuedGoal } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Goal JSON is required." };
  }

  if (typeof body.id !== "string" || typeof body.title !== "string" || !body.id.trim() || !body.title.trim()) {
    return { ok: false, error: "Goal id and title are required." };
  }

  const lifecycleStatus =
    typeof body.lifecycleStatus === "string" && allowedLifecycleStatuses.has(body.lifecycleStatus)
      ? body.lifecycleStatus
      : "draft";
  const approvedToRun = body.approvedToRun === true && lifecycleStatus === "approved";
  const status = approvedToRun ? "in-progress" : "backlog";
  const now = new Date().toISOString();
  const estimate = clampInteger(Number(body.estimate ?? 8), 1, 21);

  const goal: QueuedGoal = {
    id: body.id.trim().slice(0, 80),
    title: body.title.trim().slice(0, 180),
    lifecycleStatus,
    approvedToRun,
    status,
    estimate,
    summary: sanitizeString(body.summary, 1000),
    tags: sanitizeTags(body.tags, approvedToRun, lifecycleStatus),
    description: sanitizeString(body.description, 12_000),
    subtasks: sanitizeSubtasks(body.subtasks),
    createdAt: sanitizeIsoDate(body.createdAt) ?? now,
    updatedAt: now
  };

  return { ok: true, goal };
}

function validateWriteAccess(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ error: "Goal writes require a same-origin browser request." }, { status: 403 });
  }

  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: "Goal writes require a same-origin browser request." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  return null;
}

function sanitizeString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function sanitizeTags(value: unknown, approvedToRun: boolean, lifecycleStatus: string) {
  const baseTags = Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
  const tags = baseTags
    .map((tag) => tag.trim().toLowerCase().slice(0, 40))
    .filter((tag) => tag && tag !== "approved-to-run" && !tag.startsWith("goal-"));
  tags.push(`goal-${lifecycleStatus}`);
  if (approvedToRun) {
    tags.push("approved-to-run");
  }
  return Array.from(new Set(tags)).slice(0, 12);
}

function sanitizeSubtasks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is { id?: unknown; title?: unknown; done?: unknown } => item && typeof item === "object")
    .slice(0, 20)
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 80) : `subtask-${index + 1}`,
      title: typeof item.title === "string" ? item.title.trim().slice(0, 240) : "Untitled subtask",
      done: item.done === true
    }));
}

function sanitizeIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

async function readGoalQueue(): Promise<GoalQueue> {
  if (!existsSync(queuePath)) {
    return { version: 1, updatedAt: new Date(0).toISOString(), goals: [] };
  }

  try {
    const parsed = JSON.parse(await readFile(queuePath, "utf8")) as GoalQueue;
    return {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      goals: Array.isArray(parsed.goals) ? parsed.goals : []
    };
  } catch {
    return { version: 1, updatedAt: new Date(0).toISOString(), goals: [] };
  }
}

async function acquireQueueLock(): Promise<{ ok: true; file: Awaited<ReturnType<typeof open>> } | { ok: false }> {
  try {
    await mkdir(dirname(lockPath), { recursive: true });
    const file = await open(lockPath, "wx");
    await file.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), owner: "atlas-goals-api" }, null, 2));
    return { ok: true, file };
  } catch {
    return { ok: false };
  }
}

async function releaseQueueLock(file: Awaited<ReturnType<typeof open>>) {
  await file.close();
  await rm(lockPath, { force: true });
}

async function writeJsonAtomically(path: string, value: unknown) {
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tempPath, path);
}

function resolveProjectRoot() {
  const configuredRoot = process.env.PROJECT_LOOP_ROOT ? resolve(process.env.PROJECT_LOOP_ROOT) : null;
  const candidates = configuredRoot ? [configuredRoot] : [process.cwd(), resolve(process.cwd(), "../..")];
  const found = candidates.find(isProjectRoot);
  if (!found) {
    throw new Error("Unable to resolve project root for Atlas goal queue writes.");
  }
  return found;
}

function isProjectRoot(candidate: string) {
  if (
    !existsSync(join(candidate, "loops/project-controller/projects.json")) ||
    !existsSync(join(candidate, "apps/web/package.json"))
  ) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(join(candidate, "package.json"), "utf8")) as { name?: string; workspaces?: unknown };
    const webPackageJson = JSON.parse(readFileSync(join(candidate, "apps/web/package.json"), "utf8")) as { name?: string };
    return packageJson.name === "project-sphere" && Array.isArray(packageJson.workspaces) && webPackageJson.name === "@agent/web";
  } catch {
    return false;
  }
}
