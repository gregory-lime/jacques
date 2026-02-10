/**
 * useWorktrees Hook
 *
 * Manages worktree list, creation, and removal state.
 * Communicates with the server via WebSocket for git worktree operations.
 */

import { useState, useCallback, useEffect } from "react";
import type { Key } from "ink";
import type { WorktreeWithStatus } from "@jacques/core";
import type { ListWorktreesResult, CreateWorktreeResult, RemoveWorktreeResult } from "./useJacquesClient.js";

export interface WorktreeItem extends WorktreeWithStatus {
  sessionCount: number;
}

export interface UseWorktreesParams {
  listWorktreesWs: (repoRoot: string) => void;
  createWorktreeWs: (repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => void;
  removeWorktreeWs: (repoRoot: string, path: string, force?: boolean, deleteBranch?: boolean) => void;
  launchSession: (cwd: string, dangerouslySkipPermissions?: boolean) => void;
  listWorktreesResult: ListWorktreesResult | null;
  createWorktreeResult: CreateWorktreeResult | null;
  removeWorktreeResult: RemoveWorktreeResult | null;
  showNotification: (msg: string) => void;
  returnToMain: () => void;
  sessions: Array<{ cwd?: string; git_worktree?: string }>;
}

export interface UseWorktreesReturn {
  worktrees: WorktreeItem[];
  loading: boolean;
  error: string | null;
  selectedIndex: number;
  scrollOffset: number;
  isCreating: boolean;
  newName: string;
  createError: string | null;
  isConfirmingRemove: boolean;
  repoRoot: string | null;
  isGitProject: boolean;
  open: (repoRoot: string | null) => void;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function validateWorktreeName(name: string): string | null {
  if (!name) return "Name cannot be empty";
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return "Only letters, numbers, hyphens, underscores";
  if (name.length > 50) return "Name too long (max 50 chars)";
  return null;
}

export function useWorktrees({
  listWorktreesWs,
  createWorktreeWs,
  removeWorktreeWs,
  launchSession,
  listWorktreesResult,
  createWorktreeResult,
  removeWorktreeResult,
  showNotification,
  returnToMain,
  sessions,
}: UseWorktreesParams): UseWorktreesReturn {
  const [worktrees, setWorktrees] = useState<WorktreeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const [isGitProject, setIsGitProject] = useState(false);

  // Handle list_worktrees_result
  useEffect(() => {
    if (!listWorktreesResult) return;
    setLoading(false);
    if (listWorktreesResult.success && listWorktreesResult.worktrees) {
      const items: WorktreeItem[] = listWorktreesResult.worktrees.map((wt) => {
        // Count sessions in this worktree
        const count = sessions.filter(
          (s) => (s.cwd && (s.cwd === wt.path || s.cwd.startsWith(wt.path + '/'))) || s.git_worktree === wt.name
        ).length;
        return { ...wt, sessionCount: count };
      });
      // Main worktree first, then alphabetical
      items.sort((a, b) => {
        if (a.isMain && !b.isMain) return -1;
        if (!a.isMain && b.isMain) return 1;
        return a.name.localeCompare(b.name);
      });
      setWorktrees(items);
    } else {
      setError(listWorktreesResult.error || "Failed to list worktrees");
    }
  }, [listWorktreesResult, sessions]);

  // Handle create_worktree_result
  useEffect(() => {
    if (!createWorktreeResult) return;
    if (createWorktreeResult.success) {
      showNotification(`Worktree created: ${createWorktreeResult.branch || newName}`);
      setIsCreating(false);
      setNewName("");
      setCreateError(null);
      // Refresh list
      if (repoRoot) {
        setLoading(true);
        listWorktreesWs(repoRoot);
      }
    } else {
      setCreateError(createWorktreeResult.error || "Failed to create worktree");
    }
  }, [createWorktreeResult]);

  // Handle remove_worktree_result
  useEffect(() => {
    if (!removeWorktreeResult) return;
    if (removeWorktreeResult.success) {
      showNotification("Worktree removed");
      setIsConfirmingRemove(false);
      // Refresh list
      if (repoRoot) {
        setLoading(true);
        listWorktreesWs(repoRoot);
      }
    } else {
      showNotification(`!Remove failed: ${removeWorktreeResult.error || "unknown"}`);
      setIsConfirmingRemove(false);
    }
  }, [removeWorktreeResult]);

  const open = useCallback((root: string | null) => {
    setError(null);
    setSelectedIndex(0);
    setScrollOffset(0);
    setIsCreating(false);
    setNewName("");
    setCreateError(null);
    setIsConfirmingRemove(false);

    if (!root) {
      setRepoRoot(null);
      setIsGitProject(false);
      setWorktrees([]);
      return;
    }

    setRepoRoot(root);
    setIsGitProject(true);
    setLoading(true);
    listWorktreesWs(root);
  }, [listWorktreesWs]);

  const handleInput = useCallback((input: string, key: Key) => {
    // Remove confirmation mode
    if (isConfirmingRemove) {
      if (input === "y" || input === "Y") {
        const wt = worktrees[selectedIndex];
        if (wt && repoRoot) {
          removeWorktreeWs(repoRoot, wt.path, false, false);
        }
        return;
      }
      if (input === "f" || input === "F") {
        const wt = worktrees[selectedIndex];
        if (wt && repoRoot) {
          removeWorktreeWs(repoRoot, wt.path, true, true);
        }
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        setIsConfirmingRemove(false);
        return;
      }
      return;
    }

    // Create mode
    if (isCreating) {
      if (key.escape) {
        setIsCreating(false);
        setNewName("");
        setCreateError(null);
        return;
      }
      if (key.return) {
        const validationError = validateWorktreeName(newName);
        if (validationError) {
          setCreateError(validationError);
          return;
        }
        if (repoRoot) {
          createWorktreeWs(repoRoot, newName);
          showNotification("Creating worktree...");
        }
        return;
      }
      if (key.backspace || key.delete) {
        setNewName((prev) => prev.slice(0, -1));
        setCreateError(null);
        return;
      }
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setNewName((prev) => prev + input);
        setCreateError(null);
        return;
      }
      return;
    }

    // Normal mode
    if (key.escape) {
      returnToMain();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const next = Math.min(worktrees.length - 1, prev + 1);
        const VISIBLE = 5;
        if (next >= scrollOffset + VISIBLE) {
          setScrollOffset(next - VISIBLE + 1);
        }
        return next;
      });
      return;
    }

