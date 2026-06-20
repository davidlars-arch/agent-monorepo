import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  getCurrentRunRecoveryStatus,
  getLoopPaths,
  readControllerLockSummary,
  readJsonFile,
  resolveProjectRoot,
  resolveRepoPath,
  type CurrentLoopRunSummary,
  type RunnerStateSummary
} from "@agent/loop-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const projectRoot = resolveProjectRoot();
const loopPaths = getLoopPaths(projectRoot);

export async function GET() {
  const currentRun = await readCurrentLoopRun();
  const runnerState = await readCurrentRunnerState(currentRun);
  return NextResponse.json({
    ok: true,
    lock: await readControllerLockSummary(loopPaths.lockPath),
    currentRunRecovery: getCurrentRunRecoveryStatus(currentRun, runnerState)
  });
}

export async function POST(request: Request) {
  const accessError = validateWriteAccess(request);
  if (accessError) {
    return accessError;
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "clear-stale-lock") {
    const lock = await readControllerLockSummary(loopPaths.lockPath);
    if (!lock.removable) {
      return NextResponse.json({ error: lock.reason, lock }, { status: 409 });
    }

    const recheckedLock = await readControllerLockSummary(loopPaths.lockPath);
    if (
      !recheckedLock.removable ||
      recheckedLock.pid !== lock.pid ||
      recheckedLock.startedAt !== lock.startedAt ||
      recheckedLock.owner !== lock.owner
    ) {
      return NextResponse.json({ error: "Controller lock changed while recovery was pending.", lock: recheckedLock }, { status: 409 });
    }

    await rm(loopPaths.lockPath, { force: true });
    return NextResponse.json({ ok: true, action, lock: await readControllerLockSummary(loopPaths.lockPath) });
  }

  if (action === "clear-terminal-current-run") {
    const currentRun = await readCurrentLoopRun();
    const runnerState = await readCurrentRunnerState(currentRun);
    const recovery = getCurrentRunRecoveryStatus(currentRun, runnerState);
    if (!recovery.clearable) {
      return NextResponse.json({ error: recovery.reason, currentRunRecovery: recovery }, { status: 409 });
    }

    const recheckedRun = await readCurrentLoopRun();
    const recheckedRunnerState = await readCurrentRunnerState(recheckedRun);
    const recheckedRecovery = getCurrentRunRecoveryStatus(recheckedRun, recheckedRunnerState);
    if (!recheckedRun || recheckedRun.id !== currentRun?.id || !recheckedRecovery.clearable) {
      return NextResponse.json(
        { error: "Current run changed while recovery was pending.", currentRunRecovery: recheckedRecovery },
        { status: 409 }
      );
    }

    await rm(loopPaths.currentRunPath, { force: true });
    return NextResponse.json({ ok: true, action, currentRunRecovery: getCurrentRunRecoveryStatus(null, null) });
  }

  return NextResponse.json({ error: "Unsupported run recovery action." }, { status: 400 });
}

async function readCurrentLoopRun() {
  return readJsonFile<CurrentLoopRunSummary | null>(loopPaths.currentRunPath, null);
}

async function readCurrentRunnerState(currentRun: CurrentLoopRunSummary | null): Promise<RunnerStateSummary | null> {
  if (!currentRun?.handoffDir) {
    return null;
  }

  const statePath = resolveRepoPath(projectRoot, join(currentRun.handoffDir, "runner-state.json"));
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    return JSON.parse(await readFile(statePath, "utf8")) as RunnerStateSummary;
  } catch {
    return null;
  }
}

function validateWriteAccess(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ error: "Run recovery writes require a same-origin browser request." }, { status: 403 });
  }

  try {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedOrigin = forwardedProto ? `${forwardedProto}://${host}` : new URL(request.url).origin;
    if (new URL(origin).origin !== expectedOrigin) {
      return NextResponse.json({ error: "Run recovery writes require a same-origin browser request." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  return null;
}
