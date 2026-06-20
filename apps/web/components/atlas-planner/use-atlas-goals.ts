"use client";

import type { KanbanTicket, LoopKanbanProject } from "@agent/atlas-planner";
import type { GoalLifecycleStatus, QueuedGoalSummary } from "@agent/loop-store";
import { useState } from "react";
import {
  getDefaultGoalDraft,
  getGoalContractPreview,
  getTicketStatusForGoalLifecycle,
  goalTimeline,
  type GoalDraft,
  type GoalDraftLayer,
  type GoalSafetySettings,
  type GoalVerificationCommand
} from "./goal-composer";

export function useAtlasGoals({
  loopKanban,
  queuedGoals,
  initialGoalComposerOpen,
  addPlannerTicket,
  setPlannerStateMessage
}: {
  loopKanban: LoopKanbanProject[];
  queuedGoals?: QueuedGoalSummary[];
  initialGoalComposerOpen: boolean;
  addPlannerTicket: (ticket: KanbanTicket) => void;
  setPlannerStateMessage: (message: string) => void;
}) {
  const [isGoalComposerOpen, setIsGoalComposerOpen] = useState(initialGoalComposerOpen);
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(() => getDefaultGoalDraft());
  const [queuedGoalState, setQueuedGoalState] = useState<QueuedGoalSummary[]>(() => queuedGoals ?? []);

  function updateGoalDraft(update: Partial<GoalDraft>) {
    setGoalDraft((current) => ({ ...current, ...update }));
  }

  function updateGoalSafety(update: Partial<GoalSafetySettings>) {
    setGoalDraft((current) => ({
      ...current,
      safety: { ...current.safety, ...update }
    }));
  }

  function addGoalLayer() {
    setGoalDraft((current) => ({
      ...current,
      layers: [
        ...current.layers,
        {
          id: `layer-${Date.now().toString(36)}`,
          label: "New layer",
          criteria: "Describe what must be true for this layer to count as satisfied.",
          status: "pending",
          humanGated: false
        }
      ]
    }));
  }

  function updateGoalLayer(layerId: string, update: Partial<GoalDraftLayer>) {
    setGoalDraft((current) => ({
      ...current,
      layers: current.layers.map((layer) => (layer.id === layerId ? { ...layer, ...update } : layer))
    }));
  }

  function removeGoalLayer(layerId: string) {
    setGoalDraft((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== layerId)
    }));
  }

  function addVerificationCommand() {
    setGoalDraft((current) => ({
      ...current,
      verificationCommands: [
        ...current.verificationCommands,
        {
          id: `verify-${Date.now().toString(36)}`,
          label: "Custom check",
          command: "npm run test",
          required: true
        }
      ]
    }));
  }

  function updateVerificationCommand(commandId: string, update: Partial<GoalVerificationCommand>) {
    setGoalDraft((current) => ({
      ...current,
      verificationCommands: current.verificationCommands.map((command) =>
        command.id === commandId ? { ...command, ...update } : command
      )
    }));
  }

  function removeVerificationCommand(commandId: string) {
    setGoalDraft((current) => ({
      ...current,
      verificationCommands: current.verificationCommands.filter((command) => command.id !== commandId)
    }));
  }

  function openGoalComposer() {
    setIsGoalComposerOpen(true);
  }

  function closeGoalComposer() {
    setIsGoalComposerOpen(false);
  }

  async function saveGoalDraft() {
    const project = loopKanban.find((candidate) => candidate.id === "atlas-planner") ?? loopKanban[0];
    const epic = project?.epics?.find((candidate) => candidate.id === "planner-product") ?? project?.epics?.[0];
    const now = new Date().toISOString();
    const title = goalDraft.title.trim() || "New loop goal";
    const statement = goalDraft.statement.trim() || "Goal statement not written yet.";
    const stopCondition = goalDraft.stopCondition.trim() || "Stop when verification passes and the next step needs judgment.";
    const scope = goalDraft.scope.trim() || "Scope needs refinement before implementation.";
    const contract = getGoalContractPreview(goalDraft);
    const ticketId = `GOAL-${Date.now().toString(36).toUpperCase()}`;
    const lifecycleStatus = goalDraft.approvedToRun && goalDraft.lifecycleStatus === "draft" ? "approved" : goalDraft.lifecycleStatus;

    const ticket: KanbanTicket = {
      id: ticketId,
      title,
      status: getTicketStatusForGoalLifecycle(lifecycleStatus, goalDraft.approvedToRun),
      estimate: goalDraft.maxEstimate,
      summary: statement,
      tags: goalDraft.approvedToRun
        ? ["goal", "loop", `goal-${lifecycleStatus}`, "approved-to-run"]
        : ["goal", "loop", `goal-${lifecycleStatus}`],
      projectId: project?.id ?? "atlas-planner",
      projectLabel: project?.label ?? "Atlas Planner",
      epicId: epic?.id ?? "planner-product",
      epicLabel: epic?.label ?? "Planner Product",
      fitLabel: "",
      description: [
        statement,
        "",
        `Stop condition: ${stopCondition}`,
        `Scope: ${scope}`,
        `Lifecycle: ${lifecycleStatus}`,
        `Max estimate: ${goalDraft.maxEstimate}`,
        `Approved to run: ${goalDraft.approvedToRun ? "yes" : "no"}`,
        "",
        "Refined satisfaction layers:",
        ...contract.layers.map((layer) => `- [${layer.status}${layer.humanGated ? ", human-gated" : ""}] ${layer.label}: ${layer.criteria}`),
        "",
        "Verification:",
        ...contract.verification.map((item) => `- [${item.required ? "required" : "optional"}] ${item.label}: ${item.command}`),
        "",
        "Safety:",
        ...contract.safety.map((item) => `- ${item}`)
      ].join("\n"),
      subtasks: goalTimeline.map((step) => ({
        id: `goal-${step.id}`,
        title: `${step.label}: ${step.detail}`,
        done: false
      })),
      createdAt: now,
      updatedAt: now,
      movedAt: now
    };

    try {
      const response = await fetch("/api/atlas-goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: ticket.id,
          title: ticket.title,
          lifecycleStatus,
          approvedToRun: goalDraft.approvedToRun,
          status: ticket.status,
          estimate: ticket.estimate,
          summary: ticket.summary,
          tags: ticket.tags,
          description: ticket.description,
          subtasks: ticket.subtasks,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        })
      });
      if (!response.ok) {
        throw new Error("Queue write failed.");
      }
      const payload = (await response.json()) as { goal?: QueuedGoalSummary };
      addPlannerTicket(ticket);
      if (payload.goal) {
        const queuedGoal = payload.goal;
        setQueuedGoalState((current) => [queuedGoal, ...current.filter((goal) => goal.id !== queuedGoal.id)]);
      }
      setPlannerStateMessage(`Created ${ticketId} and queued it for the loop runner.`);
    } catch {
      setPlannerStateMessage(`Could not create ${ticketId}. Queue write failed.`);
      return;
    }
    setGoalDraft(getDefaultGoalDraft());
    closeGoalComposer();
  }

  async function updateQueuedGoalLifecycle(goal: QueuedGoalSummary, lifecycleStatus: GoalLifecycleStatus) {
    const previousGoals = queuedGoalState;
    const approvedToRun = lifecycleStatus === "approved" || lifecycleStatus === "running";
    const nextStatus = getTicketStatusForGoalLifecycle(lifecycleStatus, approvedToRun);
    const updatedGoal: QueuedGoalSummary = {
      ...goal,
      lifecycleStatus,
      approvedToRun,
      status: nextStatus,
      updatedAt: new Date().toISOString()
    };

    setQueuedGoalState((current) => current.map((candidate) => (candidate.id === goal.id ? updatedGoal : candidate)));
    setPlannerStateMessage(`${goal.id} moved to ${lifecycleStatus}.`);

    try {
      const response = await fetch("/api/atlas-goals", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: goal.id,
          lifecycleStatus,
          approvedToRun
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Goal lifecycle update failed.");
      }

      const payload = (await response.json()) as { goal?: QueuedGoalSummary };
      if (payload.goal) {
        setQueuedGoalState((current) => current.map((candidate) => (candidate.id === goal.id ? payload.goal! : candidate)));
      }
    } catch (error) {
      setQueuedGoalState(previousGoals);
      setPlannerStateMessage(error instanceof Error ? error.message : "Goal lifecycle update failed.");
    }
  }

  return {
    durableQueuedGoals: queuedGoalState,
    isGoalComposerOpen,
    goalDraft,
    openGoalComposer,
    closeGoalComposer,
    updateGoalDraft,
    updateGoalSafety,
    addGoalLayer,
    updateGoalLayer,
    removeGoalLayer,
    addVerificationCommand,
    updateVerificationCommand,
    removeVerificationCommand,
    saveGoalDraft,
    updateQueuedGoalLifecycle
  };
}
