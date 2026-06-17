export type LoopTicketStatus = "backlog" | "in-progress" | "review" | "done" | "blocked";

export * from "./reporting.ts";
export * from "./runs.ts";

export type LoopKanbanTicket = {
  id: string;
  title: string;
  status: LoopTicketStatus;
  estimate: number;
  summary: string;
  tags?: string[];
};

export type LoopKanbanEpic = {
  id: string;
  label: string;
  tickets: LoopKanbanTicket[];
};

export type LoopKanbanProject = {
  id: string;
  label: string;
  nextAction: string;
  epics?: LoopKanbanEpic[];
};

export type UsageStatusSnapshot = {
  recordedAt: string;
  model: string;
  context: string;
  currentTokens: string;
  shortWindow: string;
  weekly: string;
  note?: string;
};

export type UsageMetric = {
  label: string;
  value: string;
  detail: string;
  percentLeft?: number;
  tone: "cyan" | "teal" | "violet";
};

export type PlannerSubtask = {
  id: string;
  title: string;
  done: boolean;
};

export type KanbanTicket = LoopKanbanTicket & {
  projectId: string;
  epicId: string;
  epicLabel: string;
  projectLabel: string;
  fitLabel: string;
  description: string;
  subtasks: PlannerSubtask[];
  createdAt: string;
  updatedAt: string;
  movedAt?: string;
  completedAt?: string;
  completedCommit?: string;
};

export type PlannerTicketDraft = Omit<KanbanTicket, "fitLabel"> & {
  fitLabel?: string;
};

export type PlannerDateFilter = "created" | "updated" | "completed";

export type PlannerStateExport = {
  version: 1;
  exportedAt: string;
  tickets: KanbanTicket[];
};

export const plannerTicketStorageKey = "atlas-planner:tickets:v1";
export const plannerStateExportVersion = 1;
export const fibonacciEstimates = [1, 2, 3, 5, 8, 13, 21];
export const ticketStatuses: Array<{ id: LoopTicketStatus; label: string }> = [
  { id: "backlog", label: "Backlog" },
  { id: "in-progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" }
];

export function parseFirstPercent(value: string) {
  const match = value.match(/(\d{1,3})%/);
  if (!match) {
    return null;
  }

  return Math.min(100, Math.max(0, Number(match[1])));
}

export function getUsageMetrics(usageStatus: UsageStatusSnapshot): UsageMetric[] {
  const contextUsed = parseFirstPercent(usageStatus.context);
  const contextLeft = contextUsed === null ? undefined : 100 - contextUsed;
  const shortWindowLeft = parseFirstPercent(usageStatus.shortWindow) ?? undefined;
  const weeklyLeft = parseFirstPercent(usageStatus.weekly) ?? undefined;

  return [
    {
      label: "Context",
      value: contextLeft === undefined ? "Unknown" : `${contextLeft}% left`,
      detail: usageStatus.context,
      percentLeft: contextLeft,
      tone: "cyan"
    },
    {
      label: "Window",
      value: shortWindowLeft === undefined ? "Unknown" : `${shortWindowLeft}% left`,
      detail: usageStatus.shortWindow,
      percentLeft: shortWindowLeft,
      tone: "teal"
    },
    {
      label: "Week",
      value: weeklyLeft === undefined ? "Unknown" : `${weeklyLeft}% left`,
      detail: usageStatus.weekly,
      percentLeft: weeklyLeft,
      tone: "violet"
    }
  ];
}

export function buildPlannerTickets(projects: LoopKanbanProject[]): KanbanTicket[] {
  const now = new Date().toISOString();

  return projects.flatMap((project) =>
    (project.epics ?? []).flatMap((epic) =>
      epic.tickets.map((ticket) => ({
        ...ticket,
        projectId: project.id,
        epicId: epic.id,
        epicLabel: epic.label,
        projectLabel: project.label,
        description: ticket.summary,
        fitLabel: "",
        subtasks: [],
        tags: ticket.tags ?? [],
        createdAt: now,
        updatedAt: now,
        movedAt: now,
        completedAt: ticket.status === "done" ? now : undefined
      }))
    )
  );
}

