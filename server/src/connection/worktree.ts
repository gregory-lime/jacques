/**
 * Worktree Management
 *
 * Creates, lists, inspects, and removes git worktrees for the project.
 * Extends git-info.ts (read-only detection) with write operations.
 *
 * @module connection/worktree
 */

import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import * as path from 'path';

const execAsync = promisify(execCb);

// ─── Types ────────────────────────────────────────────────────

export interface CreateWorktreeOptions {
  /** Canonical git repo root (main worktree root) */
  repoRoot: string;
  /** Name for the new worktree (used as directory suffix and branch name) */
  name: string;
  /** Base branch to create from (defaults to HEAD) */
  baseBranch?: string;
}

export interface CreateWorktreeResult {
  success: boolean;
  /** Absolute path to the new worktree directory */
  worktreePath?: string;
  /** Branch name created for the worktree */
  branch?: string;
  error?: string;
}

export interface WorktreeEntry {
  /** Worktree name (basename of directory) */
  name: string;
  /** Absolute path to worktree directory */
  path: string;
  /** Branch checked out in this worktree */
  branch: string | null;
  /** Whether this is the main worktree */
  isMain: boolean;
}

export interface WorktreeStatus {
  /** Whether the worktree has uncommitted changes (staged or unstaged) */
  hasUncommittedChanges: boolean;
  /** Whether the worktree branch has been merged into the default branch */
  isMergedToMain: boolean;
}

export interface WorktreeWithStatus extends WorktreeEntry {
  status: WorktreeStatus;
}

export interface RemoveWorktreeOptions {
  /** Canonical git repo root (main worktree root) */
  repoRoot: string;
  /** Absolute path of the worktree to remove */
  worktreePath: string;
  /** Force removal even with uncommitted changes */
  force?: boolean;
  /** Also delete the branch after removing the worktree */
  deleteBranch?: boolean;
}

export interface RemoveWorktreeResult {
  success: boolean;
  error?: string;
  /** Whether the branch was also deleted */
  branchDeleted?: boolean;
}

// ─── Validation ───────────────────────────────────────────────

const VALID_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function validateWorktreeName(name: string): string | null {
  if (!name) return 'Name is required';
  if (!VALID_NAME_RE.test(name)) return 'Name must contain only letters, numbers, hyphens, and underscores';
  if (name.length > 100) return 'Name must be 100 characters or fewer';
  return null;
}

/**
 * Compute the worktree path: sibling to repo root with name suffix.
 * e.g. /path/to/project → /path/to/project-<name>
 */
export function computeWorktreePath(repoRoot: string, name: string): string {
  const parent = path.dirname(repoRoot);
  const base = path.basename(repoRoot);
  return path.join(parent, `${base}-${name}`);
}

// ─── Create Worktree ──────────────────────────────────────────

/**
 * Create a new git worktree as a sibling directory.
 *
 * Runs `git worktree add -b <name> <path>` which creates both
 * the worktree directory and a new branch.
 */
