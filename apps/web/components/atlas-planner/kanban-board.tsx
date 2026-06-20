"use client";

import {
  formatPlannerDate,
  getWindowDecisionLabel,
  type KanbanTicket,
  type LoopKanbanProject,
  type LoopTicketStatus,
  type PlannerTicketDraft,
  type UsageStatusSnapshot
} from "@agent/atlas-planner";
import { CalendarDays, Download, Plus, RotateCcw, Target, Upload } from "lucide-react";
import type { DragEvent, MouseEvent as ReactMouseEvent, RefObject } from "react";

type KanbanColumn = {
  id: LoopTicketStatus;
  label: string;
  tickets: KanbanTicket[];
};

export function KanbanBoard({
  columns,
  projects,
  usageStatus,
  stateMessage,
  draggingTicketId,
  dragOverStatus,
  importInputRef,
  onOpenActivityDashboard,
  onExportPlannerState,
  onImportPlannerState,
  onResetPlannerState,
  onOpenGoalComposer,
  onNewTicket,
  onColumnDragEnter,
  onColumnDragOver,
  onColumnDragLeave,
  onDrop,
  onTicketClick,
  onTicketDragStart,
  onTicketDragEnd
}: {
  columns: KanbanColumn[];
  projects: LoopKanbanProject[];
  usageStatus: UsageStatusSnapshot | null;
  stateMessage: string;
  draggingTicketId: string | null;
  dragOverStatus: LoopTicketStatus | null;
  importInputRef: RefObject<HTMLInputElement | null>;
  onOpenActivityDashboard: () => void;
  onExportPlannerState: () => void;
  onImportPlannerState: (file: File | undefined) => void;
  onResetPlannerState: () => void;
  onOpenGoalComposer: () => void;
  onNewTicket: (projects: LoopKanbanProject[]) => void;
  onColumnDragEnter: (status: LoopTicketStatus) => void;
  onColumnDragOver: (event: DragEvent<HTMLElement>, status: LoopTicketStatus) => void;
  onColumnDragLeave: (event: DragEvent<HTMLElement>, status: LoopTicketStatus) => void;
  onDrop: (event: DragEvent<HTMLElement>, status: LoopTicketStatus) => void;
  onTicketClick: (event: ReactMouseEvent<HTMLElement>, ticket: PlannerTicketDraft) => void;
  onTicketDragStart: (event: DragEvent<HTMLElement>, ticket: KanbanTicket) => void;
  onTicketDragEnd: () => void;
}) {
  return (
    <section className="loop-kanban" aria-label="Atlas Planner Kanban">
      <div className="loop-kanban__header">
        <div>
          <p>Atlas Planner</p>
          <h3>Epics and tickets</h3>
        </div>
        <div className="loop-kanban__tools">
          <span>{getWindowDecisionLabel(usageStatus)}</span>
          <button type="button" onClick={onOpenActivityDashboard}>
            <CalendarDays size={14} />
            Dashboard
          </button>
          <button type="button" onClick={onExportPlannerState}>
            <Download size={14} />
            Export
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()}>
            <Upload size={14} />
            Import
          </button>
          <button type="button" onClick={onResetPlannerState}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button type="button" onClick={onOpenGoalComposer}>
            <Target size={14} />
            Create goal
          </button>
          <button type="button" onClick={() => onNewTicket(projects)}>
            <Plus size={14} />
            New ticket
          </button>
          <input
            ref={importInputRef}
            className="loop-kanban__import"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              onImportPlannerState(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      {stateMessage ? <p className="loop-kanban__state-message">{stateMessage}</p> : null}
      <div className="loop-kanban__columns">
        {columns.map((column) => (
          <article
            key={column.id}
            className={`loop-kanban__column${draggingTicketId ? " loop-kanban__column--dragging" : ""}${
              dragOverStatus === column.id ? " loop-kanban__column--drop-target" : ""
            }`}
            onDragEnter={() => onColumnDragEnter(column.id)}
            onDragOver={(event) => onColumnDragOver(event, column.id)}
            onDragLeave={(event) => onColumnDragLeave(event, column.id)}
            onDrop={(event) => onDrop(event, column.id)}
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
                  onClick={(event) => onTicketClick(event, ticket)}
                  onDragStart={(event) => onTicketDragStart(event, ticket)}
                  onDragEnd={onTicketDragEnd}
                >
                  <div className="loop-ticket__topline">
                    <span>{ticket.projectLabel}</span>
                    <strong>{ticket.estimate}</strong>
                  </div>
                  <h4>
                    {ticket.id}: {ticket.title}
                  </h4>
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
  );
}
