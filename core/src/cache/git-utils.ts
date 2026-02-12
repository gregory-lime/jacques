/**
 * Git Utilities
 *
 * Detect git repository info (root, branch, worktree) for a project path.
 * Falls back to reading gitBranch from JSONL when filesystem detection fails.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import type { GitInfo } from "./types.js";
import { isNotFoundError, getErrorMessage } from "../logging/error-utils.js";
import { createLogger, type Logger } from "../logging/logger.js";

const execAsync = promisify(execCb);
const logger: Logger = createLogger({ prefix: "[Git]" });

/**
 * Detect git info for a project path: repo root, branch, and worktree name.
 * If the path doesn't exist, walks up parent directories to find a git repo.
 *
 * Uses async exec to avoid blocking the Node.js event loop (important when
 * the server is embedded in the CLI — sync git calls freeze the TUI).
 */
export async function detectGitInfo(projectPath: string): Promise<GitInfo> {
  // Try the exact path first, then walk up parents if it doesn't exist
  const candidates = [projectPath];
  let dir = projectPath;
  while (true) {
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    candidates.push(parent);
    dir = parent;
  }

  for (const candidate of candidates) {
    try {
      const { stdout } = await execAsync(
        `git -C "${candidate}" rev-parse --abbrev-ref HEAD --git-common-dir`,
        { timeout: 5000 }
      );
      const output = stdout.trim();

      if (!output) continue;

      const lines = output.split("\n");
      const branch = lines[0] || undefined;
      const commonDir = lines[1];

      if (!commonDir) return { branch };

      // Resolve relative paths (e.g., "../.git" from subdirectories) to absolute
      const resolved = path.resolve(candidate, commonDir);

      let repoRoot: string;
      let worktree: string | undefined;

      if (resolved.endsWith(`${path.sep}.git`) || resolved.endsWith("/.git")) {
        // Normal repo or subdirectory: .git parent is repo root
        repoRoot = path.dirname(resolved);
      } else {
        // Worktree: common dir points to shared .git dir
        repoRoot = path.dirname(resolved);
        worktree = path.basename(projectPath);
      }

      return { repoRoot, branch, worktree };
    } catch {
      // This candidate didn't work, try the next parent
      continue;
    }
  }
  return {};
}

/**
 * Read the gitBranch field from early JSONL entries.
 * Used when detectGitInfo fails (e.g., deleted worktrees).
 */
export async function readGitBranchFromJsonl(jsonlPath: string): Promise<string | null> {
  try {
    const handle = await fs.open(jsonlPath, "r");
    try {
      const buf = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(buf, 0, 8192, 0);
      const chunk = buf.toString("utf-8", 0, bytesRead);
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (typeof entry.gitBranch === "string") {
            return entry.gitBranch;
          }
        } catch {
          // Partial line
        }
      }
    } finally {
      await handle.close();
    }
  } catch (err) {
    if (!isNotFoundError(err)) {
      logger.warn("Failed to read gitBranch from JSONL:", getErrorMessage(err));
    }
  }
  return null;
}

/**
 * Read the .git file in a worktree directory to extract the main repo root.
 * Worktree .git files contain: gitdir: /path/to/main-repo/.git/worktrees/<name>
 * Returns the repo root path, or null if not a worktree .git file.
 */
export async function readWorktreeRepoRoot(dirPath: string): Promise<string | null> {
  const dotGitPath = path.join(dirPath, ".git");
  try {
    const stat = await fs.stat(dotGitPath);
    if (!stat.isFile()) return null; // Regular .git directory, not a worktree

    const content = await fs.readFile(dotGitPath, "utf-8");
    const match = content.match(/^gitdir:\s*(.+)/m);
    if (!match) return null;

    const gitdir = match[1].trim();
    // Find .git/worktrees/ segment and extract repo root before it
    for (const marker of ["/.git/worktrees/", `${path.sep}.git${path.sep}worktrees${path.sep}`]) {
      const idx = gitdir.indexOf(marker);
      if (idx >= 0) return gitdir.substring(0, idx);
    }
    return null;
  } catch {
    return null;
  }
}
