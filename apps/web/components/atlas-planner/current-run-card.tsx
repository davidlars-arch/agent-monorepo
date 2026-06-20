"use client";

import { formatPlannerDateTime } from "@agent/atlas-planner";
import type {
  ControllerLockSummary,
  CurrentLoopRunSummary,
  CurrentRunRecoveryStatus,
  RunnerEvidenceSummary,
  RunnerStateSummary
} from "@agent/loop-store";
import { useState } from "react";

export function CurrentRunCard({
  currentLoopRun,
  currentRunnerState,
  currentRunnerEvidence,
  controllerLock,
  currentRunRecovery
}: {
  currentLoopRun?: CurrentLoopRunSummary | null;
  currentRunnerState?: RunnerStateSummary | null;
  currentRunnerEvidence?: RunnerEvidenceSummary | null;
  controllerLock?: ControllerLockSummary | null;
  currentRunRecovery?: CurrentRunRecoveryStatus | null;
}) {
  const [runRecoveryMessage, setRunRecoveryMessage] = useState("");
  const [isRunRecoveryBusy, setIsRunRecoveryBusy] = useState(false);

  async function runRecoveryAction(action: "clear-stale-lock" | "clear-terminal-current-run") {
    setIsRunRecoveryBusy(true);
    setRunRecoveryMessage("");
    try {
      const response = await fetch("/api/atlas-run-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setRunRecoveryMessage(payload?.error ?? "Run recovery action failed.");
        return;
      }

      window.location.reload();
    } catch {
      setRunRecoveryMessage("Run recovery API is unavailable.");
    } finally {
      setIsRunRecoveryBusy(false);
    }
  }

  return (
    <section className="loop-current-run" aria-label="Current loop run">
      <div className="loop-current-run__header">
        <div>
          <span>Current run</span>
          <strong>{currentLoopRun ? currentLoopRun.goalTitle : "No claimed goal"}</strong>
        </div>
        <p>{currentLoopRun ? currentLoopRun.stage : "idle"}</p>
      </div>
      {controllerLock?.exists || currentRunRecovery?.active ? (
        <div className="loop-run-recovery">
          {controllerLock?.exists ? (
            <article>
              <div>
                <span>{controllerLock.stale ? "stale lock" : "controller lock"}</span>
                <strong>{controllerLock.owner || `pid ${controllerLock.pid ?? "unknown"}`}</strong>
              </div>
              <p>{controllerLock.reason}</p>
              {controllerLock.removable ? (
                <button type="button" disabled={isRunRecoveryBusy} onClick={() => runRecoveryAction("clear-stale-lock")}>
                  Clear stale lock
                </button>
              ) : null}
            </article>
          ) : null}
          {currentRunRecovery?.active ? (
            <article>
              <div>
                <span>{currentRunRecovery.terminal ? "terminal run" : "active run"}</span>
                <strong>{currentRunRecovery.runnerStatus || currentRunRecovery.currentStatus || "unknown"}</strong>
              </div>
              <p>{currentRunRecovery.reason}</p>
              {currentRunRecovery.clearable ? (
                <button
                  type="button"
                  disabled={isRunRecoveryBusy}
                  onClick={() => runRecoveryAction("clear-terminal-current-run")}
                >
                  Clear current-run
                </button>
              ) : null}
            </article>
          ) : null}
          {runRecoveryMessage ? <p className="loop-run-recovery__message">{runRecoveryMessage}</p> : null}
        </div>
      ) : null}
      {currentLoopRun ? (
        <dl>
          <div>
            <dt>Run</dt>
            <dd>{currentLoopRun.id}</dd>
          </div>
          <div>
            <dt>Goal</dt>
            <dd>{currentLoopRun.goalId}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{currentLoopRun.status}</dd>
          </div>
          <div>
            <dt>Base</dt>
            <dd>{currentLoopRun.baseCommit}</dd>
          </div>
          {currentLoopRun.branchName ? (
            <div>
              <dt>Branch</dt>
              <dd>{currentLoopRun.branchName}</dd>
            </div>
          ) : null}
          {currentLoopRun.worktreePath ? (
            <div>
              <dt>Worktree</dt>
              <dd>{currentLoopRun.worktreePath}</dd>
            </div>
          ) : null}
          {currentLoopRun.handoffDir ? (
            <div>
              <dt>Handoff</dt>
              <dd>{currentLoopRun.handoffDir}</dd>
            </div>
          ) : null}
          {currentLoopRun.runnerCommand ? (
            <div>
              <dt>Runner</dt>
              <dd>{currentLoopRun.runnerCommand}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p>Claiming an approved queued goal writes `loops/project-controller/current-run.json`.</p>
      )}
      {currentLoopRun && (currentRunnerState || currentRunnerEvidence) ? (
        <div className="loop-run-artifacts">
          {currentRunnerState ? <RunnerStateCard currentRunnerState={currentRunnerState} /> : null}
          {currentRunnerEvidence ? <RunnerEvidenceCard currentRunnerEvidence={currentRunnerEvidence} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function RunnerStateCard({ currentRunnerState }: { currentRunnerState: RunnerStateSummary }) {
  return (
    <article className="loop-run-artifacts__state">
      <div className="loop-run-artifacts__title">
        <span>Runner state</span>
        <strong>{currentRunnerState.stage}</strong>
      </div>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{currentRunnerState.status}</dd>
        </div>
        <div>
          <dt>Repairs</dt>
          <dd>
            {currentRunnerState.repairAttempts}/{currentRunnerState.maxRepairs}
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatPlannerDateTime(currentRunnerState.updatedAt)}</dd>
        </div>
      </dl>
      {currentRunnerState.timeline.length > 0 ? (
        <ol>
          {currentRunnerState.timeline.slice(-4).map((event, index) => (
            <li key={`${event.stage}-${event.status}-${event.at ?? index}`}>
              <span>{event.status}</span>
              <strong>{event.stage}</strong>
              <p>{event.detail}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

function RunnerEvidenceCard({ currentRunnerEvidence }: { currentRunnerEvidence: RunnerEvidenceSummary }) {
  return (
    <article className="loop-run-artifacts__evidence">
      <div className="loop-run-artifacts__title">
        <span>Runner evidence</span>
        <strong>{currentRunnerEvidence.status}</strong>
      </div>
      <dl>
        <div>
          <dt>Checks</dt>
          <dd>{currentRunnerEvidence.checks.length}</dd>
        </div>
        <div>
          <dt>Findings</dt>
          <dd>{currentRunnerEvidence.findings.length}</dd>
        </div>
        <div>
          <dt>Repairs</dt>
          <dd>
            {currentRunnerEvidence.repairAttempts}/{currentRunnerEvidence.maxRepairs}
          </dd>
        </div>
      </dl>
      {currentRunnerEvidence.checks.length > 0 ? (
        <div className="loop-run-artifacts__checks">
          {currentRunnerEvidence.checks.slice(-3).map((check) => (
            <p key={`${check.stage}-${check.finishedAt}-${check.repairAttempt}`}>
              <span>{check.stage}</span>
              <strong>exit {check.exitCode}</strong>
            </p>
          ))}
        </div>
      ) : null}
      {currentRunnerEvidence.findings.length > 0 ? (
        <div className="loop-run-artifacts__findings">
          {currentRunnerEvidence.findings.slice(-3).map((finding, index) => (
            <p key={`${finding.stage}-${finding.summary}-${index}`}>
              <span>{finding.severity}</span>
              <strong>{finding.summary}</strong>
              {finding.file ? <small>{finding.file}</small> : null}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}
