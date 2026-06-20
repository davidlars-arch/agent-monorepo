import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { LoopKanbanProject, UsageStatusSnapshot } from "@agent/atlas-planner";
import {
  getLoopPaths,
  getCurrentRunRecoveryStatus,
  parseJsonObject,
  readControllerLockSummary,
  readGoalQueue,
  readJsonFile,
  resolveProjectRoot,
  resolveRepoPath as resolveLoopPath,
  summarizeMemoryValue,
  type ControllerMemorySummary,
  type ControllerLockSummary,
  type CurrentLoopRunSummary,
  type QueuedGoalSummary,
  type RunnerEvidenceSummary,
  type RunnerStateSummary
} from "@agent/loop-store";
import { EarthGlobe } from "@/components/earth-globe";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const projectRoot = resolveProjectRoot();
const loopPaths = getLoopPaths(projectRoot);

async function readUsageStatus(): Promise<UsageStatusSnapshot | null> {
  return readJsonFile<UsageStatusSnapshot | null>(loopPaths.usageStatusPath, null);
}

async function readControllerLock(): Promise<ControllerLockSummary> {
  return readControllerLockSummary(loopPaths.lockPath);
}

async function readLoopKanban(): Promise<LoopKanbanProject[]> {
  const registry = await readJsonFile<{ projects?: LoopKanbanProject[] } | null>(loopPaths.registryPath, null);
  return registry?.projects ?? [];
}

async function readQueuedGoals(): Promise<QueuedGoalSummary[]> {
  const queue = await readGoalQueue(loopPaths.goalQueuePath);
  return queue.goals;
}

async function readCurrentLoopRun(): Promise<CurrentLoopRunSummary | null> {
  return readJsonFile<CurrentLoopRunSummary | null>(loopPaths.currentRunPath, null);
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
      findings: Array.isArray(evidence.findings) ? evidence.findings.slice(-8) : [],
      satisfactionLayers: Array.isArray(evidence.satisfactionLayers) ? evidence.satisfactionLayers.slice(0, 12) : [],
      pullRequest: evidence.pullRequest
    };
  } catch {
    return null;
  }
}

async function readControllerMemory(): Promise<ControllerMemorySummary | null> {
  const latestReportPath = loopPaths.reportPath;
  const statePath = loopPaths.statePath;
  const decisionsPath = loopPaths.decisionsPath;
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
  return resolveLoopPath(projectRoot, path);
}

async function readCurrentCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: projectRoot
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
  const controllerLock = await readControllerLock();
  const currentRunRecovery = getCurrentRunRecoveryStatus(currentLoopRun, currentRunnerState);
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
      controllerLock={controllerLock}
      currentRunRecovery={currentRunRecovery}
      controllerMemory={controllerMemory}
      currentCommit={currentCommit}
    />
  );
}
