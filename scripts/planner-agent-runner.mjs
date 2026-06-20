#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);

try {
  const options = parseArgs(args);
  const plan = buildPlan(options);

  if (options.dryRun) {
    printJson(plan);
    process.exit(0);
  }

  if (!options.resume) {
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
  }

  const execution = maybeRunAgentLoop(plan);

  printJson({
    status: execution.status,
    ticketId: plan.ticketId,
    runId: plan.runId,
    branch: plan.branch,
    worktreePath: plan.worktreePath,
    handoffDir: plan.handoffDir,
    files: plan.files,
    stage: execution.stage,
    repairAttempts: execution.repairAttempts,
    mode: options.resume ? "resume" : "create",
    createdAt: new Date().toISOString()
  });
} catch (error) {
  fail(error.message);
}

function parseArgs(rawArgs) {
  const options = {
    agentCommand: process.env.ATLAS_AGENT_COMMAND ?? "",
    prCommand: process.env.ATLAS_PR_COMMAND ?? "",
    base: "HEAD",
    dryRun: false,
    goalContract: null,
    goalTitle: "",
    maxRepairs: 0,
    maxRepairsProvided: false,
    resume: false
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--resume") {
      options.resume = true;
      continue;
    }

    if (
      [
        "--ticket",
        "--branch",
        "--base",
        "--worktree-dir",
        "--run-id",
        "--goal-title",
        "--goal-contract-json",
        "--handoff-dir",
        "--agent-command",
        "--maker-command",
        "--checker-command",
        "--repair-command",
        "--pr-command",
        "--max-repairs"
      ].includes(arg)
    ) {
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
      } else if (arg === "--goal-contract-json") {
        options.goalContract = parseGoalContractArg(value);
      } else if (arg === "--handoff-dir") {
        options.handoffDir = value;
      } else if (arg === "--agent-command") {
        options.agentCommand = value;
      } else if (arg === "--maker-command") {
        options.makerCommand = value;
      } else if (arg === "--checker-command") {
        options.checkerCommand = value;
      } else if (arg === "--repair-command") {
        options.repairCommand = value;
      } else if (arg === "--pr-command") {
        options.prCommand = value;
      } else if (arg === "--max-repairs") {
        options.maxRepairs = Number.parseInt(value, 10);
        options.maxRepairsProvided = true;
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.resume) {
    requireNonEmpty(options.handoffDir, "--handoff-dir");
  } else {
    requireNonEmpty(options.ticketId, "--ticket");
    requireNonEmpty(options.branch, "--branch");
    requireNonEmpty(options.base, "--base");
  }

  if (options.branch) {
    validateRefValue(options.branch, "--branch");
  }
  if (options.base) {
    validateRefValue(options.base, "--base");
  }
  if (options.runId) {
    validateIdValue(options.runId, "--run-id");
  }
  if (!Number.isInteger(options.maxRepairs) || options.maxRepairs < 0 || options.maxRepairs > 5) {
    throw new Error("--max-repairs must be an integer from 0 to 5");
  }
  if (options.repairCommand && !options.checkerCommand) {
    throw new Error("--repair-command requires --checker-command");
  }

  return options;
}

function buildPlan(options) {
  if (options.resume) {
    return buildResumePlan(options);
  }

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
    goalContract: normalizeGoalContract(options.goalContract, { title: options.goalTitle }),
    branch: options.branch,
    base: options.base,
    worktreePath,
    handoffDir,
    agentCommand: options.agentCommand,
    makerCommand: options.makerCommand,
    checkerCommand: options.checkerCommand,
    repairCommand: options.repairCommand,
    prCommand: options.prCommand,
    maxRepairs: options.maxRepairs,
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
      },
      {
        command: "repair-agent",
        args: [
          `If checker records blockers, run at most ${options.maxRepairs} repair attempt${options.maxRepairs === 1 ? "" : "s"} before stopping.`
        ]
      }
    ]
  };
}

