"use client";

import {
  buildPlannerTickets,
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
import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type PlannerTicketsApiState = {
  ok?: boolean;
  source?: "repo" | "missing" | "invalid";
  revision?: string;
  tickets?: KanbanTicket[];
  error?: string;
};

export function usePlannerTickets({
  loopKanban,
  currentCommit,
  usageStatus
}: {
  loopKanban: LoopKanbanProject[];
  currentCommit: string;
  usageStatus: UsageStatusSnapshot | null;
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
  const plannerStateRevisionRef = useRef("");
  const plannerStatePersistTimeoutRef = useRef<number | null>(null);
  const queuedPlannerTicketsRef = useRef<KanbanTicket[] | null>(null);
  const isPersistingPlannerStateRef = useRef(false);
  const isApiBackedPlannerStateRef = useRef(false);
  const shouldSkipNextPlannerPersistRef = useRef(false);
  const kanbanColumns = getKanbanColumns(plannerTickets, usageStatus);

  const persistPlannerTicketsToApi = useCallback(async (tickets: KanbanTicket[]) => {
    queuedPlannerTicketsRef.current = tickets;
    if (isPersistingPlannerStateRef.current) {
      return;
    }

    isPersistingPlannerStateRef.current = true;
    try {
      while (queuedPlannerTicketsRef.current) {
        const ticketsToPersist = queuedPlannerTicketsRef.current;
        queuedPlannerTicketsRef.current = null;
        const response = await fetch("/api/planner/tickets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseRevision: plannerStateRevisionRef.current,
            tickets: ticketsToPersist
          })
        });
        const payload = (await response.json().catch(() => null)) as PlannerTicketsApiState | null;

        if (!response.ok) {
          if (response.status === 409) {
            isApiBackedPlannerStateRef.current = false;
            queuedPlannerTicketsRef.current = null;
            setPlannerStateMessage(payload?.error ?? "Planner tickets changed on disk. Reload before saving again.");
            return;
          }

          setPlannerStateMessage(payload?.error ?? "Planner tickets could not be saved to disk. Browser fallback is still updated.");
          return;
        }

        plannerStateRevisionRef.current = payload?.revision ?? "";
      }
    } catch {
      setPlannerStateMessage("Planner ticket API is unavailable. Browser fallback is still updated.");
    } finally {
      isPersistingPlannerStateRef.current = false;
      if (queuedPlannerTicketsRef.current && isApiBackedPlannerStateRef.current) {
        void persistPlannerTicketsToApi(queuedPlannerTicketsRef.current);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      const defaultTickets = buildPlannerTickets(loopKanban);
      const apiState = await readPlannerTicketsFromApi();
      if (cancelled) {
        return;
      }
      if (apiState) {
        const repoTickets = hydratePlannerTickets(apiState.tickets ?? []);
        const repoTicketIds = new Set(repoTickets.map((ticket) => ticket.id));
        setPlannerTickets([...repoTickets, ...defaultTickets.filter((ticket) => !repoTicketIds.has(ticket.id))]);
        plannerStateRevisionRef.current = apiState.revision ?? "";
        isApiBackedPlannerStateRef.current = apiState.source !== "invalid";
        shouldSkipNextPlannerPersistRef.current = true;
        setHasLoadedPlannerState(true);
        setPlannerStateMessage(
          apiState.source === "missing"
            ? "Planner ticket file is not initialized yet. The next edit will create it."
            : apiState.source === "invalid"
              ? "Planner ticket file could not be read. Using browser fallback."
              : ""
        );
        return;
      }

      try {
        const stored = window.localStorage.getItem(plannerTicketStorageKey);
        if (!stored) {
          shouldSkipNextPlannerPersistRef.current = true;
          setPlannerTickets(defaultTickets);
          return;
        }

        const storedTickets = hydratePlannerTickets(JSON.parse(stored) as KanbanTicket[]);
        const storedTicketIds = new Set(storedTickets.map((ticket) => ticket.id));
        shouldSkipNextPlannerPersistRef.current = true;
        setPlannerTickets([...storedTickets, ...defaultTickets.filter((ticket) => !storedTicketIds.has(ticket.id))]);
      } catch {
        shouldSkipNextPlannerPersistRef.current = true;
        setPlannerTickets(buildPlannerTickets(loopKanban));
      } finally {
        setHasLoadedPlannerState(true);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [loopKanban]);

  useEffect(() => {
    if (!hasLoadedPlannerState || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(plannerTicketStorageKey, JSON.stringify(plannerTickets));
    if (shouldSkipNextPlannerPersistRef.current) {
      shouldSkipNextPlannerPersistRef.current = false;
      return;
    }

    if (!isApiBackedPlannerStateRef.current) {
      return;
    }

    if (plannerStatePersistTimeoutRef.current) {
      window.clearTimeout(plannerStatePersistTimeoutRef.current);
    }

    plannerStatePersistTimeoutRef.current = window.setTimeout(() => {
      void persistPlannerTicketsToApi(plannerTickets);
    }, 300);
  }, [hasLoadedPlannerState, persistPlannerTicketsToApi, plannerTickets]);

  useEffect(() => {
    return () => {
      if (editorCloseTimeoutRef.current) {
        window.clearTimeout(editorCloseTimeoutRef.current);
      }
      if (plannerStatePersistTimeoutRef.current) {
        window.clearTimeout(plannerStatePersistTimeoutRef.current);
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

async function readPlannerTicketsFromApi() {
  try {
    const response = await fetch("/api/planner/tickets", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as PlannerTicketsApiState | null;
    if (!response.ok || !payload?.ok || !Array.isArray(payload.tickets)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
