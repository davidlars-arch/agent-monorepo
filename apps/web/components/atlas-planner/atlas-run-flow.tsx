"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Code2,
  Database,
  FileText,
  GitCommitHorizontal,
  ShieldCheck,
  TerminalSquare,
  TestTube2,
  UserRound
} from "lucide-react";

const flowNodes = [
  {
    id: "intent",
    className: "atlas-run-flow__node--intent",
    icon: UserRound,
    label: "Intent",
    title: "Ticket or goal idea",
    detail: "A developer describes what should be built, fixed, or improved."
  },
  {
    id: "contract",
    className: "atlas-run-flow__node--contract",
    icon: ClipboardList,
    label: "Goal contract",
    title: "Executable spec",
    detail: "Scope, allowed paths, checks, stop rules, and safety gates."
  },
  {
    id: "queue",
    className: "atlas-run-flow__node--queue",
    icon: ShieldCheck,
    label: "Queue",
    title: "Approved queue",
    detail: "Only approved goals can be claimed by the controller."
  },
  {
    id: "runner",
    className: "atlas-run-flow__node--runner",
    icon: Bot,
    label: "Runner",
    title: "Claimed execution",
    detail: "One isolated run advances one task and writes state."
  },
  {
    id: "work",
    className: "atlas-run-flow__node--work",
    icon: Code2,
    label: "Work",
    title: "Edit + verify",
    detail: "Code changes, tests, evidence report, and state update."
  },
  {
    id: "done",
    className: "atlas-run-flow__node--done",
    icon: CheckCircle2,
    label: "Done",
    title: "Commit + stop",
    detail: "Clean review, scoped commit, evidence, self-stop if complete."
  },
  {
    id: "reviewer-a",
    className: "atlas-run-flow__node--reviewer-a",
    icon: Bot,
    label: "Reviewer A",
    title: "Subagent review",
    detail: "Finds bugs, missing checks, unsafe scope, and unclear behavior."
  },
  {
    id: "reviewer-b",
    className: "atlas-run-flow__node--reviewer-b",
    icon: Bot,
    label: "Reviewer B",
    title: "Final pass",
    detail: "Confirms no blocking reviewer feedback before commit."
  }
] as const;

const proofCards = [
  {
    label: "Input",
    value: "Approved goal",
    detail: "A scoped contract with allowed paths, checks, review policy, and stop rules."
  },
  {
    label: "Controller",
    value: "One claimed run",
    detail: "Atlas selects a single approved goal and creates durable current-run state."
  },
  {
    label: "Output",
    value: "Verified change",
    detail: "A bounded repo change with passing checks, review feedback, evidence, and a clean stop."
  }
] as const;

const orchestrationPrinciples = [
  {
    label: "Bounded scope",
    detail: "The goal contract says what paths, checks, and safety limits apply."
  },
  {
    label: "Durable state",
    detail: "A run can be resumed, audited, or blocked without relying on chat memory."
  },
  {
    label: "Single active runner",
    detail: "The controller claims one executable goal so agents do not trample each other."
  },
  {
    label: "Verification gate",
    detail: "Commands must pass before the work can claim completion."
  },
  {
    label: "Review + stop",
    detail: "Reviewer feedback loops before commit, then the run stops cleanly or records a blocker."
  }
] as const;

const persistedArtifacts = [
  {
    icon: FileText,
    label: "Goal and policy docs",
    files: ["README.md", "atlas_goal.md", "atlas_loop_policy.md"],
    detail: "Defines the paper-only goal, approval boundaries, retry rules, review gate, and stop conditions."
  },
  {
    icon: Database,
    label: "Planner state",
    files: ["atlas_planner_state.json"],
    detail: "Holds status, tasks, acceptance criteria, verification commands, review rounds, evidence, and blockers."
  },
  {
    icon: TerminalSquare,
    label: "Runner API",
    files: ["atlas_loop_runner.py"],
    detail: "Gives the controller concrete commands for status, next task, review records, completion, and blockers."
  },
  {
    icon: TestTube2,
    label: "Verification",
    files: ["tests/", "reports/backtest_evidence_latest.md"],
    detail: "Proves the paper trader still runs, metrics are stable, reports write, and JSON state remains valid."
  },
  {
    icon: ShieldCheck,
    label: "Reviewer records",
    files: ["Codex subagent reviews"],
    detail: "Reviewer findings loop back into edits until there is no blocking or actionable feedback."
  },
  {
    icon: GitCommitHorizontal,
    label: "Audit trail",
    files: ["reports/evidence_index.json", "git commits"],
    detail: "Captures commands, status, output paths, metrics, commit scope, and final completion proof."
  }
] as const;

const proofStats = [
  {
    label: "Tasks closed",
    value: "7",
    detail: "Each task carried criteria, checks, evidence, and completion state."
  },
  {
    label: "Review gate",
    value: "passed",
    detail: "Failed review rounds looped back before the clean final review."
  },
  {
    label: "Evidence",
    value: "indexed",
    detail: "Reports captured command status, metrics, output paths, and proof."
  }
] as const;

const runContractSteps = [
  {
    label: "Wake",
    title: "Cron starts a bounded run",
    detail: "The schedule wakes the agent, checks the planner state, and advances only one pending task."
  },
  {
    label: "Select",
    title: "Status then next",
    detail: "State validation must pass before the next pending task and its acceptance criteria are used."
  },
  {
    label: "Build",
    title: "Scoped edit",
    detail: "The runner changes only the intended POC files and keeps live trading, credentials, and funds out."
  },
  {
    label: "Verify",
    title: "Commands must pass",
    detail: "Python compile, engine runs, report generation, unittest, and JSON validation gate completion."
  },
  {
    label: "Review",
    title: "Subagent loop",
    detail: "Bad feedback records a failed round, sends work back to edit, then reruns verification and review."
  },
  {
    label: "Commit",
    title: "Clean review only",
    detail: "A clean review permits a scoped commit and evidence update. Blockers prevent commit."
  },
  {
    label: "Stop",
    title: "Final audit cleanup",
    detail: "When no tasks remain, the cron job is removed and planner state records complete with last-run proof."
  }
] as const;

