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
  FileText,
  GitCommitHorizontal,
  ListChecks,
  Network,
  RefreshCw,
  Workflow,
  X
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { ActivityDashboard } from "./atlas-planner/activity-dashboard";
import { GoalComposer } from "./atlas-planner/goal-composer";
import { KanbanBoard } from "./atlas-planner/kanban-board";
import { LoopReliabilityPanel } from "./atlas-planner/loop-reliability-panel";
import { loopFiles, loopSummaries } from "./atlas-planner/overview-data";
import { TicketEditor } from "./atlas-planner/ticket-editor";
import { useAtlasGoals } from "./atlas-planner/use-atlas-goals";
import { usePlannerTickets } from "./atlas-planner/use-planner-tickets";

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

          <LoopReliabilityPanel
            loopPlannerCommand={loopPlannerCommand}
            loopGoalSummary={loopGoalSummary}
            durableQueuedGoals={durableQueuedGoals}
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
