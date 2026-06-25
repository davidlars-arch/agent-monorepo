"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getKanbanColumns,
  plannerTicketStorageKey,
  type KanbanTicket,
  type LoopKanbanProject,
  type LoopTicketStatus,
  type PlannerSubtask
} from "@agent/atlas-planner";
import { AtlasRunFlow } from "./atlas-planner/atlas-run-flow";

const demoEventsStorageKey = "atlas-planner:poc-events:v1";
const plannerThemeStorageKey = "atlas-planner:poc-theme:v1";
const defaultGoal =
  "Build a planner GUI where a goal is refined into testable actions, split into subtasks, and shown moving live across a Kanban board while the loop works.";

type POCEvent = {
  id: string;
  message: string;
  at: string;
};

type RunnerStage = "idle" | "refining" | "working" | "reviewing" | "done";
type PlannerTheme = "classic" | "nebula";

export function AtlasPlannerOverview({
  loopKanban,
  currentCommit,
  initialGoalComposerOpen = false,
  showExplainer,
  onToggleExplainer,
  onClose
}: {
  usageStatus?: unknown;
  loopKanban: LoopKanbanProject[];
  queuedGoals?: unknown[];
  currentLoopRun?: unknown;
  currentRunnerState?: unknown;
  currentRunnerEvidence?: unknown;
  controllerLock?: unknown;
  currentRunRecovery?: unknown;
  controllerMemory?: unknown;
  currentCommit: string;
  initialGoalComposerOpen?: boolean;
  showExplainer: boolean;
  onToggleExplainer: () => void;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState(defaultGoal);
  const [tickets, setTickets] = useState<KanbanTicket[]>([]);
  const [events, setEvents] = useState<POCEvent[]>([]);
  const [runnerStage, setRunnerStage] = useState<RunnerStage>(initialGoalComposerOpen ? "refining" : "idle");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LoopTicketStatus | null>(null);
  const [isPanelFullscreen, setIsPanelFullscreen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [theme, setTheme] = useState<PlannerTheme>("classic");
  const [hasLoadedLocalState, setHasLoadedLocalState] = useState(false);
  const runTimersRef = useRef<number[]>([]);
  const columns = useMemo(() => getKanbanColumns(tickets, null), [tickets]);
  const activeTicket = tickets.find((ticket) => ticket.id === activeTicketId);
  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? activeTicket ?? tickets[0];
  const completedCount = tickets.filter((ticket) => ticket.status === "done").length;
  const isRunning = runnerStage !== "idle" && runnerStage !== "done";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        const storedTickets = window.localStorage.getItem(plannerTicketStorageKey);
        const storedEvents = window.localStorage.getItem(demoEventsStorageKey);
        if (storedTickets) {
          setTickets(JSON.parse(storedTickets) as KanbanTicket[]);
        }
        if (storedEvents) {
          setEvents(JSON.parse(storedEvents) as POCEvent[]);
        }
        const storedTheme = window.localStorage.getItem(plannerThemeStorageKey);
        if (storedTheme === "classic" || storedTheme === "nebula") {
          setTheme(storedTheme);
        }
      } catch {
        setTickets([]);
        setEvents([]);
      } finally {
        setHasLoadedLocalState(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!hasLoadedLocalState || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(plannerTicketStorageKey, JSON.stringify(tickets));
  }, [hasLoadedLocalState, tickets]);

  useEffect(() => {
    if (!hasLoadedLocalState || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(demoEventsStorageKey, JSON.stringify(events.slice(0, 20)));
  }, [events, hasLoadedLocalState]);

  useEffect(() => {
    if (!hasLoadedLocalState || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(plannerThemeStorageKey, theme);
  }, [hasLoadedLocalState, theme]);

  useEffect(() => {
    return () => {
      for (const timerId of runTimersRef.current) {
        window.clearTimeout(timerId);
      }
      runTimersRef.current = [];
    };
  }, []);

  function refineGoal() {
    clearRunTimers();
    const nextTickets = buildGoalTickets(goal, loopKanban, currentCommit);
    setTickets(nextTickets);
    setRunnerStage("refining");
    setActiveTicketId(nextTickets[0]?.id ?? null);
    setSelectedTicketId(nextTickets[0]?.id ?? null);
    pushEvent(`Refined goal into ${nextTickets.length} testable action tickets.`);
  }

  function startRun() {
    const seedTickets = tickets.length > 0 ? tickets : buildGoalTickets(goal, loopKanban, currentCommit);
    clearRunTimers();
    setTickets(seedTickets.map((ticket) => ({ ...ticket, status: "backlog" })));
    setRunnerStage("working");
    setActiveTicketId(seedTickets[0]?.id ?? null);
    setSelectedTicketId(seedTickets[0]?.id ?? null);
    pushEvent("Started demo loop. Cards will move through In progress, Review, and Done.");

    seedTickets.forEach((ticket, index) => {
      const offset = index * 3_600;
      schedule(offset, () => {
        setRunnerStage("working");
        setActiveTicketId(ticket.id);
        moveTicket(ticket.id, "in-progress", 1);
        pushEvent(`${ticket.id} started.`);
      });
      schedule(offset + 1_200, () => {
        updateTicketSubtasks(ticket.id, 2);
        pushEvent(`${ticket.id} subtasks updated.`);
      });
      schedule(offset + 2_300, () => {
        setRunnerStage("reviewing");
        moveTicket(ticket.id, "review", 3);
        pushEvent(`${ticket.id} moved to review.`);
      });
      schedule(offset + 3_300, () => {
        moveTicket(ticket.id, "done", Number.POSITIVE_INFINITY);
        pushEvent(`${ticket.id} satisfied with evidence.`);
      });
    });

    schedule(seedTickets.length * 3_600 + 250, () => {
      setRunnerStage("done");
      setActiveTicketId(null);
      pushEvent("Loop finished. The goal is now represented as completed, testable slices.");
    });
  }

  function resetBoard() {
    clearRunTimers();
    setTickets([]);
    setEvents([]);
    setRunnerStage("idle");
    setActiveTicketId(null);
    setSelectedTicketId(null);
  }

  function schedule(delay: number, action: () => void) {
    if (typeof window === "undefined") {
      return;
    }
    const id = window.setTimeout(action, delay);
    runTimersRef.current.push(id);
  }

  function clearRunTimers() {
    if (typeof window === "undefined") {
      return;
    }
    for (const timerId of runTimersRef.current) {
      window.clearTimeout(timerId);
    }
    runTimersRef.current = [];
  }

  function pushEvent(message: string) {
    const now = new Date().toISOString();
    setEvents((current) => [{ id: `${Date.now()}-${Math.random()}`, message, at: now }, ...current].slice(0, 20));
  }

  function moveTicket(ticketId: string, status: LoopTicketStatus, doneSubtasks: number) {
    const now = new Date().toISOString();
    setTickets((current) =>
      current.map((ticket) => {
        if (ticket.id !== ticketId) {
          return ticket;
        }
        return {
          ...ticket,
          status,
          updatedAt: now,
          movedAt: now,
          completedAt: status === "done" ? now : undefined,
          completedCommit: status === "done" ? currentCommit : undefined,
          subtasks: completeSubtasks(ticket.subtasks, doneSubtasks)
        };
      })
    );
  }

  function updateTicketSubtasks(ticketId: string, doneSubtasks: number) {
    const now = new Date().toISOString();
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              updatedAt: now,
              subtasks: completeSubtasks(ticket.subtasks, doneSubtasks)
            }
          : ticket
      )
    );
  }

  function handleDrop(status: LoopTicketStatus) {
    if (draggingTicketId) {
      moveTicket(draggingTicketId, status, 0);
      pushEvent(`${draggingTicketId} manually moved to ${status}.`);
    }
    setDraggingTicketId(null);
    setDragOverStatus(null);
  }

  return (
    <div
      className={`loop-overlay ${isPanelFullscreen ? "loop-overlay--fullscreen" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loop-overview-title"
    >
      <button type="button" className="loop-overlay__scrim" aria-label="Close loop overview" onClick={onClose} />
      <section className={`loop-panel atlas-poc atlas-poc--${theme} ${isPanelFullscreen ? "loop-panel--fullscreen" : ""}`}>
        <header className="loop-panel__header">
          <button
            type="button"
            className="loop-maximize-button"
            aria-label={isPanelFullscreen ? "Restore Atlas Planner size" : "Maximize Atlas Planner"}
            title={isPanelFullscreen ? "Restore" : "Maximize"}
            onClick={() => setIsPanelFullscreen((current) => !current)}
          >
            {isPanelFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <div className="loop-panel__title">
            <p>Live goal planner POC</p>
            <h2 id="loop-overview-title">Atlas Planner</h2>
            <span>Set a goal, refine it into testable slices, then watch the loop move cards live.</span>
          </div>
          <div className="loop-panel__actions">
            <button
              type="button"
              className="atlas-poc__theme-toggle"
              role="switch"
              aria-checked={theme === "nebula"}
              aria-label={`Switch to ${theme === "nebula" ? "Classic" : "Nebula"} theme`}
              onClick={() => setTheme((current) => (current === "nebula" ? "classic" : "nebula"))}
            >
              <span className="atlas-poc__theme-toggle-track" aria-hidden="true">
                <span className="atlas-poc__theme-toggle-thumb" />
              </span>
              <span className="atlas-poc__theme-toggle-text">{theme === "nebula" ? "Nebula" : "Classic"}</span>
            </button>
            <button type="button" className="loop-help-button" onClick={onToggleExplainer}>
              <ListChecks size={16} />
              {showExplainer ? "Planner board" : "Flow"}
            </button>
            <button type="button" className="loop-close-button" aria-label="Close loop overview" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="loop-panel__body">
          {showExplainer ? (
            <section className="loop-explainer loop-explainer--top" aria-label="Loop architecture overview">
              <AtlasRunFlow />
            </section>
          ) : (
            <div className="atlas-poc__workspace">
              <section className="atlas-poc__control">
                <div className="atlas-poc__goal">
                  <div>
                    <p>Goal</p>
                    <h3>Describe what the loop should build</h3>
                  </div>
                  <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={5} />
                  <div className="atlas-poc__actions">
                    <button type="button" onClick={refineGoal}>
                      <Sparkles size={16} />
                      Refine goal
                    </button>
                    <button type="button" onClick={startRun} disabled={isRunning}>
                      <Play size={16} />
                      {isRunning ? "Running" : "Start live run"}
                    </button>
                    <button type="button" onClick={resetBoard}>
                      <RefreshCw size={16} />
                      Reset
                    </button>
                  </div>
                </div>

                <div className="atlas-poc__status" aria-label="Current loop status">
                  <article>
                    <Target size={18} />
                    <span>Stage</span>
                    <strong>{getRunnerStageLabel(runnerStage)}</strong>
                  </article>
                  <article>
                    <ClipboardCheck size={18} />
                    <span>Tickets</span>
                    <strong>
                      {completedCount}/{tickets.length}
                    </strong>
                  </article>
                  <article>
                    <CheckCircle2 size={18} />
                    <span>Active</span>
                    <strong>{activeTicket?.id ?? "none"}</strong>
                  </article>
                </div>

                <div className="atlas-poc__details">
                  <div>
                    <p>Selected ticket</p>
                    <strong>{selectedTicket ? `${selectedTicket.id}: ${selectedTicket.title}` : "No ticket selected"}</strong>
                    <span>{selectedTicket?.summary ?? "Refine a goal to create the first testable actions."}</span>
                  </div>
                  {selectedTicket ? (
                    <ol>
                      {selectedTicket.subtasks.map((subtask) => (
                        <li key={subtask.id} className={subtask.done ? "is-done" : ""}>
                          <span>{subtask.done ? "Done" : "Open"}</span>
                          {subtask.title}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>
              </section>

              <section className="atlas-poc__board" aria-label="Live Kanban board">
                <div className="atlas-poc__board-header">
                  <div>
                    <p>Kanban board</p>
                    <h3>Live loop state</h3>
                  </div>
                  <button type="button" onClick={refineGoal}>
                    <Plus size={15} />
                    Rebuild tickets
                  </button>
                </div>
                <div className="atlas-poc__columns">
                  {columns.map((column) => (
                    <article
                      key={column.id}
                      className={`atlas-poc__column ${dragOverStatus === column.id ? "is-drop-target" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverStatus(column.id);
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          return;
                        }
                        setDragOverStatus(null);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleDrop(column.id);
                      }}
                    >
                      <div className="atlas-poc__column-heading">
                        <strong>{column.label}</strong>
                        <span>{column.tickets.length}</span>
                      </div>
                      <div className="atlas-poc__cards">
                        {column.tickets.map((ticket) => (
                          <button
                            type="button"
                            key={ticket.id}
                            draggable
                            className={`atlas-poc__card ${ticket.id === activeTicketId ? "is-active" : ""}`}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            onDragStart={(event) => {
                              setDraggingTicketId(ticket.id);
                              event.dataTransfer.setData("text/plain", ticket.id);
                            }}
                            onDragEnd={() => {
                              setDraggingTicketId(null);
                              setDragOverStatus(null);
                            }}
                          >
                            <span>{ticket.id}</span>
                            <strong>{ticket.title}</strong>
                            <small>{ticket.summary}</small>
                            <em>
                              {ticket.subtasks.filter((subtask) => subtask.done).length}/{ticket.subtasks.length} subtasks
                            </em>
                          </button>
                        ))}
                        {column.tickets.length === 0 ? <p>No cards</p> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="atlas-poc__events" aria-label="Live loop events">
                <div>
                  <p>Run log</p>
                  <strong>Live changes</strong>
                </div>
                <ol>
                  {events.length > 0 ? (
                    events.map((event) => (
                      <li key={event.id}>
                        <time>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                        <span>{event.message}</span>
                      </li>
                    ))
                  ) : (
                    <li>
                      <time>--:--</time>
                      <span>Refine a goal or start a run to see planner changes here.</span>
                    </li>
                  )}
                </ol>
              </section>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function buildGoalTickets(goal: string, projects: LoopKanbanProject[], currentCommit: string): KanbanTicket[] {
  const now = new Date().toISOString();
  const project = projects.find((candidate) => candidate.id === "atlas-planner") ?? projects[0];
  const projectId = project?.id ?? "atlas-planner";
  const projectLabel = project?.label ?? "Atlas Planner";
  const epic = project?.epics?.find((candidate) => candidate.id === "planner-product") ?? project?.epics?.[0];
  const normalizedGoal = goal.trim() || defaultGoal;
  const specs = [
    {
      id: "GOAL-1",
      title: "Refine goal contract",
      summary: "Turn the rough goal into outcome, scope, stop condition, and acceptance checks.",
      subtasks: ["Write the outcome in one sentence", "Define stop condition", "List acceptance checks"]
    },
    {
      id: "GOAL-2",
      title: "Create build subtasks",
      summary: "Split the goal into small tickets that can be moved, tested, and closed independently.",
      subtasks: ["Identify UI slices", "Attach testable actions", "Order work by dependency"]
    },
    {
      id: "GOAL-3",
      title: "Run live Kanban loop",
      summary: "Move the active ticket through work, review, and done while updating subtask proof.",
      subtasks: ["Start active ticket", "Update subtask progress", "Move card to review"]
    },
    {
      id: "GOAL-4",
      title: "Verify visible planner outcome",
      summary: "Confirm the board shows the completed goal, subtasks, evidence, and latest commit reference.",
      subtasks: ["Mark checks as satisfied", "Record final event", `Attach commit ${currentCommit}`]
    }
  ];

  return specs.map((spec, index) => ({
    id: spec.id,
    title: spec.title,
    status: "backlog",
    estimate: index === 0 ? 2 : 3,
    summary: spec.summary,
    tags: ["goal", "poc", "live-loop"],
    projectId,
    projectLabel,
    epicId: epic?.id ?? "planner-poc",
    epicLabel: epic?.label ?? "Planner POC",
    fitLabel: "poc",
    description: `${normalizedGoal}\n\n${spec.summary}`,
    subtasks: spec.subtasks.map((title, subtaskIndex) => ({
      id: `${spec.id}-SUB-${subtaskIndex + 1}`,
      title,
      done: false
    })),
    createdAt: now,
    updatedAt: now,
    movedAt: now
  }));
}

function completeSubtasks(subtasks: PlannerSubtask[], doneCount: number) {
  return subtasks.map((subtask, index) => ({
    ...subtask,
    done: index < doneCount
  }));
}

function getRunnerStageLabel(stage: RunnerStage) {
  if (stage === "refining") {
    return "Refined";
  }
  if (stage === "working") {
    return "Working";
  }
  if (stage === "reviewing") {
    return "Reviewing";
  }
  if (stage === "done") {
    return "Done";
  }
  return "Idle";
}
