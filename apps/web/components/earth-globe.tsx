"use client";

import { repoNodes } from "@agent/repo-graph";
import {
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Gamepad2,
  GitCommitHorizontal,
  ListChecks,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Tags,
  Workflow,
  X,
  ZoomOut
} from "lucide-react";
import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type GlobeProject = {
  id: string;
  label: string;
  shortLabel: string;
  summary: string;
  lat: number;
  lon: number;
  color: string;
};

type ProjectDetail = {
  eyebrow: string;
  title: string;
  preview: "web" | "crypto" | "package" | "game" | "analytics" | "data" | "docs";
  lastBuilt: string;
  commit: string;
  commitSummary: string;
};

type CameraMove = {
  startCamera: THREE.Vector3;
  startLookAt: THREE.Vector3;
  targetCamera: THREE.Vector3;
  targetLookAt: THREE.Vector3;
  startedAt: number;
  durationMs: number;
  revealProjectId?: string;
  hasRevealedDetail: boolean;
};

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

type UsageMetric = {
  label: string;
  value: string;
  detail: string;
  percentLeft?: number;
  tone: "cyan" | "teal" | "violet" | "slate";
};

type KanbanTicket = LoopKanbanTicket & {
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

type PlannerSubtask = {
  id: string;
  title: string;
  done: boolean;
};

type PlannerTicketDraft = Omit<KanbanTicket, "fitLabel"> & {
  fitLabel?: string;
};

type PlannerDateFilter = "created" | "updated" | "completed";

const plannerTicketStorageKey = "atlas-planner:tickets:v1";
const fibonacciEstimates = [1, 2, 3, 5, 8, 13, 21];
const ticketStatuses: Array<{ id: LoopTicketStatus; label: string }> = [
  { id: "backlog", label: "Backlog" },
  { id: "in-progress", label: "In progress" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" }
];

const projectLocations: Record<string, Pick<GlobeProject, "lat" | "lon" | "color">> = {
  web: { lat: 8, lon: -72, color: "#9f7aea" },
  "crypto-trader": { lat: 46, lon: -26, color: "#22c55e" },
  "crypto-tax": { lat: -8, lon: -34, color: "#14b8a6" },
  ui: { lat: 24, lon: 42, color: "#67e8f9" },
  "repo-graph": { lat: -12, lon: 116, color: "#facc15" },
  "unity-rpg": { lat: -42, lon: -66, color: "#fb7185" },
  dbt: { lat: -18, lon: 10, color: "#34d399" },
  seeds: { lat: -50, lon: 76, color: "#2dd4bf" },
  docs: { lat: 54, lon: 138, color: "#f8fafc" }
};

const atmosphereVertexShader = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float edge = 1.0 - max(dot(normalize(vWorldNormal), viewDirection), 0.0);
    float rim = smoothstep(0.28, 0.96, pow(edge, 1.45));
    float feather = smoothstep(0.12, 0.44, edge);
    float alpha = rim * feather * 0.44;
    vec3 color = mix(vec3(0.42, 0.82, 1.0), vec3(0.84, 0.52, 1.0), rim);

    gl_FragColor = vec4(color, alpha);
  }
`;

const projectDetails: Record<string, ProjectDetail> = {
  web: {
    eyebrow: "Next.js app",
    title: "OpenClaw Atlas web surface",
    preview: "web",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial scaffold with the web app, shared packages, Unity slot, analytics POC, and docs."
  },
  "crypto-trader": {
    eyebrow: "Trading experiment",
    title: "Kraken dry-run trader",
    preview: "crypto",
    lastBuilt: "2026-06-16 workspace build",
    commit: "69bd8a3 · 2026-06-16",
    commitSummary: "Adds a guarded spot-trading POC with scan, dry tick, live tick, state, indicators, and Kraken API code."
  },
  "crypto-tax": {
    eyebrow: "SaaS prototype",
    title: "Sweden crypto tax workbench",
    preview: "analytics",
    lastBuilt: "2026-06-16 workspace build",
    commit: "workspace draft",
    commitSummary: "Adds a Sweden-first crypto tax calculator app with CSV import, average-cost tracking, and K4-style disposal summaries."
  },
  ui: {
    eyebrow: "Shared package",
    title: "Interface primitives",
    preview: "package",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial shared React primitives for panels and icon buttons."
  },
  "repo-graph": {
    eyebrow: "Shared metadata",
    title: "Repo graph model",
    preview: "package",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial typed project-node data, now expanded with labels, groups, and featured landmarks."
  },
  "unity-rpg": {
    eyebrow: "Game project",
    title: "Astral Rift WebGL slice",
    preview: "game",
    lastBuilt: "2026-06-16 workspace build",
    commit: "5cf9e6d · 2026-06-16",
    commitSummary: "Initial Unity RPG slot and WebGL mount; workspace now includes the Astral Rift build and embedded route."
  },
  dbt: {
    eyebrow: "Analytics POC",
    title: "dbt repo-health models",
    preview: "analytics",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial DuckDB/dbt proof of concept with seeds and repo-health model structure."
  },
  seeds: {
    eyebrow: "Data seed set",
    title: "Repo health seed data",
    preview: "data",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial CSV seeds for repos, events, and runs used by the analytics proof of concept."
  },
  docs: {
    eyebrow: "Documentation",
    title: "Architecture notes",
    preview: "docs",
    lastBuilt: "2026-06-16 workspace build",
    commit: "52394b5 · 2026-06-15",
    commitSummary: "Initial docs with the monorepo layout and operating architecture."
  }
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

function parseFirstPercent(value: string) {
  const match = value.match(/(\d{1,3})%/);
  if (!match) {
    return null;
  }

  return Math.min(100, Math.max(0, Number(match[1])));
}

function formatCurrentTokenValue(value: string) {
  return value.toLowerCase().includes("not shown") ? "Unavailable" : value;
}

function getUsageMetrics(usageStatus: UsageStatusSnapshot): UsageMetric[] {
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
    },
    {
      label: "Request",
      value: formatCurrentTokenValue(usageStatus.currentTokens),
      detail: "Latest token spend",
      tone: "slate"
    }
  ];
}

function buildPlannerTickets(projects: LoopKanbanProject[]): KanbanTicket[] {
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

function getKanbanColumns(tickets: KanbanTicket[], usageStatus?: UsageStatusSnapshot | null) {
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

function getDefaultPlannerTicket(projects: LoopKanbanProject[]): PlannerTicketDraft {
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

function normalizePlannerTicket(ticket: PlannerTicketDraft): KanbanTicket {
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

function hydratePlannerTickets(tickets: KanbanTicket[]): KanbanTicket[] {
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

function normalizeTicketTag(tag: string) {
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
}

function getTicketTimestamp(ticket: KanbanTicket, filter: PlannerDateFilter) {
  if (filter === "created") {
    return ticket.createdAt;
  }
  if (filter === "completed") {
    return ticket.completedAt;
  }
  return ticket.updatedAt;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { start: formatDateInput(start), end: formatDateInput(end) };
}

function getRangeBounds(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);
  return { start: start.getTime(), end: end.getTime() };
}

function isTimestampInRange(timestamp: string | undefined, startDate: string, endDate: string) {
  if (!timestamp) {
    return false;
  }

  const time = new Date(timestamp).getTime();
  const range = getRangeBounds(startDate, endDate);
  return Number.isFinite(time) && time >= range.start && time <= range.end;
}

function formatPlannerDateTime(timestamp: string | undefined) {
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

function formatPlannerDate(timestamp: string | undefined) {
  if (!timestamp) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-SE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function estimateBudgetForWindow(percentLeft: number | null) {
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

function getWindowDecisionLabel(usageStatus?: UsageStatusSnapshot | null) {
  if (!usageStatus) {
    return "No token snapshot: max 8";
  }

  const shortWindowLeft = parseFirstPercent(usageStatus.shortWindow);
  return `Short window max: ${estimateBudgetForWindow(shortWindowLeft)} pts`;
}

const getDefaultCameraPosition = () => {
  if (typeof window === "undefined") {
    return new THREE.Vector3(0, 0.35, 3.45);
  }

  const isClassicSeViewport = window.matchMedia(
    "(width: 320px) and (height: 568px) and (-webkit-device-pixel-ratio: 2), (width: 320px) and (height: 568px) and (resolution: 2dppx), (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)"
  ).matches;

  if (isClassicSeViewport) {
    return new THREE.Vector3(0, 0.2, 4.65);
  }

  if (window.matchMedia("(max-width: 380px) and (max-height: 700px)").matches) {
    return new THREE.Vector3(0, 0.24, 4.35);
  }

  return new THREE.Vector3(0, 0.35, 3.45);
};

export function EarthGlobe({
  initialOpenProjectId,
  initialLoopOpen = false,
  usageStatus,
  loopKanban,
  currentCommit = "unknown"
}: {
  initialOpenProjectId?: string;
  initialLoopOpen?: boolean;
  usageStatus?: UsageStatusSnapshot | null;
  loopKanban?: LoopKanbanProject[];
  currentCommit?: string;
}) {
  const hasInitialProject = Boolean(initialOpenProjectId && projectLocations[initialOpenProjectId]);
  const initialProjectId = hasInitialProject && initialOpenProjectId ? initialOpenProjectId : "web";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetCameraRef = useRef<THREE.Vector3 | null>(null);
  const targetLookAtRef = useRef<THREE.Vector3 | null>(null);
  const cameraMoveRef = useRef<CameraMove | null>(null);
  const cameraSpinVelocityRef = useRef(new THREE.Vector2());
  const markerRefs = useRef(new Map<string, THREE.Mesh>());
  const hasRenderedFrameRef = useRef(false);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(hasInitialProject ? initialProjectId : null);
  const [isRpgOpen, setIsRpgOpen] = useState(false);
  const [isLoopPanelOpen, setIsLoopPanelOpen] = useState(initialLoopOpen || initialOpenProjectId === "loops");
  const [isLoopExplainerOpen, setIsLoopExplainerOpen] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);

  const projects = useMemo(
    () =>
      repoNodes
        .filter((node) => projectLocations[node.id])
        .map((node) => ({
          id: node.id,
          label: node.label,
          shortLabel: node.shortLabel,
          summary: node.summary,
          ...projectLocations[node.id]
      })),
    []
  );
  const activeProject = projects.find((project) => project.id === detailProjectId);
  const activeDetail = detailProjectId ? projectDetails[detailProjectId] : undefined;
  const fallbackProjectData = useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        detail: projectDetails[project.id]
      })),
    [projects]
  );

  const focusProject = useCallback((projectId: string, revealDetail = false) => {
    const marker = markerRefs.current.get(projectId);
    if (!marker) {
      return;
    }

    setActiveProjectId(projectId);
    cameraSpinVelocityRef.current.set(0, 0);
    const surface = marker.position.clone().normalize();
    const targetCamera = surface.clone().multiplyScalar(1.92);
    const targetLookAt = new THREE.Vector3(0, 0, 0);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    targetCameraRef.current = null;
    targetLookAtRef.current = null;

    if (!camera || !controls) {
      targetCameraRef.current = targetCamera;
      targetLookAtRef.current = targetLookAt;
      if (revealDetail) {
        setDetailProjectId(projectId);
      }
      return;
    }

    cameraMoveRef.current = {
      startCamera: camera.position.clone(),
      startLookAt: controls.target.clone(),
      targetCamera,
      targetLookAt,
      startedAt: performance.now(),
      durationMs: 1450,
      revealProjectId: revealDetail ? projectId : undefined,
      hasRevealedDetail: false
    };
  }, []);

  const selectProject = useCallback(
    (projectId: string) => {
      setDetailProjectId(null);
      focusProject(projectId, true);
    },
    [focusProject]
  );

  const openCryptoTax = useCallback(() => {
    window.location.href = `${window.location.protocol}//${window.location.hostname}:3001/`;
  }, []);

  const openCryptoTrader = useCallback(() => {
    window.location.href = `${window.location.protocol}//${window.location.hostname}:3002/`;
  }, []);

  useEffect(() => {
    if (!isLoopPanelOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLoopPanelOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isLoopPanelOpen]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    hasRenderedFrameRef.current = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#02030a");

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.copy(getDefaultCameraPosition());
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.userSelect = "none";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.45;
    controls.maxDistance = 5.2;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.85;
    controlsRef.current = controls;

    const planetTexture = createPurplePlanetTexture();
    planetTexture.colorSpace = THREE.SRGBColorSpace;
    planetTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.MeshStandardMaterial({
        map: planetTexture,
        roughness: 0.68,
        metalness: 0.08,
        emissive: "#12051f",
        emissiveIntensity: 0.4
      })
    );
    earth.rotation.y = -0.34;
    scene.add(earth);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.022, 96, 96),
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide
      })
    );
    scene.add(atmosphere);

    const andromeda = createAndromedaBackdrop();
    scene.add(andromeda);

    const stars = createStarField();
    scene.add(stars);

    scene.add(new THREE.AmbientLight("#f3e8ff", 2.4));
    const sun = new THREE.DirectionalLight("#ffffff", 3.2);
    sun.position.set(-3, 1.5, 4);
    scene.add(sun);

    const markerGroup = new THREE.Group();
    const markers = markerRefs.current;
    scene.add(markerGroup);

    for (const project of projects) {
      const position = latLonToVector(project.lat, project.lon, 1.045);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 24, 24),
        new THREE.MeshBasicMaterial({ color: project.color })
      );
      marker.position.copy(position);
      marker.userData = { projectId: project.id };
      markerGroup.add(marker);
      markers.set(project.id, marker);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 24, 24),
        new THREE.MeshBasicMaterial({
          color: project.color,
          transparent: true,
          opacity: 0.22,
          blending: THREE.AdditiveBlending
        })
      );
      halo.position.copy(position);
      markerGroup.add(halo);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const cameraSpinVelocity = cameraSpinVelocityRef.current;
    const activeTouchPointers = new Map<number, THREE.Vector2>();
    const touchStart = new THREE.Vector2();
    const touchCurrent = new THREE.Vector2();
    let hasTouchDrag = false;
    let lastPinchDistance: number | null = null;
    let lastTouchMoveTime: number | null = null;
    let previousFrameTime = performance.now();

    const clearTargetCamera = () => {
      targetCameraRef.current = null;
      targetLookAtRef.current = null;
      cameraMoveRef.current = null;
    };

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const selectMarkerAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...markers.values()]);
      const hit = hits[0]?.object;
      if (hit?.userData.projectId) {
        selectProject(hit.userData.projectId as string);
      }
    };

    const applyCameraRotation = (thetaDelta: number, phiDelta: number, clearTarget = true) => {
      if (clearTarget) {
        clearTargetCamera();
      }

      const target = controls.target.clone();
      const offset = camera.position.clone().sub(target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      spherical.theta += thetaDelta;
      spherical.phi += phiDelta;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.22, Math.PI - 0.22);
      spherical.makeSafe();
      camera.position.copy(target.clone().add(new THREE.Vector3().setFromSpherical(spherical)));
      camera.lookAt(target);
      controls.update();
    };

    const rotateCamera = (deltaX: number, deltaY: number, eventTime: number) => {
      const thetaDelta = -deltaX * 0.006;
      const phiDelta = -deltaY * 0.006;
      applyCameraRotation(thetaDelta, phiDelta);

      if (lastTouchMoveTime !== null) {
        const deltaSeconds = THREE.MathUtils.clamp((eventTime - lastTouchMoveTime) / 1000, 0.008, 0.08);
        const nextThetaVelocity = thetaDelta / deltaSeconds;
        const nextPhiVelocity = phiDelta / deltaSeconds;
        cameraSpinVelocity.x = THREE.MathUtils.lerp(cameraSpinVelocity.x, nextThetaVelocity, 0.42);
        cameraSpinVelocity.y = THREE.MathUtils.lerp(cameraSpinVelocity.y, nextPhiVelocity, 0.42);
        cameraSpinVelocity.clampLength(0, 4.6);
      }

      lastTouchMoveTime = eventTime;
    };

    const zoomCamera = (amount: number) => {
      clearTargetCamera();
      cameraSpinVelocity.set(0, 0);
      const direction = camera.position.clone().sub(controls.target).normalize();
      const distance = camera.position.distanceTo(controls.target);
      const nextDistance = THREE.MathUtils.clamp(distance + amount, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target.clone().add(direction.multiplyScalar(nextDistance)));
      controls.update();
    };

    const getTouchPointerDistance = () => {
      const points = [...activeTouchPointers.values()];
      if (points.length < 2) {
        return null;
      }
      return points[0].distanceTo(points[1]);
    };

    const handleTouchPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      clearTargetCamera();
      cameraSpinVelocity.set(0, 0);
      controls.enabled = false;
      touchStart.set(event.clientX, event.clientY);
      touchCurrent.copy(touchStart);
      hasTouchDrag = false;
      lastTouchMoveTime = event.timeStamp;
      activeTouchPointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic and older mobile browser events can reject capture; window-level handlers still keep drag alive.
      }
      lastPinchDistance = getTouchPointerDistance();
    };

    const handleTouchPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !activeTouchPointers.has(event.pointerId)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      const previous = activeTouchPointers.get(event.pointerId);
      if (!previous) {
        return;
      }

      const deltaX = event.clientX - previous.x;
      const deltaY = event.clientY - previous.y;
      previous.set(event.clientX, event.clientY);
      touchCurrent.set(event.clientX, event.clientY);

      if (activeTouchPointers.size > 1) {
        const nextPinchDistance = getTouchPointerDistance();
        if (lastPinchDistance !== null && nextPinchDistance !== null) {
          zoomCamera((lastPinchDistance - nextPinchDistance) * 0.006);
          hasTouchDrag = true;
        }
        lastPinchDistance = nextPinchDistance;
        lastTouchMoveTime = event.timeStamp;
        return;
      }

      if (Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > 4) {
        hasTouchDrag = true;
      }
      rotateCamera(deltaX, deltaY, event.timeStamp);
    };

    const handleTouchPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !activeTouchPointers.has(event.pointerId)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      activeTouchPointers.delete(event.pointerId);
      try {
        if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture may already be gone if Safari cancelled the touch.
      }

      if (activeTouchPointers.size === 0) {
        controls.enabled = true;
        lastPinchDistance = null;
        lastTouchMoveTime = null;
        if (!hasTouchDrag) {
          cameraSpinVelocity.set(0, 0);
          selectMarkerAt(touchCurrent.x, touchCurrent.y);
        }
      } else {
        lastPinchDistance = getTouchPointerDistance();
        lastTouchMoveTime = event.timeStamp;
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        return;
      }

      clearTargetCamera();
      cameraSpinVelocity.set(0, 0);
      selectMarkerAt(event.clientX, event.clientY);
    };

    const preventSafariTouchScroll = (event: TouchEvent) => {
      event.preventDefault();
    };

    const animate = () => {
      const now = performance.now();
      const deltaSeconds = THREE.MathUtils.clamp((now - previousFrameTime) / 1000, 0.001, 0.05);
      previousFrameTime = now;
      const cameraMove = cameraMoveRef.current;
      const targetCamera = targetCameraRef.current;
      const targetLookAt = targetLookAtRef.current;
      if (cameraMove) {
        const progress = THREE.MathUtils.clamp((now - cameraMove.startedAt) / cameraMove.durationMs, 0, 1);
        const easedProgress = easeInOutCubic(progress);
        camera.position.copy(cameraMove.startCamera).lerp(cameraMove.targetCamera, easedProgress);
        controls.target.copy(cameraMove.startLookAt).lerp(cameraMove.targetLookAt, easedProgress);

        if (cameraMove.revealProjectId && !cameraMove.hasRevealedDetail && progress >= 0.86) {
          cameraMove.hasRevealedDetail = true;
          setDetailProjectId(cameraMove.revealProjectId);
        }

        if (progress >= 1) {
          cameraMoveRef.current = null;
        }
      } else if (targetCamera && targetLookAt) {
        camera.position.lerp(targetCamera, 0.075);
        controls.target.lerp(targetLookAt, 0.075);
        if (camera.position.distanceTo(targetCamera) < 0.01) {
          targetCameraRef.current = null;
          targetLookAtRef.current = null;
        }
      } else if (cameraSpinVelocity.lengthSq() > 0.000001) {
        applyCameraRotation(cameraSpinVelocity.x * deltaSeconds, cameraSpinVelocity.y * deltaSeconds, false);
        const damping = Math.pow(0.955, deltaSeconds * 60);
        cameraSpinVelocity.multiplyScalar(damping);
        if (cameraSpinVelocity.lengthSq() < 0.00001) {
          cameraSpinVelocity.set(0, 0);
        }
      }

      earth.rotation.y += 0.00055;
      atmosphere.rotation.y += 0.00055;
      andromeda.rotation.z += 0.000006;
      controls.update();
      renderer.render(scene, camera);

      if (!hasRenderedFrameRef.current) {
        hasRenderedFrameRef.current = true;
        setIsCanvasReady(true);
      }
    };

    renderer.setAnimationLoop(animate);
    resize();
    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("pointerdown", handleTouchPointerDown, { capture: true });
    renderer.domElement.addEventListener("pointermove", handleTouchPointerMove, { capture: true });
    renderer.domElement.addEventListener("pointerup", handleTouchPointerEnd, { capture: true });
    renderer.domElement.addEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handleTouchPointerMove, { capture: true });
    window.addEventListener("pointerup", handleTouchPointerEnd, { capture: true });
    window.addEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
    renderer.domElement.addEventListener("touchstart", preventSafariTouchScroll, { passive: false });
    renderer.domElement.addEventListener("touchmove", preventSafariTouchScroll, { passive: false });

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handleTouchPointerDown, { capture: true });
      renderer.domElement.removeEventListener("pointermove", handleTouchPointerMove, { capture: true });
      renderer.domElement.removeEventListener("pointerup", handleTouchPointerEnd, { capture: true });
      renderer.domElement.removeEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handleTouchPointerMove, { capture: true });
      window.removeEventListener("pointerup", handleTouchPointerEnd, { capture: true });
      window.removeEventListener("pointercancel", handleTouchPointerEnd, { capture: true });
      renderer.domElement.removeEventListener("touchstart", preventSafariTouchScroll);
      renderer.domElement.removeEventListener("touchmove", preventSafariTouchScroll);
      controls.dispose();
      renderer.dispose();
      earth.geometry.dispose();
      atmosphere.geometry.dispose();
      markerGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          disposeMaterial(object.material);
        }
      });
      andromeda.geometry.dispose();
      disposeMaterial(andromeda.material);
      stars.geometry.dispose();
      disposeMaterial(stars.material);
      disposeMaterial(earth.material);
      disposeMaterial(atmosphere.material);
      planetTexture.dispose();
      markers.clear();
      hasRenderedFrameRef.current = false;
      renderer.domElement.remove();
    };
  }, [projects, selectProject]);

  const zoomBy = (amount: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) {
      return;
    }

    cameraMoveRef.current = null;
    targetCameraRef.current = null;
    targetLookAtRef.current = null;
    const direction = camera.position.clone().sub(controls.target).normalize();
    const distance = camera.position.distanceTo(controls.target);
    const nextDistance = THREE.MathUtils.clamp(distance + amount, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target.clone().add(direction.multiplyScalar(nextDistance)));
  };

  const resetView = () => {
    const targetCamera = getDefaultCameraPosition();
    const targetLookAt = new THREE.Vector3(0, 0, 0);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    targetCameraRef.current = null;
    targetLookAtRef.current = null;
    cameraMoveRef.current =
      camera && controls
        ? {
            startCamera: camera.position.clone(),
            startLookAt: controls.target.clone(),
            targetCamera,
            targetLookAt,
            startedAt: performance.now(),
            durationMs: 1050,
            hasRevealedDetail: true
          }
        : null;
    if (!camera || !controls) {
      targetCameraRef.current = targetCamera;
      targetLookAtRef.current = targetLookAt;
    }
    setActiveProjectId("web");
    setDetailProjectId(null);
    setIsRpgOpen(false);
  };

  return (
    <main className="earth-shell">
      <div
        ref={containerRef}
        className={`earth-canvas ${isCanvasReady ? "earth-canvas--ready" : ""}`}
        aria-label="Interactive 3D OpenClaw Atlas"
      />
      <div className="earth-topbar">
        <div>
          <p>Monorepo built by OpenClaw</p>
          <h1>OpenClaw Atlas</h1>
          <div className="repo-count" aria-label={`${projects.length} repos indexed`}>
            <strong>{projects.length}</strong>
            <span>repos mapped</span>
          </div>
        </div>
        <div className="earth-controls">
          <button
            type="button"
            className="earth-control-button--loop"
            aria-label="Open loop overview"
            title="Loop overview"
            onClick={() => setIsLoopPanelOpen(true)}
          >
            <Workflow size={18} />
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.34)}>
            <ZoomOut size={18} />
          </button>
          <button type="button" aria-label="Reset globe" onClick={resetView}>
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
      <div className="project-strip" aria-label="Projects">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            data-project-id={project.id}
            className={project.id === activeProjectId ? "is-active" : ""}
            onClick={() => selectProject(project.id)}
          >
            <span style={{ backgroundColor: project.color }} />
            {project.shortLabel}
          </button>
        ))}
      </div>
      {activeProject && activeDetail ? (
        <aside className="project-popover" aria-label={`${activeProject.shortLabel} project details`}>
          <button
            type="button"
            className="project-popover__close"
            aria-label="Close project details"
            onClick={() => setDetailProjectId(null)}
          >
            <X size={16} />
          </button>
          <div className={`project-picture project-picture--${activeDetail.preview}`} aria-hidden="true">
            <span />
            <i />
          </div>
          <div className="project-popover__body">
            <p className="project-popover__eyebrow">{activeDetail.eyebrow}</p>
            <h2>{activeDetail.title}</h2>
            <p>{activeProject.summary}</p>
            <dl className="project-build">
              <div>
                <dt>Last built upon</dt>
                <dd>{activeDetail.lastBuilt}</dd>
              </div>
              <div>
                <dt>Commit</dt>
                <dd>{activeDetail.commit}</dd>
              </div>
              <div>
                <dt>What it had</dt>
                <dd>{activeDetail.commitSummary}</dd>
              </div>
            </dl>
            {activeProject.id === "unity-rpg" ? (
              <button type="button" className="project-popover__action" onClick={() => setIsRpgOpen(true)}>
                <Gamepad2 size={16} />
                Open RPG
              </button>
            ) : null}
            {activeProject.id === "crypto-tax" ? (
              <button type="button" className="project-popover__action" onClick={openCryptoTax}>
                <ExternalLink size={16} />
                Explore
              </button>
            ) : null}
            {activeProject.id === "crypto-trader" ? (
              <button type="button" className="project-popover__action" onClick={openCryptoTrader}>
                <ExternalLink size={16} />
                Explore
              </button>
            ) : null}
          </div>
        </aside>
      ) : null}
      {isLoopPanelOpen ? (
        <LoopOverview
          usageStatus={usageStatus}
          loopKanban={loopKanban ?? []}
          currentCommit={currentCommit}
          showExplainer={isLoopExplainerOpen}
          onToggleExplainer={() => setIsLoopExplainerOpen((current) => !current)}
          onClose={() => setIsLoopPanelOpen(false)}
        />
      ) : null}
      {isRpgOpen ? (
        <div className="rpg-overlay" role="dialog" aria-modal="true" aria-labelledby="rpg-overlay-title">
          <button
            type="button"
            className="rpg-overlay__scrim"
            aria-label="Close RPG overlay"
            onClick={() => setIsRpgOpen(false)}
          />
          <section className="rpg-overlay__panel">
            <header className="rpg-overlay__header">
              <div>
                <p>Game Surface</p>
                <h2 id="rpg-overlay-title">
                  <Gamepad2 size={18} />
                  FF6 Inspired RPG
                </h2>
              </div>
              <button type="button" aria-label="Close RPG overlay" onClick={() => setIsRpgOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <iframe
              className="rpg-overlay__frame"
              title="FF6 Inspired RPG"
              src="/unity-rpg?embed=1"
              loading="lazy"
              allow="fullscreen; gamepad"
            />
          </section>
        </div>
      ) : null}
      <script
        id="project-fallback-data"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(fallbackProjectData) }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
