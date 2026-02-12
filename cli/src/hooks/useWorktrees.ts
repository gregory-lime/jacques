/**
 * useWorktrees Hook
 *
 * Data provider for worktree list. Fetches worktrees via WebSocket
 * and enriches with session counts. Used by useSessionsExperiment.
 */

import { useState, useCallback, useEffect } from "react";
import type { WorktreeWithStatus } from "@jacques-ai/core";
import type { ListWorktreesResult } from "./useJacquesClient.js";

export interface WorktreeItem extends WorktreeWithStatus {
  sessionCount: number;
}

export interface UseWorktreesParams {
  listWorktreesWs: (repoRoot: string) => void;
  listWorktreesResult: ListWorktreesResult | null;
  sessions: Array<{ cwd?: string; git_worktree?: string }>;
}

export interface UseWorktreesReturn {
  worktrees: WorktreeItem[];
  repoRoot: string | null;
  open: (repoRoot: string | null) => void;
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
  listWorktreesResult,
  sessions,
}: UseWorktreesParams): UseWorktreesReturn {
  const [worktrees, setWorktrees] = useState<WorktreeItem[]>([]);
  const [repoRoot, setRepoRoot] = useState<string | null>(null);

  // Handle list_worktrees_result
  useEffect(() => {
    if (!listWorktreesResult) return;
    // Only process results for our own repo (ignore other projects' results)
    if (listWorktreesResult.repoRoot && repoRoot && listWorktreesResult.repoRoot !== repoRoot) return;
    if (listWorktreesResult.success && listWorktreesResult.worktrees) {
      const items: WorktreeItem[] = listWorktreesResult.worktrees.map((wt) => {
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
    }
  }, [listWorktreesResult, sessions]);

  const open = useCallback((root: string | null) => {
    if (!root) {
      setRepoRoot(null);
      setWorktrees([]);
      return;
    }
    setRepoRoot(root);
    listWorktreesWs(root);
  }, [listWorktreesWs]);

  const reset = useCallback(() => {
    // No-op — keep worktree data across view transitions
  }, []);

  return { worktrees, repoRoot, open, reset };
}