export function getKanbanColumns(tickets: KanbanTicket[], usageStatus?: UsageStatusSnapshot | null) {
  const maxEstimate = estimateBudgetForWindow(usageStatus ? parseFirstPercent(usageStatus.shortWindow) : null);
  const columns: Array<{ id: LoopTicketStatus; label: string; tickets: KanbanTicket[] }> = [
    { id: "backlog", label: "Backlog", tickets: [] },
    { id: "in-progress", label: "In progress", tickets: [] },
    { id: "review", label: "Review", tickets: [] },
    { id: "blocked", label: "Blocked", tickets: [] },
    { id: "done", label: "Done", tickets: [] }
  ];

  for (const ticket of tickets) {
    const column = columns.find((candidate) => candidate.id === ticket.status);
    if (column) {
      column.tickets.push({
        ...ticket,
        fitLabel: ticket.estimate <= maxEstimate ? `fits <= ${maxEstimate}` : `over ${maxEstimate}`
      });
    }
  }

  for (const column of columns) {
    column.tickets.sort((left, right) => left.estimate - right.estimate || left.id.localeCompare(right.id));
  }

  return columns;
}

export function getDefaultPlannerTicket(projects: LoopKanbanProject[]): PlannerTicketDraft {
  const project = projects[0] ?? { id: "atlas-planner", label: "Atlas Planner", epics: [] };
  const epic = project.epics?.[0] ?? { id: "general", label: "General", tickets: [] };
  const now = new Date().toISOString();
  const ticketStamp = Date.now().toString(36).toUpperCase();

  return {
    id: `AP-${ticketStamp}`,
    title: "New ticket",
    status: "backlog",
    estimate: 3,
    summary: "",
    description: "",
    projectId: project.id,
    projectLabel: project.label,
    epicId: epic.id,
    epicLabel: epic.label,
    subtasks: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    movedAt: now
  };
}

export function normalizePlannerTicket(ticket: PlannerTicketDraft): KanbanTicket {
  const now = new Date().toISOString();
  const uniqueTags = Array.from(
    new Set((ticket.tags ?? []).map((tag) => normalizeTicketTag(tag)).filter(Boolean))
  ).slice(0, 8);
  const completedAt = ticket.status === "done" ? ticket.completedAt ?? now : undefined;

  return {
    ...ticket,
    id: ticket.id.trim() || `AP-${Date.now().toString(36).toUpperCase()}`,
    title: ticket.title.trim() || "Untitled ticket",
    summary: ticket.description.trim() || ticket.summary.trim() || "No description yet.",
    description: ticket.description.trim() || ticket.summary.trim(),
    fitLabel: ticket.fitLabel ?? "",
    tags: uniqueTags,
    createdAt: ticket.createdAt,
    updatedAt: now,
    movedAt: ticket.movedAt ?? now,
    completedAt,
    completedCommit: ticket.status === "done" ? ticket.completedCommit : undefined,
    subtasks: ticket.subtasks.filter((subtask) => subtask.title.trim()).map((subtask) => ({
      ...subtask,
      title: subtask.title.trim()
    }))
  };
}

export function hydratePlannerTickets(tickets: KanbanTicket[]): KanbanTicket[] {
  const now = new Date().toISOString();

  return tickets.map((ticket) => ({
    ...ticket,
    description: ticket.description ?? ticket.summary ?? "",
    fitLabel: ticket.fitLabel ?? "",
    subtasks: ticket.subtasks ?? [],
    tags: ticket.tags ?? [],
    createdAt: ticket.createdAt ?? now,
    updatedAt: ticket.updatedAt ?? ticket.createdAt ?? now,
    movedAt: ticket.movedAt ?? ticket.updatedAt ?? ticket.createdAt ?? now,
    completedAt: ticket.status === "done" ? ticket.completedAt ?? ticket.updatedAt ?? now : undefined,
    completedCommit: ticket.status === "done" ? ticket.completedCommit : undefined
  }));
}

export function createPlannerStateExport(tickets: KanbanTicket[]): PlannerStateExport {
  return {
    version: plannerStateExportVersion,
    exportedAt: new Date().toISOString(),
    tickets: hydratePlannerTickets(tickets)
  };
}

export function parsePlannerStateImport(rawState: string): KanbanTicket[] {
  const parsedState = JSON.parse(rawState) as unknown;
  const tickets = getPlannerTicketsFromImport(parsedState);

  if (!tickets) {
    throw new Error("Atlas Planner import must contain a tickets array.");
  }

  return hydratePlannerTickets(tickets.map(coerceImportedTicket));
}

export function normalizeTicketTag(tag: string) {
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
}

