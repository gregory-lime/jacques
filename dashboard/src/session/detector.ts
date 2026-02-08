/**
 * Session Detector
 *
 * Detects the current Claude Code session JSONL file.
 * Claude Code stores session history at:
 *   ~/.claude/projects/[encoded-directory-path]/[session-uuid].jsonl
 *
 * Encoding rule: Replace '/' with '-' (e.g., /Users/gole/Desktop/project → -Users-gole-Desktop-project)
 */

import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";

export interface SessionFile {
  /** Full path to the JSONL file */
  filePath: string;
  /** Session UUID (extracted from filename) */
  sessionId: string;
  /** Last modification time */
  modifiedAt: Date;
  /** File size in bytes */
  sizeBytes: number;
}

export interface DetectorOptions {
  /** Working directory to detect session for (defaults to process.cwd()) */
  cwd?: string;
  /** Path to Claude projects directory (defaults to ~/.claude/projects) */
  claudeProjectsDir?: string;
}

/**
 * Encode a directory path to Claude's format.
 * Replaces '/' with '-' (keeps leading dash).
 * Example: /Users/gole/Desktop/project -> -Users-gole-Desktop-project
 */
export function encodeProjectPath(dirPath: string): string {
  // Normalize the path and replace slashes with dashes
  const normalized = path.normalize(dirPath);
  return normalized.replace(/\//g, "-");
}

/**
 * Detect the current Claude session JSONL file.
 * Returns the most recently modified .jsonl file in the project directory.
 */
export async function detectCurrentSession(
  options: DetectorOptions = {}
): Promise<SessionFile | null> {
  const cwd = options.cwd || process.cwd();
  const claudeDir =
    options.claudeProjectsDir || path.join(os.homedir(), ".claude", "projects");

  // Encode the current directory path
  const encodedPath = encodeProjectPath(cwd);
  const projectDir = path.join(claudeDir, encodedPath);

  try {
    // Check if the project directory exists
    await fs.access(projectDir);
  } catch {
    // Project directory doesn't exist - no sessions for this project
    return null;
  }

  try {
    // Read all files in the project directory
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    if (jsonlFiles.length === 0) {
      return null;
    }

    // Get stats for all JSONL files
    const fileStats = await Promise.all(
      jsonlFiles.map(async (filename) => {
        const filePath = path.join(projectDir, filename);
        const stats = await fs.stat(filePath);
        return {
          filePath,
          filename,
          mtime: stats.mtime,
          size: stats.size,
        };
      })
    );

    // Sort by modification time (most recent first)
    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Return the most recent file
    const mostRecent = fileStats[0];
    const sessionId = path.basename(mostRecent.filename, ".jsonl");

    return {
      filePath: mostRecent.filePath,
      sessionId,
      modifiedAt: mostRecent.mtime,
      sizeBytes: mostRecent.size,
    };
  } catch (err) {
    console.error(`Error reading project directory: ${projectDir}`, err);
    return null;
  }
}

/**
 * List all session files for a project.
 * Returns sessions sorted by modification time (most recent first).
 */
export async function listProjectSessions(
  options: DetectorOptions = {}
): Promise<SessionFile[]> {
  const cwd = options.cwd || process.cwd();
  const claudeDir =
    options.claudeProjectsDir || path.join(os.homedir(), ".claude", "projects");

  const encodedPath = encodeProjectPath(cwd);
  const projectDir = path.join(claudeDir, encodedPath);

  try {
    await fs.access(projectDir);
  } catch {
    return [];
  }

  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    const fileStats = await Promise.all(
      jsonlFiles.map(async (filename) => {
        const filePath = path.join(projectDir, filename);
        const stats = await fs.stat(filePath);
        const sessionId = path.basename(filename, ".jsonl");

        return {
          filePath,
          sessionId,
          modifiedAt: stats.mtime,
          sizeBytes: stats.size,
        };
      })
    );

    // Sort by modification time (most recent first)
    return fileStats.sort(
      (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()
    );
  } catch {
    return [];
  }
}

/**
 * Get the expected project directory path for a given working directory.
 * Useful for debugging and testing.
 */
export function getProjectDirPath(
  cwd: string,
  claudeProjectsDir?: string
): string {
  const claudeDir =
    claudeProjectsDir || path.join(os.homedir(), ".claude", "projects");
  const encodedPath = encodeProjectPath(cwd);
  return path.join(claudeDir, encodedPath);
}

/**
 * Find a session file by session ID across all project directories.
 * This is useful when the cwd is incorrect but we know the session ID.
 */
export async function findSessionById(
  sessionId: string,
  claudeProjectsDir?: string
): Promise<SessionFile | null> {
  const claudeDir =
    claudeProjectsDir || path.join(os.homedir(), ".claude", "projects");

  try {
    // List all project directories
    const projectDirs = await fs.readdir(claudeDir);

    for (const projectDir of projectDirs) {
      // Skip hidden files/directories
      if (projectDir.startsWith(".")) continue;

      const projectPath = path.join(claudeDir, projectDir);
      const stat = await fs.stat(projectPath);
      if (!stat.isDirectory()) continue;

      // Check if the session file exists in this project
      const sessionFile = path.join(projectPath, `${sessionId}.jsonl`);
      try {
        const fileStat = await fs.stat(sessionFile);
        return {
          filePath: sessionFile,
          sessionId,
          modifiedAt: fileStat.mtime,
          sizeBytes: fileStat.size,
        };
      } catch {
        // File doesn't exist in this project, continue
      }
    }

    return null;
  } catch {
    return null;
  }
}
