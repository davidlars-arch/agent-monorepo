export type GoalLifecycleStatus = "draft" | "refined" | "approved" | "running" | "blocked" | "satisfied" | "archived";

export type GoalContractLayer = {
  id: string;
  label: string;
  criteria: string;
  status: "pending" | "scaffolded" | "satisfied" | "blocked" | string;
  humanGated: boolean;
};

export type GoalContractVerificationCommand = {
  id: string;
  label: string;
  command: string;
  required: boolean;
};

export type GoalContractSafetySettings = {
  maxIterations: number;
  maxRepairAttempts: number;
  tokenBudget: string;
  timeBudget: string;
  allowedPaths: string;
  externalActionPolicy: "disabled" | "pr-only" | "human-gated" | "auto-merge" | string;
};

export type GoalContract = {
  statement: string;
  stopCondition: string;
  scope: string;
  maxEstimate: number;
  satisfactionLayers: GoalContractLayer[];
  verificationCommands: GoalContractVerificationCommand[];
  safety: GoalContractSafetySettings;
};

export type QueuedGoal = {
  id: string;
  title: string;
  projectId?: string;
  projectLabel?: string;
  epicId?: string;
  epicLabel?: string;
  lifecycleStatus: GoalLifecycleStatus | string;
  approvedToRun: boolean;
  status: string;
  estimate: number;
  summary: string;
  tags: string[];
  description: string;
  goalContract: GoalContract;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  createdAt: string;
  updatedAt: string;
};

export type QueuedGoalSummary = Pick<
  QueuedGoal,
  "id" | "title" | "projectId" | "projectLabel" | "epicId" | "epicLabel" | "lifecycleStatus" | "approvedToRun" | "status" | "estimate" | "updatedAt"
>;

export type GoalQueue = {
  version: 1;
  updatedAt: string;
  goals: QueuedGoal[];
};

export type CurrentLoopRunSummary = {
  version?: 1;
  id: string;
  projectId?: string;
  projectLabel?: string;
  goalId: string;
  goalTitle: string;
  goalContract?: GoalContract;
  status: string;
  stage: string;
  claimedAt: string;
  updatedAt: string;
  baseCommit: string;
  branchName?: string;
  worktreePath?: string;
  handoffDir?: string;
  runnerCommand?: string;
  runnerCommands?: RunnerCommandConfig;
  makerPromptPath?: string;
  checkerPromptPath?: string;
  evidencePath?: string;
  selectedTask?: {
    id: string;
    title: string;
    estimate: number;
    score?: number;
    maxEstimate?: number;
    reason?: string;
  };
  timeline?: RunnerTimelineEvent[];
};

export type RunnerCommandConfig = {
  agentCommand?: string;
  makerCommand?: string;
  checkerCommand?: string;
  repairCommand?: string;
  prCommand?: string;
};

export type RunnerTimelineEvent = {
  stage: string;
  status: string;
  at: string | null;
  detail: string;
};

export type RunnerStateSummary = {
  status: string;
  stage: string;
  repairAttempts: number;
  maxRepairs: number;
  updatedAt: string;
  timeline: RunnerTimelineEvent[];
};

export type ControllerLockSummary = {
  exists: boolean;
  stale: boolean;
  removable: boolean;
  reason: string;
  owner?: string;
  pid?: number | null;
  startedAt?: string;
  ageMs?: number | null;
  modifiedAgeMs?: number | null;
  pidRunning?: boolean | null;
};

export type CurrentRunRecoveryStatus = {
  active: boolean;
  terminal: boolean;
  clearable: boolean;
  reason: string;
  runnerStatus?: string;
  currentStatus?: string;
  stage?: string;
};

export type RunnerEvidenceCheck = {
  stage: string;
  command: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  repairAttempt: number;
};

export type RunnerEvidenceFinding = {
  severity: string;
  stage: string;
  summary: string;
  file?: string;
  line?: number;
  recommendation?: string;
  at?: string;
};

export type RunnerEvidenceLayerProof = {
  layerId: string;
  label: string;
  status: string;
  criteria?: string;
  humanGated?: boolean;
  proof: string[];
  missing?: string[];
  at?: string;
};

export type RunnerEvidenceSummary = {
  status: string;
  repairAttempts: number;
  maxRepairs: number;
  checks: RunnerEvidenceCheck[];
  findings: RunnerEvidenceFinding[];
  satisfactionLayers?: RunnerEvidenceLayerProof[];
  pullRequest?: {
    status: string;
    detail?: string;
    command?: string;
    at?: string;
  };
};

export type ControllerMemorySummary = {
  latestReport?: {
    path: string;
    updatedAt: string;
    excerpt: string;
  };
  controllerState?: {
    path: string;
    updatedAt: string;
    summary: string;
  };
  decisionLog?: {
    path: string;
    updatedAt: string;
    count: number;
    lastDecision: string;
  };
};

export type LoopPaths = {
  controllerDir: string;
  registryPath: string;
  statePath: string;
  reportPath: string;
  decisionsPath: string;
  goalQueuePath: string;
  currentRunPath: string;
  lockPath: string;
  usageStatusPath: string;
};

