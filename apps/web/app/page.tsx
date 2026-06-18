import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { LoopKanbanProject, UsageStatusSnapshot } from "@agent/atlas-planner";
import { EarthGlobe } from "@/components/earth-globe";

export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

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
  searchParams: Promise<{ open?: string }>;
}) {
  const params = await searchParams;
  const requestedOpen = Array.isArray(params.open) ? params.open[0] : params.open;
  const usageStatus = await readUsageStatus();
  const loopKanban = await readLoopKanban();
  const currentCommit = await readCurrentCommit();
  return (
    <EarthGlobe
      initialOpenProjectId={requestedOpen}
      initialLoopOpen={requestedOpen === "loops"}
      usageStatus={usageStatus}
      loopKanban={loopKanban}
      currentCommit={currentCommit}
    />
  );
}