export async function createWorktree(options: CreateWorktreeOptions): Promise<CreateWorktreeResult> {
  const { repoRoot, name, baseBranch } = options;

  // Validate name
  const nameError = validateWorktreeName(name);
  if (nameError) {
    return { success: false, error: nameError };
  }

  // Validate repo root exists
  if (!existsSync(repoRoot)) {
    return { success: false, error: `Repository root does not exist: ${repoRoot}` };
  }

  // Compute target path
  const worktreePath = computeWorktreePath(repoRoot, name);

  // Check directory doesn't already exist
  if (existsSync(worktreePath)) {
    return { success: false, error: `Directory already exists: ${worktreePath}` };
  }

  // Build git command
  const baseArg = baseBranch ? ` ${baseBranch}` : '';
  const escapedPath = worktreePath.replace(/'/g, "'\\''");
  const cmd = `git -C '${repoRoot.replace(/'/g, "'\\''")}' worktree add -b '${name}' '${escapedPath}'${baseArg}`;

  try {
    await execAsync(cmd, { timeout: 15000 });
    return {
      success: true,
      worktreePath,
      branch: name,
    };
  } catch (err) {
    const message = err instanceof Error ? (err as Error & { stderr?: string }).stderr || err.message : String(err);

    // Detect common git errors
    if (message.includes('already exists')) {
      if (message.includes('branch')) {
        return { success: false, error: `Branch '${name}' already exists` };
      }
      return { success: false, error: `Worktree or directory already exists for '${name}'` };
    }

    return { success: false, error: `Git worktree add failed: ${message.trim()}` };
  }
}

// ─── List Worktrees ───────────────────────────────────────────

/**
 * List all worktrees for a repository.
 * Prunes stale entries first, then wraps `git worktree list --porcelain`.
 */
export async function listWorktrees(repoRoot: string): Promise<WorktreeEntry[]> {
  try {
    const escapedRoot = repoRoot.replace(/'/g, "'\\''");

    // Prune stale worktree entries (directories already removed)
    try {
      await execAsync(`git -C '${escapedRoot}' worktree prune`, { timeout: 5000 });
    } catch {
      // Prune failure is non-fatal
    }

    const { stdout } = await execAsync(
      `git -C '${escapedRoot}' worktree list --porcelain`,
      { timeout: 5000 }
    );

    return parsePorcelainOutput(stdout, repoRoot);
  } catch {
    return [];
  }
}

/**
 * Parse `git worktree list --porcelain` output into structured entries.
 *
 * Format:
 *   worktree /path/to/main
 *   HEAD abc123
 *   branch refs/heads/main
 *   (blank line)
 *   worktree /path/to/other
 *   HEAD def456
 *   branch refs/heads/feature
 *   (blank line)
 */
export function parsePorcelainOutput(output: string, repoRoot: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  const blocks = output.trim().split('\n\n');

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.trim().split('\n');
    let worktreePath = '';
    let branch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktreePath = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        // refs/heads/main → main
        branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      }
    }

    if (worktreePath) {
      const resolvedRoot = path.resolve(repoRoot);
      const resolvedWorktree = path.resolve(worktreePath);
      entries.push({
        name: path.basename(worktreePath),
        path: worktreePath,
        branch,
        isMain: resolvedWorktree === resolvedRoot,
      });
    }
  }

  return entries;
}

// ─── Worktree Status ─────────────────────────────────────────

/**
 * Detect the default branch for a repository (main or master).
 * Tries `git symbolic-ref refs/remotes/origin/HEAD`, falls back to checking
 * if 'main' or 'master' branch exists locally.
 */
