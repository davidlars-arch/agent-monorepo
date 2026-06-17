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
  type LoopTicketStatus,
  type PlannerDateFilter,
  type PlannerSubtask,
  type PlannerTicketDraft,
  type UsageStatusSnapshot
} from "@agent/atlas-planner";
import {
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clipboard,
  Clock3,
  Download,
  FileText,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  ListChecks,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Tags,
  Upload,
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

export function AtlasPlannerOverview({
  usageStatus,
  loopKanban,
  currentCommit,
  showExplainer,
  onToggleExplainer,
  onClose
}: {
  usageStatus?: UsageStatusSnapshot | null;
  loopKanban: LoopKanbanProject[];
  currentCommit: string;
  showExplainer: boolean;
  onToggleExplainer: () => void;
  onClose: () => void;
}) {
  const usageMetrics = usageStatus ? getUsageMetrics(usageStatus) : [];
  const [plannerTickets, setPlannerTickets] = useState<KanbanTicket[]>(() => buildPlannerTickets(loopKanban));
  const [hasLoadedPlannerState, setHasLoadedPlannerState] = useState(false);
  const [editingTicket, setEditingTicket] = useState<PlannerTicketDraft | null>(null);
  const [isTicketEditorClosing, setIsTicketEditorClosing] = useState(false);
  const [isActivityDashboardOpen, setIsActivityDashboardOpen] = useState(false);
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LoopTicketStatus | null>(null);
  const [activityDateFilter, setActivityDateFilter] = useState<PlannerDateFilter>("updated");
  const [activityDateRange, setActivityDateRange] = useState(getDefaultDateRange);
  const editorCloseTimeoutRef = useRef<number | null>(null);
  const plannerImportInputRef = useRef<HTMLInputElement | null>(null);
  const suppressTicketClickRef = useRef(false);
  const suppressTicketClickTimeoutRef = useRef<number | null>(null);
  const [plannerStateMessage, setPlannerStateMessage] = useState("");
  const kanbanColumns = getKanbanColumns(plannerTickets, usageStatus);
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
        setPlannerTickets(stored ? hydratePlannerTickets(JSON.parse(stored) as KanbanTicket[]) : buildPlannerTickets(loopKanban));
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
            </div>
            {usageStatus ? (
              <>
                <div className="usage-meta" aria-label="Usage snapshot metadata">
                  <div className="usage-snapshot">
                    <span>Model</span>
                    <strong>{usageStatus.model}</strong>
                  </div>
                  <div className="usage-snapshot usage-snapshot--date">
                    <span>Latest</span>
                    <strong>{usageStatus.recordedAt}</strong>
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
            {usageStatus?.note ? <p className="loop-usage__note">{usageStatus.note}</p> : null}
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
                <span>{getWindowDecisionLabel(usageStatus)}</span>
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
