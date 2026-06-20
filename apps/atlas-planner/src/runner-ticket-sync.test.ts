import assert from "node:assert/strict";
import test from "node:test";

import { applyRunnerStateToPlannerTickets, type KanbanTicket } from "./index.ts";

function makeTicket(overrides: Partial<KanbanTicket> = {}): KanbanTicket {
  return {
    id: "AP-RUN",
    title: "Run-backed ticket",
    status: "in-progress",
    estimate: 5,
    summary: "Sync runner state back to planner tickets.",
    tags: ["runner"],
    projectId: "atlas-planner",
    epicId: "planner-product",
    epicLabel: "Planner Product",
    projectLabel: "Atlas Planner",
    fitLabel: "",
    description: "Sync runner state back to planner tickets.",
    subtasks: [],
    createdAt: "2026-06-20T10:00:00.000Z",
    updatedAt: "2026-06-20T10:00:00.000Z",
    movedAt: "2026-06-20T10:00:00.000Z",
    ...overrides
  };
}

test("applyRunnerStateToPlannerTickets marks the selected ticket done when runner is satisfied", () => {
  const [ticket] = applyRunnerStateToPlannerTickets([makeTicket()], {
    currentRun: { selectedTask: { id: "AP-RUN" }, updatedAt: "2026-06-20T11:00:00.000Z" },
    runnerState: { status: "satisfied", updatedAt: "2026-06-20T12:00:00.000Z" },
    currentCommit: "abc1234"
  });

  assert.equal(ticket.status, "done");
  assert.equal(ticket.updatedAt, "2026-06-20T12:00:00.000Z");
  assert.equal(ticket.completedAt, "2026-06-20T12:00:00.000Z");
  assert.equal(ticket.completedCommit, "abc1234");
  assert.deepEqual(ticket.tags, ["runner", "runner-satisfied"]);
});

test("applyRunnerStateToPlannerTickets marks failed runner tickets blocked", () => {
  const [ticket] = applyRunnerStateToPlannerTickets([makeTicket()], {
    currentRun: { selectedTask: { id: "AP-RUN" } },
    runnerState: { status: "failed", updatedAt: "2026-06-20T12:30:00.000Z" }
  });

  assert.equal(ticket.status, "blocked");
  assert.equal(ticket.completedAt, undefined);
  assert.equal(ticket.completedCommit, undefined);
  assert.deepEqual(ticket.tags, ["runner", "runner-failed"]);
});

test("applyRunnerStateToPlannerTickets keeps ticket identity when no terminal runner update applies", () => {
  const tickets = [makeTicket()];
  const nextTickets = applyRunnerStateToPlannerTickets(tickets, {
    currentRun: { selectedTask: { id: "AP-RUN" } },
    runnerState: { status: "running", updatedAt: "2026-06-20T12:00:00.000Z" }
  });

  assert.equal(nextTickets, tickets);
});

test("applyRunnerStateToPlannerTickets leaves newer manual ticket edits alone", () => {
  const tickets = [
    makeTicket({
      status: "backlog",
      tags: ["runner-satisfied"],
      updatedAt: "2026-06-20T13:00:00.000Z"
    })
  ];
  const nextTickets = applyRunnerStateToPlannerTickets(tickets, {
    currentRun: { selectedTask: { id: "AP-RUN" } },
    runnerState: { status: "satisfied", updatedAt: "2026-06-20T12:00:00.000Z" },
    currentCommit: "abc1234"
  });

  assert.equal(nextTickets, tickets);
});
