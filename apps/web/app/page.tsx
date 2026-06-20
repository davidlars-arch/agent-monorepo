import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { LoopKanbanProject, UsageStatusSnapshot } from "@agent/atlas-planner";
import { EarthGlobe } from "@/components/earth-globe";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

type QueuedGoalSummary = {
  id: string;
  title: string;
  lifecycleStatus: string;
  approvedToRun: boolean;
  status: string;
  estimate: number;
  updatedAt: string;
};

type CurrentLoopRunSummary = {
  id: string;
  goalId: string;
  goalTitle: string;
  status: string;
  stage: string;
  claimedAt: string;
  updatedAt: string;
  baseCommit: string;
  branchName?: string;
  worktreePath?: string;
  handoffDir?: string;
  runnerCommand?: string;
  makerPromptPath?: string;
  checkerPromptPath?: string;
  evidencePath?: string;
};

type RunnerTimelineEvent = {
  stage: string;
  status: string;
  at: string | null;
  detail: string;
};

type RunnerStateSummary = {
  status: string;
  stage: string;
  repairAttempts: number;
  maxRepairs: number;
  updatedAt: string;
  timeline: RunnerTimelineEvent[];
};

type RunnerEvidenceCheck = {
  stage: string;
  command: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  repairAttempt: number;
};

type RunnerEvidenceFinding = {
  severity: string;
  stage: string;
  summary: string;
  file?: string;
  line?: number;
  recommendation?: string;
  at?: string;
};

type RunnerEvidenceSummary = {
  status: string;
  repairAttempts: number;
  maxRepairs: number;
  checks: RunnerEvidenceCheck[];
  findings: RunnerEvidenceFinding[];
};

type ControllerMemorySummary = {
  latestReport?: {
    path: string;
    updatedAt: string;
    excerpt: string;
  };
  controllerState?: {
    path: string;
    updatedAt: string;
    summary: string;
  };
  decisionLog?: {
    path: string;
    updatedAt: string;
    count: number;
    lastDecision: string;
  };
};

async function readUsageStatus(): Promise<UsageStatusSnapshot | null> {
  const candidates = [
    join(process.cwd(), "loops/usage-status/latest-status.json"),
    resolve(process.cwd(), "../..", "loops/usage-status/latest-status.json")
  ];
  const statusPath = candidates.find((candidate) => existsSync(candidate));
  if (!statusPath) {
    return null;
  }

  try {
    return JSON.parse(await readFile(statusPath, "utf8")) as UsageStatusSnapshot;
  } catch {
    return null;
  }
}

async function readLoopKanban(): Promise<LoopKanbanProject[]> {
  const candidates = [
    join(process.cwd(), "loops/project-controller/projects.json"),
    resolve(process.cwd(), "../..", "loops/project-controller/projects.json")
  ];
  const registryPath = candidates.find((candidate) => existsSync(candidate));
  if (!registryPath) {
    return [];
  }

  try {
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as { projects?: LoopKanbanProject[] };
    return registry.projects ?? [];
  } catch {
    return [];
  }
}

async function readQueuedGoals(): Promise<QueuedGoalSummary[]> {
  const candidates = [
    join(process.cwd(), "loops/project-controller/goal-queue.json"),
    resolve(process.cwd(), "../..", "loops/project-controller/goal-queue.json")
  ];
  const queuePath = candidates.find((candidate) => existsSync(candidate));
  if (!queuePath) {
    return [];
  }

  try {
    const queue = JSON.parse(await readFile(queuePath, "utf8")) as { goals?: QueuedGoalSummary[] };
    return Array.isArray(queue.goals) ? queue.goals : [];
  } catch {
    return [];
  }
}

async function readCurrentLoopRun(): Promise<CurrentLoopRunSummary | null> {
  const candidates = [
    join(process.cwd(), "loops/project-controller/current-run.json"),
    resolve(process.cwd(), "../..", "loops/project-controller/current-run.json")
  ];
  const runPath = candidates.find((candidate) => existsSync(candidate));
  if (!runPath) {
    return null;
  }

  try {
    return JSON.parse(await readFile(runPath, "utf8")) as CurrentLoopRunSummary;
  } catch {
    return null;
  }
}

async function readCurrentRunnerState(currentLoopRun: CurrentLoopRunSummary | null): Promise<RunnerStateSummary | null> {
  if (!currentLoopRun?.handoffDir) {
    return null;
  }

  const statePath = resolveRepoPath(join(currentLoopRun.handoffDir, "runner-state.json"));
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const state = JSON.parse(await readFile(statePath, "utf8")) as RunnerStateSummary;
    return {
      status: state.status,
      stage: state.stage,
      repairAttempts: state.repairAttempts ?? 0,
      maxRepairs: state.maxRepairs ?? 0,
      updatedAt: state.updatedAt,
      timeline: Array.isArray(state.timeline) ? state.timeline.slice(-8) : []
    };
  } catch {
    return null;
  }
}

