#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const loopDir = join(root, "loops", "repo-health");
const statePath = join(loopDir, "STATE.md");
const reportPath = join(loopDir, "latest-report.md");

const checkCommands = [
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "lint", command: "npm", args: ["run", "lint"] }
];

const runBuild = process.argv.includes("--build");
if (runBuild) {
  checkCommands.push({ name: "build", command: "npm", args: ["run", "build"] });
}

const startedAt = new Date();
const gitStatus = await run("git", ["status", "--short"]);
const dirtyEntries = parseGitStatus(gitStatus.stdout);
const workspaces = await discoverWorkspaces();
const todos = await scanTodos();
const checks = [];

for (const check of checkCommands) {
  checks.push({
    name: check.name,
    ...(await run(check.command, check.args, { timeout: 120_000 }))
  });
}

const report = renderReport({
  startedAt,
  gitStatus,
  dirtyEntries,
  workspaces,
  todos,
  checks,
  runBuild
});

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, report);
await writeFile(statePath, renderState({ startedAt, gitStatus, dirtyEntries, workspaces, todos, checks, runBuild }));

const failed = checks.filter((check) => check.exitCode !== 0);
console.log(`Repo health loop wrote ${relative(reportPath)} and ${relative(statePath)}.`);
if (failed.length > 0) {
  console.log(`Failed checks: ${failed.map((check) => check.name).join(", ")}`);
  process.exitCode = 1;
}

async function run(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeout ?? 30_000
    });
    return {
      command: [command, ...args].join(" "),
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      command: [command, ...args].join(" "),
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim()
    };
  }
}

function parseGitStatus(output) {
  return output
    .split("\n")
    .filter(Boolean)
    .map(parseGitStatusLine);
}

function parseGitStatusLine(line) {
  if (line.startsWith("?? ") || line.startsWith("!! ")) {
    return dirtyEntry(line.slice(0, 2), line.slice(3));
  }

  if (line.length > 2 && line[2] === " ") {
    return dirtyEntry(line.slice(0, 2).trim(), line.slice(3));
  }

  const match = line.match(/^([A-Z?]{1,2})\s+(.+)$/);
  if (match) {
    return dirtyEntry(match[1], match[2]);
  }

  return dirtyEntry("changed", line);
}

function dirtyEntry(status, path) {
  return {
    status,
    path,
    kind: classifyDirtyKind(status),
    owner: classifyDirtyOwner(path),
    needsReview: !isGeneratedArtifact(path)
  };
}

function classifyDirtyKind(status) {
  if (status === "??") {
    return "untracked";
  }
  if (status.includes("U") || ["AA", "DD"].includes(status)) {
    return "conflict";
  }
  if (status.includes("D")) {
    return "deleted";
  }
  if (status.includes("R")) {
    return "renamed";
  }
  if (status.includes("A")) {
    return "added";
  }
  if (status.includes("M")) {
    return "modified";
  }
  return "changed";
}

function classifyDirtyOwner(path) {
  if (isGeneratedArtifact(path)) {
    return "generated artifact";
  }
  if (path.startsWith("loops/") && (path.endsWith("/latest-report.md") || path.endsWith("/state.json") || path.endsWith("/STATE.md"))) {
    return "loop state";
  }
  return "review before assignment";
}

function isGeneratedArtifact(path) {
  return path.startsWith(".run/");
}

async function discoverWorkspaces() {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const patterns = packageJson.workspaces ?? [];
  const workspaces = [];

  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      continue;
    }

    const base = pattern.slice(0, -2);
    const found = await run("find", [base, "-mindepth", "2", "-maxdepth", "2", "-name", "package.json", "-print"]);
    for (const file of found.stdout.split("\n").filter(Boolean)) {
      const workspacePackage = JSON.parse(await readFile(join(root, file), "utf8"));
      workspaces.push({
        name: workspacePackage.name ?? file,
        path: dirname(file),
        scripts: Object.keys(workspacePackage.scripts ?? {}).sort()
      });
    }
  }

  return workspaces.sort((left, right) => left.path.localeCompare(right.path));
}

