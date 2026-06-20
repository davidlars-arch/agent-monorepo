"use client";

import {
  formatPlannerDateTime,
  getLoopGoalSummary,
  type LoopPlannerCommand
} from "@agent/atlas-planner";
import type {
  ControllerLockSummary,
  ControllerMemorySummary,
  CurrentLoopRunSummary,
  CurrentRunRecoveryStatus,
  GoalLifecycleStatus,
  QueuedGoalSummary,
  RunnerEvidenceSummary,
  RunnerStateSummary
} from "@agent/loop-store";
import { CheckCircle2, GitBranch, ShieldCheck, Workflow } from "lucide-react";
import {
  getLoopPlannerDisplayCommand,
  getLoopRunTimeline,
  loopEvidenceSources,
  prMergeGates,
  reliabilityPrimitives
} from "./overview-data";
import { CurrentRunCard } from "./current-run-card";

export function LoopReliabilityPanel({
  loopPlannerCommand,
  loopGoalSummary,
  durableQueuedGoals,
  currentLoopRun,
  currentRunnerState,
  currentRunnerEvidence,
  controllerLock,
  currentRunRecovery,
  controllerMemory,
  onUpdateQueuedGoalLifecycle
}: {
  loopPlannerCommand: LoopPlannerCommand;
  loopGoalSummary: ReturnType<typeof getLoopGoalSummary>;
  durableQueuedGoals: QueuedGoalSummary[];
  currentLoopRun?: CurrentLoopRunSummary | null;
  currentRunnerState?: RunnerStateSummary | null;
  currentRunnerEvidence?: RunnerEvidenceSummary | null;
  controllerLock?: ControllerLockSummary | null;
  currentRunRecovery?: CurrentRunRecoveryStatus | null;
  controllerMemory?: ControllerMemorySummary | null;
  onUpdateQueuedGoalLifecycle: (goal: QueuedGoalSummary, lifecycleStatus: GoalLifecycleStatus) => void;
}) {
  const loopRunTimeline = getLoopRunTimeline(loopPlannerCommand);
  const claimableQueuedGoal = durableQueuedGoals.find(
    (goal) =>
      goal.approvedToRun === true &&
      (goal.lifecycleStatus === "approved" || goal.lifecycleStatus === "running") &&
      goal.status !== "done" &&
      goal.status !== "blocked" &&
      goal.status !== "archived"
  );
  const loopPlannerDisplayCommand = getLoopPlannerDisplayCommand(loopPlannerCommand.command, {
    hasCurrentRun: Boolean(currentLoopRun),
    hasClaimableQueuedGoal: Boolean(claimableQueuedGoal)
  });

  return (
    <section className="loop-reliability" aria-label="Reliability and run control">
      <div className="loop-reliability__header">
        <div>
          <p>Reliability and run control</p>
          <h3>Board, queue, current run, and evidence must agree</h3>
          <span>
            This checks whether the selected board has a runnable goal, whether a run is already claimed, and which
            command or evidence should be trusted next.
          </span>
        </div>
        <span>
          <ShieldCheck size={14} />
          Maker/checker required
        </span>
      </div>

      <div className="loop-command-strip">
        <article>
          <span>
            <Workflow size={14} />
            Run
          </span>
          <code>{loopPlannerDisplayCommand}</code>
        </article>
        <article>
          <span>
            <CheckCircle2 size={14} />
            Verify
          </span>
          <code>{loopPlannerCommand.verificationCommand}</code>
        </article>
        <article>
          <span>
            <GitBranch size={14} />
            Stop
          </span>
          <p>{loopPlannerCommand.stopCondition}</p>
        </article>
      </div>

      <div className="loop-decision">
        <div>
          <span>Recommended ticket</span>
          <strong>
            {loopPlannerCommand.ticket
              ? `${loopPlannerCommand.ticket.id}: ${loopPlannerCommand.ticket.title}`
              : "No actionable ticket"}
          </strong>
          <p>{loopPlannerCommand.reason}</p>
          {loopPlannerCommand.decision.selected ? (
            <div className="loop-decision__score" aria-label="Planner score breakdown">
              <span>fit {loopPlannerCommand.decision.selected.breakdown.fit}</span>
              <span>value {loopPlannerCommand.decision.selected.breakdown.value}</span>
              <span>ready {loopPlannerCommand.decision.selected.breakdown.readiness}</span>
              <span>fresh {loopPlannerCommand.decision.selected.breakdown.freshness}</span>
              <span>risk {loopPlannerCommand.decision.selected.breakdown.risk}</span>
            </div>
          ) : null}
          {loopPlannerCommand.decision.skipped.length > 0 ? (
            <p className="loop-decision__skipped">
              Deferred:{" "}
              {loopPlannerCommand.decision.skipped
                .slice(0, 2)
                .map((candidate) => `${candidate.ticket.id} (${candidate.ticket.estimate} pts)`)
                .join(", ")}
            </p>
          ) : null}
        </div>
        <dl>
          <div>
            <dt>Score</dt>
            <dd>{loopPlannerCommand.decision.selected?.score ?? 0}</dd>
          </div>
          <div>
            <dt>Token gate</dt>
            <dd>{loopPlannerCommand.maxEstimate} pts</dd>
          </div>
          <div>
            <dt>Open</dt>
            <dd>{loopPlannerCommand.counts.backlog + loopPlannerCommand.counts["in-progress"]}</dd>
          </div>
          <div>
            <dt>Review</dt>
            <dd>{loopPlannerCommand.counts.review}</dd>
          </div>
        </dl>
      </div>

      <section className="loop-goal-queue" aria-label="Durable goal queue">
        <div className="loop-goal-queue__header">
          <div>
            <span>Goal queue</span>
            <strong>{durableQueuedGoals.length} queued</strong>
            <p>Approved goals wait here until the controller claims one.</p>
          </div>
          <code>loops/project-controller/goal-queue.json</code>
        </div>
        {durableQueuedGoals.length > 0 ? (
          <div className="loop-goal-queue__list">
            {durableQueuedGoals.slice(0, 4).map((goal) => (
              <article key={goal.id}>
                <div>
                  <span>{goal.lifecycleStatus}</span>
                  <strong>{goal.title}</strong>
                </div>
                <p>
                  {goal.projectLabel ? `${goal.projectLabel} · ` : ""}
                  {goal.id} · {goal.status} · {goal.estimate} pts
                  {goal.approvedToRun ? " · approved" : ""}
                </p>
                <div className="loop-goal-queue__actions">
                  {goal.lifecycleStatus === "draft" || goal.lifecycleStatus === "refined" ? (
                    <button type="button" onClick={() => onUpdateQueuedGoalLifecycle(goal, "approved")}>
                      Approve
                    </button>
                  ) : null}
                  {goal.lifecycleStatus !== "blocked" &&
                  goal.lifecycleStatus !== "satisfied" &&
                  goal.lifecycleStatus !== "archived" ? (
                    <button type="button" onClick={() => onUpdateQueuedGoalLifecycle(goal, "blocked")}>
                      Block
                    </button>
                  ) : null}
                  {goal.lifecycleStatus !== "satisfied" && goal.lifecycleStatus !== "archived" ? (
                    <button type="button" onClick={() => onUpdateQueuedGoalLifecycle(goal, "satisfied")}>
                      Satisfy
                    </button>
                  ) : null}
                  {goal.lifecycleStatus !== "archived" ? (
                    <button type="button" onClick={() => onUpdateQueuedGoalLifecycle(goal, "archived")}>
                      Archive
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>No queued goals for this board. Save a goal from the board, then approve it when it is safe to run.</p>
        )}
      </section>

      <CurrentRunCard
        currentLoopRun={currentLoopRun}
        currentRunnerState={currentRunnerState}
        currentRunnerEvidence={currentRunnerEvidence}
        controllerLock={controllerLock}
        currentRunRecovery={currentRunRecovery}
        claimableQueuedGoal={claimableQueuedGoal}
      />

      <section className="loop-run-timeline" aria-label="Loop run timeline">
        <div className="loop-run-timeline__header">
          <div>
            <span>Run timeline</span>
            <strong>Ticket to reviewed result</strong>
            <small>Ticket -&gt; goal -&gt; queue -&gt; current run -&gt; evidence -&gt; review/merge.</small>
          </div>
          <p>{loopPlannerCommand.ticket ? loopPlannerCommand.ticket.id : "Waiting for an actionable ticket"}</p>
        </div>
        <div className="loop-run-timeline__rail">
          {loopRunTimeline.map((step) => {
            const StepIcon = step.icon;
            return (
              <article key={step.id} className={`loop-run-timeline__step loop-run-timeline__step--${step.status}`}>
                <div className="loop-run-timeline__icon">
                  <StepIcon size={15} />
                </div>
                <div>
                  <span>{step.status}</span>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                  <small>{step.evidence}</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <details className="loop-evidence-viewer" aria-label="Loop evidence viewer">
        <summary className="loop-evidence-viewer__header">
          <div>
            <span>Evidence and controller memory</span>
            <strong>Proof before satisfaction</strong>
            <small>Open when reviewing a run, debugging planner state, or deciding whether work is safe to close.</small>
          </div>
          <p>{loopEvidenceSources.length} sources</p>
        </summary>
        <div className="loop-evidence-viewer__grid">
          {loopEvidenceSources.map((source) => (
            <article key={source.label}>
              <div>
                <span>{source.status}</span>
                <strong>{source.label}</strong>
              </div>
              <code>{source.path}</code>
              <p>{source.detail}</p>
            </article>
          ))}
        </div>
        {controllerMemory ? (
          <div className="loop-controller-memory">
            {controllerMemory.latestReport ? (
              <article>
                <div>
                  <span>Latest report</span>
                  <strong>{formatPlannerDateTime(controllerMemory.latestReport.updatedAt)}</strong>
                </div>
                <code>{controllerMemory.latestReport.path}</code>
                <p>{controllerMemory.latestReport.excerpt || "Report file exists but has no readable summary."}</p>
              </article>
            ) : null}
            {controllerMemory.controllerState ? (
              <article>
                <div>
                  <span>Controller state</span>
                  <strong>{formatPlannerDateTime(controllerMemory.controllerState.updatedAt)}</strong>
                </div>
                <code>{controllerMemory.controllerState.path}</code>
                <p>{controllerMemory.controllerState.summary}</p>
              </article>
            ) : null}
            {controllerMemory.decisionLog ? (
              <article>
                <div>
                  <span>Decision log</span>
                  <strong>{controllerMemory.decisionLog.count} entries</strong>
                </div>
                <code>{controllerMemory.decisionLog.path}</code>
                <p>{controllerMemory.decisionLog.lastDecision || "No decision lines recorded yet."}</p>
              </article>
            ) : null}
          </div>
        ) : null}
      </details>

      <details className="loop-merge-gates" aria-label="PR and merge gates">
        <summary className="loop-merge-gates__header">
          <div>
            <span>PR and merge gates</span>
            <strong>External actions stay explicit</strong>
            <small>These gates explain what must be true before a branch is trusted outside the local runner.</small>
          </div>
          <p>Merge gated</p>
        </summary>
        <div className="loop-merge-gates__grid">
          {prMergeGates.map((gate) => {
            const GateIcon = gate.icon;
            return (
              <article key={gate.label}>
                <div className="loop-merge-gates__icon">
                  <GateIcon size={15} />
                </div>
                <div>
                  <span>{gate.status}</span>
                  <strong>{gate.label}</strong>
                  <p>{gate.detail}</p>
                </div>
              </article>
            );
          })}
        </div>
      </details>

      {loopGoalSummary.goal ? (
        <section className="loop-goal" aria-label="Strict loop goal">
          <div className="loop-goal__summary">
            <div>
              <span>Strict goal</span>
              <strong>{loopGoalSummary.goal.title}</strong>
              <small>Goals are execution contracts. They define outcome, stop condition, paths, checks, and approval.</small>
              <p>{loopGoalSummary.goal.statement}</p>
            </div>
            <dl>
              <div>
                <dt>Layers</dt>
                <dd>{loopGoalSummary.totalLayers}</dd>
              </div>
              <div>
                <dt>Satisfied</dt>
                <dd>{loopGoalSummary.satisfiedLayers}</dd>
              </div>
              <div>
                <dt>Scaffolded</dt>
                <dd>{loopGoalSummary.counts.scaffolded}</dd>
              </div>
              <div>
                <dt>Pending</dt>
                <dd>{loopGoalSummary.counts.pending}</dd>
              </div>
            </dl>
          </div>
          <div className="loop-goal__layers">
            {loopGoalSummary.goal.layers.map((layer) => (
              <article key={layer.id} className={`loop-goal__layer loop-goal__layer--${layer.status}`}>
                <div>
                  <span>{layer.status}</span>
                  <strong>{layer.label}</strong>
                </div>
                <p>{layer.criteria[0]}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <details className="loop-primitives" aria-label="Loop reliability primitives">
        <summary>
          <span>Reliability primitives</span>
          <strong>State files and locks used by the controller</strong>
        </summary>
        {reliabilityPrimitives.map((primitive) => (
          <article key={primitive.label}>
            <span>{primitive.label}</span>
            <strong>{primitive.value}</strong>
            <p>{primitive.detail}</p>
          </article>
        ))}
      </details>
    </section>
  );
}
