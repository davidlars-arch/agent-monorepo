"use client";

import {
  fibonacciEstimates,
  formatPlannerDateTime,
  normalizeTicketTag,
  ticketStatuses,
  type LoopKanbanProject,
  type LoopTicketStatus,
  type PlannerSubtask,
  type PlannerTicketDraft
} from "@agent/atlas-planner";
import {
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Clock3,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Tags,
  X
} from "lucide-react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";

export function TicketEditor({
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
