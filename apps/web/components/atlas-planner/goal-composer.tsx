"use client";

import { fibonacciEstimates, type LoopTicketStatus } from "@agent/atlas-planner";
import type { GoalLifecycleStatus } from "@agent/loop-store";
import {
  ArrowRight,
  Bot,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  ListChecks,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  WandSparkles,
  X
} from "lucide-react";

export type GoalDraft = {
  title: string;
  lifecycleStatus: GoalLifecycleStatus;
  statement: string;
  stopCondition: string;
  scope: string;
  maxEstimate: number;
  layers: GoalDraftLayer[];
  verificationCommands: GoalVerificationCommand[];
  safety: GoalSafetySettings;
  approvedToRun: boolean;
};

export type GoalDraftLayer = {
  id: string;
  label: string;
  criteria: string;
  status: "pending" | "scaffolded" | "satisfied" | "blocked";
  humanGated: boolean;
};

export type GoalVerificationCommand = {
  id: string;
  label: string;
  command: string;
  required: boolean;
};

export type GoalSafetySettings = {
  maxIterations: number;
  maxRepairAttempts: number;
  tokenBudget: string;
  timeBudget: string;
  allowedPaths: string;
  externalActionPolicy: "disabled" | "pr-only" | "human-gated" | "auto-merge";
};

const goalLifecycleStages: Array<{ id: GoalLifecycleStatus; label: string; detail: string }> = [
  {
    id: "draft",
    label: "Draft",
    detail: "Raw human intent exists, but the loop contract is not ready."
  },
  {
    id: "refined",
    label: "Refined",
    detail: "Outcome, stop condition, layers, proof, and limits are defined."
  },
  {
    id: "approved",
    label: "Approved",
    detail: "The goal is allowed to enter the next loop run."
  },
  {
    id: "running",
    label: "Running",
    detail: "A loop is actively working the bounded slice."
  },
  {
    id: "blocked",
    label: "Blocked",
    detail: "The loop needs human input, budget, credentials, or a policy decision."
  },
  {
    id: "satisfied",
    label: "Satisfied",
    detail: "All layers and required verification have passed."
  },
  {
    id: "archived",
    label: "Archived",
    detail: "The goal is closed and kept as historical evidence."
  }
];

export const goalTimeline = [
  {
    id: "idea",
    label: "Idea",
    icon: Target,
    detail: "A person writes the raw goal in plain language: what should be better, fixed, or built."
  },
  {
    id: "refine",
    label: "Refine",
    icon: WandSparkles,
    detail: "Atlas Planner turns the raw idea into a strict goal, stop condition, scope, and satisfaction layers."
  },
  {
    id: "score",
    label: "Score",
    icon: ListChecks,
    detail: "The planner reads usage/window state, scores tickets, and picks the highest-value task that fits."
  },
  {
    id: "branch",
    label: "Branch",
    icon: GitBranch,
    detail: "The loop creates an isolated branch or worktree so agent work cannot trample main."
  },
  {
    id: "maker",
    label: "Maker",
    icon: Bot,
    detail: "The maker agent implements one bounded slice and records what changed."
  },
  {
    id: "checker",
    label: "Checker",
    icon: ShieldCheck,
    detail: "A separate reviewer checks the diff, goal layers, tests, risk, and missing evidence."
  },
  {
    id: "repair",
    label: "Repair",
    icon: RefreshCw,
    detail: "If the checker finds blockers, the loop sends them back to the maker for a capped repair cycle."
  },
  {
    id: "pr",
    label: "PR",
    icon: GitPullRequest,
    detail: "When local verification passes, the loop opens or updates a PR with the goal and evidence."
  },
  {
    id: "merge",
    label: "Merge",
    icon: GitMerge,
    detail: "After CI, review, and goal gates pass, merge can be automated behind explicit safety rules."
  },
  {
    id: "sync",
    label: "Sync",
    icon: GitCommitHorizontal,
    detail: "After merge, the loop pulls main, cleans up, and starts a fresh branch for the next goal."
  }
];