async function readCurrentRunnerEvidence(currentLoopRun: CurrentLoopRunSummary | null): Promise<RunnerEvidenceSummary | null> {
  const evidencePath = currentLoopRun?.evidencePath ?? (currentLoopRun?.handoffDir ? join(currentLoopRun.handoffDir, "evidence.json") : "");
  if (!evidencePath) {
    return null;
  }

  const resolvedEvidencePath = resolveRepoPath(evidencePath);
  if (!existsSync(resolvedEvidencePath)) {
    return null;
  }

  try {
    const evidence = JSON.parse(await readFile(resolvedEvidencePath, "utf8")) as RunnerEvidenceSummary;
    return {
      status: evidence.status,
      repairAttempts: evidence.repairAttempts ?? 0,
      maxRepairs: evidence.maxRepairs ?? 0,
      checks: Array.isArray(evidence.checks) ? evidence.checks.slice(-8) : [],
      findings: Array.isArray(evidence.findings) ? evidence.findings.slice(-8) : []
    };
  } catch {
    return null;
  }
}

async function readControllerMemory(): Promise<ControllerMemorySummary | null> {
  const latestReportPath = resolveRepoPath("loops/project-controller/latest-report.md");
  const statePath = resolveRepoPath("loops/project-controller/state.json");
  const decisionsPath = resolveRepoPath("loops/project-controller/decisions.jsonl");
  const memory: ControllerMemorySummary = {};

  if (existsSync(latestReportPath)) {
    const report = await readFile(latestReportPath, "utf8").catch(() => "");
    const reportStat = await stat(latestReportPath).catch(() => null);
    const excerpt = report
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(" ");
    memory.latestReport = {
      path: "loops/project-controller/latest-report.md",
      updatedAt: reportStat?.mtime.toISOString() ?? "",
      excerpt: excerpt.slice(0, 360)
    };
  }

  if (existsSync(statePath)) {
    const stateText = await readFile(statePath, "utf8").catch(() => "");
    const stateStat = await stat(statePath).catch(() => null);
    const state = parseJsonObject(stateText);
    const summary = state
      ? Object.entries(state)
          .slice(0, 4)
          .map(([key, value]) => `${key}: ${summarizeMemoryValue(value)}`)
          .join(" · ")
      : "State file exists but could not be parsed.";
    memory.controllerState = {
      path: "loops/project-controller/state.json",
      updatedAt: stateStat?.mtime.toISOString() ?? "",
      summary: summary.slice(0, 360)
    };
  }

  if (existsSync(decisionsPath)) {
    const decisions = await readFile(decisionsPath, "utf8").catch(() => "");
    const decisionsStat = await stat(decisionsPath).catch(() => null);
    const lines = decisions
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    memory.decisionLog = {
      path: "loops/project-controller/decisions.jsonl",
      updatedAt: decisionsStat?.mtime.toISOString() ?? "",
      count: lines.length,
      lastDecision: (lines.at(-1) ?? "").slice(0, 360)
    };
  }

  return memory.latestReport || memory.controllerState || memory.decisionLog ? memory : null;
}

function resolveRepoPath(path: string) {
  if (path.startsWith("/")) {
    return path;
  }

  return resolve(process.cwd(), "../..", path);
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function summarizeMemoryValue(value: unknown) {
  if (typeof value === "string") {
    return value.slice(0, 80);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  if (value && typeof value === "object") {
    return `${Object.keys(value).length} keys`;
  }
  return "empty";
}

async function readCurrentCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: resolve(process.cwd(), "../..")
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ open?: string; goal?: string }>;
}) {
  const params = await searchParams;
  const requestedOpen = Array.isArray(params.open) ? params.open[0] : params.open;
  const requestedGoal = Array.isArray(params.goal) ? params.goal[0] : params.goal;
  const usageStatus = await readUsageStatus();
  const loopKanban = await readLoopKanban();
  const queuedGoals = await readQueuedGoals();
  const currentLoopRun = await readCurrentLoopRun();
  const currentRunnerState = await readCurrentRunnerState(currentLoopRun);
  const currentRunnerEvidence = await readCurrentRunnerEvidence(currentLoopRun);
  const controllerMemory = await readControllerMemory();
  const currentCommit = await readCurrentCommit();
  return (
    <EarthGlobe
      initialOpenProjectId={requestedOpen}
      initialLoopOpen={requestedOpen === "loops"}
      initialGoalComposerOpen={requestedGoal === "create"}
      usageStatus={usageStatus}
      loopKanban={loopKanban}
      queuedGoals={queuedGoals}
      currentLoopRun={currentLoopRun}
      currentRunnerState={currentRunnerState}
      currentRunnerEvidence={currentRunnerEvidence}
      controllerMemory={controllerMemory}
      currentCommit={currentCommit}
    />
  );
}
