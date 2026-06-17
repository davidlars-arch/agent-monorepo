#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const controllerDir = join(root, "loops", "project-controller");
const registryPath = join(controllerDir, "projects.json");
const statePath = join(controllerDir, "state.json");
const reportPath = join(controllerDir, "latest-report.md");
const lockPath = join(controllerDir, "LOCK");
const args = process.argv.slice(2);

const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const listOnly = flags.has("--list");
const allProjects = flags.has("--all");
const dryRun = flags.has("--dry-run");
const runBuild = flags.has("--build");
const forceDue = flags.has("--force");
const projectIds = valuesFor("--project");

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const state = await readState();
const now = new Date();

if (listOnly) {
  console.log(renderList(registry));
  process.exit(0);
}

let lock;
try {
  lock = await open(lockPath, "wx");
  await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }, null, 2));
} catch {
  console.error(`Project controller lock exists at ${relative(lockPath)}. Another loop may be running.`);
  process.exit(1);
}

try {
  const selected = selectProjects(registry.projects, state, now);
  const results = [];

  for (const project of selected) {
    results.push(await runProject(project));
  }

  const nextState = updateState(state, results, now);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, renderReport({ now, selected, results, dryRun, runBuild }));
  await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

  const failed = results.filter((result) => result.status === "failed");
  console.log(`Project controller wrote ${relative(reportPath)} and ${relative(statePath)}.`);
  if (selected.length === 0) {
    console.log("No projects due.");
  }
  if (failed.length > 0) {
    console.log(`Failed projects: ${failed.map((result) => result.id).join(", ")}`);
    process.exitCode = 1;
  }
} finally {
  await lock.close();
  await rm(lockPath, { force: true });
}

function valuesFor(flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]);
    }
  }
  return values;
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return { version: 1, projects: {}, runs: [] };
  }
}

function selectProjects(projects, currentState, at) {
  if (projectIds.length > 0) {
    const found = projects.filter((project) => projectIds.includes(project.id));
    const missing = projectIds.filter((id) => !found.some((project) => project.id === id));
    if (missing.length > 0) {
      throw new Error(`Unknown project id: ${missing.join(", ")}`);
    }
    return found;
  }

  if (allProjects) {
    return projects;
  }

  return projects.filter((project) => isDue(project, currentState, at));
}

function isDue(project, currentState, at) {
  if (forceDue) {
    return true;
  }

  const projectState = currentState.projects?.[project.id];
  if (projectState?.lastStatus === "planned") {
    return true;
  }

  const lastRunAt = projectState?.lastRunAt;
  if (!lastRunAt) {
    return true;
  }

  const cadenceHours = project.cadenceHours ?? registry.defaults?.cadenceHours ?? 24;
  const elapsedMs = at.getTime() - new Date(lastRunAt).getTime();
  return elapsedMs >= cadenceHours * 60 * 60 * 1000;
}

async function runProject(project) {
  const commands = commandsFor(project);
  const startedAt = new Date();

  if (dryRun) {
    return {
      id: project.id,
      label: project.label,
      status: "planned",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      commands: commands.map((command) => ({ ...command, exitCode: null }))
    };
  }

  const commandResults = [];
  for (const command of commands) {
    const result = await run(command.cmd, command.args, {
      timeout: command.timeoutMs ?? project.timeoutMs ?? registry.defaults?.timeoutMs ?? 120_000
    });
    commandResults.push({ name: command.name, ...result });
    if (result.exitCode !== 0 && !project.allowFailure) {
      break;
    }
  }

  const failed = commandResults.some((command) => command.exitCode !== 0);
  return {
    id: project.id,
    label: project.label,
    status: failed && !project.allowFailure ? "failed" : failed ? "blocked" : "passed",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    commands: commandResults
  };
}

function commandsFor(project) {
  if (runBuild && project.buildCommands?.length) {
    return project.buildCommands;
  }
  return project.commands ?? [];
}

