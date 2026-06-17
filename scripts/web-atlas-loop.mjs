#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const loopDir = join(root, "loops", "web-atlas");
const statePath = join(loopDir, "STATE.md");
const reportPath = join(loopDir, "latest-report.md");
const runBuild = process.argv.includes("--build");

const startedAt = new Date();
const graphSource = await readFile(join(root, "packages/repo-graph/src/index.ts"), "utf8");
const graphSnapshot = inspectGraph(graphSource);
const surfaceSnapshot = await inspectSurface();
const checks = [];

const checkCommands = [
  { name: "web typecheck", command: "npm", args: ["run", "typecheck", "-w", "@agent/web"] },
  { name: "repo graph typecheck", command: "npm", args: ["run", "typecheck", "-w", "@agent/repo-graph"] },
  { name: "ui typecheck", command: "npm", args: ["run", "typecheck", "-w", "@agent/ui"] },
  { name: "web lint", command: "npm", args: ["run", "lint", "-w", "@agent/web"] }
];

if (runBuild) {
  checkCommands.push({ name: "web build", command: "npm", args: ["run", "build", "-w", "@agent/web"] });
}

for (const check of checkCommands) {
  checks.push({
    name: check.name,
    ...(await run(check.command, check.args, { timeout: 120_000 }))
  });
}

const report = renderReport({ startedAt, graphSnapshot, surfaceSnapshot, checks, runBuild });
const state = renderState({ startedAt, graphSnapshot, surfaceSnapshot, checks, runBuild });

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, report);
await writeFile(statePath, state);

const failed = checks.filter((check) => check.exitCode !== 0);
console.log(`Web atlas loop wrote ${relative(reportPath)} and ${relative(statePath)}.`);
if (failed.length > 0) {
  console.log(`Failed checks: ${failed.map((check) => check.name).join(", ")}`);
  process.exitCode = 1;
}

async function inspectSurface() {
  const files = [
    "apps/web/app/page.tsx",
    "apps/web/app/layout.tsx",
    "apps/web/app/globals.css",
    "apps/web/components/earth-globe.tsx",
    "apps/web/components/agent-terminal.tsx",
    "apps/web/app/unity-rpg/page.tsx"
  ];
  const entries = [];

  for (const file of files) {
    try {
      const content = await readFile(join(root, file), "utf8");
      entries.push({
        path: file,
        present: true,
        lines: content.split("\n").length,
        bytes: Buffer.byteLength(content)
      });
    } catch {
      entries.push({ path: file, present: false, lines: 0, bytes: 0 });
    }
  }

  const missing = entries.filter((entry) => !entry.present).map((entry) => entry.path);
  return { entries, missing };
}

function inspectGraph(source) {
  const nodesSource = source.match(/export const repoNodes: RepoNode\[] = \[([\s\S]*?)\];/)?.[1] ?? "";
  const nodeMatches = [...nodesSource.matchAll(/\n\s+id:\s*"([^"]+)"/g)].map((match) => match[1]);
  const edgeMatches = [...source.matchAll(/\{\s*from:\s*"([^"]+)",\s*to:\s*"([^"]+)"\s*\}/g)];
  const groups = [...nodesSource.matchAll(/\n\s+group:\s*"([^"]+)"/g)].map((match) => match[1]);
  const groupCounts = groups.reduce((counts, group) => {
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});

  return {
    nodeCount: nodeMatches.length,
    edgeCount: edgeMatches.length,
    featuredCount: (source.match(/featured:\s*true/g) ?? []).length,
    groups: groupCounts,
    nodes: nodeMatches
  };
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

function renderReport({ startedAt, graphSnapshot, surfaceSnapshot, checks, runBuild }) {
  const failed = checks.filter((check) => check.exitCode !== 0);
  return `# Web Atlas Loop Report

- **Run:** ${startedAt.toISOString()}
- **Mode:** ${runBuild ? "full build" : "fast checks"}
- **Status:** ${failed.length === 0 && surfaceSnapshot.missing.length === 0 ? "green" : "needs attention"}

## Next Agent Action

${nextAction({ graphSnapshot, surfaceSnapshot, checks })}

## Checks

${checks.map(renderCheckSummary).join("\n")}

## Graph Snapshot

- Nodes: ${graphSnapshot.nodeCount}
- Edges: ${graphSnapshot.edgeCount}
- Featured nodes: ${graphSnapshot.featuredCount}
- Groups: ${Object.entries(graphSnapshot.groups).map(([group, count]) => `${group}=${count}`).join(", ")}
- Node ids: ${graphSnapshot.nodes.map((node) => `\`${node}\``).join(", ")}

## Surface Files

${surfaceSnapshot.entries
  .map((entry) => `- \`${entry.path}\` ${entry.present ? `${entry.lines} lines, ${entry.bytes} bytes` : "missing"}`)
  .join("\n")}
`;
}

function renderState({ startedAt, graphSnapshot, surfaceSnapshot, checks, runBuild }) {
  const failed = checks.filter((check) => check.exitCode !== 0);
  return `# Web Atlas Loop State

This file is written by \`npm run loop:web-atlas\`. Agents should read it before acting and update it only through the loop runner unless recording a manual decision.

## Current Snapshot

- Last run: ${startedAt.toISOString()}
- Mode: ${runBuild ? "full build" : "fast checks"}
- Check status: ${failed.length === 0 ? "green" : `failed: ${failed.map((check) => check.name).join(", ")}`}
- Graph nodes: ${graphSnapshot.nodeCount}
- Graph edges: ${graphSnapshot.edgeCount}
- Missing surface files: ${surfaceSnapshot.missing.length}

## Recommended Next Step

${nextAction({ graphSnapshot, surfaceSnapshot, checks })}

## Open Loop Items

${failed.map((check) => `- Fix failing \`${check.name}\` check.`).join("\n") || "- No failing checks from the latest loop run."}
${surfaceSnapshot.missing.map((file) => `\n- Restore missing atlas surface file \`${file}\`.`).join("")}

## Last Report

See \`loops/web-atlas/latest-report.md\`.
`;
}

function nextAction({ graphSnapshot, surfaceSnapshot, checks }) {
  const failed = checks.find((check) => check.exitCode !== 0);
  if (failed) {
    return `Investigate and fix the failing \`${failed.name}\` check, then rerun \`npm run loop:web-atlas\`.`;
  }

  if (surfaceSnapshot.missing.length > 0) {
    return `Restore or intentionally remove missing atlas files: ${surfaceSnapshot.missing.map((file) => `\`${file}\``).join(", ")}.`;
  }

  if (graphSnapshot.featuredCount < 3) {
    return "Review whether the most important project areas are featured on the globe.";
  }

  return "Pick one small atlas improvement: graph truthfulness, responsive polish, route discovery, or a project detail panel refinement.";
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
