/**
 * Project name utilities for git worktree support.
 *
 * Sessions from the same git repo (including worktrees) should display
 * the git repo root name, not the worktree directory name.
 * Mirrors gui/src/utils/git.ts getProjectGroupKey().
 */

/**
 * Get the display name for a session's project.
 * Uses basename of git_repo_root when available, falls back to project name.
 */
export function getProjectGroupKey(session: { git_repo_root?: string | null; project: string }): string {
  if (session.git_repo_root) {
    return session.git_repo_root.split('/').pop() || session.project;
  }
  return session.project;
}