const runnerCommands = [
  {
    command: "python3 atlas_loop_runner.py status",
    detail: "Validate safety and review gates, count pending tasks, identify next task."
  },
  {
    command: "python3 atlas_loop_runner.py next",
    detail: "Print the next pending task, including criteria, evidence, and verification commands."
  },
  {
    command: "python3 atlas_loop_runner.py record-review --task-id ...",
    detail: "Append reviewer pass/fail rounds so review history survives outside chat."
  },
  {
    command: "python3 atlas_loop_runner.py complete --task-id ...",
    detail: "Mark the task complete only after verification, clean review, and evidence updates."
  },
  {
    command: "python3 atlas_loop_runner.py block --task-id ...",
    detail: "Stop safely when criteria cannot be met, review keeps failing, or scope would cross a safety gate."
  }
] as const;

export function AtlasRunFlow() {
  return (
    <div className="atlas-run-flow-stack">
      <section className="atlas-run-flow" aria-label="Atlas Planner run flow">
        <div className="atlas-run-flow__heading">
          <div>
            <p>How it works</p>
            <h3>How Atlas turns approved goals into verified repo changes.</h3>
            <span>
              Atlas Planner is an agentic workflow orchestrator that turns approved goals into bounded autonomous repo
              runs with state, verification, reviewer feedback, evidence, and explicit stop conditions.
            </span>
          </div>
          <aside>
            <strong>Goal to commit pipeline</strong>
            <span>Stateful, review-gated, resumable.</span>
          </aside>
        </div>

        <div className="atlas-run-flow__proof-cards" aria-label="Atlas Planner contract summary">
          {proofCards.map((card) => (
            <article key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>

        <ol className="atlas-run-flow__pipeline" aria-label="Run sequence">
          {flowNodes.slice(0, 6).map((node, index) => {
            const Icon = node.icon;
            return (
              <li key={node.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <Icon size={18} />
                  <h4>{node.label}</h4>
                </div>
                <strong>{node.title}</strong>
                <p>{node.detail}</p>
              </li>
            );
          })}
        </ol>

        <div className="atlas-run-flow__operations">
          <section aria-label="Review loop">
            <div>
              <Bot size={18} />
              <strong>Review loop</strong>
            </div>
            <p>
              Subagents inspect the change for bugs, missing checks, unsafe scope, and unclear behavior. Blocking
              feedback sends the run back to work before commit.
            </p>
          </section>
          <section aria-label="Durable proof">
            <div>
              <Database size={18} />
              <strong>Durable proof</strong>
            </div>
            <p>
              <code>atlas_planner_state.json</code> records run state. <code>reports/evidence_index.json</code> records
              commands, metrics, output paths, and proof of work.
            </p>
          </section>
        </div>

        <div className="atlas-run-flow__principles" aria-label="Orchestration contract">
          {orchestrationPrinciples.map((principle) => (
            <article key={principle.label}>
              <strong>{principle.label}</strong>
              <span>{principle.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="atlas-poc-contract" aria-label="Atlas crypto trader POC evidence contract">
        <div className="atlas-poc-contract__header">
          <div>
            <p>Historical POC evidence</p>
            <h3>Historical proof: a completed planner-run POC.</h3>
            <span>
              This completed run proves the loop mechanics without making Atlas Planner specific to crypto trading.
            </span>
          </div>
          <aside>
            <AlertTriangle size={16} />
            <span>
              Specific to <code>atlas-crypto-trader-test</code>; the monorepo controller is the productized next layer.
            </span>
          </aside>
        </div>

        <details className="atlas-poc-contract__details">
          <summary>Inspect completed run evidence</summary>

          <div className="atlas-poc-contract__proof" aria-label="POC proof of run">
            {proofStats.map((stat) => (
              <article key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                <p>{stat.detail}</p>
              </article>
            ))}
          </div>

          <div className="atlas-poc-contract__grid">
            <section className="atlas-poc-contract__timeline" aria-label="End to end POC run sequence">
              <div className="atlas-poc-contract__section-heading">
                <Clock3 size={16} />
                <h4>One run from wake to stop</h4>
              </div>
              <ol>
                {runContractSteps.map((step) => (
                  <li key={step.label}>
                    <span>{step.label}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="atlas-poc-contract__commands" aria-label="Example runner API">
              <div className="atlas-poc-contract__section-heading">
                <TerminalSquare size={16} />
                <h4>Example runner API</h4>
              </div>
              <div>
                {runnerCommands.map((runnerCommand) => (
                  <article key={runnerCommand.command}>
                    <code>{runnerCommand.command}</code>
                    <p>{runnerCommand.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="atlas-poc-contract__persisted" aria-label="Durable state and evidence">
            <div className="atlas-poc-contract__section-heading">
              <Database size={16} />
              <h4>Durable state and evidence</h4>
            </div>
            <div>
              {persistedArtifacts.map((artifact) => {
                const Icon = artifact.icon;
                return (
                  <article key={artifact.label}>
                    <div>
                      <Icon size={17} />
                      <strong>{artifact.label}</strong>
                    </div>
                    <ul>
                      {artifact.files.map((file) => (
                        <li key={file}>
                          <code>{file}</code>
                        </li>
                      ))}
                    </ul>
                    <p>{artifact.detail}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </details>
      </section>
    </div>
  );
}