export function getTicketTimestamp(ticket: KanbanTicket, filter: PlannerDateFilter) {
  if (filter === "created") {
    return ticket.createdAt;
  }
  if (filter === "completed") {
    return ticket.completedAt;
  }
  return ticket.updatedAt;
}

export function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { start: formatDateInput(start), end: formatDateInput(end) };
}

export function isTimestampInRange(timestamp: string | undefined, startDate: string, endDate: string) {
  if (!timestamp) {
    return false;
  }

  const time = new Date(timestamp).getTime();
  const range = getRangeBounds(startDate, endDate);
  return Number.isFinite(time) && time >= range.start && time <= range.end;
}

export function formatPlannerDateTime(timestamp: string | undefined) {
  if (!timestamp) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function formatPlannerDate(timestamp: string | undefined) {
  if (!timestamp) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-SE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

export function estimateBudgetForWindow(percentLeft: number | null) {
  if (percentLeft === null) {
    return 8;
  }
  if (percentLeft >= 70) {
    return 21;
  }
  if (percentLeft >= 45) {
    return 13;
  }
  if (percentLeft >= 25) {
    return 8;
  }
  if (percentLeft >= 12) {
    return 5;
  }
  return 3;
}

export function getWindowDecisionLabel(usageStatus?: UsageStatusSnapshot | null) {
  if (!usageStatus) {
    return "No token snapshot: max 8";
  }

  const shortWindowLeft = parseFirstPercent(usageStatus.shortWindow);
  return `Short window max: ${estimateBudgetForWindow(shortWindowLeft)} pts`;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getRangeBounds(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  return { start: start.getTime(), end: end.getTime() };
}

function getPlannerTicketsFromImport(parsedState: unknown) {
  if (Array.isArray(parsedState)) {
    return parsedState;
  }

  if (
    parsedState &&
    typeof parsedState === "object" &&
    "tickets" in parsedState &&
    Array.isArray((parsedState as { tickets?: unknown }).tickets)
  ) {
    return (parsedState as { tickets: unknown[] }).tickets;
  }

  return null;
}

function coerceImportedTicket(ticket: unknown): KanbanTicket {
  if (!ticket || typeof ticket !== "object") {
    throw new Error("Atlas Planner import includes an invalid ticket.");
  }

  const source = ticket as Partial<KanbanTicket>;
  const now = new Date().toISOString();
  const status = isTicketStatus(source.status) ? source.status : "backlog";
  const id = coerceString(source.id, `AP-${Date.now().toString(36).toUpperCase()}`);
  const summary = coerceString(source.summary, source.description ?? "No description yet.");
  const description = coerceString(source.description, summary);

  return {
    id,
    title: coerceString(source.title, "Untitled ticket"),
    status,
    estimate: fibonacciEstimates.includes(Number(source.estimate)) ? Number(source.estimate) : 3,
    summary,
    tags: Array.isArray(source.tags) ? source.tags.map((tag) => normalizeTicketTag(String(tag))).filter(Boolean) : [],
    projectId: coerceString(source.projectId, "atlas-planner"),
    epicId: coerceString(source.epicId, "general"),
    epicLabel: coerceString(source.epicLabel, "General"),
    projectLabel: coerceString(source.projectLabel, "Atlas Planner"),
    fitLabel: coerceString(source.fitLabel, ""),
    description,
    subtasks: Array.isArray(source.subtasks)
      ? source.subtasks
          .filter((subtask) => Boolean(subtask) && typeof subtask === "object")
          .map((subtask) => subtask as Partial<PlannerSubtask>)
          .map((subtask, index) => ({
            id: coerceString(subtask.id, `sub-${index}`),
            title: coerceString(subtask.title, "Imported subtask"),
            done: Boolean(subtask.done)
          }))
      : [],
    createdAt: coerceDateString(source.createdAt, now),
    updatedAt: coerceDateString(source.updatedAt, source.createdAt ?? now),
    movedAt: coerceDateString(source.movedAt, source.updatedAt ?? source.createdAt ?? now),
    completedAt: status === "done" ? coerceDateString(source.completedAt, source.updatedAt ?? now) : undefined,
    completedCommit: status === "done" ? coerceOptionalString(source.completedCommit) : undefined
  };
}

function coerceString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function coerceDateString(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return Number.isFinite(new Date(value).getTime()) ? value : fallback;
}

function coerceOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isTicketStatus(value: unknown): value is LoopTicketStatus {
  return ticketStatuses.some((status) => status.id === value);
}
