#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const handoffDir = requiredEnv("ATLAS_HANDOFF_DIR");
const evidencePath = requiredEnv("ATLAS_EVIDENCE_PATH");
const runId = process.env.ATLAS_RUN_ID || "";
const ticketId = process.env.ATLAS_TICKET_ID || "";

mkdirSync(handoffDir, { recursive: true });

const reviewedFiles = [
  "runner-state.json",
  "maker-prompt.md",
  "checker-prompt.md",
  "evidence.json",
  "maker-result.json",
  "maker.log"
];
const blockingIssues = [];

for (const file of reviewedFiles) {
  if (!existsSync(join(handoffDir, file))) {
    blockingIssues.push({
      severity: "blocker",
      summary: `Missing required smoke artifact: ${file}`,
      file: join(handoffDir, file),
      recommendation: "Run the deterministic smoke maker before checker review."
    });
  }
}

const runnerState = readJsonIfPresent("runner-state.json");
const makerResult = readJsonIfPresent("maker-result.json");
const evidence = readJsonIfPresent("evidence.json");

if (runnerState && runId && runnerState.runId !== runId) {
  blockingIssues.push({
    severity: "blocker",
    summary: "Runner state runId does not match ATLAS_RUN_ID.",
    file: join(handoffDir, "runner-state.json"),
    recommendation: "Resume the matching handoff directory for this run."
  });
}

if (makerResult && makerResult.status !== "passed") {
  blockingIssues.push({
    severity: "blocker",
    summary: "Smoke maker did not record a passed result.",
    file: join(handoffDir, "maker-result.json"),
    recommendation: "Inspect maker.log and rerun the smoke maker."
  });
}

if (!evidence || evidence.runId !== runId) {
  blockingIssues.push({
    severity: "blocker",
    summary: "Evidence file is missing or belongs to a different run.",
    file: evidencePath,
    recommendation: "Use the evidence file generated for this runner handoff."
  });
}

const now = new Date().toISOString();
const pass = blockingIssues.length === 0;
const satisfactionLayers = buildLayerProofs(runnerState?.goalContract?.satisfactionLayers ?? [], pass);
const verdict = {
  schemaVersion: "atlas-checker-verdict.v1",
  runId,
  ticketId,
  pass,
  status: pass ? "passed" : "blocked",
  blockingIssues,
  nonBlockingIssues: [],
  evidenceReviewed: reviewedFiles,
  recommendedNextAction: pass ? "human-review" : "repair-or-human-review",
  satisfactionLayers,
  summary: pass
    ? "The deterministic Atlas first-loop proof completed successfully."
    : "The deterministic Atlas first-loop proof is blocked by missing or mismatched artifacts.",
  createdAt: now
};

writeFileSync(join(handoffDir, "checker-verdict.json"), `${JSON.stringify(verdict, null, 2)}\n`);
writeFileSync(join(handoffDir, "checker.log"), `${verdict.summary}\nReviewed: ${reviewedFiles.join(", ")}\n`, { flag: "a" });

console.log(JSON.stringify(verdict));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required.`);
    process.exit(2);
  }
  return value;
}

function readJsonIfPresent(file) {
  const path = join(handoffDir, file);
  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    blockingIssues.push({
      severity: "blocker",
      summary: `Smoke checker could not parse ${file}.`,
      file: path,
      recommendation: "Regenerate the handoff artifact with valid JSON."
    });
    return null;
  }
}

function buildLayerProofs(layers, pass) {
  if (!Array.isArray(layers) || layers.length === 0) {
    return [
      {
        layerId: "deterministic-smoke",
        label: "Deterministic smoke",
        status: pass ? "satisfied" : "blocked",
        proof: pass ? ["Maker and checker artifacts were present and matched the run."] : [],
        missing: pass ? [] : ["Resolve blocking smoke-checker issues."],
        at: new Date().toISOString()
      }
    ];
  }

  return layers.map((layer) => ({
    layerId: firstString(layer.id, layer.layerId, layer.label) || "unnamed-layer",
    label: firstString(layer.label, layer.id, layer.layerId) || "Unnamed layer",
    status: pass ? "satisfied" : "blocked",
    criteria: firstString(layer.criteria),
    humanGated: layer.humanGated === true,
    proof: pass ? [`Smoke checker verified deterministic evidence for ${firstString(layer.label, layer.id) || "this layer"}.`] : [],
    missing: pass ? [] : ["Resolve blocking smoke-checker issues."],
    at: new Date().toISOString()
  }));
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}
