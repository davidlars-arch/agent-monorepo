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
    detail: "David describes what should exist and where it belongs."
  },
  {
    id: "contract",
    className: "atlas-run-flow__node--contract",
    icon: ClipboardList,
    label: "Contract",
    title: "Strict goal",
    detail: "Scope, allowed paths, checks, stop rules, and safety gates."
  },
  {
    id: "queue",
    className: "atlas-run-flow__node--queue",
    icon: ShieldCheck,
    label: "Queue",
    title: "Approved to run",
    detail: "Only approved goals can be claimed by the controller."
  },
  {
    id: "runner",
    className: "atlas-run-flow__node--runner",
    icon: Bot,
    label: "Runner",
    title: "Claimed execution",
    detail: "Isolated run advances one task and writes state."
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
    detail: "Confirms BAD_FEEDBACK: none before commit."
  }
] as const;

const contractArtifacts = [
  {
    icon: FileText,
    label: "Goal docs",
    files: ["README.md", "atlas_goal.md", "atlas_loop_policy.md"],
    detail: "Defines the paper-only goal, approval boundaries, retry rules, review gate, and stop conditions."
  },
  {
    icon: Database,
    label: "State source",
    files: ["atlas_planner_state.json"],
    detail: "Holds status, tasks, acceptance criteria, verification commands, review rounds, evidence, and blockers."
  },
  {
    icon: TerminalSquare,
    label: "Runner contract",
    files: ["atlas_loop_runner.py"],
    detail: "Gives the agent concrete commands for status, next task, review records, completion, and blockers."
  },
  {
    icon: TestTube2,
    label: "Verification",
    files: ["tests/", "reports/backtest_evidence_latest.md"],
    detail: "Proves the paper trader still runs, metrics are stable, reports write, and JSON state remains valid."
  },
  {
    icon: ShieldCheck,
    label: "Review gate",
    files: ["Codex subagent reviews"],
    detail: "Reviewer findings loop back into edits until there is no blocking or actionable bad feedback."
  },
  {
    icon: GitCommitHorizontal,
    label: "Audit trail",
    files: ["reports/evidence_index.json", "git commits"],
    detail: "Captures commands, status, output paths, metrics, commit scope, and final completion proof."
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
    title: "`status` then `next`",
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
    detail: "`py_compile`, engine runs, report generation, unittest, and JSON validation gate completion."
  },
  {
    label: "Review",
    title: "Subagent loop",
    detail: "Bad feedback records a failed round, sends work back to edit, then reruns verification and review."
  },
  {
    label: "Commit",
    title: "Clean review only",
    detail: "`BAD_FEEDBACK: none` permits a scoped commit and evidence update. Blockers prevent commit."
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
      <section className="atlas-run-flow" aria-label="Atlas Planner animated run flow">
        <div className="atlas-run-flow__heading">
          <div>
            <p>Conceptual overview</p>
            <h3>From idea to verified commit, with reviewer loops before trust.</h3>
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

        <div className="atlas-run-flow__canvas">
          <svg className="atlas-run-flow__arrows" viewBox="0 0 1160 520" aria-hidden="true">
            <defs>
              <marker id="atlas-flow-arrow" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="5">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 130 138 C 188 138 206 138 264 138"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 384 138 C 438 138 462 138 516 138"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 636 138 C 690 138 714 138 768 138"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 836 190 C 836 212 824 224 812 238"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 756 318 C 698 326 646 344 620 364"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 626 392 C 700 426 760 404 784 374"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 886 318 C 914 338 930 350 948 364"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--review"
              d="M 946 400 C 900 436 842 426 830 384"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--main"
              d="M 1038 316 C 1068 258 1058 218 1042 190"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--state"
              d="M 554 210 C 528 268 526 344 548 428"
            />
            <path
              className="atlas-run-flow__line atlas-run-flow__line--state"
              d="M 804 210 C 794 278 788 360 812 428"
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
          <li>Subreviewers send bad feedback back to work.</li>
          <li>Clean review allows scoped commit and stop.</li>
        </ol>
      </section>

      <section className="atlas-poc-contract" aria-label="Atlas crypto trader POC run contract">
        <div className="atlas-poc-contract__header">
          <div>
            <p>POC run contract</p>
            <h3>The exact files, commands, gates, and cleanup path behind the demo.</h3>
          </div>
          <aside>
            <AlertTriangle size={16} />
            <span>Specific to `atlas-crypto-trader-test`; the monorepo controller is the productized next layer.</span>
          </aside>
        </div>

        <div className="atlas-poc-contract__artifacts" aria-label="POC component inventory">
          {contractArtifacts.map((artifact) => {
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

          <section className="atlas-poc-contract__commands" aria-label="Runner command contract">
            <div className="atlas-poc-contract__section-heading">
              <TerminalSquare size={16} />
              <h4>Runner commands</h4>
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
      </section>
    </div>
  );
}
