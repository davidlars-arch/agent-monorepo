"use client";

import {
  buildPlannerTickets,
  createPlannerStateExport,
  fibonacciEstimates,
  formatPlannerDate,
  formatPlannerDateTime,
  getDefaultDateRange,
  getDefaultPlannerTicket,
  getKanbanColumns,
  getLoopGoalSummary,
  getLoopPlannerCommand,
  getTicketTimestamp,
  getUsageMetrics,
  getWindowDecisionLabel,
  hydratePlannerTickets,
  isTimestampInRange,
  normalizePlannerTicket,
  normalizeTicketTag,
  parsePlannerStateImport,
  plannerTicketStorageKey,
  ticketStatuses,
  type KanbanTicket,
  type LoopKanbanProject,
  type LoopPlannerCommand,
  type LoopTicketStatus,
  type PlannerDateFilter,
  type PlannerSubtask,
  type PlannerTicketDraft,
  type UsageStatusSnapshot
} from "@agent/atlas-planner";
import type {
  ControllerMemorySummary,
  CurrentLoopRunSummary,
  GoalLifecycleStatus,
  QueuedGoalSummary,
  RunnerEvidenceSummary,
  RunnerStateSummary
} from "@agent/loop-store";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clipboard,
  Clock3,
  GitBranch,
  Download,
  FileText,
  FolderGit2,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  ListChecks,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Tags,
  Target,
  Upload,
  WandSparkles,
  Workflow,
  X
} from "lucide-react";
import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

type LoopSummary = {
  id: string;
  label: string;
  cadence: string;
  permission: string;
  commit: string;
  summary: string;
  status: "ready" | "registered" | "blocked";
};

type LoopFile = {
  path: string;
  role: string;
};

