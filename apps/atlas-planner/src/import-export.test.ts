import assert from "node:assert/strict";
import test from "node:test";

import {
  createPlannerStateExport,
  parsePlannerStateImport,
  type KanbanTicket
} from "./index.ts";

const completedAt = "2026-06-16T12:34:56.000Z";
const completedCommit = "abc1234";

function makeTicket(overrides: Partial<KanbanTicket> = {}): KanbanTicket {
  return {
    id: "AP-TEST",
    title: "Verify import/export",
    status: "backlog",
    estimate: 3,
    summary: "Round-trip planner ticket data.",
    tags: ["atlas", "import-export"],
    projectId: "atlas-planner",
    epicId: "domain",
    epicLabel: "Domain",
    projectLabel: "Atlas Planner",
    fitLabel: "",
    description: "Round-trip planner ticket data.",
    subtasks: [{ id: "sub-1", title: "Write focused tests", done: true }],
    createdAt: "2026-06-15T09:00:00.000Z",
    updatedAt: "2026-06-15T10:00:00.000Z",
    movedAt: "2026-06-15T10:30:00.000Z",
    ...overrides
  };
}

test("createPlannerStateExport emits a valid envelope that parsePlannerStateImport accepts", () => {
  const ticket = makeTicket();
  const exported = createPlannerStateExport([ticket]);

  assert.equal(exported.version, 1);
  assert.equal(typeof exported.exportedAt, "string");

  const imported = parsePlannerStateImport(JSON.stringify(exported));

  assert.deepEqual(imported, exported.tickets);
});

test("parsePlannerStateImport accepts raw ticket arrays for compatibility", () => {
  const rawTicket = {
    id: " AP-RAW ",
    title: " Raw import ",
    status: "review",
    estimate: 8,
    summary: "Imported from the older storage shape.",
    description: "Imported from the older storage shape.",
    projectId: "atlas-planner",
    epicId: "compat",
    epicLabel: "Compatibility",
    projectLabel: "Atlas Planner",
    createdAt: "2026-06-15T08:00:00.000Z",
    updatedAt: "2026-06-15T08:30:00.000Z"
  };

  const [ticket] = parsePlannerStateImport(JSON.stringify([rawTicket]));

  assert.equal(ticket.id, "AP-RAW");
  assert.equal(ticket.status, "review");
  assert.equal(ticket.estimate, 8);
  assert.equal(ticket.fitLabel, "");
  assert.deepEqual(ticket.subtasks, []);
  assert.deepEqual(ticket.tags, []);
});

test("parsePlannerStateImport rejects invalid imports", () => {
  assert.throws(
    () => parsePlannerStateImport(JSON.stringify({ version: 1, tickets: "not tickets" })),
    /tickets array/
  );

  assert.throws(
    () => parsePlannerStateImport(JSON.stringify({ version: 1, tickets: [null] })),
    /invalid ticket/
  );
});

test("parsePlannerStateImport hydrates completed ticket metadata without clobbering it", () => {
  const doneTicket = makeTicket({
    id: "AP-DONE",
    status: "done",
    completedAt,
    completedCommit
  });

  const [ticket] = parsePlannerStateImport(JSON.stringify({ version: 1, tickets: [doneTicket] }));

  assert.equal(ticket.status, "done");
  assert.equal(ticket.completedAt, completedAt);
  assert.equal(ticket.completedCommit, completedCommit);
});

test("parsePlannerStateImport hydrates missing completedAt for done tickets", () => {
  const doneTicket = makeTicket({
    id: "AP-DONE-FALLBACK",
    status: "done",
    updatedAt: "2026-06-15T11:00:00.000Z",
    completedCommit
  });
  delete doneTicket.completedAt;

  const [ticket] = parsePlannerStateImport(JSON.stringify({ version: 1, tickets: [doneTicket] }));

  assert.equal(ticket.completedAt, doneTicket.updatedAt);
  assert.equal(ticket.completedCommit, completedCommit);
});
