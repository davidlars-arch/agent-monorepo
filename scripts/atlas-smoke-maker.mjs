#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const handoffDir = requiredEnv("ATLAS_HANDOFF_DIR");
const evidencePath = requiredEnv("ATLAS_EVIDENCE_PATH");
const runId = process.env.ATLAS_RUN_ID || "";
const ticketId = process.env.ATLAS_TICKET_ID || "";
const worktreePath = process.env.ATLAS_WORKTREE_PATH || process.cwd();

mkdirSync(handoffDir, { recursive: true });

const requiredFiles = ["runner-state.json", "maker-prompt.md", "checker-prompt.md", "evidence.json"];
const missingFiles = requiredFiles.filter((file) => !existsSync(join(handoffDir, file)));
if (missingFiles.length > 0) {
  writeLog(`Smoke maker could not find required handoff files: ${missingFiles.join(", ")}`);
  process.exitCode = 2;
  console.error(`Missing handoff files: ${missingFiles.join(", ")}`);
  process.exit();
}

const now = new Date().toISOString();
const makerPrompt = readFileSync(join(handoffDir, "maker-prompt.md"), "utf8");
const result = {
  schemaVersion: "atlas-smoke-maker-result.v1",
  runId,
  ticketId,
  status: "passed",
  createdAt: now,
  handoffDir,
  evidencePath,
  worktreePath,
  proof: [
    "Smoke maker ran as a deterministic local command.",
    "Required handoff files existed before checker review.",
    `Maker prompt length: ${makerPrompt.length} bytes.`
  ]
};

writeFileSync(join(handoffDir, "maker-result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeLog(`Smoke maker passed for ${runId || ticketId || "unknown run"} at ${now}`);
console.log(JSON.stringify({ status: "passed", summary: "Smoke maker wrote deterministic proof artifact." }));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required.`);
    process.exit(2);
  }
  return value;
}

function writeLog(message) {
  writeFileSync(join(handoffDir, "maker.log"), `${message}\n`, { flag: "a" });
}