export function getDefaultGoalDraft(): GoalDraft {
  return {
    title: "",
    lifecycleStatus: "draft",
    statement: "",
    stopCondition: "",
    scope: "",
    maxEstimate: 8,
    layers: getDefaultGoalLayers(),
    verificationCommands: getDefaultVerificationCommands(),
    safety: getDefaultGoalSafetySettings(),
    approvedToRun: false
  };
}

export function getTicketStatusForGoalLifecycle(
  lifecycleStatus: GoalLifecycleStatus,
  approvedToRun: boolean
): LoopTicketStatus {
  if (lifecycleStatus === "blocked") {
    return "blocked";
  }
  if (lifecycleStatus === "satisfied" || lifecycleStatus === "archived") {
    return "done";
  }
  if (lifecycleStatus === "approved" || lifecycleStatus === "running" || approvedToRun) {
    return "in-progress";
  }
  return "backlog";
}

function getDefaultGoalLayers(): GoalDraftLayer[] {
  return [
    {
      id: "goal-contract",
      label: "Goal contract",
      status: "scaffolded",
      criteria: "Goal statement, stop condition, scope, and satisfaction layers are explicit.",
      humanGated: false
    },
    {
      id: "budgeted-selection",
      label: "Budgeted selection",
      status: "scaffolded",
      criteria: "Selected task fits the current token window and records deferred larger work.",
      humanGated: false
    },
    {
      id: "maker-checker",
      label: "Maker/checker",
      status: "pending",
      criteria: "Maker output is reviewed by a separate checker before satisfaction is claimed.",
      humanGated: false
    },
    {
      id: "evidence-memory",
      label: "Evidence memory",
      status: "scaffolded",
      criteria: "Report, decision log, and state capture what happened and why.",
      humanGated: false
    },
    {
      id: "human-gate",
      label: "Human gate",
      status: "pending",
      criteria: "External actions and merge require approval until the loop has proven itself.",
      humanGated: true
    }
  ];
}

function getDefaultVerificationCommands(): GoalVerificationCommand[] {
  return [
    {
      id: "typecheck-web",
      label: "Web typecheck",
      command: "npm run typecheck -w @agent/web",
      required: true
    },
    {
      id: "lint-web",
      label: "Web lint",
      command: "npm run lint -w @agent/web",
      required: true
    },
    {
      id: "test-atlas",
      label: "Atlas planner tests",
      command: "npm run test -w @agent/atlas-planner",
      required: true
    },
    {
      id: "build-web",
      label: "Web production build",
      command: "npm run build -w @agent/web",
      required: true
    }
  ];
}

function getDefaultGoalSafetySettings(): GoalSafetySettings {
  return {
    maxIterations: 6,
    maxRepairAttempts: 3,
    tokenBudget: "Use latest daily/weekly usage window; prefer tasks <= first slice cap.",
    timeBudget: "Stop after one focused task or 45 minutes without a fresh approval.",
    allowedPaths: "apps/web/**, apps/atlas-planner/**, loops/project-controller/**, scripts/project-loop.mjs",
    externalActionPolicy: "human-gated"
  };
}

export function getGoalContractPreview(draft: GoalDraft) {
  const title = draft.title.trim() || "Untitled loop goal";
  const statement = draft.statement.trim() || "Refine the rough idea into a concrete outcome before implementation.";
  const stopCondition =
    draft.stopCondition.trim() ||
    "Stop when verification passes, evidence is recorded, and the next action needs human judgment.";
  const scope = draft.scope.trim() || "Scope is not set yet; keep the first run in planning mode until limits are clear.";

  return {
    title,
    outcome: statement,
    stopCondition,
    scope,
    maxEstimate: draft.maxEstimate,
    layers: draft.layers,
    verification: draft.verificationCommands.filter((command) => command.required),
    safety: [
      `Max first slice: ${draft.maxEstimate} points`,
      `Max iterations: ${draft.safety.maxIterations}`,
      `Max repair attempts: ${draft.safety.maxRepairAttempts}`,
      `Token budget: ${draft.safety.tokenBudget}`,
      `Time budget: ${draft.safety.timeBudget}`,
      `Allowed paths: ${draft.safety.allowedPaths}`,
      `External actions: ${draft.safety.externalActionPolicy}`
    ]
  };
}