(() => {
  window.setTimeout(() => {
    if (document.querySelector(".earth-canvas canvas")) return;
    const root = document.querySelector(".earth-shell");
    const dataNode = document.getElementById("project-fallback-data");
    if (!root || !dataNode) return;
    const projects = JSON.parse(dataNode.textContent || "[]");
    const byId = new Map(projects.map((project) => [project.id, project]));

    const text = (tag, value, className) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      element.textContent = value || "";
      return element;
    };

    const showProject = (projectId) => {
      const project = byId.get(projectId);
      if (!project || !project.detail) return;
      root.querySelector(".project-popover--fallback")?.remove();
      root.querySelectorAll(".project-strip button").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.projectId === projectId);
      });

      const panel = document.createElement("aside");
      panel.className = "project-popover project-popover--fallback";
      panel.setAttribute("aria-label", project.shortLabel + " project details");

      const close = document.createElement("button");
      close.type = "button";
      close.className = "project-popover__close";
      close.setAttribute("aria-label", "Close project details");
      close.textContent = "X";
      close.addEventListener("click", () => panel.remove());

      const picture = document.createElement("div");
      picture.className = "project-picture project-picture--" + project.detail.preview;
      picture.setAttribute("aria-hidden", "true");
      picture.append(document.createElement("span"), document.createElement("i"));

      const body = document.createElement("div");
      body.className = "project-popover__body";
      body.append(
        text("p", project.detail.eyebrow, "project-popover__eyebrow"),
        text("h2", project.detail.title),
        text("p", project.summary)
      );

      const build = document.createElement("dl");
      build.className = "project-build";
      [
        ["Last built upon", project.detail.lastBuilt],
        ["Commit", project.detail.commit],
        ["What it had", project.detail.commitSummary]
      ].forEach(([label, value]) => {
        const row = document.createElement("div");
        row.append(text("dt", label), text("dd", value));
        build.append(row);
      });
      body.append(build);

      if (project.id === "unity-rpg") {
        const link = document.createElement("a");
        link.className = "project-popover__action";
        link.href = "/unity-rpg";
        link.textContent = "Open RPG";
        body.append(link);
      }

      if (project.id === "crypto-tax") {
        const link = document.createElement("a");
        link.className = "project-popover__action";
        link.href = window.location.protocol + "//" + window.location.hostname + ":3001/";
        link.textContent = "Explore";
        body.append(link);
      }

      if (project.id === "crypto-trader") {
        const link = document.createElement("a");
        link.className = "project-popover__action";
        link.href = window.location.protocol + "//" + window.location.hostname + ":3002/";
        link.textContent = "Explore";
        body.append(link);
      }

      panel.append(close, picture, body);
      root.append(panel);
    };

    root.querySelectorAll(".project-strip button[data-project-id]").forEach((button) => {
      button.addEventListener("click", () => showProject(button.dataset.projectId));
    });
  }, 1200);
})();
          `
        }}
      />
    </main>
  );
}

function LoopOverview({
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
  const [activityDateFilter, setActivityDateFilter] = useState<PlannerDateFilter>("updated");
  const [activityDateRange, setActivityDateRange] = useState(getDefaultDateRange);
  const editorCloseTimeoutRef = useRef<number | null>(null);
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

  function handleDrop(event: DragEvent<HTMLElement>, status: LoopTicketStatus) {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData("text/plain");
    if (ticketId) {
      moveTicket(ticketId, status);
    }
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

          <section className="loop-activity" aria-label="Atlas Planner activity dashboard">
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

          <section className="loop-kanban" aria-label="Atlas Planner Kanban">
            <div className="loop-kanban__header">
              <div>
                <p>Atlas Planner</p>
                <h3>Epics and tickets</h3>
              </div>
              <div className="loop-kanban__tools">
                <span>{getWindowDecisionLabel(usageStatus)}</span>
                <button type="button" onClick={() => openTicketEditor(getDefaultPlannerTicket(loopKanban))}>
                  <Plus size={14} />
                  New ticket
                </button>
              </div>
            </div>
            <div className="loop-kanban__columns">
              {kanbanColumns.map((column) => (
                <article
                  key={column.id}
                  className="loop-kanban__column"
                  onDragOver={(event) => event.preventDefault()}
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
                        className="loop-ticket"
                        draggable
                        onClick={() => openTicketEditor(ticket)}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", ticket.id);
                          event.dataTransfer.effectAllowed = "move";
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
  const selectedProject = projects.find((project) => project.id === ticket.projectId) ?? projects[0];
  const selectedEpic =
    selectedProject?.epics?.find((epic) => epic.id === ticket.epicId) ?? selectedProject?.epics?.[0];
  const ticketTags = ticket.tags ?? [];

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

function latLonToVector(lat: number, lon: number, radius: number) {
  const latRad = THREE.MathUtils.degToRad(lat);
  const lonRad = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.sin(lonRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lonRad)
  );
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function createStarField() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 18 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[index * 3 + 2] = radius * Math.cos(phi);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#ffffff",
    size: 0.018,
    transparent: true,
    opacity: 0.72
  });
  return new THREE.Points(geometry, material);
}

function createAndromedaBackdrop() {
  const random = seededRandom(4242);
  const count = 520;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const progress = random();
    const arm = Math.floor(random() * 4);
    const angle = progress * Math.PI * 2.2 + arm * Math.PI * 0.5 + (random() - 0.5) * 0.32;
    const radius = 0.08 + Math.pow(progress, 0.72) * 2.35;
    const scatter = (random() - 0.5) * 0.28;
    const x = Math.cos(angle) * (radius + scatter);
    const y = Math.sin(angle) * (radius * 0.34 + scatter * 0.16);
    const z = (random() - 0.5) * 0.04;
    const falloff = 1 - Math.min(radius / 2.55, 1);
    const tint = random() > 0.52 ? "#93c5fd" : "#c4b5fd";
    base.set(tint).multiplyScalar(0.2 + falloff * 0.42 + random() * 0.1);

    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    colors[index * 3] = base.r;
    colors[index * 3 + 1] = base.g;
    colors[index * 3 + 2] = base.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.026,
    sizeAttenuation: true,
    vertexColors: true,
    depthTest: true,
    depthWrite: false
  });

  const galaxy = new THREE.Points(geometry, material);
  galaxy.position.set(2.85, 1.02, -8.4);
  galaxy.scale.set(1.35, 1.35, 1);
  galaxy.rotation.z = -0.24;
  galaxy.rotation.y = -0.12;
  return galaxy;
}

function createPurplePlanetTexture() {
  const random = seededRandom(1337);
  const canvas = document.createElement("canvas");
  const width = 2048;
  const height = 1024;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create purple planet texture.");
  }

  const imageData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const theta = (x / width) * Math.PI * 2;
      const haze =
        0.5 +
        0.5 *
          (Math.sin(theta * 2 + vertical * 5.2) * 0.46 +
            Math.sin(theta * 5 - vertical * 8.1) * 0.28 +
            Math.cos(theta * 9 + vertical * 2.4) * 0.16);
      const latitudeGlow = Math.sin(vertical * Math.PI);
      const index = (y * width + x) * 4;
      imageData.data[index] = 19 + haze * 28 + latitudeGlow * 36;
      imageData.data[index + 1] = 8 + haze * 16 + latitudeGlow * 12;
      imageData.data[index + 2] = 34 + haze * 74 + latitudeGlow * 132;
      imageData.data[index + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  for (let index = 0; index < 58; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 80 + random() * 280;
    const glowColor = `rgba(${160 + random() * 70}, ${100 + random() * 70}, 255, 0.16)`;
    for (const offset of [-width, 0, width]) {
      const glow = ctx.createRadialGradient(x + offset, y, 0, x + offset, y, radius);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, "rgba(20, 8, 34, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x + offset, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "screen";
  for (let band = 0; band < 18; band += 1) {
    ctx.beginPath();
    ctx.strokeStyle = band % 3 === 0 ? "rgba(125, 211, 252, 0.18)" : "rgba(216, 180, 254, 0.13)";
    ctx.lineWidth = 2 + random() * 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const y = (band / 18) * height + Math.sin(band) * 24;
    ctx.moveTo(-48, y);
    for (let x = -48; x <= width + 48; x += 24) {
      const theta = (x / width) * Math.PI * 2;
      const wave =
        Math.sin(theta * 2 + band) * (13 + band * 0.5) +
        Math.sin(theta * 5 - band * 0.7) * (5 + band * 0.18);
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "multiply";
  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    width * 0.08,
    width * 0.5,
    height * 0.5,
    width * 0.62
  );
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(0.68, "rgba(50,12,90,0.14)");
  vignette.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = "source-over";
  const leftEdge = ctx.getImageData(0, 0, 1, height);
  ctx.putImageData(leftEdge, width - 1, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
    return;
  }

  material.dispose();
}
