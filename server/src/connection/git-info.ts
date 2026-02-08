/**
 * Git Info Detection
 *
 * Detects git branch, worktree, and repo root for a given directory.
 * Uses native git commands (same logic as hooks/git-detect.sh).
 *
 * @module connection/git-info
 */

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(execCb);

/**
 * Git info for a working directory
 */
export interface GitInfo {
  /** Current branch name (e.g., "main", "feature/xyz") */
  branch: string | null;
  /** Worktree name (basename of worktree dir), only set for worktrees */
  worktree: string | null;
  /** Canonical git repo root path (main worktree root, shared across all worktrees) */
  repoRoot: string | null;
}

/**
 * Detect git info for a directory: branch, worktree name, and repo root.
 *
 * Uses `git rev-parse` to get the branch and common dir, then determines
 * whether the directory is a worktree based on the common dir location.
 *
 * @param cwd Directory to check for git info
 * @returns Git info with branch, worktree (if applicable), and repo root
 */
export async function detectGitInfo(cwd: string): Promise<GitInfo> {
  try {
    const { stdout } = await execAsync(
      `git -C "${cwd}" rev-parse --abbrev-ref HEAD --git-common-dir`,
      { timeout: 2000 }
    );

    if (!stdout.trim()) {
      return { branch: null, worktree: null, repoRoot: null };
    }

    const lines = stdout.trim().split('\n');
    const branch = lines[0] || null;
    const commonDir = lines[1];

    if (!commonDir) {
      return { branch, worktree: null, repoRoot: null };
    }

    let worktree: string | null = null;
    let repoRoot: string | null = null;

    if (commonDir === '.git') {
      // Normal repo (not a worktree) - cwd is the repo root
      repoRoot = cwd;
    } else {
      // Worktree - commonDir is absolute path to shared .git
      repoRoot = path.dirname(commonDir);
      worktree = path.basename(cwd);
    }

    return { branch, worktree, repoRoot };
  } catch {
    // Not a git repo or git not available
    return { branch: null, worktree: null, repoRoot: null };
  }
}