export const goalLifecycleStatuses: GoalLifecycleStatus[];
export const terminalGoalStatuses: string[];
export const terminalRunnerStatuses: string[];

export function isGoalLifecycleStatus(value: unknown): value is GoalLifecycleStatus;
export function getLoopPaths(root: string): LoopPaths;
export function resolveProjectRoot(options?: { cwd?: string; configuredRoot?: string }): string;
export function resolveRepoPath(root: string, path: string): string;
export function readJsonFile<T>(path: string, fallback: T): Promise<T>;
export function readGoalQueue(queuePath: string): Promise<GoalQueue>;
export function normalizeGoalQueue(value: unknown): GoalQueue;
export function validateQueuedGoalInput(
  body: Partial<QueuedGoal> | null,
  options?: { now?: string }
): { ok: true; goal: QueuedGoal } | { ok: false; error: string };
export function updateGoalLifecycle(
  goal: QueuedGoal,
  lifecycleStatus: string,
  approvedToRunInput: unknown,
  options?: { now?: string }
): QueuedGoal | null;
export function isRunnableQueuedGoal(goal: Partial<QueuedGoal> | null | undefined): boolean;
export function hasCurrentRunState(currentRunPath: string): Promise<boolean>;
export function readControllerLockSummary(
  lockPath: string,
  options?: { now?: Date; staleAfterMs?: number }
): Promise<ControllerLockSummary>;
export function getCurrentRunRecoveryStatus(
  currentRun: Partial<CurrentLoopRunSummary> | null | undefined,
  runnerState: Partial<RunnerStateSummary> | null | undefined
): CurrentRunRecoveryStatus;
export function claimNextAtlasPlannerGoal(
  root: string,
  options?: { now?: Date; readCommit?: (root: string) => Promise<string> | string; goalId?: string; projectId?: string }
): Promise<
  | { ok: true; status: "claimed"; currentRun: CurrentLoopRunSummary; goal: QueuedGoal }
  | { ok: true; status: "idle" | "blocked"; reason: string }
  | { ok: false; status: "busy"; reason: string }
>;
export function runAtlasLoopRunnerAction(
  root: string,
  action: "start-current-run" | "resume-current-run",
  options?: {
    timeoutMs?: number;
    execRunner?: (
      file: string,
      args: string[],
      options: { cwd: string; encoding: "utf8"; maxBuffer: number; timeout: number }
    ) => Promise<{ stdout?: string; stderr?: string }>;
  }
): Promise<
  | {
      ok: true;
      status: "completed";
      action: string;
      currentRun: CurrentLoopRunSummary;
      goal?: QueuedGoal | null;
      sync?: {
        ok: true;
        status: "skipped" | "non-terminal" | "synced";
        reason?: string;
        runnerStatus?: string;
        lifecycleStatus?: string;
        goal?: QueuedGoal | null;
        currentRun?: CurrentLoopRunSummary;
      };
      command: string;
      exitCode: 0;
      stdout: string;
      stderr: string;
      startedAt: string;
      finishedAt: string;
    }
  | {
      ok: false;
      status:
        | "missing-current-run"
        | "invalid-current-run"
        | "runner-state-exists"
        | "missing-runner-state"
        | "terminal-current-run"
        | "terminal-runner-state"
        | "unsupported-action"
        | "busy"
        | "changed"
        | "timed-out"
        | "failed";
      reason?: string;
      action?: string;
      currentRun?: CurrentLoopRunSummary;
      command?: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      startedAt?: string;
      finishedAt?: string;
    }
>;
export function syncTerminalAtlasRun(
  root: string,
  currentRun: Partial<CurrentLoopRunSummary> | null | undefined
): Promise<{
  ok: true;
  status: "skipped" | "non-terminal" | "synced";
  reason?: string;
  runnerStatus?: string;
  lifecycleStatus?: string;
  goal?: QueuedGoal | null;
  currentRun?: CurrentLoopRunSummary;
}>;
export function buildAtlasRunnerCommand(
  root: string,
  action: "start-current-run" | "resume-current-run" | string,
  currentRun: Partial<CurrentLoopRunSummary> | null | undefined
):
  | { ok: true; cmd: string; args: string[] }
  | {
      ok: false;
      status:
        | "invalid-current-run"
        | "runner-state-exists"
        | "missing-runner-state"
        | "terminal-current-run"
        | "terminal-runner-state"
        | "unsupported-action";
      reason: string;
    };
export function acquireFileLock(lockPath: string, owner?: string): Promise<{ ok: true; file: unknown } | { ok: false }>;
export function releaseFileLock(lockPath: string, file: unknown): Promise<void>;
export function writeJsonAtomically(path: string, value: unknown): Promise<void>;
export function getTicketStatusForGoalLifecycle(lifecycleStatus: string, approvedToRun: boolean): string;
export function parseJsonObject(value: string): Record<string, unknown> | null;
export function summarizeMemoryValue(value: unknown): string;
