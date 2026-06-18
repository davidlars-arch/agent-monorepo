import assert from "node:assert/strict";
import test from "node:test";

import {
  completePlannerRun,
  createPlannerRun,
  getLatestRunForTicket,
  startPlannerRun,
  summarizeRunStatus,
  type PlannerRun,
  type PlannerRunEvidence
} from "./runs.ts";

test("create/start/complete lifecycle timestamps", () => {
  const createdAt = "2026-06-17T08:00:00.000Z";
  const startedAt = "2026-06-17T08:15:00.000Z";
  const completedAt = "2026-06-17T09:30:00.000Z";

  const queuedRun = createPlannerRun("AP-1", "worktree/agent-os-core", "/tmp/agent-os-core", createdAt);
  const runningRun = startPlannerRun(queuedRun, startedAt);
  const completedRun = completePlannerRun(
    runningRun,
    "passed",
    { summary: "Implemented planner run lifecycle." },
    completedAt
  );

  assert.equal(queuedRun.status, "queued");
  assert.equal(queuedRun.createdAt, createdAt);
  assert.equal(queuedRun.updatedAt, createdAt);
  assert.equal(queuedRun.startedAt, undefined);
  assert.equal(queuedRun.completedAt, undefined);

  assert.equal(runningRun.status, "running");
  assert.equal(runningRun.createdAt, createdAt);
  assert.equal(runningRun.updatedAt, startedAt);
  assert.equal(runningRun.startedAt, startedAt);
  assert.equal(runningRun.completedAt, undefined);

  assert.equal(completedRun.status, "passed");
  assert.equal(completedRun.createdAt, createdAt);
  assert.equal(completedRun.startedAt, startedAt);
  assert.equal(completedRun.updatedAt, completedAt);
  assert.equal(completedRun.completedAt, completedAt);

  assert.throws(() => startPlannerRun(runningRun, completedAt), /Only queued/);
  assert.throws(() => completePlannerRun(queuedRun, "failed", {}, completedAt), /Only running/);
  assert.throws(() => completePlannerRun(runningRun, "running", {}, completedAt), /terminal status/);
});

test("getLatestRunForTicket selects by updatedAt and completedAt", () => {
  const olderRunningRun = makeRun({
    id: "run-older-running",
    ticketId: "AP-2",
    status: "running",
    updatedAt: "2026-06-17T10:00:00.000Z",
    startedAt: "2026-06-17T09:00:00.000Z"
  });
  const completedRun = makeRun({
    id: "run-completed",
    ticketId: "AP-2",
    status: "passed",
    updatedAt: "2026-06-17T09:30:00.000Z",
    completedAt: "2026-06-17T11:00:00.000Z"
  });
  const newestUpdatedRun = makeRun({
    id: "run-newest-updated",
    ticketId: "AP-2",
    status: "blocked",
    updatedAt: "2026-06-17T12:00:00.000Z",
    completedAt: "2026-06-17T10:30:00.000Z"
  });
  const otherTicketRun = makeRun({
    id: "run-other-ticket",
    ticketId: "AP-3",
    updatedAt: "2026-06-17T13:00:00.000Z"
  });

  assert.equal(
    getLatestRunForTicket([olderRunningRun, completedRun, otherTicketRun], "AP-2")?.id,
    "run-completed"
  );
  assert.equal(
    getLatestRunForTicket([olderRunningRun, completedRun, newestUpdatedRun, otherTicketRun], "AP-2")?.id,
    "run-newest-updated"
  );
  assert.equal(getLatestRunForTicket([olderRunningRun], "AP-missing"), undefined);
});

test("summarizeRunStatus returns counts by status and total", () => {
  const runs: PlannerRun[] = [
    makeRun({ id: "run-queued", status: "queued" }),
    makeRun({ id: "run-running", status: "running" }),
    makeRun({ id: "run-passed-1", status: "passed" }),
    makeRun({ id: "run-passed-2", status: "passed" }),
    makeRun({ id: "run-failed", status: "failed" }),
    makeRun({ id: "run-blocked", status: "blocked" }),
    makeRun({ id: "run-merged", status: "merged" })
  ];

  assert.deepEqual(summarizeRunStatus(runs), {
    queued: 1,
    running: 1,
    passed: 2,
    failed: 1,
    blocked: 1,
    merged: 1,
    total: 7
  });
});

test("completePlannerRun preserves evidence fields", () => {
  const evidence: PlannerRunEvidence = {
    commit: "abc1234",
    changedFiles: ["apps/atlas-planner/src/runs.ts", "apps/atlas-planner/src/runs.test.ts"],
    verification: ["npm run typecheck -w @agent/atlas-planner", "npm run test -w @agent/atlas-planner"],
    summary: "Planner run lifecycle utilities added."
  };
  const run = startPlannerRun(
    createPlannerRun("AP-4", "worktree/agent-os-core", "/tmp/agent-os-core", "2026-06-17T08:00:00.000Z"),
    "2026-06-17T08:05:00.000Z"
  );

  const completedRun = completePlannerRun(run, "merged", evidence, "2026-06-17T08:30:00.000Z");
  evidence.changedFiles?.push("mutated-after-complete.ts");
  evidence.verification?.push("mutated verification");

  assert.deepEqual(completedRun.evidence, {
    commit: "abc1234",
    changedFiles: ["apps/atlas-planner/src/runs.ts", "apps/atlas-planner/src/runs.test.ts"],
    verification: ["npm run typecheck -w @agent/atlas-planner", "npm run test -w @agent/atlas-planner"],
    summary: "Planner run lifecycle utilities added."
  });
});

function makeRun(overrides: Partial<PlannerRun>): PlannerRun {
  return {
    id: "run-default",
    ticketId: "AP-DEFAULT",
    branchName: "worktree/agent-os-core",
    worktreePath: "/tmp/agent-os-core",
    status: "queued",
    createdAt: "2026-06-17T08:00:00.000Z",
    updatedAt: "2026-06-17T08:00:00.000Z",
    ...overrides
  };
}
