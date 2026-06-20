export type GoalLifecycleStatus = "draft" | "refined" | "approved" | "running" | "blocked" | "satisfied" | "archived";

export type QueuedGoal = {
  id: string;
  title: string;
  lifecycleStatus: GoalLifecycleStatus | string;
  approvedToRun: boolean;
  status: string;
  estimate: number;
  summary: string;
  tags: string[];
  description: string;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  createdAt: string;
  updatedAt: string;
};

export type QueuedGoalSummary = Pick<QueuedGoal, "id" | "title" | "lifecycleStatus" | "approvedToRun" | "status" | "estimate" | "updatedAt">;

export type GoalQueue = {
  version: 1;
  updatedAt: string;
  goals: QueuedGoal[];
};

export type CurrentLoopRunSummary = {
  id: string;
  goalId: string;
  goalTitle: string;
  status: string;
  stage: string;
  claimedAt: string;
  updatedAt: string;
  baseCommit: string;
  branchName?: string;
  worktreePath?: string;
  handoffDir?: string;
  runnerCommand?: string;
  makerPromptPath?: string;
  checkerPromptPath?: string;
  evidencePath?: string;
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

export type RunnerEvidenceSummary = {
  status: string;
  repairAttempts: number;
  maxRepairs: number;
  checks: RunnerEvidenceCheck[];
  findings: RunnerEvidenceFinding[];
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
export function acquireFileLock(lockPath: string, owner?: string): Promise<{ ok: true; file: unknown } | { ok: false }>;
export function releaseFileLock(lockPath: string, file: unknown): Promise<void>;
export function writeJsonAtomically(path: string, value: unknown): Promise<void>;
export function getTicketStatusForGoalLifecycle(lifecycleStatus: string, approvedToRun: boolean): string;
export function parseJsonObject(value: string): Record<string, unknown> | null;
export function summarizeMemoryValue(value: unknown): string;
