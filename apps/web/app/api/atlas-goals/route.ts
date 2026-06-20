import {
  acquireFileLock,
  getLoopPaths,
  isGoalLifecycleStatus,
  readGoalQueue,
  releaseFileLock,
  resolveProjectRoot,
  updateGoalLifecycle,
  validateQueuedGoalInput,
  writeJsonAtomically,
  type QueuedGoal
} from "@agent/loop-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const projectRoot = resolveProjectRoot();
const { goalQueuePath, lockPath } = getLoopPaths(projectRoot);

export async function GET() {
  return NextResponse.json(await readGoalQueue(goalQueuePath));
}

export async function POST(request: Request) {
  const accessError = validateWriteAccess(request);
  if (accessError) {
    return accessError;
  }

  const body = (await request.json().catch(() => null)) as Partial<QueuedGoal> | null;
  const validation = validateQueuedGoalInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const goal = validation.goal;
  const lock = await acquireFileLock(lockPath, "atlas-goals-api");
  if (!lock.ok) {
    return NextResponse.json({ error: "The project loop is busy. Try again after the current run finishes." }, { status: 409 });
  }

  try {
    const queue = await readGoalQueue(goalQueuePath);
    const withoutCurrent = queue.goals.filter((candidate) => candidate.id !== goal.id);
    const nextQueue = {
      version: 1,
      updatedAt: goal.updatedAt,
      goals: [goal, ...withoutCurrent].slice(0, 50)
    };

    await writeJsonAtomically(goalQueuePath, nextQueue);

    return NextResponse.json({ ok: true, goal, queueLength: nextQueue.goals.length });
  } finally {
    await releaseFileLock(lockPath, lock.file);
  }
}

export async function PATCH(request: Request) {
  const accessError = validateWriteAccess(request);
  if (accessError) {
    return accessError;
  }

  const body = (await request.json().catch(() => null)) as { id?: unknown; lifecycleStatus?: unknown; approvedToRun?: unknown } | null;
  if (!body || typeof body.id !== "string" || typeof body.lifecycleStatus !== "string") {
    return NextResponse.json({ error: "Goal id and lifecycleStatus are required." }, { status: 400 });
  }

  if (!isGoalLifecycleStatus(body.lifecycleStatus)) {
    return NextResponse.json({ error: "Unsupported lifecycle status." }, { status: 400 });
  }

  const lock = await acquireFileLock(lockPath, "atlas-goals-api");
  if (!lock.ok) {
    return NextResponse.json({ error: "The project loop is busy. Try again after the current run finishes." }, { status: 409 });
  }

  try {
    const queue = await readGoalQueue(goalQueuePath);
    const goalIndex = queue.goals.findIndex((goal) => goal.id === body.id);
    if (goalIndex === -1) {
      return NextResponse.json({ error: "Goal not found." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const previous = queue.goals[goalIndex];
    const updatedGoal = updateGoalLifecycle(previous, body.lifecycleStatus, body.approvedToRun, { now });
    if (!updatedGoal) {
      return NextResponse.json({ error: "Unsupported lifecycle status." }, { status: 400 });
    }
    const nextGoals = [...queue.goals];
    nextGoals[goalIndex] = updatedGoal;

    const nextQueue = {
      version: 1,
      updatedAt: now,
      goals: nextGoals
    };

    await writeJsonAtomically(goalQueuePath, nextQueue);

    return NextResponse.json({ ok: true, goal: updatedGoal, queueLength: nextQueue.goals.length });
  } finally {
    await releaseFileLock(lockPath, lock.file);
  }
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
