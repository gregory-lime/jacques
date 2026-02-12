/**
 * Git utility functions for project grouping.
 *
 * Sessions from the same git repo (including worktrees) should be grouped
 * together. The `git_repo_root` field provides the canonical identity.
 *
 * Canonical source: @jacques-ai/core getProjectGroupKey (core/src/cache/project-discovery.ts)
 * Duplicated here because GUI is a browser app and cannot import from core (Node.js APIs).
 */

/**
 * Get the project group key for a session.
 * Uses basename of git_repo_root when available, falls back to project name.
 */
export function getProjectGroupKey(session: { git_repo_root?: string | null; project: string }): string {
  if (session.git_repo_root) {
    return session.git_repo_root.split(/[\\/]/).pop() || session.project;
  }
  return session.project;
}
