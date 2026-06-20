import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createPlannerStateExport, parsePlannerStateImport, type KanbanTicket } from "@agent/atlas-planner";
import { acquireFileLock, releaseFileLock, resolveProjectRoot, writeJsonAtomically } from "@agent/loop-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PlannerTicketsRequest = {
  baseRevision?: unknown;
  tickets?: unknown;
};

const projectRoot = resolveProjectRoot();
const plannerPath = join(projectRoot, "planner", "tickets.json");
const plannerLockPath = join(projectRoot, "planner", "LOCK");

export async function GET() {
  const state = await readPlannerTicketsState();
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  const accessError = validateWriteAccess(request);
  if (accessError) {
    return accessError;
  }

  const body = (await request.json().catch(() => null)) as PlannerTicketsRequest | null;
  if (!body || !Array.isArray(body.tickets)) {
    return NextResponse.json({ error: "Planner ticket writes require a tickets array." }, { status: 400 });
  }

  if (typeof body.baseRevision !== "string") {
    return NextResponse.json({ error: "Planner ticket writes require a baseRevision." }, { status: 400 });
  }

  const baseRevision = body.baseRevision;
  const tickets = validatePlannerTickets(body.tickets);
  if (!tickets.ok) {
    return NextResponse.json({ error: tickets.error }, { status: 400 });
  }

  const lock = await acquireFileLock(plannerLockPath, "planner-tickets-api");
  if (!lock.ok) {
    return NextResponse.json({ error: "Planner ticket storage is busy. Try again after the current write finishes." }, { status: 409 });
  }

  try {
    const currentState = await readPlannerTicketsState();
    if (!currentState.ok) {
      return NextResponse.json(
        {
          error: currentState.error,
          current: currentState
        },
        { status: 409 }
      );
    }

    if (currentState.revision !== baseRevision) {
      return NextResponse.json(
        {
          error: "Planner tickets changed on disk. Reload before saving again.",
          current: currentState
        },
        { status: 409 }
      );
    }

    const nextState = createPlannerStateExport(tickets.tickets);
    await writeJsonAtomically(plannerPath, nextState);

    return NextResponse.json({
      ok: true,
      source: "repo",
      revision: getPlannerRevision(`${JSON.stringify(nextState, null, 2)}\n`),
      updatedAt: nextState.exportedAt,
      tickets: nextState.tickets
    });
  } finally {
    await releaseFileLock(plannerLockPath, lock.file);
  }
}

async function readPlannerTicketsState() {
  try {
    const rawState = await readFile(plannerPath, "utf8");
    const tickets = parsePlannerStateImport(rawState);
    const parsedState = JSON.parse(rawState) as { exportedAt?: unknown; updatedAt?: unknown };
    return {
      ok: true,
      source: "repo",
      revision: getPlannerRevision(rawState),
      updatedAt: getStateTimestamp(parsedState, tickets),
      tickets
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        ok: true,
        source: "missing",
        revision: getPlannerRevision(""),
        updatedAt: null,
        tickets: []
      };
    }

    return {
      ok: false,
      source: "invalid",
      revision: getPlannerRevision("invalid"),
      updatedAt: null,
      tickets: [],
      error: "Planner ticket storage could not be read."
    };
  }
}

function validatePlannerTickets(value: unknown[]): { ok: true; tickets: KanbanTicket[] } | { ok: false; error: string } {
  try {
    return { ok: true, tickets: parsePlannerStateImport(JSON.stringify({ version: 1, tickets: value })) };
  } catch {
    return { ok: false, error: "Planner ticket payload is invalid." };
  }
}

function getPlannerRevision(rawState: string) {
  return createHash("sha256").update(rawState).digest("hex");
}

function getStateTimestamp(parsedState: { exportedAt?: unknown; updatedAt?: unknown }, tickets: KanbanTicket[]) {
  if (typeof parsedState.exportedAt === "string") {
    return parsedState.exportedAt;
  }
  if (typeof parsedState.updatedAt === "string") {
    return parsedState.updatedAt;
  }
  return tickets.reduce<string | null>((latest, ticket) => {
    if (!latest || ticket.updatedAt > latest) {
      return ticket.updatedAt;
    }
    return latest;
  }, null);
}

function validateWriteAccess(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ error: "Planner ticket writes require a same-origin browser request." }, { status: 403 });
  }

  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: "Planner ticket writes require a same-origin browser request." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  return null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