export function GoalComposer({
  draft,
  onChange,
  onAddLayer,
  onUpdateLayer,
  onRemoveLayer,
  onAddVerificationCommand,
  onUpdateVerificationCommand,
  onRemoveVerificationCommand,
  onUpdateSafety,
  onSave,
  onClose
}: {
  draft: GoalDraft;
  onChange: (update: Partial<GoalDraft>) => void;
  onAddLayer: () => void;
  onUpdateLayer: (layerId: string, update: Partial<GoalDraftLayer>) => void;
  onRemoveLayer: (layerId: string) => void;
  onAddVerificationCommand: () => void;
  onUpdateVerificationCommand: (commandId: string, update: Partial<GoalVerificationCommand>) => void;
  onRemoveVerificationCommand: (commandId: string) => void;
  onUpdateSafety: (update: Partial<GoalSafetySettings>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const contract = getGoalContractPreview(draft);

  return (
    <div className="goal-composer" role="dialog" aria-modal="true" aria-labelledby="goal-composer-title">
      <button type="button" className="goal-composer__scrim" aria-label="Close goal composer" onClick={onClose} />
      <section className="goal-composer__panel">
        <header className="goal-composer__header">
          <div>
            <p>Strict loop goal</p>
            <h3 id="goal-composer-title">Create goal</h3>
          </div>
          <button type="button" className="loop-close-button" aria-label="Close goal composer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="goal-composer__body">
          <section className="goal-form" aria-label="Goal draft">
            <label>
              Goal title
              <input
                value={draft.title}
                placeholder="Make Atlas Planner run a bounded PR loop"
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </label>
            <label>
              Lifecycle state
              <select
                value={draft.lifecycleStatus}
                onChange={(event) => onChange({ lifecycleStatus: event.target.value as GoalLifecycleStatus })}
              >
                {goalLifecycleStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              What should be true when this is done?
              <textarea
                value={draft.statement}
                placeholder="Describe the outcome in plain language."
                onChange={(event) => onChange({ statement: event.target.value })}
              />
            </label>
            <label>
              Stop condition
              <textarea
                value={draft.stopCondition}
                placeholder="Describe how the loop knows it must stop."
                onChange={(event) => onChange({ stopCondition: event.target.value })}
              />
            </label>
            <label>
              Scope and limits
              <textarea
                value={draft.scope}
                placeholder="Allowed areas, risk boundaries, and what should not be touched."
                onChange={(event) => onChange({ scope: event.target.value })}
              />
            </label>
            <label>
              Max first slice
              <select
                value={draft.maxEstimate}
                onChange={(event) => onChange({ maxEstimate: Number(event.target.value) })}
              >
                {fibonacciEstimates.map((estimate) => (
                  <option key={estimate} value={estimate}>
                    {estimate} points
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="goal-timeline" aria-label="Goal loop timeline">
            <section className="goal-lifecycle-strip" aria-label="Goal lifecycle states">
              <div className="goal-lifecycle-strip__header">
                <span>Goal lifecycle</span>
                <strong>{goalLifecycleStages.find((stage) => stage.id === draft.lifecycleStatus)?.label ?? "Draft"}</strong>
              </div>
              <div className="goal-lifecycle-strip__rail">
                {goalLifecycleStages.map((stage) => (
                  <article
                    key={stage.id}
                    className={`goal-lifecycle-strip__stage${
                      stage.id === draft.lifecycleStatus ? " goal-lifecycle-strip__stage--active" : ""
                    }`}
                  >
                    <span>{stage.label}</span>
                    <p>{stage.detail}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="goal-contract-preview" aria-label="Refined loop contract preview">
              <div className="goal-contract-preview__header">
                <span>Refined loop contract</span>
                <strong>{contract.title}</strong>
                <p>{contract.outcome}</p>
              </div>
              <div className="goal-contract-preview__grid">
                <article>
                  <span>Stop</span>
                  <p>{contract.stopCondition}</p>
                </article>
                <article>
                  <span>Scope</span>
                  <p>{contract.scope}</p>
                </article>
              </div>
              <div className="goal-contract-preview__lists">
                <article>
                  <span>Layers</span>
                  <ul>
                    {contract.layers.map((layer) => (
                      <li key={layer.id}>
                        {layer.label}: {layer.criteria}
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <span>Verification</span>
                  <ul>
                    {contract.verification.map((item) => (
                      <li key={item.id}>
                        {item.label}: {item.command}
                      </li>
                    ))}
                  </ul>
                </article>
                <article>
                  <span>Safety</span>
                  <ul>
                    {contract.safety.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </section>

            <section className="goal-layer-editor" aria-label="Satisfaction layer editor">
              <div className="goal-layer-editor__header">
                <div>
                  <span>Satisfaction layers</span>
                  <strong>Define what done means</strong>
                </div>
                <button type="button" onClick={onAddLayer}>
                  <Plus size={13} />
                  Add layer
                </button>
              </div>
              <div className="goal-layer-editor__list">
                {draft.layers.map((layer) => (
                  <article key={layer.id} className="goal-layer-editor__item">
                    <div className="goal-layer-editor__row">
                      <label>
                        Layer
                        <input
                          value={layer.label}
                          onChange={(event) => onUpdateLayer(layer.id, { label: event.target.value })}
                        />
                      </label>
                      <label>
                        Status
                        <select
                          value={layer.status}
                          onChange={(event) =>
                            onUpdateLayer(layer.id, { status: event.target.value as GoalDraftLayer["status"] })
                          }
                        >
                          <option value="pending">Pending</option>
                          <option value="scaffolded">Scaffolded</option>
                          <option value="satisfied">Satisfied</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Criteria
                      <textarea
                        value={layer.criteria}
                        onChange={(event) => onUpdateLayer(layer.id, { criteria: event.target.value })}
                      />
                    </label>
                    <div className="goal-layer-editor__footer">
                      <label>
                        <input
                          type="checkbox"
                          checked={layer.humanGated}
                          onChange={(event) => onUpdateLayer(layer.id, { humanGated: event.target.checked })}
                        />
                        Human-gated
                      </label>
                      <button type="button" onClick={() => onRemoveLayer(layer.id)} disabled={draft.layers.length <= 1}>
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="goal-verification-builder" aria-label="Verification command builder">
              <div className="goal-verification-builder__header">
                <div>
                  <span>Verification commands</span>
                  <strong>Make the stop condition executable</strong>
                </div>
                <button type="button" onClick={onAddVerificationCommand}>
                  <Plus size={13} />
                  Add command
                </button>
              </div>
              <div className="goal-verification-builder__list">
                {draft.verificationCommands.map((command) => (
                  <article key={command.id} className="goal-verification-builder__item">
                    <div className="goal-verification-builder__row">
                      <label>
                        Check name
                        <input
                          value={command.label}
                          onChange={(event) => onUpdateVerificationCommand(command.id, { label: event.target.value })}
                        />
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={command.required}
                          onChange={(event) =>
                            onUpdateVerificationCommand(command.id, { required: event.target.checked })
                          }
                        />
                        Required
                      </label>
                    </div>
                    <label>
                      Command
                      <input
                        value={command.command}
                        spellCheck={false}
                        onChange={(event) => onUpdateVerificationCommand(command.id, { command: event.target.value })}
                      />
                    </label>
                    <div className="goal-verification-builder__footer">
                      <span>{command.required ? "Must pass before done" : "Evidence only"}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveVerificationCommand(command.id)}
                        disabled={draft.verificationCommands.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="goal-safety-settings" aria-label="Loop safety settings">
              <div className="goal-safety-settings__header">
                <span>Safety settings</span>
                <strong>Bound the loop before it runs</strong>
              </div>
              <div className="goal-safety-settings__grid">
                <label>
                  Max iterations
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={draft.safety.maxIterations}
                    onChange={(event) => onUpdateSafety({ maxIterations: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Repair attempts
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={draft.safety.maxRepairAttempts}
                    onChange={(event) => onUpdateSafety({ maxRepairAttempts: Number(event.target.value) })}
                  />
                </label>
                <label>
                  External actions
                  <select
                    value={draft.safety.externalActionPolicy}
                    onChange={(event) =>
                      onUpdateSafety({
                        externalActionPolicy: event.target.value as GoalSafetySettings["externalActionPolicy"]
                      })
                    }
                  >
                    <option value="disabled">Disabled</option>
                    <option value="pr-only">PR only</option>
                    <option value="human-gated">Human-gated</option>
                    <option value="auto-merge">Auto-merge</option>
                  </select>
                </label>
              </div>
              <label>
                Token budget
                <textarea
                  value={draft.safety.tokenBudget}
                  onChange={(event) => onUpdateSafety({ tokenBudget: event.target.value })}
                />
              </label>
              <label>
                Time budget
                <textarea
                  value={draft.safety.timeBudget}
                  onChange={(event) => onUpdateSafety({ timeBudget: event.target.value })}
                />
              </label>
              <label>
                Allowed paths
                <textarea
                  value={draft.safety.allowedPaths}
                  onChange={(event) => onUpdateSafety({ allowedPaths: event.target.value })}
                />
              </label>
            </section>

            <section className="goal-decision-preview" aria-label="Loop decision preview">
              <div className="goal-decision-preview__header">
                <div>
                  <span>Decision preview</span>
                  <strong>{draft.approvedToRun ? "Approved for the next loop run" : "Waiting for approval"}</strong>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.approvedToRun}
                    onChange={(event) =>
                      onChange({
                        approvedToRun: event.target.checked,
                        lifecycleStatus:
                          event.target.checked && (draft.lifecycleStatus === "draft" || draft.lifecycleStatus === "refined")
                            ? "approved"
                            : draft.lifecycleStatus
                      })
                    }
                  />
                  Approve to run
                </label>
              </div>
              <dl>
                <div>
                  <dt>First slice</dt>
                  <dd>{contract.maxEstimate} pts</dd>
                </div>
                <div>
                  <dt>Required checks</dt>
                  <dd>{contract.verification.length}</dd>
                </div>
                <div>
                  <dt>Repair cap</dt>
                  <dd>{draft.safety.maxRepairAttempts}</dd>
                </div>
                <div>
                  <dt>External policy</dt>
                  <dd>{draft.safety.externalActionPolicy}</dd>
                </div>
              </dl>
              <p>
                Saving without approval creates a backlog goal. Approving moves it into the active lane, but external
                actions still follow the selected safety policy.
              </p>
            </section>

            <div className="goal-timeline__intro">
              <span>How the goal loop works</span>
              <strong>From rough idea to merged branch</strong>
              <p>
                The goal starts as human intent, then becomes a strict contract the loop can score, implement,
                verify, repair, and eventually merge behind gates.
              </p>
            </div>
            <div className="goal-timeline__rail">
              {goalTimeline.map((step, index) => {
                const StepIcon = step.icon;
                return (
                  <article key={step.id} className="goal-timeline__step">
                    <div className="goal-timeline__icon">
                      <StepIcon size={16} />
                    </div>
                    <div>
                      <span>{index + 1}</span>
                      <strong>{step.label}</strong>
                      <p>{step.detail}</p>
                    </div>
                    {index < goalTimeline.length - 1 ? (
                      <ArrowRight className="goal-timeline__arrow" size={15} aria-hidden="true" />
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="goal-composer__footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={onSave}>
            Save goal ticket
          </button>
        </footer>
      </section>
    </div>
  );
}
