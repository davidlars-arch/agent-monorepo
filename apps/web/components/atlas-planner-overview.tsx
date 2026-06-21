"use client";

import {
  getDefaultDateRange,
  getLoopGoalSummary,
  getLoopPlannerCommand,
  getUsageMetrics,
  type LoopKanbanProject,
  type PlannerDateFilter,
  type UsageStatusSnapshot
} from "@agent/atlas-planner";
import type {
  ControllerLockSummary,
  ControllerMemorySummary,
  CurrentLoopRunSummary,
  CurrentRunRecoveryStatus,
  QueuedGoalSummary,
  RunnerEvidenceSummary,
  RunnerStateSummary
} from "@agent/loop-store";
import {
  CircleHelp,
  GitCommitHorizontal,
  ListChecks,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Target,
  X
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { ActivityDashboard } from "./atlas-planner/activity-dashboard";
import { AtlasRunFlow } from "./atlas-planner/atlas-run-flow";
import { GoalComposer } from "./atlas-planner/goal-composer";
import { KanbanBoard } from "./atlas-planner/kanban-board";
import { LoopReliabilityPanel } from "./atlas-planner/loop-reliability-panel";
import { loopFiles, loopSummaries } from "./atlas-planner/overview-data";
import {
  getFirstLoopReadiness,
  getPlannerNextActionState,
  type PlannerNextActionKind
} from "./atlas-planner/planner-next-action";
import { TicketEditor } from "./atlas-planner/ticket-editor";
import { useAtlasGoals } from "./atlas-planner/use-atlas-goals";
import { usePlannerTickets } from "./atlas-planner/use-planner-tickets";

const selectedBoardStorageKey = "atlas-planner:selected-board:v1";

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
  controllerLock,
  currentRunRecovery,
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
  controllerLock?: ControllerLockSummary | null;
  currentRunRecovery?: CurrentRunRecoveryStatus | null;
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
  const [selectedProjectId, setSelectedProjectId] = useState(() => getDefaultSelectedProjectId(loopKanban));
  const [hasLoadedStoredBoard, setHasLoadedStoredBoard] = useState(false);
  const activeSelectedProjectId =
    selectedProjectId === "all" || loopKanban.some((project) => project.id === selectedProjectId)
      ? selectedProjectId
      : getDefaultSelectedProjectId(loopKanban);
  const selectedProject = loopKanban.find((project) => project.id === activeSelectedProjectId);
  const selectedPlannerProjectId = activeSelectedProjectId === "all" ? undefined : activeSelectedProjectId;
  const {
    visiblePlannerTickets,
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
    selectedProjectId: activeSelectedProjectId,
    currentCommit,
    usageStatus: latestUsageStatus,
    currentLoopRun,
    currentRunnerState
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
    selectedProjectId: activeSelectedProjectId,
    queuedGoals,
    initialGoalComposerOpen,
    addPlannerTicket,
    setPlannerStateMessage
  });
  const loopPlannerCommand = getLoopPlannerCommand(loopKanban, latestUsageStatus, {
    preferredProjectId: selectedPlannerProjectId ?? null,
    strictPreferredProject: Boolean(selectedPlannerProjectId)
  });
  const loopGoalSummary = getLoopGoalSummary(loopKanban, selectedPlannerProjectId ?? "atlas-planner");
  const visibleQueuedGoals = getVisibleQueuedGoals(durableQueuedGoals, activeSelectedProjectId);
  const boardLabel = activeSelectedProjectId === "all" ? "All repos" : (selectedProject?.label ?? "Unknown repo");
  const approvedGoalCount = visibleQueuedGoals.filter(isClaimableQueuedGoal).length;
  const nextAction = getPlannerNextActionState({
    approvedGoalCount,
    currentLoopRun,
    currentRunnerState,
    visibleTicketCount: visiblePlannerTickets.length
  });
  const firstLoopReadiness = getFirstLoopReadiness({
    approvedGoalCount,
    currentLoopRun,
    currentRunnerState,
    hasUsageStatus: Boolean(latestUsageStatus),
    visibleTicketCount: visiblePlannerTickets.length
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (hasLoadedStoredBoard) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const storedProjectId = window.localStorage.getItem(selectedBoardStorageKey);
      if (storedProjectId === "all" || loopKanban.some((project) => project.id === storedProjectId)) {
        setSelectedProjectId(storedProjectId ?? "all");
      }
      setHasLoadedStoredBoard(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [hasLoadedStoredBoard, loopKanban]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!hasLoadedStoredBoard) {
      return;
    }
    window.localStorage.setItem(selectedBoardStorageKey, activeSelectedProjectId);
  }, [activeSelectedProjectId, hasLoadedStoredBoard]);

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
            <p>Agentic workflow orchestration</p>
            <h2 id="loop-overview-title">Atlas Planner</h2>
          </div>
          <label className="loop-project-selector">
            <span>Board</span>
            <select value={activeSelectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              <option value="all">All repos</option>
              {loopKanban.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </select>
          </label>
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
          <section className="atlas-planner-purpose" aria-label="Atlas Planner purpose">
            <div>
              <p>What this is</p>
              <strong>Orchestrate approved goals into scoped, verified, review-gated repo changes.</strong>
              <span>
                Tickets shape the work backlog. Goals are execution contracts the orchestrator can claim. Current run is
                the single active workflow with branch, worktree, runner state, checks, evidence, and review.
              </span>
            </div>
            <ol aria-label="Planner workflow">
              <li>Ticket</li>
              <li>Goal</li>
              <li>Queue</li>
              <li>Current run</li>
              <li>Evidence</li>
              <li>Review</li>
            </ol>
          </section>

          <section className="atlas-next-action" aria-label="Planner next action">
            <div className="atlas-next-action__summary">
              <PlannerNextActionIcon kind={nextAction.kind} />
              <div>
                <p>Next safe action</p>
                <strong>{nextAction.label}</strong>
                <span>{nextAction.detail}</span>
              </div>
            </div>
            <dl>
              <div>
                <dt>Board</dt>
                <dd>{boardLabel}</dd>
              </div>
              <div>
                <dt>Tickets</dt>
                <dd>{visiblePlannerTickets.length} visible</dd>
              </div>
              <div>
                <dt>Approved goals</dt>
                <dd>{approvedGoalCount}</dd>
              </div>
              <div>
                <dt>Run</dt>
                <dd>{currentLoopRun ? currentLoopRun.stage : "idle"}</dd>
              </div>
            </dl>
          </section>

          <section className="atlas-loop-readiness" aria-label="First loop setup readiness">
            <div>
              <p>First loop setup</p>
              <strong>{firstLoopReadiness.percent}% ready</strong>
              <span>{firstLoopReadiness.summary}</span>
            </div>
            <ol>
              {firstLoopReadiness.steps.map((step) => (
                <li key={step.label} className={step.done ? "is-done" : ""}>
                  <span>{step.done ? "Ready" : "Needed"}</span>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </li>
              ))}
            </ol>
          </section>

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

          <LoopReliabilityPanel
            loopPlannerCommand={loopPlannerCommand}
            loopGoalSummary={loopGoalSummary}
            durableQueuedGoals={visibleQueuedGoals}
            currentLoopRun={currentLoopRun}
            currentRunnerState={currentRunnerState}
            currentRunnerEvidence={currentRunnerEvidence}
            controllerLock={controllerLock}
            currentRunRecovery={currentRunRecovery}
            controllerMemory={controllerMemory}
            onUpdateQueuedGoalLifecycle={updateQueuedGoalLifecycle}
          />

          {isActivityDashboardOpen ? (
            <ActivityDashboard
              tickets={visiblePlannerTickets}
              dateFilter={activityDateFilter}
              dateRange={activityDateRange}
              onDateFilterChange={setActivityDateFilter}
              onDateRangeChange={setActivityDateRange}
              onClose={() => setIsActivityDashboardOpen(false)}
            />
          ) : null}

          <KanbanBoard
            columns={kanbanColumns}
            selectedProjectLabel={boardLabel}
            visibleTicketCount={visiblePlannerTickets.length}
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
              <AtlasRunFlow />
              <div className="loop-file-map">
                <h3>Files that make the run inspectable</h3>
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

function getDefaultSelectedProjectId(projects: LoopKanbanProject[]) {
  return projects.some((project) => project.id === "atlas-planner") ? "atlas-planner" : (projects[0]?.id ?? "all");
}

function getVisibleQueuedGoals(goals: QueuedGoalSummary[], selectedProjectId: string) {
  if (selectedProjectId === "all") {
    return goals;
  }
  return goals.filter((goal) => (goal.projectId ?? "atlas-planner") === selectedProjectId);
}

function isClaimableQueuedGoal(goal: QueuedGoalSummary) {
  return (
    goal.approvedToRun === true &&
    (goal.lifecycleStatus === "approved" || goal.lifecycleStatus === "running") &&
    goal.status !== "done" &&
    goal.status !== "blocked" &&
    goal.status !== "archived"
  );
}

function PlannerNextActionIcon({ kind }: { kind: PlannerNextActionKind }) {
  if (kind === "review-run") {
    return <RefreshCw size={18} />;
  }
  if (kind === "create-goal") {
    return <Target size={18} />;
  }
  if (kind === "create-ticket") {
    return <ShieldCheck size={18} />;
  }
  return <PlayCircle size={18} />;
}
