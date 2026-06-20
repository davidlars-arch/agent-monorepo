#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const branch = process.env.ATLAS_BRANCH || currentBranch();
const baseCommit = process.env.ATLAS_BASE || "";
const prBase = process.env.ATLAS_PR_BASE || "main";
const runId = process.env.ATLAS_RUN_ID || "atlas-run";
const ticketId = process.env.ATLAS_TICKET_ID || "atlas-ticket";
const evidencePath = process.env.ATLAS_EVIDENCE_PATH || "";

if (!branch) {
  fail("Unable to determine current branch for PR creation.");
}
validateRef(branch, "branch");
validateRef(prBase, "PR base");

const existing = gh(["pr", "view", branch, "--json", "url,number,state,title"]);
if (existing.status === 0 && existing.stdout.trim()) {
  process.stdout.write(existing.stdout.trim() + "\n");
  process.exit(0);
}

const bodyPath = join(process.cwd(), `.atlas-pr-${runId}.md`);
writeFileSync(bodyPath, renderPrBody(), "utf8");

const pushed = git(["push", "-u", "origin", branch]);
if (pushed.status !== 0) {
  process.stderr.write(pushed.stderr || pushed.stdout || "git push failed\n");
  process.exit(pushed.status || 1);
}

const created = gh(["pr", "create", "--base", prBase, "--head", branch, "--title", `${ticketId}: Atlas runner output`, "--body-file", bodyPath]);
if (created.status !== 0) {
  process.stderr.write(created.stderr || created.stdout || "gh pr create failed\n");
  process.exit(created.status || 1);
}

process.stdout.write(created.stdout.trim() + "\n");

function renderPrBody() {
  const evidence = readEvidence();
  return [
    `Atlas runner PR for \`${ticketId}\``,
    "",
    `Run: \`${runId}\``,
    `Branch: \`${branch}\``,
    `PR base: \`${prBase}\``,
    baseCommit ? `Runner base commit: \`${baseCommit}\`` : "",
    "",
    "Merge remains human-gated.",
    "",
    "Evidence:",
    `- Status: ${evidence.status ?? "unknown"}`,
    `- Checks: ${Array.isArray(evidence.checks) ? evidence.checks.length : 0}`,
    `- Findings: ${Array.isArray(evidence.findings) ? evidence.findings.length : 0}`,
    evidencePath ? `- Evidence path: \`${evidencePath}\`` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function readEvidence() {
  if (!evidencePath || !existsSync(evidencePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    return {};
  }
}

function currentBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function git(args) {
  return spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function gh(args) {
  return spawnSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function validateRef(value, label) {
  if (
    value !== value.trim() ||
    /\s/.test(value) ||
    value.startsWith("-") ||
    value.includes("..") ||
    value.includes("@{") ||
    /[~^:?*[\\]/.test(value) ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock")
  ) {
    fail(`Unsafe ${label} ref: ${value}`);
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
