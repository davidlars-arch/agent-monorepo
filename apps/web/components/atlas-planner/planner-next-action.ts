type CurrentRunLike = {
  stage: string;
} | null | undefined;

type RunnerStateLike = {
  status: string;
} | null | undefined;

export type PlannerNextActionKind = "claim-goal" | "review-run" | "start-runner" | "create-goal" | "create-ticket";

export function getPlannerNextActionState({
  approvedGoalCount,
  currentLoopRun,
  currentRunnerState,
  visibleTicketCount
}: {
  approvedGoalCount: number;
  currentLoopRun?: CurrentRunLike;
  currentRunnerState?: RunnerStateLike;
  visibleTicketCount: number;
}) {
  if (!currentLoopRun && approvedGoalCount > 0) {
    return {
      kind: "claim-goal" as const,
      label: "Claim approved goal",
      detail: "The queue has approved work. Claim one goal to create the current run before starting the runner."
    };
  }

  if (currentLoopRun && currentRunnerState) {
    return {
      kind: "review-run" as const,
      label: "Review or resume current run",
      detail: "A goal is already claimed. Use current run evidence and runner state before deciding the next move."
    };
  }

  if (currentLoopRun) {
    return {
      kind: "start-runner" as const,
      label: "Start runner",
      detail: "The goal is claimed. Start the runner to produce handoff state, checks, and evidence."
    };
  }

  if (visibleTicketCount > 0) {
    return {
      kind: "create-goal" as const,
      label: "Create goal from board work",
      detail: "Pick the highest-value ticket and turn it into a bounded execution contract."
    };
  }

  return {
    kind: "create-ticket" as const,
    label: "Create the first ticket",
    detail: "Add planning work to this board before creating an executable goal."
  };
}

export function getFirstLoopReadiness({
  approvedGoalCount,
  currentLoopRun,
  currentRunnerState,
  hasUsageStatus,
  visibleTicketCount
}: {
  approvedGoalCount: number;
  currentLoopRun?: CurrentRunLike;
  currentRunnerState?: RunnerStateLike;
  hasUsageStatus: boolean;
  visibleTicketCount: number;
}) {
  const steps = [
    {
      label: "Board seeded",
      done: visibleTicketCount > 0,
      detail: visibleTicketCount > 0 ? `${visibleTicketCount} tickets are visible on this board.` : "Create or import a ticket."
    },
    {
      label: "Usage window known",
      done: hasUsageStatus,
      detail: hasUsageStatus ? "Token runway is available for ticket sizing." : "Run the usage status job or wait for the next snapshot."
    },
    {
      label: "Goal approved",
      done: approvedGoalCount > 0 || Boolean(currentLoopRun),
      detail:
        approvedGoalCount > 0
          ? `${approvedGoalCount} approved goal${approvedGoalCount === 1 ? "" : "s"} can be claimed.`
          : currentLoopRun
            ? "A goal has already been claimed."
            : "Create a goal from the board and approve it to run."
    },
    {
      label: "Current run created",
      done: Boolean(currentLoopRun),
      detail: currentLoopRun ? `Current run is at ${currentLoopRun.stage}.` : "Claim an approved goal to create current-run state."
    },
    {
      label: "Runner evidence started",
      done: Boolean(currentRunnerState),
      detail: currentRunnerState
        ? `Runner state is ${currentRunnerState.status}.`
        : "Start the runner after the current run is claimed."
    }
  ];
  const complete = steps.filter((step) => step.done).length;
  const percent = Math.round((complete / steps.length) * 100);
  const summary =
    percent === 100
      ? "The first loop has everything it needs for review."
      : approvedGoalCount > 0
        ? "Claim the approved goal next, then start the runner."
        : "Create and approve one goal to seed the runner.";

  return { percent, steps, summary };
}
