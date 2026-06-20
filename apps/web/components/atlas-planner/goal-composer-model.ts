import { fibonacciEstimates, type LoopTicketStatus } from "@agent/atlas-planner";
import type { GoalLifecycleStatus } from "@agent/loop-store";
import {
  Bot,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Target,
  WandSparkles
} from "lucide-react";

export type GoalDraft = {
  title: string;
  lifecycleStatus: GoalLifecycleStatus;
  statement: string;
  stopCondition: string;
  scope: string;
  maxEstimate: number;
  layers: GoalDraftLayer[];
  verificationCommands: GoalVerificationCommand[];
  safety: GoalSafetySettings;
  approvedToRun: boolean;
};

export type GoalDraftLayer = {
  id: string;
  label: string;
  criteria: string;
  status: "pending" | "scaffolded" | "satisfied" | "blocked";
  humanGated: boolean;
};

export type GoalVerificationCommand = {
  id: string;
  label: string;
  command: string;
  required: boolean;
};

export type GoalSafetySettings = {
  maxIterations: number;
  maxRepairAttempts: number;
  tokenBudget: string;
  timeBudget: string;
  allowedPaths: string;
  externalActionPolicy: "disabled" | "pr-only" | "human-gated" | "auto-merge";
};

export const goalLifecycleStages: Array<{ id: GoalLifecycleStatus; label: string; detail: string }> = [
  {
    id: "draft",
    label: "Draft",
    detail: "Raw human intent exists, but the loop contract is not ready."
  },
  {
    id: "refined",
    label: "Refined",
    detail: "Outcome, stop condition, layers, proof, and limits are defined."
  },
  {
    id: "approved",
    label: "Approved",
    detail: "The goal is allowed to enter the next loop run."
  },
  {
    id: "running",
    label: "Running",
    detail: "A loop is actively working the bounded slice."
  },
  {
    id: "blocked",
    label: "Blocked",
    detail: "The loop needs human input, budget, credentials, or a policy decision."
  },
  {
    id: "satisfied",
    label: "Satisfied",
    detail: "All layers and required verification have passed."
  },
  {
    id: "archived",
    label: "Archived",
    detail: "The goal is closed and kept as historical evidence."
  }
];

export const goalTimeline = [
  {
    id: "idea",
    label: "Idea",
    icon: Target,
    detail: "A person writes the raw goal in plain language: what should be better, fixed, or built."
  },
  {
    id: "refine",
    label: "Refine",
    icon: WandSparkles,
    detail: "Atlas Planner turns the raw idea into a strict goal, stop condition, scope, and satisfaction layers."
  },
  {
    id: "score",
    label: "Score",
    icon: ListChecks,
    detail: "The planner reads usage/window state, scores tickets, and picks the highest-value task that fits."
  },
  {
    id: "branch",
    label: "Branch",
    icon: GitBranch,
    detail: "The loop creates an isolated branch or worktree so agent work cannot trample main."
  },
  {
    id: "maker",
    label: "Maker",
    icon: Bot,
    detail: "The maker agent implements one bounded slice and records what changed."
  },
  {
    id: "checker",
    label: "Checker",
    icon: ShieldCheck,
    detail: "A separate reviewer checks the diff, goal layers, tests, risk, and missing evidence."
  },
  {
    id: "repair",
    label: "Repair",
    icon: RefreshCw,
    detail: "If the checker finds blockers, the loop sends them back to the maker for a capped repair cycle."
  },
  {
    id: "pr",
    label: "PR",
    icon: GitPullRequest,
    detail: "When local verification passes, the loop opens or updates a PR with the goal and evidence."
  },
  {
    id: "merge",
    label: "Merge",
    icon: GitMerge,
    detail: "After CI, review, and goal gates pass, merge can be automated behind explicit safety rules."
  },
  {
    id: "sync",
    label: "Sync",
    icon: GitCommitHorizontal,
    detail: "After merge, the loop pulls main, cleans up, and starts a fresh branch for the next goal."
  }
];

