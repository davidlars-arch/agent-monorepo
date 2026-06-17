#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);

try {
  const options = parseArgs(args);
  const plan = buildPlan(options);

  if (options.dryRun) {
    printJson({
      ticketId: plan.ticketId,
      branch: plan.branch,
      base: plan.base,
      worktreePath: plan.worktreePath,
      commands: plan.commands
    });
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

  printJson({
    status: "created",
    ticketId: plan.ticketId,
    branch: plan.branch,
    worktreePath: plan.worktreePath,
    createdAt: new Date().toISOString()
  });
} catch (error) {
  fail(error.message);
}

function parseArgs(rawArgs) {
  const options = {
    base: "HEAD",
    dryRun: false
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (["--ticket", "--branch", "--base", "--worktree-dir"].includes(arg)) {
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

  return options;
}

function buildPlan(options) {
  const sanitizedBranch = sanitizeName(options.branch);
  const worktreePath = resolve(
    process.cwd(),
    options.worktreeDir ?? `../agent-monorepo-${sanitizedBranch}`
  );
  const commandArgs = ["worktree", "add", "-b", options.branch, worktreePath, options.base];

  return {
    ticketId: options.ticketId,
    branch: options.branch,
    base: options.base,
    worktreePath,
    commands: [
      {
        command: "git",
        args: commandArgs
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
