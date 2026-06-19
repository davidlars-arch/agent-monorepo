#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);

try {
  const options = parseArgs(args);
  const plan = buildPlan(options);

  if (options.dryRun) {
    printJson(plan);
    process.exit(0);
  }

  if (existsSync(plan.worktreePath)) {
    fail(`Worktree path already exists: ${plan.worktreePath}`);
  }

  const git = spawnSync("git", plan.commands[0].args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (git.status !== 0) {
    fail("git worktree add failed", {
      exitCode: git.status,
      stdout: git.stdout.trim(),
      stderr: git.stderr.trim()
    });
  }

  writeRunFiles(plan);

  printJson({
    status: "created",
    ticketId: plan.ticketId,
    runId: plan.runId,
    branch: plan.branch,
    worktreePath: plan.worktreePath,
    handoffDir: plan.handoffDir,
    files: plan.files,
    createdAt: new Date().toISOString()
  });
} catch (error) {
  fail(error.message);
}

function parseArgs(rawArgs) {
  const options = {
    base: "HEAD",
    dryRun: false,
    goalTitle: ""
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (["--ticket", "--branch", "--base", "--worktree-dir", "--run-id", "--goal-title", "--handoff-dir"].includes(arg)) {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }

      if (arg === "--ticket") {
        options.ticketId = value;
      } else if (arg === "--branch") {
        options.branch = value;
      } else if (arg === "--base") {
        options.base = value;
      } else if (arg === "--worktree-dir") {
        options.worktreeDir = value;
      } else if (arg === "--run-id") {
        options.runId = value;
      } else if (arg === "--goal-title") {
        options.goalTitle = value;
      } else if (arg === "--handoff-dir") {
        options.handoffDir = value;
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  requireNonEmpty(options.ticketId, "--ticket");
  requireNonEmpty(options.branch, "--branch");
  requireNonEmpty(options.base, "--base");

  validateRefValue(options.branch, "--branch");
  validateRefValue(options.base, "--base");
  if (options.runId) {
    validateIdValue(options.runId, "--run-id");
  }

  return options;
}

function buildPlan(options) {
  const sanitizedBranch = sanitizeName(options.branch);
  const ticketSlug = sanitizeName(options.ticketId);
  const runId = options.runId ?? `run-${ticketSlug}-${Date.now().toString(36)}`;
  const worktreePath = resolve(
    process.cwd(),
    options.worktreeDir ?? `../agent-monorepo-${sanitizedBranch}`
  );
  const handoffDir = resolve(
    process.cwd(),
    options.handoffDir ?? join("loops", "project-controller", "runs", runId)
  );
  const commandArgs = ["worktree", "add", "-b", options.branch, worktreePath, options.base];
  const files = {
    state: relative(process.cwd(), join(handoffDir, "runner-state.json")),
    makerPrompt: relative(process.cwd(), join(handoffDir, "maker-prompt.md")),
    checkerPrompt: relative(process.cwd(), join(handoffDir, "checker-prompt.md")),
    evidence: relative(process.cwd(), join(handoffDir, "evidence.json"))
  };

  return {
    ticketId: options.ticketId,
    runId,
    goalTitle: options.goalTitle,
    branch: options.branch,
    base: options.base,
    worktreePath,
    handoffDir,
    files,
    commands: [
      {
        command: "git",
        args: commandArgs
      },
      {
        command: "maker-agent",
        args: [`Read ${files.makerPrompt} and implement one bounded slice in ${worktreePath}.`]
      },
      {
        command: "checker-agent",
        args: [`Read ${files.checkerPrompt}, review ${options.branch}, and append findings to ${files.evidence}.`]
      }
    ]
  };
}

function requireNonEmpty(value, flag) {
  if (!value || value.trim() === "") {
    throw new Error(`${flag} is required`);
  }
}

function validateRefValue(value, flag) {
  if (value !== value.trim() || /\s/.test(value)) {
    throw new Error(`${flag} must not contain whitespace`);
  }
  if (
    value.startsWith("-") ||
    value.includes("..") ||
    value.includes("@{") ||
    /[~^:?*[\\]/.test(value) ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.endsWith(".lock")
  ) {
    throw new Error(`${flag} is not a safe git ref value`);
  }
}

function validateIdValue(value, flag) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${flag} may only contain letters, numbers, dots, underscores, and dashes`);
  }
}

function sanitizeName(value) {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!sanitized) {
    throw new Error("Branch name cannot be sanitized into a usable worktree directory name");
  }

  return sanitized;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function writeRunFiles(plan) {
  mkdirSync(plan.handoffDir, { recursive: true });
  writeFileSync(
    join(plan.handoffDir, "runner-state.json"),
    `${JSON.stringify(
      {
        version: 1,
        runId: plan.runId,
        ticketId: plan.ticketId,
        goalTitle: plan.goalTitle,
        branch: plan.branch,
        base: plan.base,
        worktreePath: plan.worktreePath,
        status: "prepared",
        stage: "maker-handoff",
        createdAt: new Date().toISOString(),
        files: plan.files
      },
      null,
      2
    )}\n`
  );
  writeFileSync(join(plan.handoffDir, "maker-prompt.md"), renderMakerPrompt(plan));
  writeFileSync(join(plan.handoffDir, "checker-prompt.md"), renderCheckerPrompt(plan));
  writeFileSync(
    join(plan.handoffDir, "evidence.json"),
    `${JSON.stringify({ version: 1, runId: plan.runId, status: "awaiting-maker", checks: [], findings: [] }, null, 2)}\n`
  );
}

function renderMakerPrompt(plan) {
  return `# Maker Handoff

- Run: \`${plan.runId}\`
- Ticket: \`${plan.ticketId}\`
- Goal: ${plan.goalTitle || "No goal title supplied."}
- Branch: \`${plan.branch}\`
- Worktree: \`${plan.worktreePath}\`
- Base: \`${plan.base}\`

Implement one bounded slice for this ticket in the worktree. Keep the diff scoped, run the relevant checks, and update \`${plan.files.evidence}\` with changed files, verification commands, and a short summary.
`;
}

function renderCheckerPrompt(plan) {
  return `# Checker Handoff

- Run: \`${plan.runId}\`
- Ticket: \`${plan.ticketId}\`
- Branch: \`${plan.branch}\`
- Worktree: \`${plan.worktreePath}\`
- Evidence: \`${plan.files.evidence}\`

Review the maker diff and verification evidence. Record blocker findings before any merge or satisfaction decision. Do not mark the run satisfied from maker output alone.
`;
}

function fail(message, details) {
  const payload = {
    status: "failed",
    error: message
  };

  if (details) {
    payload.details = details;
  }

  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
