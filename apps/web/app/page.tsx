import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
      currentCommit={currentCommit}
    />
  );
}
