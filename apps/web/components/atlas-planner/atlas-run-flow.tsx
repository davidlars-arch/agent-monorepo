"use client";

import { Bot, CheckCircle2, ClipboardList, Code2, ShieldCheck, UserRound } from "lucide-react";

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

export function AtlasRunFlow() {
  return (
    <section className="atlas-run-flow" aria-label="Atlas Planner animated run flow">
      <div className="atlas-run-flow__heading">
        <div>
          <p>How Atlas Planner runs work</p>
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
          <path className="atlas-run-flow__line atlas-run-flow__line--main" d="M 130 138 C 188 138 206 138 264 138" />
          <path className="atlas-run-flow__line atlas-run-flow__line--main" d="M 384 138 C 438 138 462 138 516 138" />
          <path className="atlas-run-flow__line atlas-run-flow__line--main" d="M 636 138 C 690 138 714 138 768 138" />
          <path className="atlas-run-flow__line atlas-run-flow__line--main" d="M 836 190 C 836 212 824 224 812 238" />
          <path className="atlas-run-flow__line atlas-run-flow__line--review" d="M 756 318 C 698 326 646 344 620 364" />
          <path className="atlas-run-flow__line atlas-run-flow__line--review" d="M 626 392 C 700 426 760 404 784 374" />
          <path className="atlas-run-flow__line atlas-run-flow__line--review" d="M 886 318 C 914 338 930 350 948 364" />
          <path className="atlas-run-flow__line atlas-run-flow__line--review" d="M 946 400 C 900 436 842 426 830 384" />
          <path className="atlas-run-flow__line atlas-run-flow__line--main" d="M 1038 316 C 1068 258 1058 218 1042 190" />
          <path className="atlas-run-flow__line atlas-run-flow__line--state" d="M 554 210 C 528 268 526 344 548 428" />
          <path className="atlas-run-flow__line atlas-run-flow__line--state" d="M 804 210 C 794 278 788 360 812 428" />
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
  );
}