function buildResumePlan(options) {
  const handoffDir = resolve(process.cwd(), options.handoffDir);
  const statePath = join(handoffDir, "runner-state.json");
  const state = readJson(statePath);
  const worktreePath = state.worktreePath;

  if (!worktreePath || !existsSync(worktreePath)) {
    throw new Error(`Cannot resume; worktree path does not exist: ${worktreePath ?? "(missing)"}`);
  }

  return {
    ticketId: state.ticketId,
    runId: state.runId,
    goalTitle: state.goalTitle ?? "",
    goalContract: normalizeGoalContract(state.goalContract, { title: state.goalTitle ?? "" }),
    branch: state.branch,
    base: state.base,
    worktreePath,
    handoffDir,
    agentCommand: options.agentCommand,
    makerCommand: options.makerCommand,
    checkerCommand: options.checkerCommand,
    repairCommand: options.repairCommand,
    prCommand: options.prCommand,
    maxRepairs: options.maxRepairsProvided ? options.maxRepairs : clampRepairAttempts(state.maxRepairs),
    files: state.files ?? {
      state: relative(process.cwd(), statePath),
      makerPrompt: relative(process.cwd(), join(handoffDir, "maker-prompt.md")),
      checkerPrompt: relative(process.cwd(), join(handoffDir, "checker-prompt.md")),
      evidence: relative(process.cwd(), join(handoffDir, "evidence.json"))
    },
    commands: [
      {
        command: "maker-agent",
        args: [`Read ${relative(process.cwd(), join(handoffDir, "maker-prompt.md"))} and continue the run in ${worktreePath}.`]
      },
      {
        command: "checker-agent",
        args: [`Read ${relative(process.cwd(), join(handoffDir, "checker-prompt.md"))}, review ${state.branch}, and update evidence.`]
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

function clampRepairAttempts(value) {
  const attempts = Number(value);
  if (!Number.isInteger(attempts)) {
    return 0;
  }
  return Math.min(5, Math.max(0, attempts));
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
        goalContract: plan.goalContract,
        branch: plan.branch,
        base: plan.base,
        worktreePath: plan.worktreePath,
        status: "prepared",
        stage: "maker-handoff",
        repairAttempts: 0,
        maxRepairs: plan.maxRepairs,
        prCommand: plan.prCommand,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [
          { stage: "prepare", status: "done", at: new Date().toISOString(), detail: "Worktree and handoff files were created." },
          { stage: "maker", status: plan.makerCommand ? "next" : "waiting", at: null, detail: "Maker implementation is required before checker review." },
          { stage: "checker", status: "locked", at: null, detail: "Checker review starts after maker completes." },
          { stage: "repair", status: plan.maxRepairs > 0 ? "locked" : "disabled", at: null, detail: "Repair is bounded by maxRepairs." }
        ],
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
    `${JSON.stringify(
      {
        version: 1,
        runId: plan.runId,
        status: "awaiting-maker",
        repairAttempts: 0,
        maxRepairs: plan.maxRepairs,
        satisfactionLayers: createInitialLayerEvidence(plan.goalContract),
        pullRequest: {
          status: plan.prCommand ? "configured" : "human-gated",
          detail: plan.prCommand
            ? "PR command is configured and will run after checker satisfaction."
            : "PR creation stays human-gated until ATLAS_PR_COMMAND or --pr-command is configured."
        },
        checks: [],
        findings: [],
        events: []
      },
      null,
      2
    )}\n`
  );
}

function maybeRunAgentLoop(plan) {
  const makerCommand = resolveStageCommand("maker", plan);
  const checkerCommand = resolveStageCommand("checker", plan);

  if (!makerCommand && !checkerCommand) {
    return { status: "created", stage: "maker-handoff", repairAttempts: 0 };
  }

  if (!makerCommand || !checkerCommand) {
    throw new Error("maker and checker commands must both be available; pass --agent-command or explicit --maker-command and --checker-command");
  }

  const maker = runLoopCommand("maker", makerCommand, plan);
  appendEvidenceEvent(plan, maker);
  if (!isCommandPassed(maker)) {
    updateRunnerState(plan, {
      status: "blocked",
      stage: "maker-failed",
      repairAttempts: 0,
      timelineEvent: { stage: "maker", status: "failed", at: maker.finishedAt, detail: maker.command }
    });
    return { status: "blocked", stage: "maker-failed", repairAttempts: 0 };
  }

  updateRunnerState(plan, {
    status: "running",
    stage: "checker",
    repairAttempts: 0,
    timelineEvent: { stage: "maker", status: "done", at: maker.finishedAt, detail: maker.command }
  });

  let checker = runLoopCommand("checker", checkerCommand, plan);
  appendEvidenceEvent(plan, checker);
  if (isCommandPassed(checker)) {
    return completeSatisfiedRun(plan, 0, { stage: "checker", status: "done", at: checker.finishedAt, detail: checker.command });
  }

  let repairAttempts = 0;
  for (let attempt = 1; attempt <= plan.maxRepairs; attempt += 1) {
    const repairCommand = resolveStageCommand("repair", plan);
    if (!repairCommand) {
      break;
    }
    repairAttempts = attempt;

    updateRunnerState(plan, {
      status: "repairing",
      stage: `repair-${attempt}`,
      repairAttempts: attempt,
      timelineEvent: { stage: "checker", status: "failed", at: checker.finishedAt, detail: checker.command }
    });

    const repair = runLoopCommand("repair", repairCommand, plan, { attempt });
    appendEvidenceEvent(plan, repair);
    if (!isCommandPassed(repair)) {
      updateEvidenceStatus(plan, "repair-failed", attempt);
      updateRunnerState(plan, {
        status: "blocked",
        stage: "repair-failed",
        repairAttempts: attempt,
        timelineEvent: { stage: "repair", status: "failed", at: repair.finishedAt, detail: repair.command }
      });
      return { status: "blocked", stage: "repair-failed", repairAttempts: attempt };
    }

    checker = runLoopCommand("checker", checkerCommand, plan, { attempt });
    appendEvidenceEvent(plan, checker);
    if (isCommandPassed(checker)) {
      return completeSatisfiedRun(plan, attempt, { stage: "checker", status: "done", at: checker.finishedAt, detail: checker.command });
    }
  }

  updateEvidenceStatus(plan, "checker-blocked", repairAttempts);
  updateRunnerState(plan, {
    status: "blocked",
    stage: "checker-blocked",
    repairAttempts,
    timelineEvent: { stage: "checker", status: "failed", at: checker.finishedAt, detail: checker.command }
  });
  return { status: "blocked", stage: "checker-blocked", repairAttempts };
}

function completeSatisfiedRun(plan, repairAttempts, checkerTimelineEvent) {
  updateEvidenceStatus(plan, repairAttempts > 0 ? "checker-passed-after-repair" : "checker-passed", repairAttempts);
  updateRunnerState(plan, {
    status: "satisfied",
    stage: "checker-passed",
    repairAttempts,
    timelineEvent: checkerTimelineEvent
  });

  const prCommand = plan.prCommand || "";
  if (!prCommand) {
    updatePullRequestGate(plan, {
      status: "ready",
      detail: "Local maker/checker evidence passed. PR creation is ready but still human-gated until ATLAS_PR_COMMAND is configured."
    });
    return { status: "satisfied", stage: "checker-passed", repairAttempts };
  }

  const pr = runLoopCommand("pr", prCommand, plan);
  appendEvidenceEvent(plan, pr);
  if (!isCommandPassed(pr)) {
    updatePullRequestGate(plan, {
      status: "blocked",
      command: pr.command,
      detail: pr.stderr || pr.stdout || "PR command failed.",
      at: pr.finishedAt
    });
    updateRunnerState(plan, {
      status: "blocked",
      stage: "pr-blocked",
      repairAttempts,
      timelineEvent: { stage: "pr", status: "failed", at: pr.finishedAt, detail: pr.command }
    });
    return { status: "blocked", stage: "pr-blocked", repairAttempts };
  }

  updatePullRequestGate(plan, {
    status: "created",
    command: pr.command,
    detail: pr.stdout || "PR command completed.",
    at: pr.finishedAt
  });
  updateRunnerState(plan, {
    status: "satisfied",
    stage: "pr-created",
    repairAttempts,
    timelineEvent: { stage: "pr", status: "done", at: pr.finishedAt, detail: pr.command }
  });
  return { status: "satisfied", stage: "pr-created", repairAttempts };
}

function resolveStageCommand(stage, plan) {
  if (stage === "maker") {
    return plan.makerCommand || plan.agentCommand || "";
  }
  if (stage === "checker") {
    return plan.checkerCommand || plan.agentCommand || "";
  }
  if (stage === "repair") {
    return plan.repairCommand || plan.agentCommand || "";
  }
  if (stage === "pr") {
    return plan.prCommand || "";
  }

  return "";
}

function isCommandPassed(event) {
  return event.exitCode === 0 && !hasBlockerFindings(event);
}

function hasBlockerFindings(event) {
  return Boolean(
    event.structuredStatus === "blocked" ||
      event.structuredStatus === "failed" ||
      event.structuredFindings?.some((finding) => finding.severity === "blocker") ||
      hasUnsatisfiedLayerProof(event)
  );
}

function hasUnsatisfiedLayerProof(event) {
  if (event.stage !== "checker") {
    return false;
  }

  const requiredLayerIds = Array.isArray(event.requiredSatisfactionLayerIds) ? event.requiredSatisfactionLayerIds : [];
  const layerProof = Array.isArray(event.structuredSatisfactionLayers) ? event.structuredSatisfactionLayers : [];
  if (requiredLayerIds.length === 0 && layerProof.length === 0) {
    return false;
  }

  const byId = new Map(layerProof.map((layer) => [firstString(layer.layerId, layer.label) ?? "", layer]));
  for (const requiredLayerId of requiredLayerIds) {
    const layer = byId.get(requiredLayerId);
    if (!isLayerProofSatisfied(layer)) {
      return true;
    }
  }

  return layerProof.some((layer) => !isLayerProofSatisfied(layer));
}

function isLayerProofSatisfied(layer) {
  return Boolean(
    layer &&
      layer.status === "satisfied" &&
      stringList(layer.proof).length > 0 &&
      stringList(layer.missing).length === 0
  );
}

function runLoopCommand(stage, command, plan, details = {}) {
  const startedAt = new Date().toISOString();
  const promptPath = getStagePromptPath(stage, plan);
  const prompt = promptPath && existsSync(promptPath) ? readFileSync(promptPath, "utf8") : "";
  const expandedCommand = expandCommandTemplate(command, {
    evidencePath: join(plan.handoffDir, "evidence.json"),
    handoffDir: plan.handoffDir,
    branch: plan.branch,
    base: plan.base,
    prompt,
    promptPath,
    repairAttempt: String(details.attempt ?? 0),
    runId: plan.runId,
    stage,
    ticketId: plan.ticketId,
    worktreePath: plan.worktreePath
  });
  const result = spawnSync(expandedCommand, {
    cwd: plan.worktreePath,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ATLAS_RUN_ID: plan.runId,
      ATLAS_TICKET_ID: plan.ticketId,
      ATLAS_STAGE: stage,
      ATLAS_PROMPT_PATH: promptPath,
      ATLAS_HANDOFF_DIR: plan.handoffDir,
      ATLAS_EVIDENCE_PATH: join(plan.handoffDir, "evidence.json"),
      ATLAS_REPAIR_ATTEMPT: String(details.attempt ?? 0),
      ATLAS_BRANCH: plan.branch,
      ATLAS_BASE: plan.base
    }
  });

  return {
    stage,
    command: expandedCommand,
    exitCode: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    startedAt,
    finishedAt: new Date().toISOString(),
    repairAttempt: details.attempt ?? 0,
    requiredSatisfactionLayerIds: getRequiredSatisfactionLayerIds(plan.goalContract),
    ...parseStructuredCheckerOutput(stage, result.stdout, result.stderr)
  };
}

function getStagePromptPath(stage, plan) {
  if (stage === "maker" || stage === "repair") {
    return join(plan.handoffDir, "maker-prompt.md");
  }
  if (stage === "checker") {
    return join(plan.handoffDir, "checker-prompt.md");
  }
  if (stage === "pr") {
    return join(plan.handoffDir, "checker-prompt.md");
  }

  return "";
}

function getRequiredSatisfactionLayerIds(goalContract) {
  if (!goalContract || !Array.isArray(goalContract.satisfactionLayers)) {
    return [];
  }

  return goalContract.satisfactionLayers
    .map((layer) => firstString(layer.id, layer.layerId, layer.label))
    .filter(Boolean);
}

function expandCommandTemplate(command, values) {
  return command.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    if (!(key in values)) {
      return match;
    }
    return shellQuote(values[key]);
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function parseStructuredCheckerOutput(stage, stdout, stderr) {
  if (stage !== "checker") {
    return {};
  }

  const parsed = parseJsonBlock(stdout) ?? parseJsonBlock(stderr);
  if (!parsed) {
    return {};
  }

  const findings = Array.isArray(parsed) ? parsed : parsed.findings;
  const structuredFindings = Array.isArray(findings)
    ? findings.map((finding) => normalizeCheckerFinding(finding)).filter(Boolean)
    : [];

  return {
    structuredStatus: typeof parsed.status === "string" ? parsed.status : undefined,
    structuredSummary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    structuredFindings,
    structuredSatisfactionLayers: normalizeLayerProof(parsed.satisfactionLayers ?? parsed.layerProof)
  };
}

function parseJsonBlock(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  const marked = trimmed.match(/ATLAS_CHECKER_JSON_START\s*([\s\S]*?)\s*ATLAS_CHECKER_JSON_END/);
  const candidate = marked?.[1]?.trim() ?? trimmed;
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeCheckerFinding(finding) {
  if (!finding || typeof finding !== "object") {
    return null;
  }

  const summary = firstString(finding.summary, finding.message, finding.title);
  if (!summary) {
    return null;
  }

  const severity = (firstString(finding.severity, finding.level) ?? "info").toLowerCase();
  const normalizedSeverity = ["blocker", "warning", "info"].includes(severity) ? severity : "info";

  return {
    severity: normalizedSeverity,
    summary,
    file: firstString(finding.file, finding.path),
    line: Number.isInteger(finding.line) ? finding.line : undefined,
    recommendation: firstString(finding.recommendation, finding.fix, finding.detail)
  };
}

function normalizeLayerProof(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 20)
    .map((item) => {
      const layerId = firstString(item.layerId, item.id);
      const label = firstString(item.label, item.title);
      if (!layerId && !label) {
        return null;
      }

      return {
        layerId: layerId || label,
        label: label || layerId,
        status: normalizeLayerProofStatus(firstString(item.status) ?? "pending"),
        criteria: firstString(item.criteria),
        humanGated: item.humanGated === true,
        proof: stringList(item.proof ?? item.evidence),
        missing: stringList(item.missing ?? item.gaps),
        at: firstString(item.at)
      };
    })
    .filter(Boolean);
}

function normalizeLayerProofStatus(value) {
  const status = value.toLowerCase();
  return ["pending", "scaffolded", "satisfied", "blocked"].includes(status) ? status : "pending";
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim() !== "")?.trim();
}

function stringList(value) {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).slice(0, 20);
}

function appendEvidenceEvent(plan, event) {
  const evidencePath = join(plan.handoffDir, "evidence.json");
  const evidence = readJson(evidencePath);
  const next = {
    ...evidence,
    status: event.exitCode === 0 ? `${event.stage}-passed` : `${event.stage}-failed`,
    repairAttempts: Math.max(evidence.repairAttempts ?? 0, event.repairAttempt ?? 0),
    checks: [
      ...(evidence.checks ?? []),
      {
        stage: event.stage,
        command: event.command,
        exitCode: event.exitCode,
        startedAt: event.startedAt,
        finishedAt: event.finishedAt,
        repairAttempt: event.repairAttempt
      }
    ],
    events: [...(evidence.events ?? []), event]
  };

  if (event.structuredFindings?.length) {
    next.findings = [
      ...(next.findings ?? evidence.findings ?? []),
      ...event.structuredFindings.map((finding) => ({
        ...finding,
        stage: event.stage,
        command: event.command,
        repairAttempt: event.repairAttempt,
        at: event.finishedAt
      }))
    ];
  }

  if (event.structuredSatisfactionLayers?.length) {
    next.satisfactionLayers = mergeLayerEvidence(next.satisfactionLayers ?? evidence.satisfactionLayers ?? [], event.structuredSatisfactionLayers, event);
  }

  if (hasBlockerFindings(event) && !event.structuredFindings?.some((finding) => finding.severity === "blocker")) {
    next.findings = [
      ...(next.findings ?? evidence.findings ?? []),
      {
        severity: "blocker",
        stage: event.stage,
        summary: event.structuredSummary ?? "Checker reported blocked status",
        command: event.command,
        repairAttempt: event.repairAttempt,
        at: event.finishedAt
      }
    ];
  }

  if (event.exitCode !== 0) {
    next.findings = [
      ...(next.findings ?? evidence.findings ?? []),
      {
        severity: "blocker",
        stage: event.stage,
        summary: `${event.stage} command exited ${event.exitCode}`,
        command: event.command,
        repairAttempt: event.repairAttempt,
        at: event.finishedAt
      }
    ];
  }

  writeJson(evidencePath, next);
}

function mergeLayerEvidence(existing, incoming, event) {
  const byId = new Map();
  for (const layer of Array.isArray(existing) ? existing : []) {
    if (layer && typeof layer === "object") {
      byId.set(firstString(layer.layerId, layer.id, layer.label) ?? "", layer);
    }
  }

  for (const layer of incoming) {
    const key = firstString(layer.layerId, layer.label) ?? "";
    const previous = byId.get(key) ?? {};
    byId.set(key, {
      ...previous,
      ...layer,
      proof: [...stringList(previous.proof), ...stringList(layer.proof)],
      missing: [...stringList(previous.missing), ...stringList(layer.missing)],
      at: layer.at ?? event.finishedAt,
      stage: event.stage,
      command: event.command,
      repairAttempt: event.repairAttempt
    });
  }

  return Array.from(byId.values()).filter((layer) => firstString(layer.layerId, layer.label));
}

function updateEvidenceStatus(plan, status, repairAttempts) {
  const evidencePath = join(plan.handoffDir, "evidence.json");
  const evidence = readJson(evidencePath);
  writeJson(evidencePath, { ...evidence, status, repairAttempts });
}

function updatePullRequestGate(plan, update) {
  const evidencePath = join(plan.handoffDir, "evidence.json");
  const evidence = readJson(evidencePath);
  writeJson(evidencePath, {
    ...evidence,
    pullRequest: {
      ...(evidence.pullRequest ?? {}),
      ...update
    }
  });
}

function updateRunnerState(plan, update) {
  const statePath = join(plan.handoffDir, "runner-state.json");
  const state = readJson(statePath);
  writeJson(statePath, {
    ...state,
    status: update.status,
    stage: update.stage,
    repairAttempts: update.repairAttempts,
    updatedAt: new Date().toISOString(),
    timeline: update.timelineEvent ? [...(state.timeline ?? []), update.timelineEvent] : state.timeline
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function renderMakerPrompt(plan) {
  const contract = renderGoalContract(plan.goalContract);
  return `# Maker Handoff

- Run: \`${plan.runId}\`
- Ticket: \`${plan.ticketId}\`
- Goal: ${plan.goalTitle || "No goal title supplied."}
- Branch: \`${plan.branch}\`
- Worktree: \`${plan.worktreePath}\`
- Base: \`${plan.base}\`

Implement one bounded slice for this ticket in the worktree. Keep the diff scoped, run the relevant checks, and update \`${plan.files.evidence}\` with changed files, verification commands, and a short summary.

## Goal Contract

${contract}

Runtime env:

- \`ATLAS_STAGE=maker\`
- \`ATLAS_PROMPT_PATH\` points at this file.
- \`ATLAS_EVIDENCE_PATH\` points at the shared evidence JSON.
`;
}

function renderCheckerPrompt(plan) {
  const contract = renderGoalContract(plan.goalContract);
  return `# Checker Handoff

- Run: \`${plan.runId}\`
- Ticket: \`${plan.ticketId}\`
- Goal: ${plan.goalTitle || "No goal title supplied."}
- Branch: \`${plan.branch}\`
- Worktree: \`${plan.worktreePath}\`
- Evidence: \`${plan.files.evidence}\`

Review the maker diff and verification evidence. Record blocker findings before any merge or satisfaction decision. Do not mark the run satisfied from maker output alone.

## Goal Contract

${contract}

If you find blockers, print structured JSON to stdout so the runner can record it:

\`\`\`json
{
  "status": "blocked",
  "satisfactionLayers": [
    {
      "layerId": "goal-contract",
      "status": "blocked",
      "proof": [],
      "missing": ["Describe the missing layer proof."]
    }
  ],
  "findings": [
    {
      "severity": "blocker",
      "summary": "Describe the concrete blocking issue.",
      "file": "relative/path.ts",
      "line": 1,
      "recommendation": "Describe the smallest repair."
    }
  ]
}
\`\`\`

Use \`status: "passed"\` with an empty \`findings\` array when the diff satisfies the goal and evidence requirements.
`;
}

function parseGoalContractArg(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    throw new Error("--goal-contract-json must be valid JSON object text");
  }
}

function normalizeGoalContract(value, fallback = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    statement: firstString(source.statement, source.outcome, fallback.title) ?? "",
    stopCondition: firstString(source.stopCondition) ?? "",
    scope: firstString(source.scope) ?? "",
    maxEstimate: Number.isFinite(Number(source.maxEstimate)) ? Number(source.maxEstimate) : undefined,
    satisfactionLayers: normalizeContractLayers(source.satisfactionLayers ?? source.layers),
    verificationCommands: normalizeVerificationCommands(source.verificationCommands ?? source.verification),
    safety: normalizeSafetySettings(source.safety)
  };
}

function normalizeContractLayers(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 20)
    .map((item, index) => ({
      id: firstString(item.id) ?? `layer-${index + 1}`,
      label: firstString(item.label, item.title) ?? `Layer ${index + 1}`,
      criteria: firstString(item.criteria) ?? "",
      status: normalizeLayerProofStatus(firstString(item.status) ?? "pending"),
      humanGated: item.humanGated === true
    }));
}

function normalizeVerificationCommands(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .slice(0, 20)
    .map((item, index) => ({
      id: firstString(item.id) ?? `verify-${index + 1}`,
      label: firstString(item.label, item.name) ?? `Verification ${index + 1}`,
      command: firstString(item.command) ?? "",
      required: item.required !== false
    }))
    .filter((item) => item.command);
}

function normalizeSafetySettings(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    maxIterations: Number.isFinite(Number(source.maxIterations)) ? Number(source.maxIterations) : undefined,
    maxRepairAttempts: Number.isFinite(Number(source.maxRepairAttempts)) ? Number(source.maxRepairAttempts) : undefined,
    tokenBudget: firstString(source.tokenBudget) ?? "",
    timeBudget: firstString(source.timeBudget) ?? "",
    allowedPaths: firstString(source.allowedPaths) ?? "",
    externalActionPolicy: firstString(source.externalActionPolicy) ?? ""
  };
}

