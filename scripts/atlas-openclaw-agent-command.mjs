#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const stage = process.env.ATLAS_STAGE || "maker";
const runId = process.env.ATLAS_RUN_ID || "atlas-run";
const ticketId = process.env.ATLAS_TICKET_ID || "atlas-ticket";
const promptPath = process.env.ATLAS_PROMPT_PATH || "";
const evidencePath = process.env.ATLAS_EVIDENCE_PATH || "";
const handoffDir = process.env.ATLAS_HANDOFF_DIR || "";
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
    ? renderCheckerInstructions()
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

if (outputText && (output.aborted || stage !== "checker")) {
  const destination = output.aborted ? process.stderr : process.stdout;
  destination.write(`${outputText}\n`);
}
if (result.stderr.trim()) {
  process.stderr.write(`${result.stderr.trim()}\n`);
}

if (!output.aborted && stage === "checker" && (result.status ?? 1) === 0) {
  const verdictResult = writeCheckerVerdict(outputText);
  if (!verdictResult.ok) {
    if (outputText) {
      process.stderr.write(`${outputText}\n`);
    }
    console.error(verdictResult.reason);
    process.exit(2);
  }
}

process.exit(output.aborted ? 1 : (result.status ?? 1));

function renderCheckerInstructions() {
  return [
    "For checker stage, act as a verdict-only reviewer.",
    "Do not edit files. Do not run repair. Do not create PRs. Do not merge.",
    "Inspect the handoff artifacts, maker result, evidence, and worktree diff.",
    "Finish with structured JSON between ATLAS_CHECKER_JSON_START and ATLAS_CHECKER_JSON_END.",
    "The JSON must use this schema:",
    JSON.stringify(
      {
        schemaVersion: "atlas-checker-verdict.v1",
        runId,
        ticketId,
        pass: true,
        status: "passed",
        blockingIssues: [],
        nonBlockingIssues: [],
        evidenceReviewed: ["handoff.json", "goal-contract.json", "evidence.json", "maker-result.json", "maker.log"],
        recommendedNextAction: "human-review",
        satisfactionLayers: [],
        summary: "Deterministic maker output satisfies the goal contract."
      },
      null,
      2
    )
  ].join("\n");
}

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

function writeCheckerVerdict(outputText) {
  if (!handoffDir) {
    return { ok: false, reason: "ATLAS_HANDOFF_DIR is required for checker verdict output." };
  }

  const verdict = parseCheckerVerdict(outputText);
  if (!verdict) {
    return { ok: false, reason: "OpenClaw checker did not return valid atlas-checker-verdict.v1 JSON." };
  }

  const normalized = {
    ...verdict,
    runId: verdict.runId || runId,
    ticketId: verdict.ticketId || ticketId,
    status: verdict.status || (verdict.pass === true ? "passed" : "blocked"),
    blockingIssues: Array.isArray(verdict.blockingIssues) ? verdict.blockingIssues : [],
    nonBlockingIssues: Array.isArray(verdict.nonBlockingIssues) ? verdict.nonBlockingIssues : [],
    evidenceReviewed: Array.isArray(verdict.evidenceReviewed) ? verdict.evidenceReviewed : [],
    recommendedNextAction: verdict.recommendedNextAction || (verdict.pass === true ? "human-review" : "repair-or-human-review")
  };

  writeFileSync(join(handoffDir, "checker-verdict.json"), `${JSON.stringify(normalized, null, 2)}\n`);
  writeFileSync(
    join(handoffDir, "checker.log"),
    `${normalized.summary || "OpenClaw checker completed."}\nReviewed: ${normalized.evidenceReviewed.join(", ") || "(not listed)"}\n`,
    { flag: "a" }
  );

  process.stdout.write(`${JSON.stringify(toRunnerCheckerPayload(normalized))}\n`);
  return { ok: true };
}

function parseCheckerVerdict(outputText) {
  const parsed = parseMarkedJson(outputText) ?? parseLooseJson(outputText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  if (parsed.schemaVersion !== "atlas-checker-verdict.v1") {
    return null;
  }
  if (parsed.pass !== true && parsed.pass !== false) {
    return null;
  }
  return parsed;
}

function parseMarkedJson(outputText) {
  const marked = outputText.match(/ATLAS_CHECKER_JSON_START\s*([\s\S]*?)\s*ATLAS_CHECKER_JSON_END/);
  if (!marked?.[1]) {
    return null;
  }
  return parseLooseJson(marked[1]);
}

function parseLooseJson(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return JSON.parse(escapeLiteralNewlinesInJsonStrings(trimmed));
    } catch {
      return null;
    }
  }
}

function escapeLiteralNewlinesInJsonStrings(value) {
  let escaped = "";
  let inString = false;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      escaped += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaped += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      escaped += char;
      continue;
    }

    if (inString && char === "\n") {
      escaped += "\\n";
      continue;
    }

    if (inString && char === "\r") {
      continue;
    }

    escaped += char;
  }

  return escaped;
}

function toRunnerCheckerPayload(verdict) {
  return {
    status: verdict.status,
    summary: verdict.summary,
    findings: [
      ...verdict.blockingIssues.map((issue) => ({ severity: "blocker", ...issue })),
      ...verdict.nonBlockingIssues.map((issue) => ({ severity: issue.severity || "warning", ...issue }))
    ],
    satisfactionLayers: verdict.satisfactionLayers
  };
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