async function run(command, commandArgs, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeout ?? 120_000
    });
    return {
      command: [command, ...commandArgs].join(" "),
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      command: [command, ...commandArgs].join(" "),
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim()
    };
  }
}

function updateState(currentState, results, at) {
  const next = {
    version: 1,
    updatedAt: at.toISOString(),
    projects: { ...(currentState.projects ?? {}) },
    runs: [...(currentState.runs ?? [])]
  };

  for (const result of results) {
    if (dryRun || result.status === "planned") {
      continue;
    }

    next.projects[result.id] = {
      lastRunAt: result.finishedAt,
      lastStatus: result.status,
      lastCommandCount: result.commands.length
    };
  }

  next.runs.push({
    runAt: at.toISOString(),
    mode: runBuild ? "build" : "fast",
    dryRun,
    projects: results.map((result) => ({ id: result.id, status: result.status }))
  });
  next.runs = next.runs.slice(-25);
  return next;
}

function renderReport({ now, selected, results }) {
  return `# Project Controller Report

- **Run:** ${now.toISOString()}
- **Mode:** ${runBuild ? "build" : "fast"}
- **Dry run:** ${dryRun ? "yes" : "no"}
- **Selected projects:** ${selected.length === 0 ? "none" : selected.map((project) => `\`${project.id}\``).join(", ")}
- **Status:** ${reportStatus(results)}

## Next Controller Action

${nextControllerAction(selected, results)}

## Project Results

${results.length === 0 ? "No projects were due." : results.map(renderProjectResult).join("\n")}

## Registry Summary

${registry.projects
  .map((project) => `- \`${project.id}\` (${project.permission}): every ${project.cadenceHours ?? registry.defaults.cadenceHours}h; ${project.nextAction}`)
  .join("\n")}
`;
}

function renderProjectResult(result) {
  const project = registry.projects.find((candidate) => candidate.id === result.id);
  return `### ${result.label}

- Project: \`${result.id}\`
- Status: ${result.status}
- Permission: ${project?.permission ?? registry.defaults.permission}
- Next action: ${project?.nextAction ?? "No next action recorded."}

${result.commands.map(renderCommandResult).join("\n")}
`;
}

function renderCommandResult(command) {
  if (command.exitCode === null) {
    return `- Planned: \`${command.cmd} ${(command.args ?? []).join(" ")}\``;
  }

  const output = [command.stdout, command.stderr].filter(Boolean).join("\n\n");
  return `- ${command.exitCode === 0 ? "Passed" : "Failed"} \`${command.name}\`: \`${command.command}\` (exit ${command.exitCode})${command.exitCode === 0 || !output ? "" : `\n\n${codeBlock(tail(output, 80))}`}`;
}

function reportStatus(results) {
  if (results.length === 0) {
    return "idle";
  }
  if (results.some((result) => result.status === "failed")) {
    return "failed";
  }
  if (results.some((result) => result.status === "blocked")) {
    return "blocked";
  }
  if (results.every((result) => result.status === "planned")) {
    return "planned";
  }
  return "green";
}

function nextControllerAction(selected, results) {
  if (selected.length === 0) {
    return "No projects are due. Use `--force`, `--all`, or `--project <id>` to override.";
  }

  const failed = results.find((result) => result.status === "failed");
  if (failed) {
    return `Fix the failing \`${failed.id}\` command before starting new build work.`;
  }

  const blocked = results.find((result) => result.status === "blocked");
  if (blocked) {
    return `Resolve the blocker for \`${blocked.id}\` or keep it in plan-only mode.`;
  }

  const first = selected[0];
  return first.nextAction ?? "Pick the highest-priority passed project and build one small slice.";
}

function renderList(projectRegistry) {
  return projectRegistry.projects
    .map((project) => `${project.id}\t${project.permission}\tevery ${project.cadenceHours ?? projectRegistry.defaults.cadenceHours}h\t${project.area}`)
    .join("\n");
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
