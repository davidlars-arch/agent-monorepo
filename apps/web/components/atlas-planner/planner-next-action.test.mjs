import assert from "node:assert/strict";
import test from "node:test";

import { getFirstLoopReadiness, getPlannerNextActionState } from "./planner-next-action.ts";

test("planner next action asks for a goal when the board has tickets but no queue", () => {
  const action = getPlannerNextActionState({
    approvedGoalCount: 0,
    currentLoopRun: null,
    currentRunnerState: null,
    visibleTicketCount: 12
  });

  assert.equal(action.kind, "create-goal");
  assert.equal(action.label, "Create goal from board work");
});

test("planner next action claims approved queued goals before starting a runner", () => {
  const action = getPlannerNextActionState({
    approvedGoalCount: 1,
    currentLoopRun: null,
    currentRunnerState: null,
    visibleTicketCount: 12
  });

  assert.equal(action.kind, "claim-goal");
});

test("first loop readiness reflects seeded board and usage before a goal exists", () => {
  const readiness = getFirstLoopReadiness({
    approvedGoalCount: 0,
    currentLoopRun: null,
    currentRunnerState: null,
    hasUsageStatus: true,
    visibleTicketCount: 12
  });

  assert.equal(readiness.percent, 40);
  assert.equal(readiness.steps.filter((step) => step.done).length, 2);
  assert.match(readiness.summary, /Create and approve one goal/);
});

test("first loop readiness reaches full when runner state exists", () => {
  const readiness = getFirstLoopReadiness({
    approvedGoalCount: 0,
    currentLoopRun: { stage: "maker" },
    currentRunnerState: { status: "running" },
    hasUsageStatus: true,
    visibleTicketCount: 1
  });

  assert.equal(readiness.percent, 100);
});
