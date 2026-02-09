/**
 * Git Utilities
 *
 * Detect git repository info (root, branch, worktree) for a project path.
 * Falls back to reading gitBranch from JSONL when filesystem detection fails.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { GitInfo } from "./types.js";
import { isNotFoundError, getErrorMessage } from "../logging/error-utils.js";
import { createLogger, type Logger } from "../logging/logger.js";

const logger: Logger = createLogger({ prefix: "[Git]" });

/**
 * Detect git info for a project path: repo root, branch, and worktree name.
 * If the path doesn't exist, walks up parent directories to find a git repo.
 */
export function detectGitInfo(projectPath: string): GitInfo {
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
      const output = execSync(
        `git -C "${candidate}" rev-parse --abbrev-ref HEAD --git-common-dir`,
        { encoding: "utf-8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();

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