type GoalDraft = {
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

type GoalDraftLayer = {
  id: string;
  label: string;
  criteria: string;
  status: "pending" | "scaffolded" | "satisfied" | "blocked";
  humanGated: boolean;
};

type GoalVerificationCommand = {
  id: string;
  label: string;
  command: string;
  required: boolean;
};

type GoalSafetySettings = {
  maxIterations: number;
  maxRepairAttempts: number;
  tokenBudget: string;
  timeBudget: string;
  allowedPaths: string;
  externalActionPolicy: "disabled" | "pr-only" | "human-gated" | "auto-merge";
};

const goalLifecycleStages: Array<{ id: GoalLifecycleStatus; label: string; detail: string }> = [
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

const loopSummaries: LoopSummary[] = [
  {
    id: "project-controller",
    label: "Atlas Planner",
    cadence: "Runs due loops",
    permission: "registry controlled",
    commit: "c445d7d · chore: add project loop controller",
    summary: "Adds the central registry, lock, local state, latest report, project selection, dry-run mode, and build-mode execution.",
    status: "ready"
  },
  {
    id: "repo-health",
    label: "Repo Health",
    cadence: "Every 24h",
    permission: "build-local",
    commit: "65ff02e · chore: organize project sphere workspace tooling",
    summary: "Keeps the monorepo green with typecheck, lint, optional build, dirty-worktree detection, and TODO sampling.",
    status: "ready"
  },
  {
    id: "web-atlas",
    label: "Web Atlas",
    cadence: "Every 24h",
    permission: "build-local-and-commit",
    commit: "9b8cdc7 · chore: add web atlas loop",
    summary: "Checks the Project Sphere web surface, repo graph metadata, shared UI package, and atlas surface files.",
    status: "ready"
  },
  {
    id: "crypto-tax-sweden",
    label: "Crypto Tax Sweden",
    cadence: "Every 72h",
    permission: "build-local-and-commit",
    commit: "c445d7d · registered in project controller",
    summary: "Runs the tax app checks and queues focused work around CSV edge cases, review flow, exports, and evidence trails.",
    status: "registered"
  },
  {
    id: "crypto-trader-test",
    label: "Crypto Trader Test",
    cadence: "Every 72h",
    permission: "dry-run-only-and-commit",
    commit: "c445d7d · registered in project controller",
    summary: "Runs safe trader checks and dry-run-only automation. Live trading is deliberately excluded from the loop.",
    status: "registered"
  },
  {
    id: "rpg-slice",
    label: "RPG Slice",
    cadence: "Every 72h",
    permission: "build-local-and-commit",
    commit: "c445d7d · registered in project controller",
    summary: "Tracks the Unity/WebGL slice, browser mock parity, and original JRPG-style gameplay increments.",
    status: "registered"
  },
  {
    id: "analytics-dbt",
    label: "Analytics dbt POC",
    cadence: "Every 168h",
    permission: "plan-until-dbt-installed",
    commit: "c445d7d · registered in project controller",
    summary: "Records the dbt analytics loop as blocked until dbt is available on PATH, then runs local DuckDB models.",
    status: "blocked"
  },
  {
    id: "workspace-memory",
    label: "Workspace Maintenance",
    cadence: "Every 168h",
    permission: "internal-edits-only",
    commit: "c445d7d · registered in project controller",
    summary: "Keeps OpenClaw memory and heartbeat notes maintained without leaking private workspace context.",
    status: "registered"
  }
];

const loopFiles: LoopFile[] = [
  {
    path: "loops/project-controller/projects.json",
    role: "Committed registry: project ids, cadence, permissions, commands, build commands, and next actions."
  },
  {
    path: "loops/project-controller/LOOP.md",
    role: "Human-readable controller contract: purpose, cadence, state files, and expansion points."
  },
  {
    path: "loops/project-controller/PROMPT.md",
    role: "Agent runbook for operating the controller and choosing the next build slice."
  },
  {
    path: "loops/project-controller/state.json",
    role: "Ignored local memory: last run time, status, command counts, and short run history."
  },
  {
    path: "loops/project-controller/latest-report.md",
    role: "Ignored latest report: selected projects, pass/block/fail state, and next controller action."
  },
  {
    path: "loops/project-controller/decisions.jsonl",
    role: "Ignored append-only planner audit trail: selected ticket, score, token budget, reason, and deferred larger work."
  },
  {
    path: "loops/*/LOOP.md",
    role: "Durable child-loop contract for one project area."
  },
  {
    path: "loops/*/PROMPT.md",
    role: "Agent prompt/runbook for executing that child loop safely."
  },
  {
    path: "scripts/project-loop.mjs",
    role: "Controller runner: lock, select due projects, execute commands, write state/report."
  }
];

const reliabilityPrimitives = [
  {
    label: "Automation",
    value: "Cadence owns discovery",
    detail: "The loop finds due projects instead of waiting for a fresh human prompt."
  },
  {
    label: "Isolation",
    value: "Worktree before parallel work",
    detail: "Agents can draft fixes without trampling the active checkout."
  },
  {
    label: "Skills",
    value: "Project rules live outside chat",
    detail: "Repeatable loop knowledge belongs in skills and loop markdown, not pasted prompts."
  },
  {
    label: "Connectors",
    value: "External actions stay explicit",
    detail: "Issues, messages, and PR updates need an approved connector path."
  },
  {
    label: "Maker / checker",
    value: "Verifier grades the work",
    detail: "The agent that builds should not be the only one deciding that it is done."
  },
  {
    label: "State memory",
    value: "The repo remembers",
    detail: "State files and reports carry progress across cold starts."
  }
];

const goalTimeline = [
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

const loopRunTimelineSteps = [
  {
    id: "queued",
    label: "Queued",
    icon: Target,
    detail: "A goal or ticket is selected and waiting for the loop runner."
  },
  {
    id: "scored",
    label: "Scored",
    icon: ListChecks,
    detail: "Usage window, Fibonacci size, readiness, and risk are checked before work starts."
  },
  {
    id: "branch",
    label: "Branch",
    icon: GitBranch,
    detail: "The loop enters an isolated branch or worktree for the selected slice."
  },
  {
    id: "maker",
    label: "Maker",
    icon: Bot,
    detail: "The maker agent implements one bounded change and records the diff."
  },
  {
    id: "checker",
    label: "Checker",
    icon: ShieldCheck,
    detail: "A separate reviewer checks goal layers, risk, and missing evidence."
  },
  {
    id: "verify",
    label: "Verify",
    icon: CheckCircle2,
    detail: "Required commands must pass before the loop can claim satisfaction."
  },
  {
    id: "pr",
    label: "PR",
    icon: GitPullRequest,
    detail: "The loop opens or updates a pull request with the evidence trail."
  },
  {
    id: "merge",
    label: "Merge",
    icon: GitMerge,
    detail: "Merge stays gated until checks, review, and policy allow it."
  },
  {
    id: "sync",
    label: "Sync",
    icon: GitCommitHorizontal,
    detail: "After merge, main is pulled and the next branch can begin cleanly."
  }
];

const loopEvidenceSources = [
  {
    label: "Latest report",
    path: "loops/project-controller/latest-report.md",
    status: "local memory",
    detail: "Human-readable summary of the last controller run, blockers, and next action."
  },
  {
    label: "Controller state",
    path: "loops/project-controller/state.json",
    status: "local memory",
    detail: "Run timestamps, command counts, status history, and loop bookkeeping."
  },
  {
    label: "Decision log",
    path: "loops/project-controller/decisions.jsonl",
    status: "audit trail",
    detail: "Append-only selected ticket, score, token gate, reason, and deferred work."
  },
  {
    label: "Usage window",
    path: "loops/usage-status/latest-status.json",
    status: "budget input",
    detail: "Current daily and weekly runway used to choose a sane first slice."
  },
  {
    label: "Verification output",
    path: "npm scripts and build logs",
    status: "required proof",
    detail: "Typecheck, lint, tests, build, screenshots, and reviewer findings before satisfaction."
  },
  {
    label: "PR evidence",
    path: "GitHub PR link",
    status: "future connector",
    detail: "PR, CI status, review comments, merge result, and post-merge sync evidence."
  }
];

const prMergeGates = [
  {
    label: "PR creation",
    icon: GitPullRequest,
    status: "planned",
    detail: "Open or update a PR only after required local verification is green."
  },
  {
    label: "CI checks",
    icon: CheckCircle2,
    status: "required",
    detail: "Remote checks must pass before review or merge can advance."
  },
  {
    label: "Subagent review",
    icon: ShieldCheck,
    status: "required",
    detail: "A checker reviews the diff, satisfaction layers, risk, and missing evidence."
  },
  {
    label: "Repair loop",
    icon: RefreshCw,
    status: "bounded",
    detail: "Reviewer blockers loop back to maker until fixed or the repair cap is hit."
  },
  {
    label: "Merge gate",
    icon: GitMerge,
    status: "human-gated",
    detail: "Merge remains approval-gated until policy is deliberately loosened."
  },
  {
    label: "Sync main",
    icon: GitCommitHorizontal,
    status: "required",
    detail: "After merge, pull main, clean the branch/worktree, and start fresh."
  }
];

function getLoopRunTimeline(command: LoopPlannerCommand) {
  return loopRunTimelineSteps.map((step, index) => {
    if (!command.ticket) {
      return {
        ...step,
        status: index === 0 ? "waiting" : "locked",
        evidence: index === 0 ? "No actionable ticket selected yet." : "Locked until a ticket is selected."
      };
    }

    if (index <= 1) {
      return {
        ...step,
        status: "ready",
        evidence:
          index === 0
            ? `${command.ticket.id} is selected for the next run.`
            : `Planner score ${command.decision.selected?.score ?? 0}; cap ${command.maxEstimate} pts.`
      };
    }

    if (index === 2) {
      return {
        ...step,
        status: "next",
        evidence: "Next required action before maker work starts."
      };
    }

    return {
      ...step,
      status: "locked",
      evidence: "Locked until previous stage records evidence."
    };
  });
}

function getDefaultGoalDraft(): GoalDraft {
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

function getTicketStatusForGoalLifecycle(lifecycleStatus: GoalLifecycleStatus, approvedToRun: boolean): LoopTicketStatus {
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

function getDefaultGoalLayers(): GoalDraftLayer[] {
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

function getDefaultVerificationCommands(): GoalVerificationCommand[] {
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

function getDefaultGoalSafetySettings(): GoalSafetySettings {
  return {
    maxIterations: 6,
    maxRepairAttempts: 3,
    tokenBudget: "Use latest daily/weekly usage window; prefer tasks <= first slice cap.",
    timeBudget: "Stop after one focused task or 45 minutes without a fresh approval.",
    allowedPaths: "apps/web/**, apps/atlas-planner/**, loops/project-controller/**, scripts/project-loop.mjs",
    externalActionPolicy: "human-gated"
  };
}

function getGoalContractPreview(draft: GoalDraft) {
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

function getAgentRunSlug(ticket: PlannerTicketDraft) {
  const sourceLabel = ticket.id || ticket.title || "ticket";
  const slug = sourceLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "ticket";
}

function getAgentRunSuggestions(ticket: PlannerTicketDraft) {
  const ticketSlug = getAgentRunSlug(ticket);
  const branch = `worktree/${ticketSlug}`;
  const ticketArg =
    ticket.id
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || ticketSlug;

  return {
    branch,
    command: `node scripts/planner-agent-runner.mjs --ticket ${ticketArg} --branch ${branch}`,
    runState:
      ticket.status === "done"
        ? "Complete placeholder"
        : ticket.status === "in-progress"
          ? "Ready placeholder"
          : "Queued placeholder",
    worktree: `agent-monorepo-${ticketSlug}`
  };
}

function formatRelativeUsageTime(timestamp: string | undefined, now: number) {
  if (!timestamp) {
    return "Updated unknown";
  }

  const recordedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(recordedAt)) {
    return "Updated unknown";
  }

  const diffSeconds = Math.max(0, Math.floor((now - recordedAt) / 1000));
  if (diffSeconds < 45) {
    return "Updated just now";
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `Updated ${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return `Updated ${diffHours} hr ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Updated ${diffDays} d ago`;
}

export function AtlasPlannerOverview({
  usageStatus,
  loopKanban,
  queuedGoals,
  currentLoopRun,
  currentRunnerState,
  currentRunnerEvidence,
  controllerMemory,
  currentCommit,
  initialGoalComposerOpen = false,
  showExplainer,
  onToggleExplainer,
  onClose
}: {
  usageStatus?: UsageStatusSnapshot | null;
  loopKanban: LoopKanbanProject[];
  queuedGoals?: QueuedGoalSummary[];
  currentLoopRun?: CurrentLoopRunSummary | null;
  currentRunnerState?: RunnerStateSummary | null;
  currentRunnerEvidence?: RunnerEvidenceSummary | null;
  controllerMemory?: ControllerMemorySummary | null;
  currentCommit: string;
  initialGoalComposerOpen?: boolean;
  showExplainer: boolean;
  onToggleExplainer: () => void;
  onClose: () => void;
}) {
  const [latestUsageStatus, setLatestUsageStatus] = useState<UsageStatusSnapshot | null>(usageStatus ?? null);
  const [usageClock, setUsageClock] = useState(() => Date.now());
  const [isUsageRefreshing, setIsUsageRefreshing] = useState(false);
  const usageMetrics = latestUsageStatus ? getUsageMetrics(latestUsageStatus) : [];
  const [plannerTickets, setPlannerTickets] = useState<KanbanTicket[]>(() => buildPlannerTickets(loopKanban));
  const [hasLoadedPlannerState, setHasLoadedPlannerState] = useState(false);
  const [editingTicket, setEditingTicket] = useState<PlannerTicketDraft | null>(null);
  const [isTicketEditorClosing, setIsTicketEditorClosing] = useState(false);
  const [isActivityDashboardOpen, setIsActivityDashboardOpen] = useState(false);
  const [isGoalComposerOpen, setIsGoalComposerOpen] = useState(initialGoalComposerOpen);
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(() => getDefaultGoalDraft());
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LoopTicketStatus | null>(null);
  const [activityDateFilter, setActivityDateFilter] = useState<PlannerDateFilter>("updated");
  const [activityDateRange, setActivityDateRange] = useState(getDefaultDateRange);
  const [queuedGoalState, setQueuedGoalState] = useState<QueuedGoalSummary[]>(() => queuedGoals ?? []);
  const editorCloseTimeoutRef = useRef<number | null>(null);
  const plannerImportInputRef = useRef<HTMLInputElement | null>(null);
  const suppressTicketClickRef = useRef(false);
  const suppressTicketClickTimeoutRef = useRef<number | null>(null);
  const [plannerStateMessage, setPlannerStateMessage] = useState("");
  const kanbanColumns = getKanbanColumns(plannerTickets, latestUsageStatus);
  const loopPlannerCommand = getLoopPlannerCommand(loopKanban, latestUsageStatus);
  const loopGoalSummary = getLoopGoalSummary(loopKanban);
  const loopRunTimeline = getLoopRunTimeline(loopPlannerCommand);
  const durableQueuedGoals = queuedGoalState;
  const completedTicketsInRange = plannerTickets.filter((ticket) =>
    isTimestampInRange(ticket.completedAt, activityDateRange.start, activityDateRange.end)
  );
  const completedTickets = [...completedTicketsInRange]
    .sort((left, right) => new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime())
    .slice(0, 5);
  const activityTickets = plannerTickets
    .filter((ticket) =>
      isTimestampInRange(getTicketTimestamp(ticket, activityDateFilter), activityDateRange.start, activityDateRange.end)
    )
    .sort(
      (left, right) =>
        new Date(getTicketTimestamp(right, activityDateFilter) ?? 0).getTime() -
        new Date(getTicketTimestamp(left, activityDateFilter) ?? 0).getTime()
    )
    .slice(0, 8);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(plannerTicketStorageKey);
        const defaultTickets = buildPlannerTickets(loopKanban);
        if (!stored) {
          setPlannerTickets(defaultTickets);
          return;
        }

        const storedTickets = hydratePlannerTickets(JSON.parse(stored) as KanbanTicket[]);
        const storedTicketIds = new Set(storedTickets.map((ticket) => ticket.id));
        setPlannerTickets([...storedTickets, ...defaultTickets.filter((ticket) => !storedTicketIds.has(ticket.id))]);
      } catch {
        setPlannerTickets(buildPlannerTickets(loopKanban));
      } finally {
        setHasLoadedPlannerState(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loopKanban]);

  useEffect(() => {
    if (!hasLoadedPlannerState || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(plannerTicketStorageKey, JSON.stringify(plannerTickets));
  }, [hasLoadedPlannerState, plannerTickets]);

  useEffect(() => {
    return () => {
      if (editorCloseTimeoutRef.current) {
        window.clearTimeout(editorCloseTimeoutRef.current);
      }
      if (suppressTicketClickTimeoutRef.current) {
        window.clearTimeout(suppressTicketClickTimeoutRef.current);
      }
    };
  }, []);

  async function refreshUsageStatus() {
    setIsUsageRefreshing(true);
    try {
      const response = await fetch("/api/usage-status", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const nextUsageStatus = (await response.json()) as UsageStatusSnapshot | null;
      setLatestUsageStatus(nextUsageStatus);
      setUsageClock(Date.now());
    } catch {
      // Keep the latest known snapshot visible if the local status file is temporarily unavailable.
    } finally {
      setIsUsageRefreshing(false);
    }
  }

  function moveTicket(ticketId: string, status: LoopTicketStatus) {
    const now = new Date().toISOString();
    setPlannerTickets((current) =>
      current.map((ticket) => {
        if (ticket.id !== ticketId || ticket.status === status) {
          return ticket;
        }

        return {
          ...ticket,
          status,
          updatedAt: now,
          movedAt: now,
          completedAt: status === "done" ? now : undefined,
          completedCommit: status === "done" ? currentCommit : undefined
        };
      })
    );
  }

  function suppressTicketClick() {
    suppressTicketClickRef.current = true;
    if (suppressTicketClickTimeoutRef.current) {
      window.clearTimeout(suppressTicketClickTimeoutRef.current);
    }
    suppressTicketClickTimeoutRef.current = window.setTimeout(() => {
      suppressTicketClickRef.current = false;
      suppressTicketClickTimeoutRef.current = null;
    }, 250);
  }

  function clearDragState() {
    setDraggingTicketId(null);
    setDragOverStatus(null);
  }

  function handleColumnDragOver(event: DragEvent<HTMLElement>, status: LoopTicketStatus) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  }

  function handleColumnDragLeave(event: DragEvent<HTMLElement>, status: LoopTicketStatus) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDragOverStatus((current) => (current === status ? null : current));
  }

  function handleDrop(event: DragEvent<HTMLElement>, status: LoopTicketStatus) {
    event.preventDefault();
    suppressTicketClick();
    const ticketId = event.dataTransfer.getData("text/plain");
    if (ticketId) {
      moveTicket(ticketId, status);
    }
    clearDragState();
  }

  function handleTicketClick(event: ReactMouseEvent<HTMLElement>, ticket: PlannerTicketDraft) {
    if (suppressTicketClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    openTicketEditor(ticket);
  }

  function saveEditingTicket() {
    if (!editingTicket) {
      return;
    }

    const normalizedTicket = normalizePlannerTicket(editingTicket);
    setPlannerTickets((current) => {
      const existingTicket = current.find((ticket) => ticket.id === normalizedTicket.id);
      const movedAt =
        existingTicket && existingTicket.status !== normalizedTicket.status ? normalizedTicket.updatedAt : normalizedTicket.movedAt;
      const completedAt =
        normalizedTicket.status === "done"
          ? existingTicket?.status === "done"
            ? normalizedTicket.completedAt
            : normalizedTicket.updatedAt
          : undefined;
      const completedCommit =
        normalizedTicket.status === "done"
          ? existingTicket?.status === "done"
            ? normalizedTicket.completedCommit ?? currentCommit
            : currentCommit
          : undefined;
      const ticketToSave = {
        ...normalizedTicket,
        movedAt,
        completedAt,
        completedCommit
      };

      const exists = Boolean(existingTicket);
      if (exists) {
        return current.map((ticket) => (ticket.id === normalizedTicket.id ? ticketToSave : ticket));
      }
      return [ticketToSave, ...current];
    });
    closeTicketEditor();
  }

  function deleteEditingTicket() {
    if (!editingTicket) {
      return;
    }

    setPlannerTickets((current) => current.filter((ticket) => ticket.id !== editingTicket.id));
    closeTicketEditor();
  }

  function openTicketEditor(ticket: PlannerTicketDraft) {
    if (editorCloseTimeoutRef.current) {
      window.clearTimeout(editorCloseTimeoutRef.current);
    }
    setIsTicketEditorClosing(false);
    setEditingTicket({ ...ticket, tags: ticket.tags ?? [] });
  }

  function closeTicketEditor() {
    if (editorCloseTimeoutRef.current) {
      window.clearTimeout(editorCloseTimeoutRef.current);
    }
    setIsTicketEditorClosing(true);
    editorCloseTimeoutRef.current = window.setTimeout(() => {
      setEditingTicket(null);
      setIsTicketEditorClosing(false);
      editorCloseTimeoutRef.current = null;
    }, 180);
  }

  function updateEditingTicket(update: Partial<PlannerTicketDraft>) {
    setEditingTicket((current) => (current ? { ...current, ...update } : current));
  }

  function addSubtask() {
    setEditingTicket((current) =>
      current
        ? {
            ...current,
            subtasks: [
              ...current.subtasks,
              { id: `sub-${Date.now().toString(36)}`, title: "", done: false }
            ]
          }
        : current
    );
  }

  function updateSubtask(subtaskId: string, update: Partial<PlannerSubtask>) {
    setEditingTicket((current) =>
      current
        ? {
            ...current,
            subtasks: current.subtasks.map((subtask) =>
              subtask.id === subtaskId ? { ...subtask, ...update } : subtask
            )
          }
        : current
    );
  }

  function removeSubtask(subtaskId: string) {
    setEditingTicket((current) =>
      current
        ? {
            ...current,
            subtasks: current.subtasks.filter((subtask) => subtask.id !== subtaskId)
          }
        : current
    );
  }

  function exportPlannerState() {
    if (typeof window === "undefined") {
      return;
    }

    const plannerState = createPlannerStateExport(plannerTickets);
    const stateBlob = new Blob([JSON.stringify(plannerState, null, 2)], { type: "application/json" });
    const stateUrl = window.URL.createObjectURL(stateBlob);
    const link = document.createElement("a");
    link.href = stateUrl;
    link.download = `atlas-planner-${plannerState.exportedAt.slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(stateUrl);
    setPlannerStateMessage(`Exported ${plannerState.tickets.length} tickets.`);
  }

  function importPlannerState(file: File | undefined) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const importedTickets = parsePlannerStateImport(String(reader.result ?? ""));
        setPlannerTickets(importedTickets);
        setPlannerStateMessage(`Imported ${importedTickets.length} tickets.`);
      } catch {
        setPlannerStateMessage("Import failed. Use an Atlas Planner JSON export.");
      }
    });
    reader.readAsText(file);
  }

  function resetPlannerState() {
    const defaultTickets = buildPlannerTickets(loopKanban);
    setPlannerTickets(defaultTickets);
    setPlannerStateMessage(`Reset to ${defaultTickets.length} default tickets.`);
  }

  function updateGoalDraft(update: Partial<GoalDraft>) {
    setGoalDraft((current) => ({ ...current, ...update }));
  }

  function updateGoalSafety(update: Partial<GoalSafetySettings>) {
    setGoalDraft((current) => ({
      ...current,
      safety: { ...current.safety, ...update }
    }));
  }

  function addGoalLayer() {
    setGoalDraft((current) => ({
      ...current,
      layers: [
        ...current.layers,
        {
          id: `layer-${Date.now().toString(36)}`,
          label: "New layer",
          criteria: "Describe what must be true for this layer to count as satisfied.",
          status: "pending",
          humanGated: false
        }
      ]
    }));
  }

  function updateGoalLayer(layerId: string, update: Partial<GoalDraftLayer>) {
    setGoalDraft((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === layerId ? { ...layer, ...update } : layer))
    }));
  }

  function removeGoalLayer(layerId: string) {
    setGoalDraft((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== layerId)
    }));
  }

  function addVerificationCommand() {
    setGoalDraft((current) => ({
      ...current,
      verificationCommands: [
        ...current.verificationCommands,
        {
          id: `verify-${Date.now().toString(36)}`,
          label: "Custom check",
          command: "npm run test",
          required: true
        }
      ]
    }));
  }

  function updateVerificationCommand(commandId: string, update: Partial<GoalVerificationCommand>) {
    setGoalDraft((current) => ({
      ...current,
      verificationCommands: current.verificationCommands.map((command) =>
        command.id === commandId ? { ...command, ...update } : command
      )
    }));
  }

  function removeVerificationCommand(commandId: string) {
    setGoalDraft((current) => ({
      ...current,
      verificationCommands: current.verificationCommands.filter((command) => command.id !== commandId)
    }));
  }

  function closeGoalComposer() {
    setIsGoalComposerOpen(false);
  }

  async function saveGoalDraft() {
    const project = loopKanban.find((candidate) => candidate.id === "atlas-planner") ?? loopKanban[0];
    const epic = project?.epics?.find((candidate) => candidate.id === "planner-product") ?? project?.epics?.[0];
    const now = new Date().toISOString();
    const title = goalDraft.title.trim() || "New loop goal";
    const statement = goalDraft.statement.trim() || "Goal statement not written yet.";
    const stopCondition = goalDraft.stopCondition.trim() || "Stop when verification passes and the next step needs judgment.";
    const scope = goalDraft.scope.trim() || "Scope needs refinement before implementation.";
    const contract = getGoalContractPreview(goalDraft);
    const ticketId = `GOAL-${Date.now().toString(36).toUpperCase()}`;
    const lifecycleStatus = goalDraft.approvedToRun && goalDraft.lifecycleStatus === "draft" ? "approved" : goalDraft.lifecycleStatus;

    const ticket: KanbanTicket = {
      id: ticketId,
      title,
      status: getTicketStatusForGoalLifecycle(lifecycleStatus, goalDraft.approvedToRun),
      estimate: goalDraft.maxEstimate,
      summary: statement,
      tags: goalDraft.approvedToRun
        ? ["goal", "loop", `goal-${lifecycleStatus}`, "approved-to-run"]
        : ["goal", "loop", `goal-${lifecycleStatus}`],
      projectId: project?.id ?? "atlas-planner",
      projectLabel: project?.label ?? "Atlas Planner",
      epicId: epic?.id ?? "planner-product",
      epicLabel: epic?.label ?? "Planner Product",
      fitLabel: "",
      description: [
        statement,
        "",
        `Stop condition: ${stopCondition}`,
        `Scope: ${scope}`,
        `Lifecycle: ${lifecycleStatus}`,
        `Max estimate: ${goalDraft.maxEstimate}`,
        `Approved to run: ${goalDraft.approvedToRun ? "yes" : "no"}`,
        "",
        "Refined satisfaction layers:",
        ...contract.layers.map((layer) => `- [${layer.status}${layer.humanGated ? ", human-gated" : ""}] ${layer.label}: ${layer.criteria}`),
        "",
        "Verification:",
        ...contract.verification.map((item) => `- [${item.required ? "required" : "optional"}] ${item.label}: ${item.command}`),
        "",
        "Safety:",
        ...contract.safety.map((item) => `- ${item}`)
      ].join("\n"),
      subtasks: goalTimeline.map((step) => ({
        id: `goal-${step.id}`,
        title: `${step.label}: ${step.detail}`,
        done: false
      })),
      createdAt: now,
      updatedAt: now,
      movedAt: now
    };

    try {
      const response = await fetch("/api/atlas-goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: ticket.id,
          title: ticket.title,
          lifecycleStatus,
          approvedToRun: goalDraft.approvedToRun,
          status: ticket.status,
          estimate: ticket.estimate,
          summary: ticket.summary,
          tags: ticket.tags,
          description: ticket.description,
          subtasks: ticket.subtasks,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        })
      });
      if (!response.ok) {
        throw new Error("Queue write failed.");
      }
      const payload = (await response.json()) as { goal?: QueuedGoalSummary };
      setPlannerTickets((current) => [ticket, ...current]);
      if (payload.goal) {
        const queuedGoal = payload.goal;
        setQueuedGoalState((current) => [queuedGoal, ...current.filter((goal) => goal.id !== queuedGoal.id)]);
      }
      setPlannerStateMessage(`Created ${ticketId} and queued it for the loop runner.`);
    } catch {
      setPlannerStateMessage(`Could not create ${ticketId}. Queue write failed.`);
      return;
    }
    setGoalDraft(getDefaultGoalDraft());
    closeGoalComposer();
  }

  async function updateQueuedGoalLifecycle(goal: QueuedGoalSummary, lifecycleStatus: GoalLifecycleStatus) {
    const previousGoals = queuedGoalState;
    const approvedToRun = lifecycleStatus === "approved" || lifecycleStatus === "running";
    const nextStatus = getTicketStatusForGoalLifecycle(lifecycleStatus, approvedToRun);
    const updatedGoal: QueuedGoalSummary = {
      ...goal,
      lifecycleStatus,
      approvedToRun,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };

    setQueuedGoalState((current) => current.map((candidate) => (candidate.id === goal.id ? updatedGoal : candidate)));
    setPlannerStateMessage(`${goal.id} moved to ${lifecycleStatus}.`);

    try {
      const response = await fetch("/api/atlas-goals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: goal.id,
          lifecycleStatus,
          approvedToRun
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Goal lifecycle update failed.");
      }

      const payload = (await response.json()) as { goal?: QueuedGoalSummary };
      if (payload.goal) {
        setQueuedGoalState((current) => current.map((candidate) => (candidate.id === goal.id ? payload.goal! : candidate)));
      }
    } catch (error) {
      setQueuedGoalState(previousGoals);
      setPlannerStateMessage(error instanceof Error ? error.message : "Goal lifecycle update failed.");
    }
  }

  return (
    <div className="loop-overlay" role="dialog" aria-modal="true" aria-labelledby="loop-overview-title">
      <button type="button" className="loop-overlay__scrim" aria-label="Close loop overview" onClick={onClose} />
      <section className="loop-panel">
        <header className="loop-panel__header">
          <div>
            <p>Token-aware work board</p>
            <h2 id="loop-overview-title">Atlas Planner</h2>
          </div>
          <div className="loop-panel__actions">
            <button type="button" className="loop-help-button" onClick={onToggleExplainer}>
              <CircleHelp size={16} />
              {showExplainer ? "Loop list" : "How it works"}
            </button>
            <button type="button" className="loop-close-button" aria-label="Close loop overview" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="loop-panel__body">
          <section className="loop-usage" aria-label="Latest usage status">
            <div className="loop-usage__heading">
              <div>
                <ListChecks size={16} />
                <h3>Token runway</h3>
              </div>
              <button
                type="button"
                className="loop-usage__refresh"
                onClick={refreshUsageStatus}
                disabled={isUsageRefreshing}
                aria-label="Refresh token runway"
              >
                <RefreshCw size={14} />
                <span>{isUsageRefreshing ? "Refreshing" : "Refresh"}</span>
              </button>
            </div>
            {latestUsageStatus ? (
              <>
                <div className="usage-meta" aria-label="Usage snapshot metadata">
                  <div className="usage-snapshot">
                    <span>Model</span>
                    <strong>{latestUsageStatus.model}</strong>
                  </div>
                  <div className="usage-snapshot usage-snapshot--date">
                    <span>Updated</span>
                    <strong>{formatRelativeUsageTime(latestUsageStatus.recordedAt, usageClock)}</strong>
                  </div>
                </div>
                <div className="usage-dashboard">
                  {usageMetrics.map((metric) => (
                    <article key={metric.label} className={`usage-card usage-card--${metric.tone}`}>
                      <div className="usage-card__header">
                        <span className="usage-card__badge" aria-hidden="true">
                          {metric.label.slice(0, 1)}
                        </span>
                        <div>
                          <span>{metric.label}</span>
                          <strong>{metric.percentLeft === undefined ? metric.detail : metric.value}</strong>
                        </div>
                      </div>
                      {metric.percentLeft === undefined ? null : (
                        <div
                          className="usage-ring"
                          role="meter"
                          aria-label={metric.label}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={metric.percentLeft}
                          style={{ "--usage-percent": `${metric.percentLeft}%` } as CSSProperties}
                        >
                          <span>{metric.percentLeft}%</span>
                        </div>
                      )}
                      {metric.percentLeft === undefined ? <p>{metric.value}</p> : null}
                      <small>{metric.percentLeft === undefined ? "Snapshot from latest status job" : metric.detail}</small>
                      {metric.percentLeft === undefined ? null : (
                        <div className="usage-meter" aria-hidden="true">
                          <span style={{ width: `${metric.percentLeft}%` }} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p>No usage snapshot has been written yet. The scheduled status job will fill this after its first run.</p>
            )}
            {latestUsageStatus?.note ? <p className="loop-usage__note">{latestUsageStatus.note}</p> : null}
          </section>

          <section className="loop-reliability" aria-label="Reliable loop planner">
            <div className="loop-reliability__header">
              <div>
                <p>Reliable loop planner</p>
                <h3>Next controlled run</h3>
              </div>
              <span>
                <ShieldCheck size={14} />
                Maker/checker required
              </span>
            </div>

            <div className="loop-command-strip">
              <article>
                <span>
                  <Workflow size={14} />
                  Run
                </span>
                <code>{loopPlannerCommand.command}</code>
              </article>
              <article>
                <span>
                  <CheckCircle2 size={14} />
                  Verify
                </span>
                <code>{loopPlannerCommand.verificationCommand}</code>
              </article>
              <article>
                <span>
                  <GitBranch size={14} />
                  Stop
                </span>
                <p>{loopPlannerCommand.stopCondition}</p>
              </article>
            </div>

            <div className="loop-decision">
              <div>
                <span>Recommended ticket</span>
                <strong>
                  {loopPlannerCommand.ticket
                    ? `${loopPlannerCommand.ticket.id}: ${loopPlannerCommand.ticket.title}`
                    : "No actionable ticket"}
                </strong>
                <p>{loopPlannerCommand.reason}</p>
                {loopPlannerCommand.decision.selected ? (
                  <div className="loop-decision__score" aria-label="Planner score breakdown">
                    <span>fit {loopPlannerCommand.decision.selected.breakdown.fit}</span>
                    <span>value {loopPlannerCommand.decision.selected.breakdown.value}</span>
                    <span>ready {loopPlannerCommand.decision.selected.breakdown.readiness}</span>
                    <span>fresh {loopPlannerCommand.decision.selected.breakdown.freshness}</span>
                    <span>risk {loopPlannerCommand.decision.selected.breakdown.risk}</span>
                  </div>
                ) : null}
                {loopPlannerCommand.decision.skipped.length > 0 ? (
                  <p className="loop-decision__skipped">
                    Deferred:{" "}
                    {loopPlannerCommand.decision.skipped
                      .slice(0, 2)
                      .map((candidate) => `${candidate.ticket.id} (${candidate.ticket.estimate} pts)`)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
              <dl>
                <div>
                  <dt>Score</dt>
                  <dd>{loopPlannerCommand.decision.selected?.score ?? 0}</dd>
                </div>
                <div>
                  <dt>Token gate</dt>
                  <dd>{loopPlannerCommand.maxEstimate} pts</dd>
                </div>
                <div>
                  <dt>Open</dt>
                  <dd>{loopPlannerCommand.counts.backlog + loopPlannerCommand.counts["in-progress"]}</dd>
                </div>
                <div>
                  <dt>Review</dt>
                  <dd>{loopPlannerCommand.counts.review}</dd>
                </div>
              </dl>
            </div>

            <section className="loop-goal-queue" aria-label="Durable goal queue">
              <div className="loop-goal-queue__header">
                <div>
                  <span>Durable goal queue</span>
                  <strong>{durableQueuedGoals.length} queued</strong>
                </div>
                <code>loops/project-controller/goal-queue.json</code>
              </div>
              {durableQueuedGoals.length > 0 ? (
                <div className="loop-goal-queue__list">
                  {durableQueuedGoals.slice(0, 4).map((goal) => (
                    <article key={goal.id}>
                      <div>
                        <span>{goal.lifecycleStatus}</span>
                        <strong>{goal.title}</strong>
                      </div>
                      <p>
                        {goal.id} · {goal.status} · {goal.estimate} pts
                        {goal.approvedToRun ? " · approved" : ""}
                      </p>
                      <div className="loop-goal-queue__actions">
                        {goal.lifecycleStatus === "draft" || goal.lifecycleStatus === "refined" ? (
                          <button type="button" onClick={() => updateQueuedGoalLifecycle(goal, "approved")}>
                            Approve
                          </button>
                        ) : null}
                        {goal.lifecycleStatus !== "blocked" && goal.lifecycleStatus !== "satisfied" && goal.lifecycleStatus !== "archived" ? (
                          <button type="button" onClick={() => updateQueuedGoalLifecycle(goal, "blocked")}>
                            Block
                          </button>
                        ) : null}
                        {goal.lifecycleStatus !== "satisfied" && goal.lifecycleStatus !== "archived" ? (
                          <button type="button" onClick={() => updateQueuedGoalLifecycle(goal, "satisfied")}>
                            Satisfy
                          </button>
                        ) : null}
                        {goal.lifecycleStatus !== "archived" ? (
                          <button type="button" onClick={() => updateQueuedGoalLifecycle(goal, "archived")}>
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p>No durable goals yet. Saving a goal writes it here for the controller.</p>
              )}
            </section>

            <section className="loop-current-run" aria-label="Current loop run">
              <div className="loop-current-run__header">
                <div>
                  <span>Current run</span>
                  <strong>{currentLoopRun ? currentLoopRun.goalTitle : "No claimed goal"}</strong>
                </div>
                <p>{currentLoopRun ? currentLoopRun.stage : "idle"}</p>
              </div>
              {currentLoopRun ? (
                <dl>
                  <div>
                    <dt>Run</dt>
                    <dd>{currentLoopRun.id}</dd>
                  </div>
                  <div>
                    <dt>Goal</dt>
                    <dd>{currentLoopRun.goalId}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{currentLoopRun.status}</dd>
                  </div>
                  <div>
                    <dt>Base</dt>
                    <dd>{currentLoopRun.baseCommit}</dd>
                  </div>
                  {currentLoopRun.branchName ? (
                    <div>
                      <dt>Branch</dt>
                      <dd>{currentLoopRun.branchName}</dd>
                    </div>
                  ) : null}
                  {currentLoopRun.worktreePath ? (
                    <div>
                      <dt>Worktree</dt>
                      <dd>{currentLoopRun.worktreePath}</dd>
                    </div>
                  ) : null}
                  {currentLoopRun.handoffDir ? (
                    <div>
                      <dt>Handoff</dt>
                      <dd>{currentLoopRun.handoffDir}</dd>
                    </div>
                  ) : null}
                  {currentLoopRun.runnerCommand ? (
                    <div>
                      <dt>Runner</dt>
                      <dd>{currentLoopRun.runnerCommand}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p>Claiming an approved queued goal writes `loops/project-controller/current-run.json`.</p>
              )}
              {currentLoopRun && (currentRunnerState || currentRunnerEvidence) ? (
                <div className="loop-run-artifacts">
                  {currentRunnerState ? (
                    <article className="loop-run-artifacts__state">
                      <div className="loop-run-artifacts__title">
                        <span>Runner state</span>
                        <strong>{currentRunnerState.stage}</strong>
                      </div>
                      <dl>
                        <div>
                          <dt>Status</dt>
                          <dd>{currentRunnerState.status}</dd>
                        </div>
                        <div>
                          <dt>Repairs</dt>
                          <dd>
                            {currentRunnerState.repairAttempts}/{currentRunnerState.maxRepairs}
                          </dd>
                        </div>
                        <div>
                          <dt>Updated</dt>
                          <dd>{formatPlannerDateTime(currentRunnerState.updatedAt)}</dd>
                        </div>
                      </dl>
                      {currentRunnerState.timeline.length > 0 ? (
                        <ol>
                          {currentRunnerState.timeline.slice(-4).map((event, index) => (
                            <li key={`${event.stage}-${event.status}-${event.at ?? index}`}>
                              <span>{event.status}</span>
                              <strong>{event.stage}</strong>
                              <p>{event.detail}</p>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </article>
                  ) : null}
                  {currentRunnerEvidence ? (
                    <article className="loop-run-artifacts__evidence">
                      <div className="loop-run-artifacts__title">
                        <span>Runner evidence</span>
                        <strong>{currentRunnerEvidence.status}</strong>
                      </div>
                      <dl>
                        <div>
                          <dt>Checks</dt>
                          <dd>{currentRunnerEvidence.checks.length}</dd>
                        </div>
                        <div>
                          <dt>Findings</dt>
                          <dd>{currentRunnerEvidence.findings.length}</dd>
                        </div>
                        <div>
                          <dt>Repairs</dt>
                          <dd>
                            {currentRunnerEvidence.repairAttempts}/{currentRunnerEvidence.maxRepairs}
                          </dd>
                        </div>
                      </dl>
                      {currentRunnerEvidence.checks.length > 0 ? (
                        <div className="loop-run-artifacts__checks">
                          {currentRunnerEvidence.checks.slice(-3).map((check) => (
                            <p key={`${check.stage}-${check.finishedAt}-${check.repairAttempt}`}>
                              <span>{check.stage}</span>
                              <strong>exit {check.exitCode}</strong>
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {currentRunnerEvidence.findings.length > 0 ? (
                        <div className="loop-run-artifacts__findings">
                          {currentRunnerEvidence.findings.slice(-3).map((finding, index) => (
                            <p key={`${finding.stage}-${finding.summary}-${index}`}>
                              <span>{finding.severity}</span>
                              <strong>{finding.summary}</strong>
                              {finding.file ? <small>{finding.file}</small> : null}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="loop-run-timeline" aria-label="Loop run timeline">
              <div className="loop-run-timeline__header">
                <div>
                  <span>Run timeline</span>
                  <strong>From selected slice to clean main</strong>
                </div>
                <p>{loopPlannerCommand.ticket ? loopPlannerCommand.ticket.id : "Waiting for an actionable ticket"}</p>
              </div>
              <div className="loop-run-timeline__rail">
                {loopRunTimeline.map((step) => {
                  const StepIcon = step.icon;
                  return (
                    <article key={step.id} className={`loop-run-timeline__step loop-run-timeline__step--${step.status}`}>
                      <div className="loop-run-timeline__icon">
                        <StepIcon size={15} />
                      </div>
                      <div>
                        <span>{step.status}</span>
                        <strong>{step.label}</strong>
                        <p>{step.detail}</p>
                        <small>{step.evidence}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="loop-evidence-viewer" aria-label="Loop evidence viewer">
              <div className="loop-evidence-viewer__header">
                <div>
                  <span>Evidence viewer</span>
                  <strong>Proof before satisfaction</strong>
                </div>
                <p>{loopEvidenceSources.length} sources</p>
              </div>
              <div className="loop-evidence-viewer__grid">
                {loopEvidenceSources.map((source) => (
                  <article key={source.label}>
                    <div>
                      <span>{source.status}</span>
                      <strong>{source.label}</strong>
                    </div>
                    <code>{source.path}</code>
                    <p>{source.detail}</p>
                  </article>
                ))}
              </div>
              {controllerMemory ? (
                <div className="loop-controller-memory">
                  {controllerMemory.latestReport ? (
                    <article>
                      <div>
                        <span>Latest report</span>
                        <strong>{formatPlannerDateTime(controllerMemory.latestReport.updatedAt)}</strong>
                      </div>
                      <code>{controllerMemory.latestReport.path}</code>
                      <p>{controllerMemory.latestReport.excerpt || "Report file exists but has no readable summary."}</p>
                    </article>
                  ) : null}
                  {controllerMemory.controllerState ? (
                    <article>
                      <div>
                        <span>Controller state</span>
                        <strong>{formatPlannerDateTime(controllerMemory.controllerState.updatedAt)}</strong>
                      </div>
                      <code>{controllerMemory.controllerState.path}</code>
                      <p>{controllerMemory.controllerState.summary}</p>
                    </article>
                  ) : null}
                  {controllerMemory.decisionLog ? (
                    <article>
                      <div>
                        <span>Decision log</span>
                        <strong>{controllerMemory.decisionLog.count} entries</strong>
                      </div>
                      <code>{controllerMemory.decisionLog.path}</code>
                      <p>{controllerMemory.decisionLog.lastDecision || "No decision lines recorded yet."}</p>
                    </article>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="loop-merge-gates" aria-label="PR and merge gates">
              <div className="loop-merge-gates__header">
                <div>
                  <span>PR and merge gates</span>
                  <strong>External actions stay explicit</strong>
                </div>
                <p>Merge gated</p>
              </div>
              <div className="loop-merge-gates__grid">
                {prMergeGates.map((gate) => {
                  const GateIcon = gate.icon;
                  return (
                    <article key={gate.label}>
                      <div className="loop-merge-gates__icon">
                        <GateIcon size={15} />
                      </div>
                      <div>
                        <span>{gate.status}</span>
                        <strong>{gate.label}</strong>
                        <p>{gate.detail}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {loopGoalSummary.goal ? (
              <section className="loop-goal" aria-label="Strict loop goal">
                <div className="loop-goal__summary">
                  <div>
                    <span>Strict goal</span>
                    <strong>{loopGoalSummary.goal.title}</strong>
                    <p>{loopGoalSummary.goal.statement}</p>
                  </div>
                  <dl>
                    <div>
                      <dt>Layers</dt>
                      <dd>{loopGoalSummary.totalLayers}</dd>
                    </div>
                    <div>
                      <dt>Satisfied</dt>
                      <dd>{loopGoalSummary.satisfiedLayers}</dd>
                    </div>
                    <div>
                      <dt>Scaffolded</dt>
                      <dd>{loopGoalSummary.counts.scaffolded}</dd>
                    </div>
                    <div>
                      <dt>Pending</dt>
                      <dd>{loopGoalSummary.counts.pending}</dd>
                    </div>
                  </dl>
                </div>
                <div className="loop-goal__layers">
                  {loopGoalSummary.goal.layers.map((layer) => (
                    <article key={layer.id} className={`loop-goal__layer loop-goal__layer--${layer.status}`}>
                      <div>
                        <span>{layer.status}</span>
                        <strong>{layer.label}</strong>
                      </div>
                      <p>{layer.criteria[0]}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="loop-primitives" aria-label="Loop reliability primitives">
              {reliabilityPrimitives.map((primitive) => (
                <article key={primitive.label}>
                  <span>{primitive.label}</span>
                  <strong>{primitive.value}</strong>
                  <p>{primitive.detail}</p>
                </article>
              ))}
            </div>
          </section>

          {isActivityDashboardOpen ? (
          <section className="loop-activity loop-activity--overlay" aria-label="Atlas Planner activity dashboard">
            <div className="loop-activity__header">
              <div>
                <p>Activity dashboard</p>
                <h3>Latest movement</h3>
              </div>
              <div className="loop-activity__filters">
                <label>
                  Timeline
                  <select
                    value={activityDateFilter}
                    onChange={(event) => setActivityDateFilter(event.target.value as PlannerDateFilter)}
                  >
                    <option value="updated">Updated</option>
                    <option value="created">Created</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
                <label>
                  From
                  <input
                    type="date"
                    value={activityDateRange.start}
                    onChange={(event) =>
                      setActivityDateRange((current) => ({ ...current, start: event.target.value }))
                    }
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={activityDateRange.end}
                    onChange={(event) => setActivityDateRange((current) => ({ ...current, end: event.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className="loop-close-button"
                  aria-label="Close activity dashboard"
                  onClick={() => setIsActivityDashboardOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="loop-activity__grid">
              <article className="loop-activity__stat">
                <span>
                  <CheckCircle2 size={14} />
                  Finished
                </span>
                <strong>{completedTicketsInRange.length}</strong>
                <small>{activityDateRange.start} to {activityDateRange.end}</small>
              </article>
              <article className="loop-activity__finished">
                <div>
                  <strong>Latest finished tickets</strong>
                  <small>Completed timestamp</small>
                </div>
                {completedTickets.length > 0 ? (
                  completedTickets.map((ticket) => (
                    <div key={ticket.id} className="loop-activity__row">
                      <span>{ticket.id}</span>
                      <p>{ticket.title}</p>
                      <time>{formatPlannerDateTime(ticket.completedAt)}</time>
                      {ticket.completedCommit ? <code>{ticket.completedCommit}</code> : null}
                    </div>
                  ))
                ) : (
                  <p className="loop-activity__empty">No finished tickets in this range.</p>
                )}
              </article>
              <article className="loop-activity__timeline">
                <div>
                  <strong>{activityDateFilter} timeline</strong>
                  <small>Last 7 days by default</small>
                </div>
                {activityTickets.length > 0 ? (
                  activityTickets.map((ticket) => (
                    <div key={`${ticket.id}-${activityDateFilter}`} className="loop-activity__event">
                      <span />
                      <div>
                        <time>{formatPlannerDateTime(getTicketTimestamp(ticket, activityDateFilter))}</time>
                        <strong>{ticket.id}: {ticket.title}</strong>
                        <small>
                          {ticket.projectLabel} · {ticket.status}
                        </small>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="loop-activity__empty">No ticket activity in this range.</p>
                )}
              </article>
            </div>
          </section>
          ) : null}

          <section className="loop-kanban" aria-label="Atlas Planner Kanban">
            <div className="loop-kanban__header">
              <div>
                <p>Atlas Planner</p>
                <h3>Epics and tickets</h3>
              </div>
              <div className="loop-kanban__tools">
                <span>{getWindowDecisionLabel(latestUsageStatus)}</span>
                <button type="button" onClick={() => setIsActivityDashboardOpen(true)}>
                  <CalendarDays size={14} />
                  Dashboard
                </button>
                <button type="button" onClick={exportPlannerState}>
                  <Download size={14} />
                  Export
                </button>
                <button type="button" onClick={() => plannerImportInputRef.current?.click()}>
                  <Upload size={14} />
                  Import
                </button>
                <button type="button" onClick={resetPlannerState}>
                  <RotateCcw size={14} />
                  Reset
                </button>
                <button type="button" onClick={() => setIsGoalComposerOpen(true)}>
                  <Target size={14} />
                  Create goal
                </button>
                <button type="button" onClick={() => openTicketEditor(getDefaultPlannerTicket(loopKanban))}>
                  <Plus size={14} />
                  New ticket
                </button>
                <input
                  ref={plannerImportInputRef}
                  className="loop-kanban__import"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    importPlannerState(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
            {plannerStateMessage ? <p className="loop-kanban__state-message">{plannerStateMessage}</p> : null}
            <div className="loop-kanban__columns">
              {kanbanColumns.map((column) => (
                <article
                  key={column.id}
                  className={`loop-kanban__column${draggingTicketId ? " loop-kanban__column--dragging" : ""}${
                    dragOverStatus === column.id ? " loop-kanban__column--drop-target" : ""
                  }`}
                  onDragEnter={() => setDragOverStatus(column.id)}
                  onDragOver={(event) => handleColumnDragOver(event, column.id)}
                  onDragLeave={(event) => handleColumnDragLeave(event, column.id)}
                  onDrop={(event) => handleDrop(event, column.id)}
                >
                  <div className="loop-kanban__column-heading">
                    <strong>{column.label}</strong>
                    <span>{column.tickets.length}</span>
                  </div>
                  <div className="loop-kanban__cards">
                    {column.tickets.map((ticket) => (
                      <section
                        key={ticket.id}
                        className={`loop-ticket${draggingTicketId === ticket.id ? " loop-ticket--dragging" : ""}`}
                        draggable
                        onClick={(event) => handleTicketClick(event, ticket)}
                        onDragStart={(event) => {
                          suppressTicketClick();
                          setDraggingTicketId(ticket.id);
                          setDragOverStatus(ticket.status);
                          event.dataTransfer.setData("text/plain", ticket.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          suppressTicketClick();
                          clearDragState();
                        }}
                      >
                        <div className="loop-ticket__topline">
                          <span>{ticket.projectLabel}</span>
                          <strong>{ticket.estimate}</strong>
                        </div>
                        <h4>{ticket.id}: {ticket.title}</h4>
                        <p>{ticket.description || ticket.summary}</p>
                        <div className="loop-ticket__meta">
                          <span>{ticket.epicLabel}</span>
                          <small>
                            {ticket.subtasks.filter((subtask) => subtask.done).length}/{ticket.subtasks.length} tasks ·{" "}
                            {ticket.fitLabel}
                          </small>
                        </div>
                        <div className="loop-ticket__dates">
                          <span>Created {formatPlannerDate(ticket.createdAt)}</span>
                          <span>Moved {formatPlannerDate(ticket.movedAt)}</span>
                          {ticket.completedAt ? <span>Done {formatPlannerDate(ticket.completedAt)}</span> : null}
                          {ticket.completedCommit ? <span>Commit {ticket.completedCommit}</span> : null}
                        </div>
                        {(ticket.tags ?? []).length > 0 ? (
                          <div className="loop-ticket__tags" aria-label={`${ticket.id} tags`}>
                            {(ticket.tags ?? []).slice(0, 4).map((tag) => (
                              <span key={tag}>#{tag}</span>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    ))}
                    {column.tickets.length === 0 ? <p className="loop-kanban__empty">No tickets here.</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          {editingTicket ? (
            <TicketEditor
              ticket={editingTicket}
              isClosing={isTicketEditorClosing}
              projects={loopKanban}
              onChange={updateEditingTicket}
              onSave={saveEditingTicket}
              onDelete={deleteEditingTicket}
              onClose={closeTicketEditor}
              onAddSubtask={addSubtask}
              onUpdateSubtask={updateSubtask}
              onRemoveSubtask={removeSubtask}
            />
          ) : null}

          {isGoalComposerOpen ? (
            <GoalComposer
              draft={goalDraft}
              onChange={updateGoalDraft}
              onAddLayer={addGoalLayer}
              onUpdateLayer={updateGoalLayer}
              onRemoveLayer={removeGoalLayer}
              onAddVerificationCommand={addVerificationCommand}
              onUpdateVerificationCommand={updateVerificationCommand}
              onRemoveVerificationCommand={removeVerificationCommand}
              onUpdateSafety={updateGoalSafety}
              onSave={saveGoalDraft}
              onClose={closeGoalComposer}
            />
          ) : null}

          <section className="loop-summary-grid" aria-label="Loop commit summaries">
            {loopSummaries.map((loop) => (
              <article key={loop.id} className={`loop-summary loop-summary--${loop.status}`}>
                <div className="loop-summary__topline">
                  <span>{loop.status}</span>
                  <small>{loop.cadence}</small>
                </div>
                <h3>{loop.label}</h3>
                <p>{loop.summary}</p>
                <dl>
                  <div>
                    <dt>
                      <GitCommitHorizontal size={13} />
                      Latest commit
                    </dt>
                    <dd>{loop.commit}</dd>
                  </div>
                  <div>
                    <dt>
                      <ListChecks size={13} />
                      Permission
                    </dt>
                    <dd>{loop.permission}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>

          {showExplainer ? (
            <section className="loop-explainer" aria-label="Loop architecture overview">
              <div className="loop-explainer__intro">
                <p>
                  The controller is the only part that decides what is due. Child loops stay small: they run checks,
                  write a report, and hand back one next action. The point is repeatable movement without turning the
                  repo into scheduled chaos.
                </p>
              </div>

              <div className="loop-graph" aria-label="Architecture graph">
                <div className="loop-node loop-node--source">
                  <Workflow size={18} />
                  <strong>project-loop.mjs</strong>
                  <span>locks and selects due work</span>
                </div>
                <span className="loop-edge" />
                <div className="loop-node">
                  <Network size={18} />
                  <strong>projects.json</strong>
                  <span>registry, cadence, permissions</span>
                </div>
                <span className="loop-edge" />
                <div className="loop-node">
                  <RefreshCw size={18} />
                  <strong>child loops</strong>
                  <span>repo-health, web-atlas, project checks</span>
                </div>
                <span className="loop-edge" />
                <div className="loop-node loop-node--output">
                  <FileText size={18} />
                  <strong>state + report</strong>
                  <span>local memory and next action</span>
                </div>
              </div>

              <div className="loop-file-map">
                <h3>Markdown and state map</h3>
                <div>
                  {loopFiles.map((file) => (
                    <article key={file.path}>
                      <code>{file.path}</code>
                      <p>{file.role}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function GoalComposer({
  draft,
  onChange,
  onAddLayer,
  onUpdateLayer,
  onRemoveLayer,
  onAddVerificationCommand,
  onUpdateVerificationCommand,
  onRemoveVerificationCommand,
  onUpdateSafety,
  onSave,
  onClose
}: {
  draft: GoalDraft;
  onChange: (update: Partial<GoalDraft>) => void;
  onAddLayer: () => void;
  onUpdateLayer: (layerId: string, update: Partial<GoalDraftLayer>) => void;
  onRemoveLayer: (layerId: string) => void;
  onAddVerificationCommand: () => void;
  onUpdateVerificationCommand: (commandId: string, update: Partial<GoalVerificationCommand>) => void;
  onRemoveVerificationCommand: (commandId: string) => void;
  onUpdateSafety: (update: Partial<GoalSafetySettings>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const contract = getGoalContractPreview(draft);

  return (
    <div className="goal-composer" role="dialog" aria-modal="true" aria-labelledby="goal-composer-title">
      <button type="button" className="goal-composer__scrim" aria-label="Close goal composer" onClick={onClose} />
      <section className="goal-composer__panel">
        <header className="goal-composer__header">
          <div>
            <p>Strict loop goal</p>
            <h3 id="goal-composer-title">Create goal</h3>
          </div>
          <button type="button" className="loop-close-button" aria-label="Close goal composer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="goal-composer__body">
          <section className="goal-form" aria-label="Goal draft">
            <label>
              Goal title
              <input
                value={draft.title}
                placeholder="Make Atlas Planner run a bounded PR loop"
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </label>
            <label>
              Lifecycle state
              <select
                value={draft.lifecycleStatus}
                onChange={(event) => onChange({ lifecycleStatus: event.target.value as GoalLifecycleStatus })}
              >
                {goalLifecycleStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What should be true when this is done?
              <textarea
                value={draft.statement}
                placeholder="Describe the outcome in plain language."
                onChange={(event) => onChange({ statement: event.target.value })}
              />
            </label>
            <label>
              Stop condition
              <textarea
                value={draft.stopCondition}
                placeholder="Describe how the loop knows it must stop."
                onChange={(event) => onChange({ stopCondition: event.target.value })}
              />
            </label>
            <label>
              Scope and limits
              <textarea
                value={draft.scope}
                placeholder="Allowed areas, risk boundaries, and what should not be touched."
                onChange={(event) => onChange({ scope: event.target.value })}
              />
            </label>
            <label>
              Max first slice
              <select
                value={draft.maxEstimate}
                onChange={(event) => onChange({ maxEstimate: Number(event.target.value) })}
              >
                {fibonacciEstimates.map((estimate) => (
                  <option key={estimate} value={estimate}>
                    {estimate} points
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="goal-timeline" aria-label="Goal loop timeline">
            <section className="goal-lifecycle-strip" aria-label="Goal lifecycle states">
              <div className="goal-lifecycle-strip__header">
                <span>Goal lifecycle</span>
                <strong>{goalLifecycleStages.find((stage) => stage.id === draft.lifecycleStatus)?.label ?? "Draft"}</strong>
              </div>
              <div className="goal-lifecycle-strip__rail">
                {goalLifecycleStages.map((stage) => (
                  <article
                    key={stage.id}
                    className={`goal-lifecycle-strip__stage${
                      stage.id === draft.lifecycleStatus ? " goal-lifecycle-strip__stage--active" : ""
                    }`}
                  >
                    <span>{stage.label}</span>
                    <p>{stage.detail}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="goal-contract-preview" aria-label="Refined loop contract preview">
              <div className="goal-contract-preview__header">
                <span>Refined loop contract</span>
                <strong>{contract.title}</strong>
                <p>{contract.outcome}</p>
              </div>
              <div className="goal-contract-preview__grid">
                <article>
                  <span>Stop</span>
                  <p>{contract.stopCondition}</p>
                </article>
                <article>
                  <span>Scope</span>
                  <p>{contract.scope}</p>
                </article>
              </div>
              <div className="goal-contract-preview__lists">
                <article>
                  <span>Layers</span>
                  <ul>
                    {contract.layers.map((layer) => (
                      <li key={layer.id}>
                        {layer.label}: {layer.criteria}
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <span>Verification</span>
                  <ul>
                    {contract.verification.map((item) => (
                      <li key={item.id}>
                        {item.label}: {item.command}
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <span>Safety</span>
                  <ul>
                    {contract.safety.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </section>

            <section className="goal-layer-editor" aria-label="Satisfaction layer editor">
              <div className="goal-layer-editor__header">
                <div>
                  <span>Satisfaction layers</span>
                  <strong>Define what done means</strong>
                </div>
                <button type="button" onClick={onAddLayer}>
                  <Plus size={13} />
                  Add layer
                </button>
              </div>
              <div className="goal-layer-editor__list">
                {draft.layers.map((layer) => (
                  <article key={layer.id} className="goal-layer-editor__item">
                    <div className="goal-layer-editor__row">
                      <label>
                        Layer
                        <input
                          value={layer.label}
                          onChange={(event) => onUpdateLayer(layer.id, { label: event.target.value })}
                        />
                      </label>
                      <label>
                        Status
                        <select
                          value={layer.status}
                          onChange={(event) =>
                            onUpdateLayer(layer.id, { status: event.target.value as GoalDraftLayer["status"] })
                          }
                        >
                          <option value="pending">Pending</option>
                          <option value="scaffolded">Scaffolded</option>
                          <option value="satisfied">Satisfied</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Criteria
                      <textarea
                        value={layer.criteria}
                        onChange={(event) => onUpdateLayer(layer.id, { criteria: event.target.value })}
                      />
                    </label>
                    <div className="goal-layer-editor__footer">
                      <label>
                        <input
                          type="checkbox"
                          checked={layer.humanGated}
                          onChange={(event) => onUpdateLayer(layer.id, { humanGated: event.target.checked })}
                        />
                        Human-gated
                      </label>
                      <button type="button" onClick={() => onRemoveLayer(layer.id)} disabled={draft.layers.length <= 1}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="goal-verification-builder" aria-label="Verification command builder">
              <div className="goal-verification-builder__header">
                <div>
                  <span>Verification commands</span>
                  <strong>Make the stop condition executable</strong>
                </div>
                <button type="button" onClick={onAddVerificationCommand}>
                  <Plus size={13} />
                  Add command
                </button>
              </div>
              <div className="goal-verification-builder__list">
                {draft.verificationCommands.map((command) => (
                  <article key={command.id} className="goal-verification-builder__item">
                    <div className="goal-verification-builder__row">
                      <label>
                        Check name
                        <input
                          value={command.label}
                          onChange={(event) => onUpdateVerificationCommand(command.id, { label: event.target.value })}
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={command.required}
                          onChange={(event) =>
                            onUpdateVerificationCommand(command.id, { required: event.target.checked })
                          }
                        />
                        Required
                      </label>
                    </div>
                    <label>
                      Command
                      <input
                        value={command.command}
                        spellCheck={false}
                        onChange={(event) => onUpdateVerificationCommand(command.id, { command: event.target.value })}
                      />
                    </label>
                    <div className="goal-verification-builder__footer">
                      <span>{command.required ? "Must pass before done" : "Evidence only"}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveVerificationCommand(command.id)}
                        disabled={draft.verificationCommands.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="goal-safety-settings" aria-label="Loop safety settings">
              <div className="goal-safety-settings__header">
                <span>Safety settings</span>
                <strong>Bound the loop before it runs</strong>
              </div>
              <div className="goal-safety-settings__grid">
                <label>
                  Max iterations
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={draft.safety.maxIterations}
                    onChange={(event) => onUpdateSafety({ maxIterations: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Repair attempts
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={draft.safety.maxRepairAttempts}
                    onChange={(event) => onUpdateSafety({ maxRepairAttempts: Number(event.target.value) })}
                  />
                </label>
                <label>
                  External actions
                  <select
                    value={draft.safety.externalActionPolicy}
                    onChange={(event) =>
                      onUpdateSafety({
                        externalActionPolicy: event.target.value as GoalSafetySettings["externalActionPolicy"]
                      })
                    }
                  >
                    <option value="disabled">Disabled</option>
                    <option value="pr-only">PR only</option>
                    <option value="human-gated">Human-gated</option>
                    <option value="auto-merge">Auto-merge</option>
                  </select>
                </label>
              </div>
              <label>
                Token budget
                <textarea
                  value={draft.safety.tokenBudget}
                  onChange={(event) => onUpdateSafety({ tokenBudget: event.target.value })}
                />
              </label>
              <label>
                Time budget
                <textarea
                  value={draft.safety.timeBudget}
                  onChange={(event) => onUpdateSafety({ timeBudget: event.target.value })}
                />
              </label>
              <label>
                Allowed paths
                <textarea
                  value={draft.safety.allowedPaths}
                  onChange={(event) => onUpdateSafety({ allowedPaths: event.target.value })}
                />
              </label>
            </section>

            <section className="goal-decision-preview" aria-label="Loop decision preview">
              <div className="goal-decision-preview__header">
                <div>
                  <span>Decision preview</span>
                  <strong>{draft.approvedToRun ? "Approved for the next loop run" : "Waiting for approval"}</strong>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.approvedToRun}
                    onChange={(event) =>
                      onChange({
                        approvedToRun: event.target.checked,
                        lifecycleStatus:
                          event.target.checked && (draft.lifecycleStatus === "draft" || draft.lifecycleStatus === "refined")
                            ? "approved"
                            : draft.lifecycleStatus
                      })
                    }
                  />
                  Approve to run
                </label>
              </div>
              <dl>
                <div>
                  <dt>First slice</dt>
                  <dd>{contract.maxEstimate} pts</dd>
                </div>
                <div>
                  <dt>Required checks</dt>
                  <dd>{contract.verification.length}</dd>
                </div>
                <div>
                  <dt>Repair cap</dt>
                  <dd>{draft.safety.maxRepairAttempts}</dd>
                </div>
                <div>
                  <dt>External policy</dt>
                  <dd>{draft.safety.externalActionPolicy}</dd>
                </div>
              </dl>
              <p>
                Saving without approval creates a backlog goal. Approving moves it into the active lane, but external
                actions still follow the selected safety policy.
              </p>
            </section>

            <div className="goal-timeline__intro">
              <span>How the goal loop works</span>
              <strong>From rough idea to merged branch</strong>
              <p>
                The goal starts as human intent, then becomes a strict contract the loop can score, implement,
                verify, repair, and eventually merge behind gates.
              </p>
            </div>
            <div className="goal-timeline__rail">
              {goalTimeline.map((step, index) => {
                const StepIcon = step.icon;
                return (
                  <article key={step.id} className="goal-timeline__step">
                    <div className="goal-timeline__icon">
                      <StepIcon size={16} />
                    </div>
                    <div>
                      <span>{index + 1}</span>
                      <strong>{step.label}</strong>
                      <p>{step.detail}</p>
                    </div>
                    {index < goalTimeline.length - 1 ? (
                      <ArrowRight className="goal-timeline__arrow" size={15} aria-hidden="true" />
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="goal-composer__footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={onSave}>
            Save goal ticket
          </button>
        </footer>
      </section>
    </div>
  );
}

function TicketEditor({
  ticket,
  isClosing,
  projects,
  onChange,
  onSave,
  onDelete,
  onClose,
  onAddSubtask,
  onUpdateSubtask,
  onRemoveSubtask
}: {
  ticket: PlannerTicketDraft;
  isClosing: boolean;
  projects: LoopKanbanProject[];
  onChange: (update: Partial<PlannerTicketDraft>) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  onAddSubtask: () => void;
  onUpdateSubtask: (subtaskId: string, update: Partial<PlannerSubtask>) => void;
  onRemoveSubtask: (subtaskId: string) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [copiedCommand, setCopiedCommand] = useState("");
  const [failedCommand, setFailedCommand] = useState("");
  const selectedProject = projects.find((project) => project.id === ticket.projectId) ?? projects[0];
  const selectedEpic =
    selectedProject?.epics?.find((epic) => epic.id === ticket.epicId) ?? selectedProject?.epics?.[0];
  const ticketTags = ticket.tags ?? [];
  const agentRun = getAgentRunSuggestions(ticket);
  const copyButtonLabel =
    copiedCommand === agentRun.command ? "Copied" : failedCommand === agentRun.command ? "Copy failed" : "Copy runner command";

  async function copyRunnerCommand() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setFailedCommand(agentRun.command);
      return;
    }

    try {
      await navigator.clipboard.writeText(agentRun.command);
      setCopiedCommand(agentRun.command);
      setFailedCommand("");
      window.setTimeout(() => setCopiedCommand(""), 1600);
    } catch {
      setFailedCommand(agentRun.command);
    }
  }

  function updateProject(projectId: string) {
    const project = projects.find((candidate) => candidate.id === projectId);
    const epic = project?.epics?.[0];
    if (!project) {
      return;
    }

    onChange({
      projectId: project.id,
      projectLabel: project.label,
      epicId: epic?.id ?? "general",
      epicLabel: epic?.label ?? "General"
    });
  }

  function updateEpic(epicId: string) {
    const epic = selectedProject?.epics?.find((candidate) => candidate.id === epicId);
    if (!epic) {
      onChange({ epicId: "custom", epicLabel: epicId || "General" });
      return;
    }

    onChange({ epicId: epic.id, epicLabel: epic.label });
  }

  function addTag(rawTag = tagInput) {
    const nextTags = rawTag
      .split(/[,;]/)
      .map((tag) => normalizeTicketTag(tag))
      .filter(Boolean);
    if (nextTags.length === 0) {
      return;
    }

    onChange({ tags: Array.from(new Set([...ticketTags, ...nextTags])).slice(0, 8) });
    setTagInput("");
  }

  function removeTag(tag: string) {
    onChange({ tags: ticketTags.filter((currentTag) => currentTag !== tag) });
  }

  function handleTagKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }
    if (event.key === "Backspace" && !tagInput && ticketTags.length > 0) {
      removeTag(ticketTags[ticketTags.length - 1]);
    }
  }

  return (
    <div
      className={`ticket-editor${isClosing ? " ticket-editor--closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-editor-title"
    >
      <button type="button" className="ticket-editor__scrim" aria-label="Close ticket editor" onClick={onClose} />
      <section className="ticket-editor__panel">
        <header className="ticket-editor__header">
          <div>
            <p>{ticket.status}</p>
            <h3 id="ticket-editor-title">{ticket.title || ticket.id}</h3>
          </div>
          <button type="button" className="loop-close-button" aria-label="Close ticket editor" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="ticket-editor__body">
          <label>
            Ticket id
            <input value={ticket.id} onChange={(event) => onChange({ id: event.target.value })} />
          </label>
          <label>
            Title
            <input value={ticket.title} onChange={(event) => onChange({ title: event.target.value })} />
          </label>
          <label className="ticket-editor__wide">
            Description
            <textarea value={ticket.description} onChange={(event) => onChange({ description: event.target.value })} />
          </label>

          <section className="ticket-editor__tags ticket-editor__wide" aria-label="Ticket tags">
            <div>
              <span>
                <Tags size={13} />
                Tags
              </span>
              <small>{ticketTags.length}/8</small>
            </div>
            <div className="ticket-editor__tagbox">
              {ticketTags.map((tag) => (
                <button key={tag} type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag} tag`}>
                  #{tag}
                  <X size={12} />
                </button>
              ))}
              <input
                value={tagInput}
                placeholder={ticketTags.length ? "Add another tag" : "Add tags"}
                onBlur={() => addTag()}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
              />
            </div>
          </section>

          <section className="ticket-editor__timestamps ticket-editor__wide" aria-label="Ticket timestamps">
            <div>
              <Clock3 size={13} />
              <span>Created</span>
              <time>{formatPlannerDateTime(ticket.createdAt)}</time>
            </div>
            <div>
              <CalendarDays size={13} />
              <span>Moved</span>
              <time>{formatPlannerDateTime(ticket.movedAt)}</time>
            </div>
            <div>
              <CheckCircle2 size={13} />
              <span>Completed</span>
              <time>{formatPlannerDateTime(ticket.completedAt)}</time>
            </div>
            <div>
              <GitCommitHorizontal size={13} />
              <span>Commit</span>
              <time>{ticket.completedCommit ?? "Not yet"}</time>
            </div>
          </section>

          <section className="ticket-editor__agent-run ticket-editor__wide" aria-label="Agent run">
            <div className="agent-run__heading">
              <div>
                <span>Agent OS</span>
                <strong>Agent run</strong>
              </div>
              <span>{agentRun.runState}</span>
            </div>
            <div className="agent-run__grid">
              <div>
                <GitBranch size={14} />
                <span>Branch</span>
                <code>{agentRun.branch}</code>
              </div>
              <div>
                <FolderGit2 size={14} />
                <span>Worktree</span>
                <code>{agentRun.worktree}</code>
              </div>
            </div>
            <div className="agent-run__command">
              <code>{agentRun.command}</code>
              <button type="button" onClick={copyRunnerCommand}>
                <Clipboard size={14} />
                {copyButtonLabel}
              </button>
            </div>
          </section>

          <label>
            Status
            <select
              value={ticket.status}
              onChange={(event) => onChange({ status: event.target.value as LoopTicketStatus })}
            >
              {ticketStatuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Estimate
            <select value={ticket.estimate} onChange={(event) => onChange({ estimate: Number(event.target.value) })}>
              {fibonacciEstimates.map((estimate) => (
                <option key={estimate} value={estimate}>
                  {estimate}
                </option>
              ))}
            </select>
          </label>

          <label>
            Project
            <select value={ticket.projectId} onChange={(event) => updateProject(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Epic
            <select value={selectedEpic?.id ?? ticket.epicId} onChange={(event) => updateEpic(event.target.value)}>
              {(selectedProject?.epics ?? []).map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.label}
                </option>
              ))}
              {selectedEpic ? null : <option value={ticket.epicId}>{ticket.epicLabel}</option>}
            </select>
          </label>

          <section className="ticket-editor__subtasks ticket-editor__wide">
            <div>
              <strong>Subtasks</strong>
              <button type="button" onClick={onAddSubtask}>
                Add subtask
              </button>
            </div>
            {ticket.subtasks.map((subtask) => (
              <div key={subtask.id} className="ticket-editor__subtask">
                <input
                  type="checkbox"
                  checked={subtask.done}
                  onChange={(event) => onUpdateSubtask(subtask.id, { done: event.target.checked })}
                  aria-label={`Mark ${subtask.title || "subtask"} done`}
                />
                <input
                  value={subtask.title}
                  placeholder="Subtask"
                  onChange={(event) => onUpdateSubtask(subtask.id, { title: event.target.value })}
                />
                <button type="button" onClick={() => onRemoveSubtask(subtask.id)}>
                  Remove
                </button>
              </div>
            ))}
            {ticket.subtasks.length === 0 ? <p>No subtasks yet.</p> : null}
          </section>
        </div>

        <footer className="ticket-editor__footer">
          <button type="button" onClick={onDelete}>
            Delete
          </button>
          <div>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={onSave}>
              Save ticket
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
