"use client";

import {
  buildPlannerTickets,
  applyRunnerStateToPlannerTickets,
  createPlannerStateExport,
  getDefaultPlannerTicket,
  getKanbanColumns,
  hydratePlannerTickets,
  normalizePlannerTicket,
  parsePlannerStateImport,
  plannerTicketStorageKey,
  type KanbanTicket,
  type LoopKanbanProject,
  type LoopTicketStatus,
  type PlannerSubtask,
  type PlannerTicketDraft,
  type UsageStatusSnapshot
} from "@agent/atlas-planner";
import type { CurrentLoopRunSummary, RunnerStateSummary } from "@agent/loop-store";
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

const plannerRunnerSyncStorageKey = "atlas-planner:runner-sync:v1";

export function usePlannerTickets({
  loopKanban,
  currentCommit,
  usageStatus,
  currentLoopRun,
  currentRunnerState
}: {
  loopKanban: LoopKanbanProject[];
  currentCommit: string;
  usageStatus: UsageStatusSnapshot | null;
  currentLoopRun?: CurrentLoopRunSummary | null;
  currentRunnerState?: RunnerStateSummary | null;
}) {
  const [plannerTickets, setPlannerTickets] = useState<KanbanTicket[]>(() => buildPlannerTickets(loopKanban));
  const [hasLoadedPlannerState, setHasLoadedPlannerState] = useState(false);
  const [editingTicket, setEditingTicket] = useState<PlannerTicketDraft | null>(null);
  const [isTicketEditorClosing, setIsTicketEditorClosing] = useState(false);
  const [draggingTicketId, setDraggingTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<LoopTicketStatus | null>(null);
  const [plannerStateMessage, setPlannerStateMessage] = useState("");
  const editorCloseTimeoutRef = useRef<number | null>(null);
  const plannerImportInputRef = useRef<HTMLInputElement | null>(null);
  const suppressTicketClickRef = useRef(false);
  const suppressTicketClickTimeoutRef = useRef<number | null>(null);
  const syncedRunnerRunIdsRef = useRef<Set<string>>(new Set());
  const kanbanColumns = getKanbanColumns(plannerTickets, usageStatus);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        syncedRunnerRunIdsRef.current = readSyncedRunnerRunIds();
        const stored = window.localStorage.getItem(plannerTicketStorageKey);
        const defaultTickets = buildPlannerTickets(loopKanban);
        if (!stored) {
          setPlannerTickets(defaultTickets);
          return;
        }

        const storedTickets = hydratePlannerTickets(JSON.parse(stored) as KanbanTicket[]);
        const storedTicketIds = new Set(storedTickets.map((ticket) => ticket.id));
        setPlannerTickets([...storedTickets, ...defaultTickets.filter((ticket) => !storedTicketIds.has(ticket.id))]);
      } catch {
        setPlannerTickets(buildPlannerTickets(loopKanban));
      } finally {
        setHasLoadedPlannerState(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loopKanban]);

  useEffect(() => {
    if (!hasLoadedPlannerState || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(plannerTicketStorageKey, JSON.stringify(plannerTickets));
  }, [hasLoadedPlannerState, plannerTickets]);

  useEffect(() => {
    if (!hasLoadedPlannerState || typeof window === "undefined") {
      return;
    }

    const runId = currentLoopRun?.id;
    const runnerStatus = currentRunnerState?.status;
    if (!runId || !runnerStatus || !["satisfied", "blocked", "failed"].includes(runnerStatus)) {
      return;
    }
    if (syncedRunnerRunIdsRef.current.has(runId)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPlannerTickets((current) =>
        applyRunnerStateToPlannerTickets(current, {
          currentRun: currentLoopRun,
          runnerState: currentRunnerState,
          currentCommit
        })
      );
      syncedRunnerRunIdsRef.current.add(runId);
      writeSyncedRunnerRunIds(syncedRunnerRunIdsRef.current);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [currentCommit, currentLoopRun, currentRunnerState, hasLoadedPlannerState]);

  useEffect(() => {
    return () => {
      if (editorCloseTimeoutRef.current) {
        window.clearTimeout(editorCloseTimeoutRef.current);
      }
      if (suppressTicketClickTimeoutRef.current) {
        window.clearTimeout(suppressTicketClickTimeoutRef.current);
      }
    };
  }, []);

  function moveTicket(ticketId: string, status: LoopTicketStatus) {
    const now = new Date().toISOString();
    setPlannerTickets((current) =>
      current.map((ticket) => {
        if (ticket.id !== ticketId || ticket.status === status) {
          return ticket;
        }

        return {
          ...ticket,
          status,
          updatedAt: now,
          movedAt: now,
          completedAt: status === "done" ? now : undefined,
          completedCommit: status === "done" ? currentCommit : undefined
        };
      })
    );
  }

  function suppressTicketClick() {
    suppressTicketClickRef.current = true;
    if (suppressTicketClickTimeoutRef.current) {
      window.clearTimeout(suppressTicketClickTimeoutRef.current);
    }
    suppressTicketClickTimeoutRef.current = window.setTimeout(() => {
      suppressTicketClickRef.current = false;
      suppressTicketClickTimeoutRef.current = null;
    }, 250);
  }

  function clearDragState() {
    setDraggingTicketId(null);
    setDragOverStatus(null);
  }

  function handleColumnDragOver(event: DragEvent<HTMLElement>, status: LoopTicketStatus) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStatus(status);
  }

  function handleColumnDragLeave(event: DragEvent<HTMLElement>, status: LoopTicketStatus) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setDragOverStatus((current) => (current === status ? null : current));
  }

  function handleDrop(event: DragEvent<HTMLElement>, status: LoopTicketStatus) {
    event.preventDefault();
    suppressTicketClick();
    const ticketId = event.dataTransfer.getData("text/plain");
    if (ticketId) {
      moveTicket(ticketId, status);
    }
    clearDragState();
  }

  function handleTicketClick(event: ReactMouseEvent<HTMLElement>, ticket: PlannerTicketDraft) {
    if (suppressTicketClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    openTicketEditor(ticket);
  }

  function handleTicketDragStart(event: DragEvent<HTMLElement>, ticket: KanbanTicket) {
    suppressTicketClick();
    setDraggingTicketId(ticket.id);
    setDragOverStatus(ticket.status);
    event.dataTransfer.setData("text/plain", ticket.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleTicketDragEnd() {
    suppressTicketClick();
    clearDragState();
  }

  function saveEditingTicket() {
    if (!editingTicket) {
      return;
    }

    const normalizedTicket = normalizePlannerTicket(editingTicket);
    setPlannerTickets((current) => {
      const existingTicket = current.find((ticket) => ticket.id === normalizedTicket.id);
      const movedAt =
        existingTicket && existingTicket.status !== normalizedTicket.status
          ? normalizedTicket.updatedAt
          : normalizedTicket.movedAt;
      const completedAt =
        normalizedTicket.status === "done"
          ? existingTicket?.status === "done"
            ? normalizedTicket.completedAt
            : normalizedTicket.updatedAt
          : undefined;
      const completedCommit =
        normalizedTicket.status === "done"
          ? existingTicket?.status === "done"
            ? normalizedTicket.completedCommit ?? currentCommit
            : currentCommit
          : undefined;
      const ticketToSave = {
        ...normalizedTicket,
        movedAt,
        completedAt,
        completedCommit
      };

      const exists = Boolean(existingTicket);
      if (exists) {
        return current.map((ticket) => (ticket.id === normalizedTicket.id ? ticketToSave : ticket));
      }
      return [ticketToSave, ...current];
    });
    closeTicketEditor();
  }

  function deleteEditingTicket() {
    if (!editingTicket) {
      return;
    }

    setPlannerTickets((current) => current.filter((ticket) => ticket.id !== editingTicket.id));
    closeTicketEditor();
  }

  function openTicketEditor(ticket: PlannerTicketDraft) {
    if (editorCloseTimeoutRef.current) {
      window.clearTimeout(editorCloseTimeoutRef.current);
    }
    setIsTicketEditorClosing(false);
    setEditingTicket({ ...ticket, tags: ticket.tags ?? [] });
  }

  function openNewTicket() {
    openTicketEditor(getDefaultPlannerTicket(loopKanban));
  }

  function closeTicketEditor() {
    if (editorCloseTimeoutRef.current) {
      window.clearTimeout(editorCloseTimeoutRef.current);
    }
    setIsTicketEditorClosing(true);
    editorCloseTimeoutRef.current = window.setTimeout(() => {
      setEditingTicket(null);
      setIsTicketEditorClosing(false);
      editorCloseTimeoutRef.current = null;
    }, 180);
  }

  function updateEditingTicket(update: Partial<PlannerTicketDraft>) {
    setEditingTicket((current) => (current ? { ...current, ...update } : current));
  }

  function addSubtask() {
    setEditingTicket((current) =>
      current
        ? {
            ...current,
            subtasks: [...current.subtasks, { id: `sub-${Date.now().toString(36)}`, title: "", done: false }]
          }
        : current
    );
  }

  function updateSubtask(subtaskId: string, update: Partial<PlannerSubtask>) {
    setEditingTicket((current) =>
      current
        ? {
            ...current,
            subtasks: current.subtasks.map((subtask) =>
              subtask.id === subtaskId ? { ...subtask, ...update } : subtask
            )
          }
        : current
    );
  }

  function removeSubtask(subtaskId: string) {
    setEditingTicket((current) =>
      current
        ? {
            ...current,
            subtasks: current.subtasks.filter((subtask) => subtask.id !== subtaskId)
          }
        : current
    );
  }

  function exportPlannerState() {
    if (typeof window === "undefined") {
      return;
    }

    const plannerState = createPlannerStateExport(plannerTickets);
    const stateBlob = new Blob([JSON.stringify(plannerState, null, 2)], { type: "application/json" });
    const stateUrl = window.URL.createObjectURL(stateBlob);
    const link = document.createElement("a");
    link.href = stateUrl;
    link.download = `atlas-planner-${plannerState.exportedAt.slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(stateUrl);
    setPlannerStateMessage(`Exported ${plannerState.tickets.length} tickets.`);
  }

  function importPlannerState(file: File | undefined) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const importedTickets = parsePlannerStateImport(String(reader.result ?? ""));
        setPlannerTickets(importedTickets);
        setPlannerStateMessage(`Imported ${importedTickets.length} tickets.`);
      } catch {
        setPlannerStateMessage("Import failed. Use an Atlas Planner JSON export.");
      }
    });
    reader.readAsText(file);
  }

  function resetPlannerState() {
    const defaultTickets = buildPlannerTickets(loopKanban);
    setPlannerTickets(defaultTickets);
    setPlannerStateMessage(`Reset to ${defaultTickets.length} default tickets.`);
  }

  function addPlannerTicket(ticket: KanbanTicket) {
    setPlannerTickets((current) => [ticket, ...current]);
  }

  return {
    plannerTickets,
    kanbanColumns,
    editingTicket,
    isTicketEditorClosing,
    draggingTicketId,
    dragOverStatus,
    plannerImportInputRef,
    plannerStateMessage,
    setDragOverStatus,
    setPlannerStateMessage,
    addPlannerTicket,
    openNewTicket,
    closeTicketEditor,
    updateEditingTicket,
    saveEditingTicket,
    deleteEditingTicket,
    addSubtask,
    updateSubtask,
    removeSubtask,
    exportPlannerState,
    importPlannerState,
    resetPlannerState,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleDrop,
    handleTicketClick,
    handleTicketDragStart,
    handleTicketDragEnd
  };
}

function readSyncedRunnerRunIds() {
  try {
    const value = window.localStorage.getItem(plannerRunnerSyncStorageKey);
    const parsed = value ? (JSON.parse(value) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeSyncedRunnerRunIds(runIds: Set<string>) {
  window.localStorage.setItem(plannerRunnerSyncStorageKey, JSON.stringify([...runIds].slice(-100)));
}
