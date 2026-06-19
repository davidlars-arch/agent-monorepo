export type LoopTicketStatus = "backlog" | "in-progress" | "review" | "done" | "blocked";

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
  area?: string;
  cadenceHours?: number;
  permission?: string;
  nextAction: string;
  goal?: LoopGoal;
  epics?: LoopKanbanEpic[];
  commands?: LoopCommand[];
  buildCommands?: LoopCommand[];
  allowFailure?: boolean;
};

export type LoopCommand = {
  name: string;
  cmd: string;
  args?: string[];
  timeoutMs?: number;
};

export type LoopGoalLayerStatus = "pending" | "scaffolded" | "satisfied" | "blocked";

export type LoopGoalLayer = {
  id: string;
  label: string;
  status: LoopGoalLayerStatus;
  criteria: string[];
  evidence?: string[];
};

export type LoopGoal = {
  id: string;
  title: string;
  statement: string;
  stopCondition: string;
  layers: LoopGoalLayer[];
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

export type LoopPlannerCommand = {
  command: string;
  verificationCommand: string;
  maxEstimate: number;
  shortWindowLeft: number | null;
  ticket?: KanbanTicket;
  reason: string;
  stopCondition: string;
  counts: Record<LoopTicketStatus, number>;
  decision: LoopPlannerDecision;
};

export type LoopPlannerScoreBreakdown = {
  fit: number;
  value: number;
  readiness: number;
  freshness: number;
  risk: number;
  total: number;
};

export type LoopPlannerCandidate = {
  ticket: KanbanTicket;
  score: number;
  breakdown: LoopPlannerScoreBreakdown;
  reason: string;
};

export type LoopPlannerDecision = {
  maxEstimate: number;
  shortWindowLeft: number | null;
  selected?: LoopPlannerCandidate;
  candidates: LoopPlannerCandidate[];
  skipped: LoopPlannerCandidate[];
};

export type LoopGoalSummary = {
  goal?: LoopGoal;
  counts: Record<LoopGoalLayerStatus, number>;
  totalLayers: number;
  satisfiedLayers: number;
  isSatisfied: boolean;
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

export function getLoopPlannerCommand(
  projects: LoopKanbanProject[],
  usageStatus?: UsageStatusSnapshot | null
): LoopPlannerCommand {
  const shortWindowLeft = usageStatus ? parseFirstPercent(usageStatus.shortWindow) : null;
  const maxEstimate = estimateBudgetForWindow(shortWindowLeft);
  const tickets = buildPlannerTickets(projects);
  const counts = getTicketStatusCounts(tickets);
  const decision = getLoopPlannerDecision(projects, usageStatus, { preferredProjectId: "atlas-planner" });
  const ticket = decision.selected?.ticket;
  const projectId = ticket?.projectId ?? projects.find((project) => project.id === "atlas-planner")?.id ?? projects[0]?.id;
  const command = projectId
    ? `npm run loop:projects -- --project ${projectId}`
    : "npm run loop:projects -- --list";
  const verificationCommand = projectId
    ? `npm run loop:projects -- --project ${projectId} --build`
    : "npm run loop:projects -- --all --build";

  return {
    command,
    verificationCommand,
    maxEstimate,
    shortWindowLeft,
    ticket,
    reason: decision.selected?.reason ?? getPlannerCommandReason(ticket, maxEstimate, shortWindowLeft),
    stopCondition: "Checks pass, latest-report.md records evidence, and the next action needs human judgment.",
    counts,
    decision
  };
}

export function getLoopPlannerDecision(
  projects: LoopKanbanProject[],
  usageStatus?: UsageStatusSnapshot | null,
  options: { preferredProjectId?: string } = {}
): LoopPlannerDecision {
  const shortWindowLeft = usageStatus ? parseFirstPercent(usageStatus.shortWindow) : null;
  const maxEstimate = estimateBudgetForWindow(shortWindowLeft);
  const tickets = buildPlannerTickets(projects);
  const preferredTickets = options.preferredProjectId
    ? tickets.filter((ticket) => ticket.projectId === options.preferredProjectId)
    : [];
  const scoredPreferredTickets = scorePlannerTickets(preferredTickets, projects, maxEstimate, options.preferredProjectId);
  const scoredTickets =
    scoredPreferredTickets.candidates.length > 0
      ? scoredPreferredTickets
      : scorePlannerTickets(tickets, projects, maxEstimate, options.preferredProjectId);

  return {
    maxEstimate,
    shortWindowLeft,
    selected: scoredTickets.candidates[0],
    candidates: scoredTickets.candidates,
    skipped: scoredTickets.skipped
  };
}

export function getLoopGoalSummary(projects: LoopKanbanProject[], projectId = "atlas-planner"): LoopGoalSummary {
  const goal = projects.find((project) => project.id === projectId)?.goal;
  const counts: Record<LoopGoalLayerStatus, number> = {
    pending: 0,
    scaffolded: 0,
    satisfied: 0,
    blocked: 0
  };

  for (const layer of goal?.layers ?? []) {
    counts[layer.status] += 1;
  }

  const totalLayers = goal?.layers.length ?? 0;
  const satisfiedLayers = counts.satisfied;

  return {
    goal,
    counts,
    totalLayers,
    satisfiedLayers,
    isSatisfied: totalLayers > 0 && satisfiedLayers === totalLayers
  };
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

function getPlannerCommandReason(ticket: KanbanTicket | undefined, maxEstimate: number, shortWindowLeft: number | null) {
  const windowLabel = shortWindowLeft === null ? "without a token snapshot" : `with ${shortWindowLeft}% of the short window left`;
  if (!ticket) {
    return `No actionable ticket is registered, so list the loop registry ${windowLabel}.`;
  }

  if (ticket.estimate <= maxEstimate) {
    return `${ticket.id} fits the ${maxEstimate}-point window ${windowLabel}.`;
  }

  return `${ticket.id} is the smallest actionable ticket, but it is over the ${maxEstimate}-point window ${windowLabel}.`;
}

function scorePlannerTickets(
  tickets: KanbanTicket[],
  projects: LoopKanbanProject[],
  maxEstimate: number,
  preferredProjectId: string | undefined
) {
  const candidates = tickets
    .filter((ticket) => ticket.status !== "done" && ticket.status !== "blocked")
    .map((ticket) => {
      const project = projects.find((candidate) => candidate.id === ticket.projectId);
      const breakdown = getPlannerScoreBreakdown(ticket, project, maxEstimate, preferredProjectId);
      return {
        ticket,
        score: breakdown.total,
        breakdown,
        reason: getPlannerScoreReason(ticket, breakdown, maxEstimate)
      };
    })
    .sort((left, right) => right.score - left.score || right.ticket.estimate - left.ticket.estimate || left.ticket.id.localeCompare(right.ticket.id));

  const skipped = tickets
    .filter((ticket) => ticket.status !== "done" && ticket.status !== "blocked" && ticket.estimate > maxEstimate)
    .map((ticket) => {
      const project = projects.find((candidate) => candidate.id === ticket.projectId);
      const breakdown = getPlannerScoreBreakdown(ticket, project, maxEstimate, preferredProjectId);
      return {
        ticket,
        score: breakdown.total,
        breakdown,
        reason: `${ticket.id} needs ${ticket.estimate} points, above the ${maxEstimate}-point window.`
      };
    })
    .sort((left, right) => right.ticket.estimate - left.ticket.estimate || right.score - left.score)
    .slice(0, 4);

  return { candidates, skipped };
}

function getPlannerScoreBreakdown(
  ticket: KanbanTicket,
  project: LoopKanbanProject | undefined,
  maxEstimate: number,
  preferredProjectId: string | undefined
): LoopPlannerScoreBreakdown {
  const tags = ticket.tags ?? [];
  const fit =
    ticket.estimate <= maxEstimate
      ? 40 + Math.round((ticket.estimate / Math.max(1, maxEstimate)) * 30)
      : -40 - (ticket.estimate - maxEstimate) * 8;
  const value =
    (ticket.projectId === preferredProjectId ? 18 : 0) +
    (tags.some((tag) => ["loop-engineering", "reliability", "usage", "evidence"].includes(tag)) ? 8 : 0);
  const readiness =
    (ticket.summary || ticket.description ? 8 : 0) +
    ((project?.commands?.length ?? 0) > 0 ? 6 : 0) +
    (tags.length > 0 ? 3 : 0);
  const freshness = ticket.status === "in-progress" ? 20 : ticket.status === "review" ? 14 : 4;
  const riskyText = `${project?.permission ?? ""} ${tags.join(" ")} ${ticket.title}`.toLowerCase();
  const risk =
    (riskyText.includes("live trading") || riskyText.includes("migration") || riskyText.includes("auth") ? -24 : 0) +
    (ticket.estimate > maxEstimate ? -12 : 0);
  const total = fit + value + readiness + freshness + risk;

  return { fit, value, readiness, freshness, risk, total };
}

function getPlannerScoreReason(ticket: KanbanTicket, breakdown: LoopPlannerScoreBreakdown, maxEstimate: number) {
  const fitText =
    ticket.estimate <= maxEstimate
      ? `uses ${ticket.estimate}/${maxEstimate} points`
      : `needs ${ticket.estimate}/${maxEstimate} points`;
  const statusText =
    ticket.status === "in-progress"
      ? "continues active work"
      : ticket.status === "review"
        ? "keeps review moving"
        : "starts backlog work";

  return `${ticket.id} scored ${breakdown.total}: ${fitText}, ${statusText}, value ${breakdown.value}, readiness ${breakdown.readiness}, risk ${breakdown.risk}.`;
}

function getTicketStatusCounts(tickets: KanbanTicket[]) {
  return ticketStatuses.reduce<Record<LoopTicketStatus, number>>(
    (counts, status) => ({
      ...counts,
      [status.id]: tickets.filter((ticket) => ticket.status === status.id).length
    }),
    {
      backlog: 0,
      "in-progress": 0,
      review: 0,
      blocked: 0,
      done: 0
    }
  );
}
