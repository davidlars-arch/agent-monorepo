#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const stage = process.env.ATLAS_STAGE || "maker";
const runId = process.env.ATLAS_RUN_ID || "atlas-run";
const ticketId = process.env.ATLAS_TICKET_ID || "atlas-ticket";
const promptPath = process.env.ATLAS_PROMPT_PATH || "";
const evidencePath = process.env.ATLAS_EVIDENCE_PATH || "";
const worktreePath = process.env.ATLAS_WORKTREE_PATH || process.cwd();

const prompt = promptPath && existsSync(promptPath) ? readFileSync(promptPath, "utf8") : "";
const message = [
  `[Atlas ${stage} task]`,
  `Run: ${runId}`,
  `Ticket: ${ticketId}`,
  `Worktree: ${worktreePath}`,
  evidencePath ? `Evidence: ${evidencePath}` : "",
  "",
  prompt,
  "",
  stage === "checker"
    ? "For checker stage, finish with structured JSON between ATLAS_CHECKER_JSON_START and ATLAS_CHECKER_JSON_END."
    : "Work only in the provided worktree and update evidence if you change files."
]
  .filter(Boolean)
  .join("\n");

const args = [
  "agent",
  "--local",
  "--json",
  "--session-key",
  `agent:atlas-runner:${sanitizeSessionKey(`${runId}-${stage}`)}`,
  "--message",
  message,
  "--timeout",
  process.env.ATLAS_OPENCLAW_TIMEOUT_SECONDS || "900"
];

const result = spawnSync("openclaw", args, {
  cwd: worktreePath,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"]
});

const output = parseAgentOutput(result.stdout);
const outputText = output.text || result.stdout.trim();

if (outputText) {
  const destination = output.aborted ? process.stderr : process.stdout;
  destination.write(`${outputText}\n`);
}
if (result.stderr.trim()) {
  process.stderr.write(`${result.stderr.trim()}\n`);
}

process.exit(output.aborted ? 1 : (result.status ?? 1));

function parseAgentOutput(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    return {
      aborted: parsed.meta?.aborted === true || parsed.result?.meta?.aborted === true,
      text:
        firstString(parsed.text, parsed.message, parsed.content, parsed.result?.text, parsed.result?.message) ||
        firstString(parsed.final, parsed.output) ||
        firstPayloadText(parsed)
    };
  } catch {
    return { aborted: false, text: "" };
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function firstPayloadText(value) {
  if (!Array.isArray(value?.payloads)) {
    return "";
  }
  for (const payload of value.payloads) {
    const text = firstString(payload?.text, payload?.message, payload?.content);
    if (text) {
      return text;
    }
  }
  return "";
}

function sanitizeSessionKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
