import assert from "node:assert/strict";
import test from "node:test";

import {
  getActivityDashboardModel,
  updatePlannerDateRange,
  type KanbanTicket,
  type PlannerDateRange
} from "./index.ts";

function makeTicket(overrides: Partial<KanbanTicket> = {}): KanbanTicket {
  return {
    id: "AP-TEST",
    title: "Activity test ticket",
    status: "backlog",
    estimate: 3,
    summary: "Activity dashboard regression coverage.",
    tags: [],
    projectId: "atlas-planner",
    epicId: "planner-product",
    epicLabel: "Planner Product",
    projectLabel: "Atlas Planner",
    fitLabel: "",
    description: "Activity dashboard regression coverage.",
    subtasks: [],
    createdAt: "2026-06-10T09:00:00.000Z",
    updatedAt: "2026-06-10T10:00:00.000Z",
    movedAt: "2026-06-10T10:00:00.000Z",
    ...overrides
  };
}

test("updatePlannerDateRange preserves the other bound for rapid functional updates", () => {
  let range: PlannerDateRange = { start: "2026-06-10", end: "2026-06-16" };

  range = updatePlannerDateRange(range, { start: "2026-06-11" });
  range = updatePlannerDateRange(range, { end: "2026-06-17" });

  assert.deepEqual(range, {
    start: "2026-06-11",
    end: "2026-06-17"
  });
});

test("getActivityDashboardModel sorts completed tickets newest first and limits the feed", () => {
  const model = getActivityDashboardModel(
    [
      makeTicket({ id: "AP-1", completedAt: "2026-06-11T09:00:00.000Z" }),
      makeTicket({ id: "AP-2", completedAt: "2026-06-13T09:00:00.000Z" }),
      makeTicket({ id: "AP-3", completedAt: "2026-06-12T09:00:00.000Z" }),
      makeTicket({ id: "AP-4", completedAt: "2026-06-10T09:00:00.000Z" }),
      makeTicket({ id: "AP-5", completedAt: "2026-06-14T09:00:00.000Z" }),
      makeTicket({ id: "AP-6", completedAt: "2026-06-15T09:00:00.000Z" }),
      makeTicket({ id: "AP-OUT", completedAt: "2026-06-20T09:00:00.000Z" })
    ],
    "completed",
    { start: "2026-06-10", end: "2026-06-15" }
  );

  assert.deepEqual(
    model.completedTickets.map((ticket) => ticket.id),
    ["AP-6", "AP-5", "AP-2", "AP-3", "AP-1"]
  );
  assert.equal(model.completedTicketsInRange.length, 6);
});

test("getActivityDashboardModel filters and sorts the selected activity timeline", () => {
  const model = getActivityDashboardModel(
    [
      makeTicket({ id: "AP-OLD", updatedAt: "2026-06-09T09:00:00.000Z" }),
      makeTicket({ id: "AP-MID", updatedAt: "2026-06-12T09:00:00.000Z" }),
      makeTicket({ id: "AP-NEW", updatedAt: "2026-06-13T09:00:00.000Z" }),
      makeTicket({ id: "AP-CREATED", createdAt: "2026-06-13T12:00:00.000Z", updatedAt: "2026-06-20T09:00:00.000Z" })
    ],
    "updated",
    { start: "2026-06-10", end: "2026-06-13" }
  );

  assert.deepEqual(
    model.activityTickets.map((ticket) => ticket.id),
    ["AP-NEW", "AP-MID"]
  );
});