    // Enter — launch session in selected worktree
    if (key.return && worktrees.length > 0) {
      const wt = worktrees[selectedIndex];
      if (wt) {
        showNotification("Launching session...");
        launchSession(wt.path);
      }
      return;
    }

    // a — add (create) worktree
    if (input === "a" || input === "A") {
      if (!isGitProject || !repoRoot) {
        showNotification("Not a git project");
        return;
      }
      setIsCreating(true);
      setNewName("");
      setCreateError(null);
      return;
    }

    // d — delete (remove) worktree
    if (input === "d" || input === "D") {
      if (worktrees.length === 0) return;
      const wt = worktrees[selectedIndex];
      if (wt?.isMain) {
        showNotification("Cannot remove the main worktree");
        return;
      }
      setIsConfirmingRemove(true);
      return;
    }
  }, [isCreating, isConfirmingRemove, worktrees, selectedIndex, scrollOffset, repoRoot, isGitProject, newName, returnToMain, listWorktreesWs, createWorktreeWs, removeWorktreeWs, launchSession, showNotification]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
    setIsCreating(false);
    setNewName("");
    setCreateError(null);
    setIsConfirmingRemove(false);
    setError(null);
  }, []);

  return {
    worktrees,
    loading,
    error,
    selectedIndex,
    scrollOffset,
    isCreating,
    newName,
    createError,
    isConfirmingRemove,
    repoRoot,
    isGitProject,
    open,
    handleInput,
    reset,
  };
}
