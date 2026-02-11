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
import type { CreateWorktreeResult, RemoveWorktreeResult } from "./useJacquesClient.js";

// ---- Content item types ----

export type ContentItem =
  | { kind: "worktree-header"; name: string; branch: string | null; isMain: boolean; sessionCount: number }
  | { kind: "session"; session: Session }
  | { kind: "spacer" }
  | { kind: "new-session-button"; worktreePath: string }
  | { kind: "new-worktree-button" }
  | { kind: "new-worktree-input" }
  | { kind: "show-all-worktrees-button"; hiddenCount: number }
  | { kind: "remove-worktree-button"; worktreePath: string; worktreeName: string }
  | { kind: "remove-worktree-confirm"; worktreePath: string; worktreeName: string; branch: string | null; hasUncommittedChanges: boolean; isMergedToMain: boolean; sessionCount: number };

// ---- Params & Return ----

export interface UseSessionsExperimentParams {
  sessions: Session[];
  worktrees: WorktreeItem[];
  focusedSessionId: string | null;
  selectedProject: string | null;
  focusTerminal: (sessionId: string) => void;
  maximizeWindow: (sessionId: string) => void;
  tileWindows: (sessionIds: string[], layout?: "side-by-side" | "thirds" | "2x2" | "smart") => void;
  launchSession: (cwd: string, dangerouslySkipPermissions?: boolean) => void;
  showNotification: (msg: string) => void;
  returnToMain: () => void;
  createWorktreeWs: (repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => void;
  removeWorktreeWs: (repoRoot: string, path: string, force?: boolean, deleteBranch?: boolean) => void;
  repoRoot: string | null;
  createWorktreeResult: CreateWorktreeResult | null;
  removeWorktreeResult: RemoveWorktreeResult | null;
  skipPermissions: boolean;
}

export interface UseSessionsExperimentReturn {
  items: ContentItem[];
  selectableIndices: number[];
  selectedIndex: number;
  selectedIds: Set<string>;
  showHelp: boolean;
  scrollBias: number;
  isCreatingWorktree: boolean;
  newWorktreeName: string;
  worktreeCreateError: string | null;
  isRemovingWorktree: boolean;
  removeDeleteBranch: boolean;
  removeForce: boolean;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useSessionsExperiment({
  sessions,
  worktrees,
  focusedSessionId,
  selectedProject,
  focusTerminal,
  maximizeWindow,
  tileWindows,
  launchSession,
  showNotification,
  returnToMain,
  createWorktreeWs,
  removeWorktreeWs,
  repoRoot,
  createWorktreeResult,
  removeWorktreeResult,
  skipPermissions,
}: UseSessionsExperimentParams): UseSessionsExperimentReturn {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(true);
  const [scrollBias, setScrollBias] = useState(0);
  const [showAllWorktrees, setShowAllWorktrees] = useState(false);
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [newWorktreeName, setNewWorktreeName] = useState("");
  const [worktreeCreateError, setWorktreeCreateError] = useState<string | null>(null);
  const [removingWorktreePath, setRemovingWorktreePath] = useState<string | null>(null);
  const [removeForce, setRemoveForce] = useState(false);
  const [removeDeleteBranch, setRemoveDeleteBranch] = useState(true);

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

  // Handle removeWorktreeResult
  useEffect(() => {
    if (!removeWorktreeResult) return;
    // useWorktrees already shows notification and refreshes the list
    setRemovingWorktreePath(null);
    setRemoveDeleteBranch(true);
    setRemoveForce(false);
  }, [removeWorktreeResult]);

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

      // Remove worktree button (only for non-main worktrees when showing all)
      if (showAllWorktrees && !wt.isMain) {
        selectable.push(result.length);
        if (removingWorktreePath === wt.path) {
          result.push({
            kind: "remove-worktree-confirm",
            worktreePath: wt.path,
            worktreeName: wt.name,
            branch: wt.branch,
            hasUncommittedChanges: wt.status.hasUncommittedChanges,
            isMergedToMain: wt.status.isMergedToMain,
            sessionCount: wtSessions.length,
          });
        } else {
          result.push({
            kind: "remove-worktree-button",
            worktreePath: wt.path,
            worktreeName: wt.name,
          });
        }
      }
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

    // Show hidden worktree count hint (non-selectable) when not showing all
    if (hiddenEmptyCount > 0 && !showAllWorktrees) {
      result.push({ kind: "spacer" });
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
  }, [filteredSessions, worktrees, showAllWorktrees, repoRoot, isCreatingWorktree, removingWorktreePath]);

