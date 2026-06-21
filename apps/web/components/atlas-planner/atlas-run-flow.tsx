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
          <dl>
            <div>
              <dt>Source of truth</dt>
              <dd>Planner state</dd>
            </div>
            <div>
              <dt>Gate</dt>
              <dd>Subagent review</dd>
            </div>
            <div>
              <dt>Exit</dt>
              <dd>Evidence + stop</dd>
            </div>
          </dl>
        </div>

        <div className="atlas-run-flow__principles" aria-label="Orchestration contract">
          {orchestrationPrinciples.map((principle) => (
            <article key={principle.label}>
              <strong>{principle.label}</strong>
              <span>{principle.detail}</span>
            </article>
          ))}
        </div>

        <div className="atlas-run-flow__canvas">
          <svg className="atlas-run-flow__arrows" viewBox="0 0 980 500" aria-hidden="true">
            <defs>
              <marker id="atlas-flow-arrow" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="5">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 158 132 C 178 132 192 132 214 132"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 348 132 C 368 132 382 132 404 132"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 538 132 C 558 132 572 132 594 132"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 662 186 C 662 210 656 224 650 238"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 626 318 C 574 330 520 346 498 364"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 508 392 C 574 426 626 404 642 374"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 736 318 C 754 338 772 350 790 364"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 786 400 C 746 432 690 426 682 384"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 860 316 C 886 258 878 218 860 186"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--state"
              d="M 430 204 C 408 266 406 340 426 410"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--state"
              d="M 638 204 C 632 276 630 352 646 410"
            />
          </svg>

          {flowNodes.map((node) => {
            const Icon = node.icon;
            return (
              <article key={node.id} className={`atlas-run-flow__node ${node.className}`}>
                <span>{node.label}</span>
                <div>
                  <Icon size={18} />
                  <strong>{node.title}</strong>
                </div>
                <p>{node.detail}</p>
              </article>
            );
          })}

          <article className="atlas-run-flow__store atlas-run-flow__store--state">
            <strong>atlas_planner_state.json</strong>
            <span>task status, review rounds, blockers, completion</span>
          </article>
          <article className="atlas-run-flow__store atlas-run-flow__store--evidence">
            <strong>reports/evidence_index.json</strong>
            <span>commands, metrics, output paths, proof of work</span>
          </article>
        </div>

        <ol className="atlas-run-flow__legend" aria-label="Run sequence">
          <li>Goal is approved and queued.</li>
          <li>Controller claims one run.</li>
          <li>Runner edits one bounded task.</li>
          <li>Verification writes evidence.</li>
          <li>Reviewer agents send blocking feedback back to work.</li>
          <li>Clean review allows scoped commit and stop.</li>
        </ol>

        <ol className="atlas-run-flow__mobile-steps" aria-label="Compact run sequence">
          <li>Goal contract</li>
          <li>Approved queue</li>
          <li>Controller claims one run</li>
          <li>Runner edits and verifies</li>
          <li>Review gate loops feedback</li>
          <li>Commit, evidence, or safe stop</li>
        </ol>

        <p className="atlas-run-flow__mobile-evidence">
          <strong>Durable proof:</strong> planner state plus evidence index make each run resumable, reviewable, and
          auditable.
        </p>
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
