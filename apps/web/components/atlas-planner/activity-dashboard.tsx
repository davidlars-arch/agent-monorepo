"use client";

import {
  formatPlannerDateTime,
  getTicketTimestamp,
  isTimestampInRange,
  type KanbanTicket,
  type PlannerDateFilter
} from "@agent/atlas-planner";
import { CheckCircle2, X } from "lucide-react";

export type PlannerDateRange = {
  start: string;
  end: string;
};

export function ActivityDashboard({
  tickets,
  dateFilter,
  dateRange,
  onDateFilterChange,
  onDateRangeChange,
  onClose
}: {
  tickets: KanbanTicket[];
  dateFilter: PlannerDateFilter;
  dateRange: PlannerDateRange;
  onDateFilterChange: (dateFilter: PlannerDateFilter) => void;
  onDateRangeChange: (dateRange: PlannerDateRange) => void;
  onClose: () => void;
}) {
  const completedTicketsInRange = tickets.filter((ticket) =>
    isTimestampInRange(ticket.completedAt, dateRange.start, dateRange.end)
  );
  const completedTickets = [...completedTicketsInRange]
    .sort((left, right) => new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime())
    .slice(0, 5);
  const activityTickets = tickets
    .filter((ticket) => isTimestampInRange(getTicketTimestamp(ticket, dateFilter), dateRange.start, dateRange.end))
    .sort(
      (left, right) =>
        new Date(getTicketTimestamp(right, dateFilter) ?? 0).getTime() -
        new Date(getTicketTimestamp(left, dateFilter) ?? 0).getTime()
    )
    .slice(0, 8);

  return (
    <section className="loop-activity loop-activity--overlay" aria-label="Atlas Planner activity dashboard">
      <div className="loop-activity__header">
        <div>
          <p>Activity dashboard</p>
          <h3>Latest movement</h3>
        </div>
        <div className="loop-activity__filters">
          <label>
            Timeline
            <select value={dateFilter} onChange={(event) => onDateFilterChange(event.target.value as PlannerDateFilter)}>
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={dateRange.start}
              onChange={(event) => onDateRangeChange({ ...dateRange, start: event.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={dateRange.end}
              onChange={(event) => onDateRangeChange({ ...dateRange, end: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="loop-close-button"
            aria-label="Close activity dashboard"
            onClick={onClose}
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
          <small>
            {dateRange.start} to {dateRange.end}
          </small>
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
            <strong>{dateFilter} timeline</strong>
            <small>Last 7 days by default</small>
          </div>
          {activityTickets.length > 0 ? (
            activityTickets.map((ticket) => (
              <div key={`${ticket.id}-${dateFilter}`} className="loop-activity__event">
                <span />
                <div>
                  <time>{formatPlannerDateTime(getTicketTimestamp(ticket, dateFilter))}</time>
                  <strong>
                    {ticket.id}: {ticket.title}
                  </strong>
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
  );
}
