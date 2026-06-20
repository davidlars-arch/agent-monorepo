import type { LoopPlannerCommand } from "@agent/atlas-planner";
import {
  Bot,
  CheckCircle2,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Target
} from "lucide-react";

type LoopSummary = {
  id: string;
  label: string;
  cadence: string;
  permission: string;
  commit: string;
  summary: string;
  status: "ready" | "registered" | "blocked";
};

type LoopFile = {
  path: string;
  role: string;
};

export const loopSummaries: LoopSummary[] = [
  {
    id: "project-controller",
    label: "Atlas Planner",
    cadence: "Runs due loops",
    permission: "registry controlled",
    commit: "c445d7d · chore: add project loop controller",
    summary: "Adds the central registry, lock, local state, latest report, project selection, dry-run mode, and build-mode execution.",
    status: "ready"
  },
  {
    id: "repo-health",
    label: "Repo Health",
    cadence: "Every 24h",
    permission: "build-local",
    commit: "65ff02e · chore: organize project sphere workspace tooling",
    summary: "Keeps the monorepo green with typecheck, lint, optional build, dirty-worktree detection, and TODO sampling.",
    status: "ready"
  },
  {
    id: "web-atlas",
    label: "Web Atlas",
    cadence: "Every 24h",
    permission: "build-local-and-commit",
    commit: "9b8cdc7 · chore: add web atlas loop",
    summary: "Checks the Project Sphere web surface, repo graph metadata, shared UI package, and atlas surface files.",
    status: "ready"
  },
  {
    id: "crypto-tax-sweden",
    label: "Crypto Tax Sweden",
    cadence: "Every 72h",
    permission: "build-local-and-commit",
    commit: "c445d7d · registered in project controller",
    summary: "Runs the tax app checks and queues focused work around CSV edge cases, review flow, exports, and evidence trails.",
    status: "registered"
  },
  {
    id: "crypto-trader-test",
    label: "Crypto Trader Test",
    cadence: "Every 72h",
    permission: "dry-run-only-and-commit",
    commit: "c445d7d · registered in project controller",
    summary: "Runs safe trader checks and dry-run-only automation. Live trading is deliberately excluded from the loop.",
    status: "registered"
  },
  {
    id: "rpg-slice",
    label: "RPG Slice",
    cadence: "Every 72h",
    permission: "build-local-and-commit",
    commit: "c445d7d · registered in project controller",
    summary: "Tracks the Unity/WebGL slice, browser mock parity, and original JRPG-style gameplay increments.",
    status: "registered"
  },
  {
    id: "analytics-dbt",
    label: "Analytics dbt POC",
    cadence: "Every 168h",
    permission: "plan-until-dbt-installed",
    commit: "c445d7d · registered in project controller",
    summary: "Records the dbt analytics loop as blocked until dbt is available on PATH, then runs local DuckDB models.",
    status: "blocked"
  },
  {
    id: "workspace-memory",
    label: "Workspace Maintenance",
    cadence: "Every 168h",
    permission: "internal-edits-only",
    commit: "c445d7d · registered in project controller",
    summary: "Keeps OpenClaw memory and heartbeat notes maintained without leaking private workspace context.",
    status: "registered"
  }
];

export const loopFiles: LoopFile[] = [
  {
    path: "loops/project-controller/projects.json",
    role: "Committed registry: project ids, cadence, permissions, commands, build commands, and next actions."
  },
  {
    path: "loops/project-controller/LOOP.md",
    role: "Human-readable controller contract: purpose, cadence, state files, and expansion points."
  },
  {
    path: "loops/project-controller/PROMPT.md",
    role: "Agent runbook for operating the controller and choosing the next build slice."
  },
  {
    path: "loops/project-controller/state.json",
    role: "Ignored local memory: last run time, status, command counts, and short run history."
  },
  {
    path: "loops/project-controller/latest-report.md",
    role: "Ignored latest report: selected projects, pass/block/fail state, and next controller action."
  },
  {
    path: "loops/project-controller/decisions.jsonl",
    role: "Ignored append-only planner audit trail: selected ticket, score, token budget, reason, and deferred larger work."
  },
  {
    path: "loops/*/LOOP.md",
    role: "Durable child-loop contract for one project area."
  },
  {
    path: "loops/*/PROMPT.md",
    role: "Agent prompt/runbook for executing that child loop safely."
  },
  {
    path: "scripts/project-loop.mjs",
    role: "Controller runner: lock, select due projects, execute commands, write state/report."
  }
];

export const reliabilityPrimitives = [
  {
    label: "Automation",
    value: "Cadence owns discovery",
    detail: "The loop finds due projects instead of waiting for a fresh human prompt."
  },
  {
    label: "Isolation",
    value: "Worktree before parallel work",
    detail: "Agents can draft fixes without trampling the active checkout."
  },
  {
    label: "Skills",
    value: "Project rules live outside chat",
    detail: "Repeatable loop knowledge belongs in skills and loop markdown, not pasted prompts."
  },
  {
    label: "Connectors",
    value: "External actions stay explicit",
    detail: "Issues, messages, and PR updates need an approved connector path."
  },
  {
    label: "Maker / checker",
    value: "Verifier grades the work",
    detail: "The agent that builds should not be the only one deciding that it is done."
  },
  {
    label: "State memory",
    value: "The repo remembers",
    detail: "State files and reports carry progress across cold starts."
  }
];

