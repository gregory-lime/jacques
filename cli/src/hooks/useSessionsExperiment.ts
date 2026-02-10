/**
 * useSessionsExperiment Hook
 *
 * Scrollable list of active sessions grouped by worktree.
 * Supports multi-select for tiling, vim-style keyboard navigation,
 * new-session/new-worktree buttons, and worktree visibility toggle.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import type { Key } from "ink";
import type { Session } from "@jacques/core";
import { getProjectGroupKey } from "@jacques/core";
import type { WorktreeItem } from "./useWorktrees.js";
import { validateWorktreeName } from "./useWorktrees.js";
import type { CreateWorktreeResult } from "./useJacquesClient.js";

// ---- Content item types ----

export type ContentItem =
  | { kind: "worktree-header"; name: string; branch: string | null; isMain: boolean; sessionCount: number }
  | { kind: "session"; session: Session }
  | { kind: "spacer" }
  | { kind: "new-session-button"; worktreePath: string }
  | { kind: "new-worktree-button" }
  | { kind: "new-worktree-input" }
  | { kind: "show-all-worktrees-button"; hiddenCount: number };

// ---- Params & Return ----

export interface UseSessionsExperimentParams {
  sessions: Session[];
  worktrees: WorktreeItem[];
  focusedSessionId: string | null;
  selectedProject: string | null;
  terminalHeight: number;
  focusTerminal: (sessionId: string) => void;
  maximizeWindow: (sessionId: string) => void;
  tileWindows: (sessionIds: string[], layout?: "side-by-side" | "thirds" | "2x2" | "smart") => void;
  launchSession: (cwd: string, dangerouslySkipPermissions?: boolean) => void;
  showNotification: (msg: string) => void;
  returnToMain: () => void;
  createWorktreeWs: (repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => void;
  repoRoot: string | null;
  createWorktreeResult: CreateWorktreeResult | null;
  skipPermissions: boolean;
}

export interface UseSessionsExperimentReturn {
  items: ContentItem[];
  selectableIndices: number[];
  selectedIndex: number;
  scrollOffset: number;
  selectedIds: Set<string>;
  isCreatingWorktree: boolean;
  newWorktreeName: string;
  worktreeCreateError: string | null;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useSessionsExperiment({
  sessions,
  worktrees,
  focusedSessionId,
  selectedProject,
  terminalHeight,
  focusTerminal,
  maximizeWindow,
  tileWindows,
  launchSession,
  showNotification,
  returnToMain,
  createWorktreeWs,
  repoRoot,
  createWorktreeResult,
  skipPermissions,
}: UseSessionsExperimentParams): UseSessionsExperimentReturn {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAllWorktrees, setShowAllWorktrees] = useState(false);
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [newWorktreeName, setNewWorktreeName] = useState("");
  const [worktreeCreateError, setWorktreeCreateError] = useState<string | null>(null);

  // Viewport = content area height (terminal minus borders + footer)
  const viewport = Math.max(8, terminalHeight - 3);

  // Handle createWorktreeResult
  useEffect(() => {
    if (!createWorktreeResult) return;
    if (createWorktreeResult.success) {
      showNotification(`Worktree created: ${createWorktreeResult.branch || newWorktreeName}`);
      setIsCreatingWorktree(false);
      setNewWorktreeName("");
      setWorktreeCreateError(null);
    } else {
      setWorktreeCreateError(createWorktreeResult.error || "Failed to create worktree");
    }
  }, [createWorktreeResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter sessions by selected project
  const filteredSessions = useMemo(() => {
    const filtered = selectedProject
      ? sessions.filter((s) => getProjectGroupKey(s) === selectedProject)
      : [...sessions];
    filtered.sort((a, b) => {
      if (a.session_id === focusedSessionId) return -1;
      if (b.session_id === focusedSessionId) return 1;
      return a.registered_at - b.registered_at;
    });
    return filtered;
  }, [sessions, selectedProject, focusedSessionId]);

  // Group sessions by worktree and build flat content list
  const { items, selectableIndices } = useMemo(() => {
    const result: ContentItem[] = [];
    const selectable: number[] = [];

    // Match sessions to worktrees
    const sessionsByWorktree = new Map<string, Session[]>();
    const unmatched: Session[] = [];

    for (const session of filteredSessions) {
      let matched = false;
      const wtId = session.git_worktree || null;
      for (const wt of worktrees) {
        if (
          (wtId === null && wt.isMain) ||
          (wtId !== null && (wtId === wt.name || wtId === wt.branch)) ||
          (session.cwd && (session.cwd === wt.path || session.cwd.startsWith(wt.path + '/')))
        ) {
          const existing = sessionsByWorktree.get(wt.name) || [];
          existing.push(session);
          sessionsByWorktree.set(wt.name, existing);
          matched = true;
          break;
        }
      }
      if (!matched) {
        unmatched.push(session);
      }
    }

    // Determine which worktrees are visible
    let hiddenEmptyCount = 0;
    const visibleWorktrees: WorktreeItem[] = [];
    for (const wt of worktrees) {
      const wtSessions = sessionsByWorktree.get(wt.name) || [];
      if (wt.isMain || wtSessions.length > 0 || showAllWorktrees) {
        visibleWorktrees.push(wt);
      } else {
        hiddenEmptyCount++;
      }
    }

    // Build items per visible worktree
    visibleWorktrees.forEach((wt) => {
      const wtSessions = sessionsByWorktree.get(wt.name) || [];

      // Spacer before group (not first visible)
      if (result.length > 0) {
        result.push({ kind: "spacer" });
      }

      // Worktree header (non-selectable)
      result.push({
        kind: "worktree-header",
        name: wt.name,
        branch: wt.branch,
        isMain: wt.isMain,
        sessionCount: wtSessions.length,
      });

      for (const session of wtSessions) {
        selectable.push(result.length);
        result.push({ kind: "session", session });
      }

      // New session button after each worktree's sessions
      selectable.push(result.length);
      result.push({ kind: "new-session-button", worktreePath: wt.path });
    });

    // Unmatched sessions
    if (unmatched.length > 0) {
      if (visibleWorktrees.length > 0) {
        result.push({ kind: "spacer" });
      }
      result.push({
        kind: "worktree-header",
        name: "other",
        branch: null,
        isMain: false,
        sessionCount: unmatched.length,
      });
      for (const session of unmatched) {
        selectable.push(result.length);
        result.push({ kind: "session", session });
      }
    }

    // No worktrees at all -- show sessions flat
    if (worktrees.length === 0 && unmatched.length === 0) {
      for (const session of filteredSessions) {
        selectable.push(result.length);
        result.push({ kind: "session", session });
      }
    }

    // Show/hide empty worktrees toggle
    if (hiddenEmptyCount > 0 || showAllWorktrees) {
      result.push({ kind: "spacer" });
      selectable.push(result.length);
      result.push({ kind: "show-all-worktrees-button", hiddenCount: hiddenEmptyCount });
    }

    // New worktree button (or input if creating)
    if (repoRoot) {
      result.push({ kind: "spacer" });
      selectable.push(result.length);
      if (isCreatingWorktree) {
        result.push({ kind: "new-worktree-input" });
      } else {
        result.push({ kind: "new-worktree-button" });
      }
    }

    return { items: result, selectableIndices: selectable };
  }, [filteredSessions, worktrees, showAllWorktrees, repoRoot, isCreatingWorktree]);

  // Current selectable item's position in the items array
  const currentItemIndex = selectableIndices[selectedIndex] ?? -1;

  // Adjust scroll when cursor moves outside viewport
  const adjustScroll = useCallback((itemIdx: number) => {
    setScrollOffset((prev) => {
      // Show header above if possible
      if (itemIdx < prev) return Math.max(0, itemIdx - 1);
      if (itemIdx >= prev + viewport) return itemIdx - viewport + 1;
      return prev;
    });
  }, [viewport]);

  const handleInput = useCallback((input: string, key: Key) => {
    // Creation mode guard
    if (isCreatingWorktree) {
      if (key.escape) {
        setIsCreatingWorktree(false);
        setNewWorktreeName("");
        setWorktreeCreateError(null);
        return;
      }
      if (key.return) {
        const validationError = validateWorktreeName(newWorktreeName);
        if (validationError) {
          setWorktreeCreateError(validationError);
          return;
        }
        if (repoRoot) {
          createWorktreeWs(repoRoot, newWorktreeName, undefined, skipPermissions || undefined);
          showNotification("Creating worktree...");
        }
        return;
      }
      if (key.backspace || key.delete) {
        setNewWorktreeName((prev) => prev.slice(0, -1));
        setWorktreeCreateError(null);
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setNewWorktreeName((prev) => prev + input);
        setWorktreeCreateError(null);
        return;
      }
      return;
    }

    if (key.escape) {
      returnToMain();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        adjustScroll(selectableIndices[next] ?? 0);
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const next = Math.min(selectableIndices.length - 1, prev + 1);
        adjustScroll(selectableIndices[next] ?? 0);
        return next;
      });
      return;
    }

    // Enter — context-dependent action
    if (key.return) {
      const item = items[currentItemIndex];
      if (!item) return;
      if (item.kind === "session") {
        showNotification("Focusing terminal...");
        focusTerminal(item.session.session_id);
      } else if (item.kind === "new-session-button") {
        showNotification("Launching new session...");
        launchSession(item.worktreePath, skipPermissions || undefined);
      } else if (item.kind === "new-worktree-button") {
        setIsCreatingWorktree(true);
        setNewWorktreeName("");
        setWorktreeCreateError(null);
      } else if (item.kind === "show-all-worktrees-button") {
        setShowAllWorktrees((prev) => !prev);
      }
      return;
    }

    // Space — toggle multi-select
    if (input === " ") {
      const item = items[currentItemIndex];
      if (item?.kind === "session") {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.session.session_id)) {
            next.delete(item.session.session_id);
          } else {
            next.add(item.session.session_id);
          }
          return next;
        });
      }
      return;
    }

    // f — maximize
    if (input === "f") {
      const item = items[currentItemIndex];
      if (item?.kind === "session") {
        showNotification("Maximizing window...");
        maximizeWindow(item.session.session_id);
      }
      return;
    }

    // t — tile (needs 2+ selected)
    if (input === "t") {
      if (selectedIds.size >= 2) {
        showNotification(`Tiling ${selectedIds.size} windows...`);
        tileWindows(Array.from(selectedIds));
      } else {
        showNotification("Select 2+ sessions with Space first");
      }
      return;
    }

    // n — new session in same directory
    if (input === "n") {
      const item = items[currentItemIndex];
      if (item?.kind === "session") {
        const cwd = item.session.cwd || item.session.workspace?.project_dir;
        if (cwd) {
          showNotification("Launching new session...");
          launchSession(cwd, skipPermissions || undefined);
        }
      }
      return;
    }

    // a — select all sessions
    if (input === "a") {
      const allIds = new Set<string>();
      for (const item of items) {
        if (item.kind === "session") allIds.add(item.session.session_id);
      }
      setSelectedIds(allIds);
      return;
    }

    // x — clear selection
    if (input === "x") {
      setSelectedIds(new Set());
      return;
    }
  }, [
    selectableIndices, items, currentItemIndex, selectedIds, viewport,
    returnToMain, focusTerminal, maximizeWindow, tileWindows, launchSession,
    showNotification, adjustScroll, isCreatingWorktree, newWorktreeName,
    repoRoot, createWorktreeWs, skipPermissions,
  ]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
    setSelectedIds(new Set());
    setShowAllWorktrees(false);
    setIsCreatingWorktree(false);
    setNewWorktreeName("");
    setWorktreeCreateError(null);
  }, []);

  return {
    items,
    selectableIndices,
    selectedIndex,
    scrollOffset,
    selectedIds,
    isCreatingWorktree,
    newWorktreeName,
    worktreeCreateError,
    handleInput,
    reset,
  };
}
