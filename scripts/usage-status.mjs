#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();
const statusPath = join(root, "loops", "usage-status", "latest-status.json");
const args = process.argv.slice(2);
const showOnly = args.includes("--show");
const forceWrite = args.includes("--force");
const minAgeMinutes = readPositiveNumber("USAGE_STATUS_MIN_AGE_MINUTES", 30);
const explicitUsageValueProvided = [
  "USAGE_STATUS_MODEL",
  "USAGE_CONTEXT",
  "USAGE_CURRENT_TOKENS",
  "USAGE_SHORT_WINDOW",
  "USAGE_WEEKLY",
  "USAGE_NOTE"
].some((envName) => Boolean(process.env[envName]?.trim()));

if (showOnly) {
  try {
    console.log(await readFile(statusPath, "utf8"));
  } catch {
    console.log("No usage status snapshot has been written yet.");
  }
  process.exit(0);
}

const existingStatus = await readExistingStatus();

if (!forceWrite && !explicitUsageValueProvided && isFresh(existingStatus, minAgeMinutes)) {
  console.log(`Skipped ${relative(statusPath)}; snapshot is newer than ${minAgeMinutes} minutes.`);
  console.log("Use --force or pass USAGE_* env values to write a fresh snapshot.");
  process.exit(0);
}

const status = {
  recordedAt: new Date().toISOString(),
  model: readValue("USAGE_STATUS_MODEL", existingStatus?.model, "unknown"),
  context: readValue("USAGE_CONTEXT", existingStatus?.context, "unknown"),
  currentTokens: readValue("USAGE_CURRENT_TOKENS", existingStatus?.currentTokens, "unknown"),
  shortWindow: readValue("USAGE_SHORT_WINDOW", existingStatus?.shortWindow, "unknown"),
  weekly: readValue("USAGE_WEEKLY", existingStatus?.weekly, "unknown"),
  note: readValue(
    "USAGE_NOTE",
    existingStatus?.note,
    "No live usage source configured; Atlas Planner is using conservative fallback sizing."
  )
};

await mkdir(dirname(statusPath), { recursive: true });
await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);

console.log(`Wrote ${relative(statusPath)} without calling an LLM or usage API.`);
console.log(`Short window: ${status.shortWindow}`);
console.log(`Planner fallback: ${status.shortWindow === "unknown" ? "max 8-point ticket" : "derived from shortWindow"}`);

async function readExistingStatus() {
  try {
    return JSON.parse(await readFile(statusPath, "utf8"));
  } catch {
    return null;
  }
}

function readValue(envName, existingValue, fallback) {
  const envValue = process.env[envName];
  if (envValue && envValue.trim()) {
    return envValue.trim();
  }
  if (typeof existingValue === "string" && existingValue.trim()) {
    return existingValue.trim();
  }
  return fallback;
}

function readPositiveNumber(envName, fallback) {
  const value = Number(process.env[envName]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isFresh(status, maxAgeMinutes) {
  if (!status?.recordedAt) {
    return false;
  }

  const recordedAt = new Date(status.recordedAt).getTime();
  if (!Number.isFinite(recordedAt)) {
    return false;
  }

  return Date.now() - recordedAt < maxAgeMinutes * 60 * 1000;
}

function relative(path) {
  return path.replace(`${root}/`, "");
}
