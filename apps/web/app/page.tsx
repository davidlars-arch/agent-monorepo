import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EarthGlobe, type UsageStatusSnapshot } from "@/components/earth-globe";

export const dynamic = "force-dynamic";

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

export default async function Home({
  searchParams
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const params = await searchParams;
  const usageStatus = await readUsageStatus();
  return <EarthGlobe initialOpenProjectId={params.open} usageStatus={usageStatus} />;
}
