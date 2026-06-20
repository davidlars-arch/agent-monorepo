import { claimNextAtlasPlannerGoal, resolveProjectRoot, runAtlasLoopRunnerAction } from "@agent/loop-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const projectRoot = resolveProjectRoot();

type AtlasLoopRunnerAction = "claim-next-goal" | "start-current-run" | "resume-current-run";

const actionAliases: Record<string, AtlasLoopRunnerAction> = {
  "claim-next-goal": "claim-next-goal",
  "claim-next-approved-goal": "claim-next-goal",
  claim: "claim-next-goal",
  "start-current-run": "start-current-run",
  "start-runner": "start-current-run",
  start: "start-current-run",
  "resume-current-run": "resume-current-run",
  "resume-runner": "resume-current-run",
  resume: "resume-current-run"
};

export async function POST(request: Request) {
  const accessError = validateWriteAccess(request);
  if (accessError) {
    return accessError;
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown; timeoutMs?: unknown; goalId?: unknown; projectId?: unknown } | null;
  const action = normalizeAction(body?.action);
  if (!action) {
    return NextResponse.json({ error: "Unsupported Atlas loop runner action." }, { status: 400 });
  }

  if (action === "claim-next-goal") {
    const result = await claimNextAtlasPlannerGoal(projectRoot, {
      goalId: normalizeId(body?.goalId),
      projectId: normalizeId(body?.projectId)
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason, result }, { status: 409 });
    }
    if (result.status !== "claimed") {
      return NextResponse.json({ action, ...result });
    }

    return NextResponse.json({ ok: true, action, status: result.status, currentRun: result.currentRun, goal: result.goal });
  }

  const result = await runAtlasLoopRunnerAction(projectRoot, action, { timeoutMs: normalizeTimeoutMs(body?.timeoutMs) });
  if (!result.ok) {
    const status = result.status === "timed-out" ? 504 : result.status === "failed" ? 500 : 409;
    return NextResponse.json({ error: result.reason ?? result.stderr ?? "Atlas loop runner action failed.", result }, { status });
  }

  return NextResponse.json(result);
}

function normalizeAction(action: unknown): AtlasLoopRunnerAction | null {
  if (typeof action !== "string") {
    return null;
  }

  return actionAliases[action.trim()] ?? null;
}

function normalizeTimeoutMs(timeoutMs: unknown) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return 25_000;
  }

  return Math.max(1_000, Math.min(60_000, Math.trunc(timeoutMs)));
}

function normalizeId(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value)) {
    return "";
  }
  return value;
}

function validateWriteAccess(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ error: "Atlas loop runner writes require a same-origin browser request." }, { status: 403 });
  }

  try {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const expectedOrigin = forwardedProto ? `${forwardedProto}://${host}` : new URL(request.url).origin;
    if (new URL(origin).origin !== expectedOrigin) {
      return NextResponse.json({ error: "Atlas loop runner writes require a same-origin browser request." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  return null;
}
