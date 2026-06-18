export type PlannerRunStatus = "queued" | "running" | "passed" | "failed" | "blocked" | "merged";

export type PlannerRunEvidence = {
  commit?: string;
  changedFiles?: string[];
  verification?: string[];
  summary?: string;
};

export type PlannerRun = {
  id: string;
  ticketId: string;
  branchName: string;
  worktreePath: string;
  status: PlannerRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  evidence?: PlannerRunEvidence;
};

export type PlannerRunStatusSummary = Record<PlannerRunStatus, number> & {
  total: number;
};

const terminalRunStatuses = new Set<PlannerRunStatus>(["passed", "failed", "blocked", "merged"]);

export function createPlannerRun(
  ticketId: string,
  branchName: string,
  worktreePath: string,
  now: Date | string = new Date()
): PlannerRun {
  const timestamp = toIsoTimestamp(now);

  return {
    id: createPlannerRunId(ticketId, branchName, timestamp),
    ticketId,
    branchName,
    worktreePath,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function startPlannerRun(run: PlannerRun, now: Date | string = new Date()): PlannerRun {
  if (run.status !== "queued") {
    throw new Error("Only queued planner runs can be started.");
  }

  const timestamp = toIsoTimestamp(now);

  return {
    ...run,
    status: "running",
    updatedAt: timestamp,
    startedAt: timestamp
  };
}

export function completePlannerRun(
  run: PlannerRun,
  status: PlannerRunStatus,
  evidence: PlannerRunEvidence,
  now: Date | string = new Date()
): PlannerRun {
  if (!terminalRunStatuses.has(status)) {
    throw new Error("Planner runs can only be completed with a terminal status.");
  }
  if (run.status !== "running") {
    throw new Error("Only running planner runs can be completed.");
  }

  const timestamp = toIsoTimestamp(now);

  return {
    ...run,
    status,
    updatedAt: timestamp,
    completedAt: timestamp,
    evidence: preserveRunEvidence(evidence)
  };
}

export function getLatestRunForTicket(runs: PlannerRun[], ticketId: string): PlannerRun | undefined {
  return runs
    .filter((run) => run.ticketId === ticketId)
    .reduce<PlannerRun | undefined>((latestRun, run) => {
      if (!latestRun) {
        return run;
      }

      return getRunSortTime(run) >= getRunSortTime(latestRun) ? run : latestRun;
    }, undefined);
}

export function summarizeRunStatus(runs: PlannerRun[]): PlannerRunStatusSummary {
  const summary: PlannerRunStatusSummary = {
    queued: 0,
    running: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    merged: 0,
    total: runs.length
  };

  for (const run of runs) {
    summary[run.status] += 1;
  }

  return summary;
}

function preserveRunEvidence(evidence: PlannerRunEvidence): PlannerRunEvidence {
  return {
    ...evidence,
    changedFiles: evidence.changedFiles ? [...evidence.changedFiles] : undefined,
    verification: evidence.verification ? [...evidence.verification] : undefined
  };
}

function getRunSortTime(run: PlannerRun) {
  return Math.max(toTime(run.updatedAt), toTime(run.completedAt));
}

function toTime(timestamp: string | undefined) {
  if (!timestamp) {
    return Number.NEGATIVE_INFINITY;
  }

  const time = new Date(timestamp).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function toIsoTimestamp(value: Date | string) {
  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function createPlannerRunId(ticketId: string, branchName: string, timestamp: string) {
  const slug = `${ticketId}-${branchName}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const stamp = new Date(timestamp).getTime().toString(36);

  return `run-${slug || "planner"}-${stamp}`;
}