async function scanTodos() {
  const result = await run("rg", [
    "--line-number",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!.next/**",
    "--glob",
    "!dist/**",
    "--glob",
    "!public/unity-build/**",
    "--glob",
    "!loops/repo-health/**",
    "--glob",
    "!scripts/repo-health-loop.mjs",
    "TODO|FIXME|HACK|XXX"
  ]);

  if (result.exitCode > 1) {
    return [{ path: "rg", line: 0, text: result.stderr || "todo scan failed" }];
  }

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .slice(0, 40)
    .map((line) => {
      const [path, rawLine, ...rest] = line.split(":");
      return {
        path,
        line: Number(rawLine),
        text: rest.join(":").trim()
      };
    });
}

function renderReport({ startedAt, gitStatus, dirtyEntries, workspaces, todos, checks, runBuild }) {
  const failed = checks.filter((check) => check.exitCode !== 0);
  return `# Repo Health Loop Report

- **Run:** ${startedAt.toISOString()}
- **Mode:** ${runBuild ? "full build" : "fast checks"}
- **Status:** ${failed.length === 0 ? "green" : "needs attention"}

## Next Agent Action

${nextAction({ gitStatus, todos, checks })}

## Checks

${checks.map(renderCheckSummary).join("\n")}

## Dirty Worktree

${codeBlock(gitStatus.stdout || "clean")}

${renderDirtyClassification(dirtyEntries)}

## Workspaces

${workspaces
  .map((workspace) => `- \`${workspace.name}\` at \`${workspace.path}\` (${workspace.scripts.join(", ") || "no scripts"})`)
  .join("\n")}

## TODO-like Markers

${todos.length === 0 ? "No TODO/FIXME/HACK/XXX markers found." : todos.map((todo) => `- \`${todo.path}:${todo.line}\` ${todo.text}`).join("\n")}
`;
}

function renderState({ startedAt, gitStatus, dirtyEntries, workspaces, todos, checks, runBuild }) {
  const failed = checks.filter((check) => check.exitCode !== 0);
  const reviewCount = dirtyEntries.filter((entry) => entry.needsReview).length;
  return `# Repo Health Loop State

This file is written by \`npm run loop:repo-health\`. Agents should read it before acting and update it only through the loop runner unless recording a manual decision.

## Current Snapshot

- Last run: ${startedAt.toISOString()}
- Mode: ${runBuild ? "full build" : "fast checks"}
- Check status: ${failed.length === 0 ? "green" : `failed: ${failed.map((check) => check.name).join(", ")}`}
- Workspaces: ${workspaces.length}
- TODO markers sampled: ${todos.length}
- Dirty entries: ${dirtyEntries.length}
- Dirty entries needing review: ${reviewCount}

## Recommended Next Step

${nextAction({ gitStatus, todos, checks })}

## Open Loop Items

${failed.map((check) => `- Fix failing \`${check.name}\` check.`).join("\n") || "- No failing checks from the latest loop run."}
${gitStatus.stdout ? "\n- Review dirty worktree entries before assigning parallel worktrees." : ""}
${todos.length > 0 ? "\n- Triage TODO-like markers and decide which are real work." : ""}

## Last Report

See \`loops/repo-health/latest-report.md\`.
`;
}

function renderDirtyClassification(dirtyEntries) {
  if (dirtyEntries.length === 0) {
    return "No dirty entries to classify.";
  }

  return `### Dirty Classification

${dirtyEntries
  .map(
    (entry) =>
      `- \`${entry.path}\` (${entry.status.trim() || "changed"}): ${entry.kind}; ${entry.owner}${
        entry.needsReview ? "; hold before spawning agents" : "; safe to ignore unless checks fail"
      }`
  )
  .join("\n")}`;
}

function nextAction({ gitStatus, todos, checks }) {
  const failed = checks.find((check) => check.exitCode !== 0);
  if (failed) {
    return `Investigate and fix the failing \`${failed.name}\` check. Start with the output in this report, make the smallest safe change, then rerun \`npm run loop:repo-health\`.`;
  }

  if (gitStatus.stdout) {
    return "Review the dirty worktree and separate current human/agent work from new loop candidates before spawning parallel agents.";
  }

  if (todos.length > 0) {
    return "Pick one TODO-like marker, verify whether it still matters, and either fix it or remove the stale marker.";
  }

  return "No immediate issue found. Keep the loop on discovery/triage cadence.";
}

function renderCheckSummary(check) {
  return `### ${check.name}

- Command: \`${check.command}\`
- Exit: ${check.exitCode}

${check.exitCode === 0 ? "Passed." : `${codeBlock(tail([check.stdout, check.stderr].filter(Boolean).join("\n\n"), 120))}`}
`;
}

function codeBlock(value) {
  return `\`\`\`\n${value}\n\`\`\``;
}

function relative(path) {
  return path.replace(`${root}/`, "");
}

function tail(value, lines) {
  return value.split("\n").slice(-lines).join("\n");
}