  // Current selectable item's position in the items array
  const currentItemIndex = selectableIndices[selectedIndex] ?? -1;

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

    // Remove confirmation mode guard
    if (removingWorktreePath !== null) {
      if (key.escape) {
        setRemovingWorktreePath(null);
        setRemoveDeleteBranch(true);
        setRemoveForce(false);
        return;
      }
      if (key.return) {
        const item = items[currentItemIndex];
        if (item?.kind === "remove-worktree-confirm") {
          if (item.hasUncommittedChanges && !removeForce) {
            showNotification("!Toggle [f]orce to remove with uncommitted changes");
            return;
          }
          if (repoRoot) {
            removeWorktreeWs(repoRoot, item.worktreePath, removeForce, removeDeleteBranch);
            showNotification("Removing worktree...");
          }
        }
        return;
      }
      if (input === "f" || input === "F") {
        setRemoveForce((prev) => !prev);
        return;
      }
      if (input === "b" || input === "B") {
        setRemoveDeleteBranch((prev) => !prev);
        return;
      }
      // Arrow keys cancel confirmation and fall through to normal navigation
      if (key.upArrow || key.downArrow) {
        setRemovingWorktreePath(null);
        setRemoveDeleteBranch(true);
        setRemoveForce(false);
        // fall through
      } else {
        return; // swallow other keys
      }
    }

    if (key.escape) {
      returnToMain();
      return;
    }

    if (key.upArrow) {
      if (selectedIndex > 0) {
        setSelectedIndex((prev) => prev - 1);
        setScrollBias(0);
      } else {
        setScrollBias((prev) => prev + 1);
      }
      return;
    }

    if (key.downArrow) {
      if (selectedIndex < selectableIndices.length - 1) {
        setSelectedIndex((prev) => prev + 1);
        setScrollBias(0);
      } else {
        setScrollBias((prev) => prev - 1);
      }
      return;
    }

    // Any other key resets scroll bias
    setScrollBias(0);

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
      } else if (item.kind === "remove-worktree-button") {
        setRemovingWorktreePath(item.worktreePath);
        setRemoveDeleteBranch(true);
        setRemoveForce(false);
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

    // d — toggle details (show/hide empty worktrees)
    if (input === "d") {
      setShowAllWorktrees((prev) => !prev);
      return;
    }

    // h — toggle help/shortcuts
    if (input === "h") {
      setShowHelp((prev) => !prev);
      return;
    }

    // x — clear selection
    if (input === "x") {
      setSelectedIds(new Set());
      return;
    }
  }, [
    selectableIndices, items, currentItemIndex, selectedIds, selectedIndex,
    returnToMain, focusTerminal, maximizeWindow, tileWindows, launchSession,
    showNotification, isCreatingWorktree, newWorktreeName,
    repoRoot, createWorktreeWs, removeWorktreeWs, skipPermissions,
    removingWorktreePath, removeForce, removeDeleteBranch,
  ]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setSelectedIds(new Set());
    setScrollBias(0);
    setShowAllWorktrees(false);
    setIsCreatingWorktree(false);
    setNewWorktreeName("");
    setWorktreeCreateError(null);
    setRemovingWorktreePath(null);
    setRemoveDeleteBranch(true);
    setRemoveForce(false);
  }, []);

  return {
    items,
    selectableIndices,
    selectedIndex,
    selectedIds,
    showHelp,
    scrollBias,
    isCreatingWorktree,
    newWorktreeName,
    worktreeCreateError,
    isRemovingWorktree: removingWorktreePath !== null,
    removeDeleteBranch,
    removeForce,
    handleInput,
    reset,
  };
}
