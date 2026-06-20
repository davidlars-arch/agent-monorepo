"use client";

import {
  formatPlannerDateTime,
  getDefaultDateRange,
  getLoopGoalSummary,
  getLoopPlannerCommand,
  getUsageMetrics,
  type LoopKanbanProject,
  type LoopPlannerCommand,
  type PlannerDateFilter,
  type UsageStatusSnapshot
} from "@agent/atlas-planner";
import type {
  ControllerMemorySummary,
  CurrentLoopRunSummary,
  QueuedGoalSummary,
  RunnerEvidenceSummary,
  RunnerStateSummary
} from "@agent/loop-store";
import {
  Bot,
  CheckCircle2,
  CircleHelp,
  GitBranch,
  FileText,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  ListChecks,
  Network,
  RefreshCw,
  ShieldCheck,
  Target,
  Workflow,
  X
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { ActivityDashboard } from "./atlas-planner/activity-dashboard";
import { GoalComposer } from "./atlas-planner/goal-composer";
import { KanbanBoard } from "./atlas-planner/kanban-board";
import { TicketEditor } from "./atlas-planner/ticket-editor";
import { useAtlasGoals } from "./atlas-planner/use-atlas-goals";
import { usePlannerTickets } from "./atlas-planner/use-planner-tickets";

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
  const [isActivityDashboardOpen, setIsActivityDashboardOpen] = useState(false);
  const [activityDateFilter, setActivityDateFilter] = useState<PlannerDateFilter>("updated");
  const [activityDateRange, setActivityDateRange] = useState(getDefaultDateRange);
  const {
    plannerTickets,
    kanbanColumns,
    editingTicket,
    isTicketEditorClosing,
    draggingTicketId,
    dragOverStatus,
    plannerImportInputRef,
    plannerStateMessage,
    setDragOverStatus,
    setPlannerStateMessage,
    addPlannerTicket,
    openNewTicket,
    closeTicketEditor,
    updateEditingTicket,
    saveEditingTicket,
    deleteEditingTicket,
    addSubtask,
    updateSubtask,
    removeSubtask,
    exportPlannerState,
    importPlannerState,
    resetPlannerState,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleDrop,
    handleTicketClick,
    handleTicketDragStart,
    handleTicketDragEnd
  } = usePlannerTickets({
    loopKanban,
    currentCommit,
    usageStatus: latestUsageStatus
  });
  const {
    durableQueuedGoals,
    isGoalComposerOpen,
    goalDraft,
    openGoalComposer,
    closeGoalComposer,
    updateGoalDraft,
    updateGoalSafety,
    addGoalLayer,
    updateGoalLayer,
    removeGoalLayer,
    addVerificationCommand,
    updateVerificationCommand,
    removeVerificationCommand,
    saveGoalDraft,
    updateQueuedGoalLifecycle
  } = useAtlasGoals({
    loopKanban,
    queuedGoals,
    initialGoalComposerOpen,
    addPlannerTicket,
    setPlannerStateMessage
  });
  const loopPlannerCommand = getLoopPlannerCommand(loopKanban, latestUsageStatus);
  const loopGoalSummary = getLoopGoalSummary(loopKanban);
  const loopRunTimeline = getLoopRunTimeline(loopPlannerCommand);

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
            <ActivityDashboard
              tickets={plannerTickets}
              dateFilter={activityDateFilter}
              dateRange={activityDateRange}
              onDateFilterChange={setActivityDateFilter}
              onDateRangeChange={setActivityDateRange}
              onClose={() => setIsActivityDashboardOpen(false)}
            />
          ) : null}

          <KanbanBoard
            columns={kanbanColumns}
            usageStatus={latestUsageStatus}
            stateMessage={plannerStateMessage}
            draggingTicketId={draggingTicketId}
            dragOverStatus={dragOverStatus}
            importInputRef={plannerImportInputRef}
            onOpenActivityDashboard={() => setIsActivityDashboardOpen(true)}
            onExportPlannerState={exportPlannerState}
            onImportPlannerState={importPlannerState}
            onResetPlannerState={resetPlannerState}
            onOpenGoalComposer={openGoalComposer}
            onNewTicket={openNewTicket}
            onColumnDragEnter={setDragOverStatus}
            onColumnDragOver={handleColumnDragOver}
            onColumnDragLeave={handleColumnDragLeave}
            onDrop={handleDrop}
            onTicketClick={handleTicketClick}
            onTicketDragStart={handleTicketDragStart}
            onTicketDragEnd={handleTicketDragEnd}
          />

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
