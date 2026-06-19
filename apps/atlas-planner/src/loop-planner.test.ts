import assert from "node:assert/strict";
import test from "node:test";

import {
  getLoopGoalSummary,
  getLoopPlannerCommand,
  getLoopPlannerDecision,
  type LoopKanbanProject,
  type UsageStatusSnapshot
} from "./index.ts";

const usageStatus: UsageStatusSnapshot = {
  recordedAt: "2026-06-19T08:00:00.000Z",
  model: "gpt-5-codex",
  context: "22% used",
  currentTokens: "12000",
  shortWindow: "48% left",
  weekly: "80% left"
};

function makeProject(overrides: Partial<LoopKanbanProject> = {}): LoopKanbanProject {
  return {
    id: "atlas-planner",
    label: "Atlas Planner",
    nextAction: "Build reliable loop planner behavior.",
    epics: [
      {
        id: "planner-product",
        label: "Planner Product",
        tickets: [
          {
            id: "AP-ACTIVE",
            title: "Continue active loop control",
            status: "in-progress",
            estimate: 8,
            summary: "Fits the current window."
          },
          {
            id: "AP-LARGE",
            title: "Extract planner app",
            status: "backlog",
            estimate: 21,
            summary: "Too large for a medium token window."
          }
        ]
      }
    ],
    ...overrides
  };
}

function makeRepoHealthProject(): LoopKanbanProject {
  return {
    id: "repo-health",
    label: "Repo Health",
    nextAction: "Keep the repo green.",
    epics: [
      {
        id: "repo-safety",
        label: "Repo Safety",
        tickets: [
          {
            id: "RH-1",
            title: "Separate dirty work",
            status: "in-progress",
            estimate: 3,
            summary: "This is globally active but not the planner product focus."
          }
        ]
      }
    ]
  };
}

test("getLoopPlannerCommand picks an active ticket that fits the token window", () => {
  const command = getLoopPlannerCommand([makeProject()], usageStatus);

  assert.equal(command.maxEstimate, 13);
  assert.equal(command.ticket?.id, "AP-ACTIVE");
  assert.equal(command.command, "npm run loop:projects -- --project atlas-planner");
  assert.equal(command.verificationCommand, "npm run loop:projects -- --project atlas-planner --build");
  assert.equal(command.counts["in-progress"], 1);
  assert.match(command.reason, /uses 8\/13 points/);
  assert.equal(command.decision.selected?.breakdown.total, command.decision.candidates[0]?.score);
});

test("getLoopPlannerCommand falls back to listing when no project exists", () => {
  const command = getLoopPlannerCommand([], null);

  assert.equal(command.command, "npm run loop:projects -- --list");
  assert.equal(command.verificationCommand, "npm run loop:projects -- --all --build");
  assert.equal(command.ticket, undefined);
});

test("getLoopPlannerCommand keeps Atlas Planner as the product focus", () => {
  const command = getLoopPlannerCommand([makeRepoHealthProject(), makeProject()], null);

  assert.equal(command.ticket?.id, "AP-ACTIVE");
  assert.equal(command.command, "npm run loop:projects -- --project atlas-planner");
});

test("getLoopPlannerDecision maximizes useful ticket size inside the window", () => {
  const decision = getLoopPlannerDecision(
    [
      makeProject({
        epics: [
          {
            id: "planner-product",
            label: "Planner Product",
            tickets: [
              {
                id: "AP-SMALL",
                title: "Small cleanup",
                status: "backlog",
                estimate: 3,
                summary: "Small but less useful."
              },
              {
                id: "AP-FIT",
                title: "Larger useful slice",
                status: "backlog",
                estimate: 13,
                summary: "Uses the available window cleanly.",
                tags: ["loop-engineering"]
              },
              {
                id: "AP-TOO-BIG",
                title: "Huge extraction",
                status: "backlog",
                estimate: 21,
                summary: "Should be skipped for this window."
              }
            ]
          }
        ]
      })
    ],
    usageStatus,
    { preferredProjectId: "atlas-planner" }
  );

  assert.equal(decision.maxEstimate, 13);
  assert.equal(decision.selected?.ticket.id, "AP-FIT");
  assert.equal(decision.skipped[0]?.ticket.id, "AP-TOO-BIG");
});

test("getLoopGoalSummary counts layered satisfaction status", () => {
  const summary = getLoopGoalSummary([
    makeProject({
      goal: {
        id: "goal-test",
        title: "Layered goal",
        statement: "Prove strict goal scaffolding works.",
        stopCondition: "All layers satisfied.",
        layers: [
          { id: "contract", label: "Contract", status: "satisfied", criteria: ["Has a goal."] },
          { id: "evidence", label: "Evidence", status: "scaffolded", criteria: ["Writes evidence."] },
          { id: "gate", label: "Gate", status: "pending", criteria: ["Needs human gate."] }
        ]
      }
    })
  ]);

  assert.equal(summary.goal?.id, "goal-test");
  assert.equal(summary.totalLayers, 3);
  assert.equal(summary.satisfiedLayers, 1);
  assert.equal(summary.counts.scaffolded, 1);
  assert.equal(summary.counts.pending, 1);
  assert.equal(summary.isSatisfied, false);
});
