type DateLike = Date | number | string | null | undefined;

export type ReportingTicketLike = {
  id: string;
  title: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
  completedAt?: DateLike;
  completedCommit?: string;
};

export type TicketThroughput = {
  created: number;
  updated: number;
  completed: number;
};

export type CompletedTicketFeedItem = {
  id: string;
  title: string;
  completedAt: string;
  completedCommit?: string;
};

export type ReportingVerificationLike =
  | {
      passed?: number | boolean;
      failed?: number | boolean;
      status?: string;
      result?: string;
      outcome?: string;
    }
  | Array<{
      passed?: boolean;
      status?: string;
      result?: string;
      outcome?: string;
    }>;

export type ReportingRunLike = {
  status?: string;
  result?: string;
  outcome?: string;
  merged?: boolean;
  mergedAt?: DateLike;
  changedFiles?: number | unknown[];
  filesChanged?: number | unknown[];
  verification?: ReportingVerificationLike;
  verifications?: ReportingVerificationLike;
};

export type RunEfficiencySummary = {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  merged: number;
  changedFiles: number;
  verification: {
    passed: number;
    failed: number;
  };
};

export function getTicketThroughput(
  tickets: ReportingTicketLike[],
  startDate: DateLike,
  endDate: DateLike
): TicketThroughput {
  const startMs = toTimestamp(startDate);
  const endMs = toTimestamp(endDate);

  if (startMs === null || endMs === null) {
    return { created: 0, updated: 0, completed: 0 };
  }

  const fromMs = Math.min(startMs, endMs);
  const toMs = Math.max(startMs, endMs);

  return tickets.reduce<TicketThroughput>(
    (counts, ticket) => ({
      created: counts.created + (isInRange(ticket.createdAt, fromMs, toMs) ? 1 : 0),
      updated: counts.updated + (isInRange(ticket.updatedAt, fromMs, toMs) ? 1 : 0),
      completed: counts.completed + (isInRange(ticket.completedAt, fromMs, toMs) ? 1 : 0)
    }),
    { created: 0, updated: 0, completed: 0 }
  );
}

export function getCompletedTicketFeed(
  tickets: ReportingTicketLike[],
  limit: number
): CompletedTicketFeedItem[] {
  const feedLimit = Math.max(0, Math.floor(limit));

  return tickets
    .filter((ticket) => toTimestamp(ticket.completedAt) !== null)
    .sort((left, right) => {
      const completedDiff = (toTimestamp(right.completedAt) ?? 0) - (toTimestamp(left.completedAt) ?? 0);

      return completedDiff || left.id.localeCompare(right.id);
    })
    .slice(0, feedLimit)
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      completedAt: String(ticket.completedAt),
      completedCommit: ticket.completedCommit
    }));
}

export function getRunEfficiencySummary(runs: ReportingRunLike[]): RunEfficiencySummary {
  return runs.reduce<RunEfficiencySummary>(
    (summary, run) => {
      const status = normalizeStatus(run.status ?? run.result ?? run.outcome);
      const verification = getVerificationCounts(run.verification) ?? getVerificationCounts(run.verifications);

      summary.total += 1;
      summary.passed += status === "passed" ? 1 : 0;
      summary.failed += status === "failed" ? 1 : 0;
      summary.blocked += status === "blocked" ? 1 : 0;
      summary.merged += run.merged || run.mergedAt || status === "merged" ? 1 : 0;
      summary.changedFiles += getChangedFileCount(run.changedFiles ?? run.filesChanged);

      if (verification) {
        summary.verification.passed += verification.passed;
        summary.verification.failed += verification.failed;
      }

      return summary;
    },
    {
      total: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      merged: 0,
      changedFiles: 0,
      verification: { passed: 0, failed: 0 }
    }
  );
}

function isInRange(value: DateLike, startMs: number, endMs: number) {
  const timestamp = toTimestamp(value);

  return timestamp !== null && timestamp >= startMs && timestamp <= endMs;
}

function toTimestamp(value: DateLike) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();

  return Number.isNaN(timestamp) ? null : timestamp;
}

function normalizeStatus(value: string | undefined) {
  const status = value?.toLowerCase();

  if (status === "pass" || status === "passed" || status === "success" || status === "succeeded") {
    return "passed";
  }

  if (status === "fail" || status === "failed" || status === "failure" || status === "error") {
    return "failed";
  }

  if (status === "blocked") {
    return "blocked";
  }

  if (status === "merged") {
    return "merged";
  }

  return status;
}

function getChangedFileCount(value: number | unknown[] | undefined) {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  return 0;
}

function getVerificationCounts(value: ReportingVerificationLike | undefined) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.reduce(
      (counts, verification) => {
        const status = normalizeStatus(verification.status ?? verification.result ?? verification.outcome);
        const passed = typeof verification.passed === "boolean" ? verification.passed : status === "passed";
        const failed = status === "failed";

        return {
          passed: counts.passed + (passed ? 1 : 0),
          failed: counts.failed + (failed ? 1 : 0)
        };
      },
      { passed: 0, failed: 0 }
    );
  }

  const passed = toCount(value.passed);
  const failed = toCount(value.failed);
  const status = normalizeStatus(value.status ?? value.result ?? value.outcome);

  return {
    passed: passed + (status === "passed" ? 1 : 0),
    failed: failed + (status === "failed" ? 1 : 0)
  };
}

function toCount(value: number | boolean | undefined) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  return 0;
}