export function getDefaultGoalDraft(): GoalDraft {
  return {
    title: "",
    lifecycleStatus: "draft",
    statement: "",
    stopCondition: "",
    scope: "",
    maxEstimate: 8,
    layers: getDefaultGoalLayers(),
    verificationCommands: getDefaultVerificationCommands(),
    safety: getDefaultGoalSafetySettings(),
    approvedToRun: false
  };
}

export function getTicketStatusForGoalLifecycle(
  lifecycleStatus: GoalLifecycleStatus,
  approvedToRun: boolean
): LoopTicketStatus {
  if (lifecycleStatus === "blocked") {
    return "blocked";
  }
  if (lifecycleStatus === "satisfied" || lifecycleStatus === "archived") {
    return "done";
  }
  if (lifecycleStatus === "approved" || lifecycleStatus === "running" || approvedToRun) {
    return "in-progress";
  }
  return "backlog";
}

export function getDefaultGoalLayers(): GoalDraftLayer[] {
  return [
    {
      id: "goal-contract",
      label: "Goal contract",
      status: "scaffolded",
      criteria: "Goal statement, stop condition, scope, and satisfaction layers are explicit.",
      humanGated: false
    },
    {
      id: "budgeted-selection",
      label: "Budgeted selection",
      status: "scaffolded",
      criteria: "Selected task fits the current token window and records deferred larger work.",
      humanGated: false
    },
    {
      id: "maker-checker",
      label: "Maker/checker",
      status: "pending",
      criteria: "Maker output is reviewed by a separate checker before satisfaction is claimed.",
      humanGated: false
    },
    {
      id: "evidence-memory",
      label: "Evidence memory",
      status: "scaffolded",
      criteria: "Report, decision log, and state capture what happened and why.",
      humanGated: false
    },
    {
      id: "human-gate",
      label: "Human gate",
      status: "pending",
      criteria: "External actions and merge require approval until the loop has proven itself.",
      humanGated: true
    }
  ];
}

export function getDefaultVerificationCommands(): GoalVerificationCommand[] {
  return [
    {
      id: "typecheck-web",
      label: "Web typecheck",
      command: "npm run typecheck -w @agent/web",
      required: true
    },
    {
      id: "lint-web",
      label: "Web lint",
      command: "npm run lint -w @agent/web",
      required: true
    },
    {
      id: "test-atlas",
      label: "Atlas planner tests",
      command: "npm run test -w @agent/atlas-planner",
      required: true
    },
    {
      id: "build-web",
      label: "Web production build",
      command: "npm run build -w @agent/web",
      required: true
    }
  ];
}

export function getDefaultGoalSafetySettings(): GoalSafetySettings {
  return {
    maxIterations: 6,
    maxRepairAttempts: 3,
    tokenBudget: "Use latest daily/weekly usage window; prefer tasks <= first slice cap.",
    timeBudget: "Stop after one focused task or 45 minutes without a fresh approval.",
    allowedPaths: "apps/web/**, apps/atlas-planner/**, loops/project-controller/**, scripts/project-loop.mjs",
    externalActionPolicy: "human-gated"
  };
}

export function getGoalContractPreview(draft: GoalDraft) {
  const title = draft.title.trim() || "Untitled loop goal";
  const statement = draft.statement.trim() || "Refine the rough idea into a concrete outcome before implementation.";
  const stopCondition =
    draft.stopCondition.trim() ||
    "Stop when verification passes, evidence is recorded, and the next action needs human judgment.";
  const scope = draft.scope.trim() || "Scope is not set yet; keep the first run in planning mode until limits are clear.";

  return {
    title,
    outcome: statement,
    stopCondition,
    scope,
    maxEstimate: draft.maxEstimate,
    layers: draft.layers,
    verification: draft.verificationCommands.filter((command) => command.required),
    safety: [
      `Max first slice: ${draft.maxEstimate} points`,
      `Max iterations: ${draft.safety.maxIterations}`,
      `Max repair attempts: ${draft.safety.maxRepairAttempts}`,
      `Token budget: ${draft.safety.tokenBudget}`,
      `Time budget: ${draft.safety.timeBudget}`,
      `Allowed paths: ${draft.safety.allowedPaths}`,
      `External actions: ${draft.safety.externalActionPolicy}`
    ]
  };
}

export { fibonacciEstimates };