function createInitialLayerEvidence(contract) {
  return contract.satisfactionLayers.map((layer) => ({
    layerId: layer.id,
    label: layer.label,
    status: layer.status,
    criteria: layer.criteria,
    humanGated: layer.humanGated,
    proof: [],
    missing: []
  }));
}

function renderGoalContract(contract) {
  const layers = contract.satisfactionLayers.length
    ? contract.satisfactionLayers
        .map((layer) => `- [${layer.status}${layer.humanGated ? ", human-gated" : ""}] ${layer.id} - ${layer.label}: ${layer.criteria}`)
        .join("\n")
    : "- No satisfaction layers supplied.";
  const verification = contract.verificationCommands.length
    ? contract.verificationCommands
        .map((item) => `- [${item.required ? "required" : "optional"}] ${item.label}: \`${item.command}\``)
        .join("\n")
    : "- No verification commands supplied.";
  const safetyLines = [
    ["Max estimate", contract.maxEstimate],
    ["Max iterations", contract.safety.maxIterations],
    ["Max repair attempts", contract.safety.maxRepairAttempts],
    ["Token budget", contract.safety.tokenBudget],
    ["Time budget", contract.safety.timeBudget],
    ["Allowed paths", contract.safety.allowedPaths],
    ["External actions", contract.safety.externalActionPolicy]
  ]
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([label, value]) => `- ${label}: ${value}`)
    .join("\n");

  return `Statement: ${contract.statement || "No statement supplied."}

Stop condition: ${contract.stopCondition || "No stop condition supplied."}

Scope: ${contract.scope || "No scope supplied."}

Satisfaction layers:
${layers}

Verification commands:
${verification}

Safety settings:
${safetyLines || "- No safety settings supplied."}`;
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
