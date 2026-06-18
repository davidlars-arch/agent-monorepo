import assert from "node:assert/strict";
import test from "node:test";

import {
  getCompletedTicketFeed,
  getRunEfficiencySummary,
  getTicketThroughput,
  type ReportingRunLike,
  type ReportingTicketLike
} from "./reporting.ts";

function makeTicket(overrides: Partial<ReportingTicketLike> = {}): ReportingTicketLike {
  return {
    id: "AP-TEST",
    title: "Reporting test ticket",
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    ...overrides
  };
}

test("getTicketThroughput counts ticket dates inside the range", () => {
  const throughput = getTicketThroughput(
    [
      makeTicket({
        id: "AP-1",
        createdAt: "2026-06-10T09:00:00.000Z",
        updatedAt: "2026-06-11T10:00:00.000Z",
        completedAt: "2026-06-12T11:00:00.000Z"
      }),
      makeTicket({
        id: "AP-2",
        createdAt: "2026-06-09T23:59:59.000Z",
        updatedAt: "2026-06-13T15:00:00.000Z",
        completedAt: "2026-06-14T00:00:01.000Z"
      }),
      makeTicket({
        id: "AP-3",
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-16T10:00:00.000Z"
      })
    ],
    "2026-06-10T00:00:00.000Z",
    "2026-06-14T00:00:00.000Z"
  );

  assert.deepEqual(throughput, {
    created: 2,
    updated: 2,
    completed: 1
  });
});

test("getCompletedTicketFeed returns latest completed tickets within the limit", () => {
  const feed = getCompletedTicketFeed(
    [
      makeTicket({
        id: "AP-OLD",
        title: "Older completed ticket",
        completedAt: "2026-06-11T08:00:00.000Z",
        completedCommit: "aaa111"
      }),
      makeTicket({
        id: "AP-NEW",
        title: "Newest completed ticket",
        completedAt: "2026-06-13T08:00:00.000Z",
        completedCommit: "bbb222"
      }),
      makeTicket({
        id: "AP-MID",
        title: "Middle completed ticket",
        completedAt: "2026-06-12T08:00:00.000Z"
      }),
      makeTicket({
        id: "AP-OPEN",
        title: "Open ticket"
      })
    ],
    2
  );

  assert.deepEqual(feed, [
    {
      id: "AP-NEW",
      title: "Newest completed ticket",
      completedAt: "2026-06-13T08:00:00.000Z",
      completedCommit: "bbb222"
    },
    {
      id: "AP-MID",
      title: "Middle completed ticket",
      completedAt: "2026-06-12T08:00:00.000Z",
      completedCommit: undefined
    }
  ]);
});

test("getRunEfficiencySummary counts run status, merge, files, and verification totals", () => {
  const runs: ReportingRunLike[] = [
    {
      status: "passed",
      merged: true,
      changedFiles: ["src/a.ts", "src/a.test.ts"],
      verification: { passed: 2, failed: 1 }
    },
    {
      result: "failed",
      changedFiles: 3,
      verification: [{ status: "passed" }, { status: "failed" }]
    },
    {
      outcome: "blocked",
      filesChanged: ["src/b.ts"],
      verification: { status: "failed" }
    },
    {
      status: "merged",
      mergedAt: "2026-06-15T12:00:00.000Z"
    }
  ];

  assert.deepEqual(getRunEfficiencySummary(runs), {
    total: 4,
    passed: 1,
    failed: 1,
    blocked: 1,
    merged: 2,
    changedFiles: 6,
    verification: {
      passed: 3,
      failed: 3
    }
  });
});

test("reporting utilities handle empty inputs", () => {
  assert.deepEqual(getTicketThroughput([], "2026-06-01T00:00:00.000Z", "2026-06-30T23:59:59.000Z"), {
    created: 0,
    updated: 0,
    completed: 0
  });
  assert.deepEqual(getCompletedTicketFeed([], 5), []);
  assert.deepEqual(getRunEfficiencySummary([]), {
    total: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    merged: 0,
    changedFiles: 0,
    verification: {
      passed: 0,
      failed: 0
    }
  });
});
