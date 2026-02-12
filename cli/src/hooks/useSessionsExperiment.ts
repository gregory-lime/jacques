/**
 * useSessionsExperiment Hook
 *
 * Scrollable list of active sessions grouped by worktree.
 * Supports multi-select for tiling, vim-style keyboard navigation,
 * new-session/new-worktree buttons, and worktree visibility toggle.
 */

import { useState, useCallback, useMemo, useEffect } from "react";

import type { Key } from "ink";
import type { Session, DiscoveredProject, WorktreeWithStatus } from "@jacques/core";
import type { WorktreeItem } from "./useWorktrees.js";
import { validateWorktreeName } from "./useWorktrees.js";
import type { CreateWorktreeResult, RemoveWorktreeResult } from "./useJacquesClient.js";
import { buildSessionItems } from "../utils/sessions-items-builder.js";

// ---- Content item types ----

export type ContentItem =
  | { kind: "project-header"; projectName: string; gitRepoRoot: string | null; sessionCount: number; isCurrent: boolean }
  | { kind: "worktree-header"; name: string; branch: string | null; isMain: boolean; sessionCount: number; ahead?: number; behind?: number; dirty?: boolean; merged?: boolean }
  | { kind: "session"; session: Session }
  | { kind: "spacer" }
  | { kind: "new-session-button"; worktreePath: string }
  | { kind: "new-worktree-button"; targetRepoRoot?: string }
  | { kind: "new-worktree-input" }
  | { kind: "show-all-worktrees-button"; hiddenCount: number }
  | { kind: "remove-worktree-button"; worktreePath: string; worktreeName: string }
  | { kind: "remove-worktree-confirm"; worktreePath: string; worktreeName: string; branch: string | null; hasUncommittedChanges: boolean; isMergedToMain: boolean; sessionCount: number };

// ---- Params & Return ----

export interface UseSessionsExperimentParams {
  sessions: Session[];
  allProjects: DiscoveredProject[];
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
  listWorktreesWs: (repoRoot: string) => void;
  worktreesByRepo: Map<string, WorktreeWithStatus[]>;
  repoRoot: string | null;
  refreshWorktrees: () => void;
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
  creatingForRepoRoot: string | null;
  isRemovingWorktree: boolean;
  removeDeleteBranch: boolean;
  removeForce: boolean;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useSessionsExperiment({
  sessions,
  allProjects,
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
  listWorktreesWs,
  worktreesByRepo,
  repoRoot,
  refreshWorktrees,
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
  const [creatingForRepoRoot, setCreatingForRepoRoot] = useState<string | null>(null);
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

  // Sort sessions (focused first, then by registration time)
  const sortedSessions = useMemo(() => {
    const sorted = [...sessions];
    sorted.sort((a, b) => {
      if (a.session_id === focusedSessionId) return -1;
      if (b.session_id === focusedSessionId) return 1;
      return a.registered_at - b.registered_at;
    });
    return sorted;
  }, [sessions, focusedSessionId]);

  // Group sessions by project and build flat content list
  const { items, selectableIndices } = useMemo(() => {
    return buildSessionItems({
      sortedSessions, allProjects, worktrees, selectedProject,
      showAllWorktrees, isCreatingWorktree, removingWorktreePath,
      repoRoot, worktreesByRepo,
    });
  }, [sortedSessions, worktrees, showAllWorktrees, repoRoot, isCreatingWorktree, removingWorktreePath, selectedProject, allProjects, worktreesByRepo]);

  // Current selectable item's position in the items array
  const currentItemIndex = selectableIndices[selectedIndex] ?? -1;

  const handleInput = useCallback((input: string, key: Key) => {
    // Creation mode guard
    if (isCreatingWorktree) {
      if (key.escape) {
        setIsCreatingWorktree(false);
        setNewWorktreeName("");
        setWorktreeCreateError(null);
        setCreatingForRepoRoot(null);
        return;
      }
      if (key.return) {
        const validationError = validateWorktreeName(newWorktreeName);
        if (validationError) {
          setWorktreeCreateError(validationError);
          return;
        }
        const targetRoot = creatingForRepoRoot || repoRoot;
        if (targetRoot) {
          createWorktreeWs(targetRoot, newWorktreeName, undefined, skipPermissions || undefined);
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
        setCreatingForRepoRoot(item.targetRepoRoot || null);
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
      setShowAllWorktrees((prev) => {
        const next = !prev;
        if (next) {
          // Fetch worktrees for all git projects
          for (const project of allProjects) {
            if (project.gitRepoRoot) {
              listWorktreesWs(project.gitRepoRoot);
            }
          }
        }
        return next;
      });
      refreshWorktrees();
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
    showNotification, isCreatingWorktree, newWorktreeName, creatingForRepoRoot,
    repoRoot, refreshWorktrees, createWorktreeWs, removeWorktreeWs, listWorktreesWs, skipPermissions,
    removingWorktreePath, removeForce, removeDeleteBranch, allProjects,
  ]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setSelectedIds(new Set());
    setScrollBias(0);
    setShowAllWorktrees(false);
    setIsCreatingWorktree(false);
    setNewWorktreeName("");
    setWorktreeCreateError(null);
    setCreatingForRepoRoot(null);
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
    creatingForRepoRoot,
    isRemovingWorktree: removingWorktreePath !== null,
    removeDeleteBranch,
    removeForce,
    handleInput,
    reset,
  };
}