const loopRunTimelineSteps = [
  {
    id: "queued",
    label: "Queued",
    icon: Target,
    detail: "A goal or ticket is selected and waiting for the loop runner."
  },
  {
    id: "scored",
    label: "Scored",
    icon: ListChecks,
    detail: "Usage window, Fibonacci size, readiness, and risk are checked before work starts."
  },
  {
    id: "branch",
    label: "Branch",
    icon: GitBranch,
    detail: "The loop enters an isolated branch or worktree for the selected slice."
  },
  {
    id: "maker",
    label: "Maker",
    icon: Bot,
    detail: "The maker agent implements one bounded change and records the diff."
  },
  {
    id: "checker",
    label: "Checker",
    icon: ShieldCheck,
    detail: "A separate reviewer checks goal layers, risk, and missing evidence."
  },
  {
    id: "verify",
    label: "Verify",
    icon: CheckCircle2,
    detail: "Required commands must pass before the loop can claim satisfaction."
  },
  {
    id: "pr",
    label: "PR",
    icon: GitPullRequest,
    detail: "The loop opens or updates a pull request with the evidence trail."
  },
  {
    id: "merge",
    label: "Merge",
    icon: GitMerge,
    detail: "Merge stays gated until checks, review, and policy allow it."
  },
  {
    id: "sync",
    label: "Sync",
    icon: GitCommitHorizontal,
    detail: "After merge, main is pulled and the next branch can begin cleanly."
  }
];

export const loopEvidenceSources = [
  {
    label: "Latest report",
    path: "loops/project-controller/latest-report.md",
    status: "local memory",
    detail: "Human-readable summary of the last controller run, blockers, and next action."
  },
  {
    label: "Controller state",
    path: "loops/project-controller/state.json",
    status: "local memory",
    detail: "Run timestamps, command counts, status history, and loop bookkeeping."
  },
  {
    label: "Decision log",
    path: "loops/project-controller/decisions.jsonl",
    status: "audit trail",
    detail: "Append-only selected ticket, score, token gate, reason, and deferred work."
  },
  {
    label: "Usage window",
    path: "loops/usage-status/latest-status.json",
    status: "budget input",
    detail: "Current daily and weekly runway used to choose a sane first slice."
  },
  {
    label: "Verification output",
    path: "npm scripts and build logs",
    status: "required proof",
    detail: "Typecheck, lint, tests, build, screenshots, and reviewer findings before satisfaction."
  },
  {
    label: "PR evidence",
    path: "GitHub PR link",
    status: "future connector",
    detail: "PR, CI status, review comments, merge result, and post-merge sync evidence."
  }
];

export const prMergeGates = [
  {
    label: "PR creation",
    icon: GitPullRequest,
    status: "planned",
    detail: "Open or update a PR only after required local verification is green."
  },
  {
    label: "CI checks",
    icon: CheckCircle2,
    status: "required",
    detail: "Remote checks must pass before review or merge can advance."
  },
  {
    label: "Subagent review",
    icon: ShieldCheck,
    status: "required",
    detail: "A checker reviews the diff, satisfaction layers, risk, and missing evidence."
  },
  {
    label: "Repair loop",
    icon: RefreshCw,
    status: "bounded",
    detail: "Reviewer blockers loop back to maker until fixed or the repair cap is hit."
  },
  {
    label: "Merge gate",
    icon: GitMerge,
    status: "human-gated",
    detail: "Merge remains approval-gated until policy is deliberately loosened."
  },
  {
    label: "Sync main",
    icon: GitCommitHorizontal,
    status: "required",
    detail: "After merge, pull main, clean the branch/worktree, and start fresh."
  }
];

export function getLoopPlannerDisplayCommand(
  command: string,
  options: { hasCurrentRun: boolean; hasClaimableQueuedGoal: boolean }
) {
  if (
    !options.hasCurrentRun &&
    options.hasClaimableQueuedGoal &&
    command.startsWith("npm run loop:projects") &&
    !command.includes("--claim-goal")
  ) {
    return `${command} --claim-goal`;
  }

  return command;
}

export function getLoopRunTimeline(command: LoopPlannerCommand) {
  return loopRunTimelineSteps.map((step, index) => {
    if (!command.ticket) {
      return {
        ...step,
        status: index === 0 ? "waiting" : "locked",
        evidence: index === 0 ? "No actionable ticket selected yet." : "Locked until a ticket is selected."
      };
    }

    if (index <= 1) {
      return {
        ...step,
        status: "ready",
        evidence:
          index === 0
            ? `${command.ticket.id} is selected for the next run.`
            : `Planner score ${command.decision.selected?.score ?? 0}; cap ${command.maxEstimate} pts.`
      };
    }

    if (index === 2) {
      return {
        ...step,
        status: "next",
        evidence: "Next required action before maker work starts."
      };
    }

    return {
      ...step,
      status: "locked",
      evidence: "Locked until previous stage records evidence."
    };
  });
}