export async function detectDefaultBranch(repoRoot: string): Promise<string> {
  const escaped = repoRoot.replace(/'/g, "'\\''");

  // Try symbolic-ref first (requires remote tracking)
  try {
    const { stdout } = await execAsync(
      `git -C '${escaped}' symbolic-ref refs/remotes/origin/HEAD`,
      { timeout: 5000 }
    );
    const ref = stdout.trim().replace(/^refs\/remotes\/origin\//, '');
    if (ref) return ref;
  } catch {
    // No remote HEAD configured
  }

  // Fall back: check if 'main' branch exists
  try {
    await execAsync(`git -C '${escaped}' rev-parse --verify refs/heads/main`, { timeout: 5000 });
    return 'main';
  } catch {
    // 'main' doesn't exist
  }

  // Final fallback: assume 'master'
  return 'master';
}

/**
 * Check status of a single worktree: uncommitted changes and merge status.
 */
export async function checkWorktreeStatus(
  worktreePath: string,
  branch: string | null,
  defaultBranch: string,
  repoRoot: string,
): Promise<WorktreeStatus> {
  const escapedPath = worktreePath.replace(/'/g, "'\\''");
  const escapedRoot = repoRoot.replace(/'/g, "'\\''");

  // Check for uncommitted changes
  let hasUncommittedChanges = false;
  try {
    const { stdout } = await execAsync(
      `git -C '${escapedPath}' status --porcelain`,
      { timeout: 5000 }
    );
    hasUncommittedChanges = stdout.trim().length > 0;
  } catch {
    // If status fails, assume clean
  }

  // Check if branch is merged into default branch.
  // Three cases:
  // 1. Branch is NOT an ancestor of default → has unmerged work → not merged
  // 2. Branch IS an ancestor AND its tip is on default's first-parent line
  //    → branch just points at an old mainline commit (no unique work) → not merged
  // 3. Branch IS an ancestor AND its tip is NOT on default's first-parent line
  //    → branch was merged via merge commit → merged
  let isMergedToMain = false;
  if (branch && branch !== defaultBranch) {
    try {
      // Step 1: is the branch an ancestor of the default branch?
      await execAsync(
        `git -C '${escapedRoot}' merge-base --is-ancestor '${branch}' '${defaultBranch}'`,
        { timeout: 5000 }
      );

      // Branch IS an ancestor — check if it was merged or is just at an old commit
      const { stdout: tipOut } = await execAsync(
        `git -C '${escapedRoot}' rev-parse '${branch}'`,
        { timeout: 5000 }
      );
      const branchTip = tipOut.trim();

      // Step 2: check if branch tip is on default branch's first-parent line
      let isOnFirstParentLine = false;
      try {
        const { stdout: fpCommits } = await execAsync(
          `git -C '${escapedRoot}' rev-list --first-parent '${branchTip}^..${defaultBranch}'`,
          { timeout: 10000 }
        );
        isOnFirstParentLine = fpCommits.split('\n').some(h => h.trim() === branchTip);
      } catch {
        // rev-list failed (e.g., root commit has no parent)
        isOnFirstParentLine = false;
      }

      // On first-parent line → just at old mainline commit, not "merged"
      // NOT on first-parent line → was merged via merge commit
      isMergedToMain = !isOnFirstParentLine;
    } catch {
      // is-ancestor failed → not merged
      isMergedToMain = false;
    }
  }

  return { hasUncommittedChanges, isMergedToMain };
}

/**
 * List all worktrees with their status (uncommitted changes, merge status).
 * Returns all worktrees including main.
 */
export async function listWorktreesWithStatus(repoRoot: string): Promise<WorktreeWithStatus[]> {
  const entries = await listWorktrees(repoRoot);
  if (entries.length === 0) return [];

  const defaultBranch = await detectDefaultBranch(repoRoot);

  const results: WorktreeWithStatus[] = [];
  for (const entry of entries) {
    if (entry.isMain) {
      // Main worktree: skip status check, always safe
      results.push({
        ...entry,
        status: { hasUncommittedChanges: false, isMergedToMain: true },
      });
      continue;
    }

    const status = await checkWorktreeStatus(
      entry.path,
      entry.branch,
      defaultBranch,
      repoRoot,
    );
    results.push({ ...entry, status });
  }

  return results;
}

// ─── Remove Worktree ─────────────────────────────────────────

/**
 * Remove a git worktree and optionally delete its branch.
 *
 * Runs `git worktree remove <path>` with optional --force flag.
 * If deleteBranch is true, also runs `git branch -d <branch>`.
 */
export async function removeWorktree(options: RemoveWorktreeOptions): Promise<RemoveWorktreeResult> {
  const { repoRoot, worktreePath, force, deleteBranch } = options;
  const escapedRoot = repoRoot.replace(/'/g, "'\\''");
  const escapedPath = worktreePath.replace(/'/g, "'\\''");

  // Validate repo root exists
  if (!existsSync(repoRoot)) {
    return { success: false, error: `Repository root does not exist: ${repoRoot}` };
  }

  // Validate worktree path exists
  if (!existsSync(worktreePath)) {
    return { success: false, error: `Worktree does not exist: ${worktreePath}` };
  }

  // Don't allow removing the main worktree
  if (path.resolve(worktreePath) === path.resolve(repoRoot)) {
    return { success: false, error: 'Cannot remove the main worktree' };
  }

  // Detect branch name before removal (needed for branch deletion)
  let branchName: string | null = null;
  if (deleteBranch) {
    try {
      const { stdout } = await execAsync(
        `git -C '${escapedPath}' rev-parse --abbrev-ref HEAD`,
        { timeout: 5000 }
      );
      branchName = stdout.trim() || null;
    } catch {
      // Can't detect branch, skip branch deletion
    }
  }

  // Remove the worktree
  const forceFlag = force ? ' --force' : '';
  const cmd = `git -C '${escapedRoot}' worktree remove '${escapedPath}'${forceFlag}`;

  try {
    await execAsync(cmd, { timeout: 15000 });
  } catch (err) {
    const message = err instanceof Error ? (err as Error & { stderr?: string }).stderr || err.message : String(err);

    if (message.includes('untracked') || message.includes('modified')) {
      return { success: false, error: `Worktree has uncommitted changes. Use force to remove anyway.` };
    }

    return { success: false, error: `Git worktree remove failed: ${message.trim()}` };
  }

  // Optionally delete the branch
  let branchDeleted = false;
  if (deleteBranch && branchName) {
    const branchFlag = force ? '-D' : '-d';
    try {
      await execAsync(
        `git -C '${escapedRoot}' branch ${branchFlag} '${branchName}'`,
        { timeout: 5000 }
      );
      branchDeleted = true;
    } catch {
      // Branch deletion failed (e.g., not fully merged with -d), but worktree removal succeeded
    }
  }

  return { success: true, branchDeleted };
}
