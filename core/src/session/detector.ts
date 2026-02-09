/**
 * Session Detector
 *
 * Detects the current Claude Code session JSONL file.
 * Claude Code stores session history at:
 *   ~/.claude/projects/[encoded-directory-path]/[session-uuid].jsonl
 *
 * Encoding rule: Replace '/' with '-' (e.g., /Users/gole/Desktop/project → -Users-gole-Desktop-project)
 *
 * IMPORTANT: Claude Code encodes BOTH '/' AND '_' as '-', making naive
 * string-based reversal impossible. Use decodeProjectPath() which reads
 * the authoritative originalPath from sessions-index.json.
 */

import { promises as fs } from "fs";
import { getErrorMessage } from "../logging/error-utils.js";
import { createLogger, type Logger } from "../logging/logger.js";
import * as path from "path";
import * as os from "os";
import { getRootCatalogPath } from "../sources/config.js";

const logger: Logger = createLogger({ prefix: "[Detector]" });

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
 * Get the Claude projects directory path.
 *
 * Resolution order:
 *   1. CLAUDE_CONFIG_DIR env var + /projects
 *   2. rootPath from ~/.jacques/config.json + /projects
 *   3. Default: ~/.claude/projects
 *
 * Works cross-platform: macOS, Linux, and Windows.
 */
export function getClaudeProjectsDir(): string {
  const envDir = process.env.CLAUDE_CONFIG_DIR;
  if (envDir) {
    return path.join(envDir, "projects");
  }
  return path.join(getRootCatalogPath(), "projects");
}

/**
 * Get the Claude settings.json path.
 * Uses the same resolution logic as getClaudeProjectsDir().
 */
export function getClaudeSettingsPath(): string {
  const envDir = process.env.CLAUDE_CONFIG_DIR;
  if (envDir) {
    return path.join(envDir, "settings.json");
  }
  return path.join(getRootCatalogPath(), "settings.json");
}

/**
 * Encode a directory path to Claude's format.
 * Replaces path separators with '-' (keeps leading dash).
 * Example: /Users/gole/Desktop/project -> -Users-gole-Desktop-project
 *
 * Cross-platform: handles both '/' (Unix) and '\' (Windows) separators.
 * On Windows, also strips the drive letter colon (C:\foo → -C-foo).
 * TODO: verify encoding on actual Windows Claude Code installation
 */
export function encodeProjectPath(dirPath: string): string {
  // Normalize and convert to forward slashes for consistent encoding
  const normalized = path.normalize(dirPath).replace(/\\/g, "/");
  // Strip drive letter colon on Windows (C:/foo → C/foo)
  const noDriveColon = normalized.replace(/^([A-Za-z]):/, "$1");
  return noDriveColon.replace(/\//g, "-");
}

/**
 * Read the originalPath field from a project's sessions-index.json.
 * Claude Code stores the real filesystem path here, which is the only
 * reliable way to reverse the encoded directory name.
 */
async function readOriginalPath(
  encodedDir: string,
  claudeProjectsDir?: string
): Promise<string | null> {
  const claudeDir = claudeProjectsDir || getClaudeProjectsDir();
  const indexPath = path.join(claudeDir, encodedDir, "sessions-index.json");
  try {
    const content = await fs.readFile(indexPath, "utf-8");
    const data = JSON.parse(content);
    return typeof data.originalPath === "string" ? data.originalPath : null;
  } catch {
    return null;
  }
}

/**
 * Read the cwd field from the first available JSONL entry in a project directory.
 * This provides the real project path when sessions-index.json is unavailable.
 */
async function readCwdFromJsonl(
  encodedDir: string,
  claudeProjectsDir?: string
): Promise<string | null> {
  const claudeDir = claudeProjectsDir || getClaudeProjectsDir();
  const projectDir = path.join(claudeDir, encodedDir);
  try {
    const entries = await fs.readdir(projectDir);
    const jsonlFile = entries.find((e) => e.endsWith(".jsonl"));
    if (!jsonlFile) return null;

    const filePath = path.join(projectDir, jsonlFile);
    const handle = await fs.open(filePath, "r");
    try {
      // Read just enough to get the first few lines (cwd appears early)
      const buf = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(buf, 0, 8192, 0);
      const chunk = buf.toString("utf-8", 0, bytesRead);
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (typeof entry.cwd === "string") {
            return entry.cwd;
          }
        } catch {
          // Partial JSON line, skip
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    // Directory unreadable or no JSONL files
  }
  return null;
}

/**
 * Naive decode: replace all dashes with slashes.
 * This is WRONG for paths containing dashes or underscores, but serves
 * as a fallback when sessions-index.json is unavailable.
 */
export function decodeProjectPathNaive(encodedDir: string): string {
  if (!encodedDir.startsWith("-")) {
    return encodedDir;
  }
  return "/" + encodedDir.slice(1).split("-").join("/");
}

/**
 * Decode an encoded project directory name to the real filesystem path.
 *
 * Resolution order:
 *   1. sessions-index.json originalPath (authoritative, written by Claude Code)
 *   2. cwd field from first JSONL entry (reliable, written at session start)
 *   3. Naive decode: replace all dashes with slashes (last resort, often wrong)
 */
export async function decodeProjectPath(
  encodedDir: string,
  claudeProjectsDir?: string
): Promise<string> {
  const original = await readOriginalPath(encodedDir, claudeProjectsDir);
  if (original) return original;

  const cwdPath = await readCwdFromJsonl(encodedDir, claudeProjectsDir);
  if (cwdPath) return cwdPath;

  return decodeProjectPathNaive(encodedDir);
}

/**
 * Detect the current Claude session JSONL file.
 * Returns the most recently modified .jsonl file in the project directory.
 */
export async function detectCurrentSession(
  options: DetectorOptions = {}
): Promise<SessionFile | null> {
  const cwd = options.cwd || process.cwd();
  const claudeDir = options.claudeProjectsDir || getClaudeProjectsDir();

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
    logger.error(`Error reading project directory ${projectDir}:`, getErrorMessage(err));
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
  const claudeDir = options.claudeProjectsDir || getClaudeProjectsDir();

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
  const claudeDir = claudeProjectsDir || getClaudeProjectsDir();
  const encodedPath = encodeProjectPath(cwd);
  return path.join(claudeDir, encodedPath);
}

/**
 * Subagent file info
 */
export interface SubagentFile {
  /** Full path to the subagent JSONL file */
  filePath: string;
  /** Agent ID extracted from filename (e.g., "a0323e0") */
  agentId: string;
  /** Last modification time */
  modifiedAt: Date;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * List all subagent JSONL files for a given session.
 * Claude Code stores subagent conversations in:
 *   {session-id}/subagents/agent-{agentId}.jsonl
 *
 * @param sessionFilePath Path to the main session JSONL file
 * @returns Array of subagent files found
 */
export async function listSubagentFiles(
  sessionFilePath: string
): Promise<SubagentFile[]> {
  // The subagents directory is at {session-id}/subagents/ relative to the session file
  const sessionDir = sessionFilePath.replace(".jsonl", "");
  const subagentsDir = path.join(sessionDir, "subagents");

  try {
    await fs.access(subagentsDir);
  } catch {
    // No subagents directory exists for this session
    return [];
  }

  try {
    const files = await fs.readdir(subagentsDir);
    const subagentFiles: SubagentFile[] = [];

    for (const filename of files) {
      // Subagent files are named agent-{agentId}.jsonl
      if (!filename.startsWith("agent-") || !filename.endsWith(".jsonl")) {
        continue;
      }

      const filePath = path.join(subagentsDir, filename);
      const stats = await fs.stat(filePath);

      // Extract agent ID from filename: agent-a0323e0.jsonl -> a0323e0
      const agentId = filename.replace("agent-", "").replace(".jsonl", "");

      subagentFiles.push({
        filePath,
        agentId,
        modifiedAt: stats.mtime,
        sizeBytes: stats.size,
      });
    }

    // Sort by modification time (oldest first, since they were likely created in order)
    return subagentFiles.sort(
      (a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime()
    );
  } catch {
    return [];
  }
}

/**
 * Find a session file by session ID across all project directories.
 * This is useful when the cwd is incorrect but we know the session ID.
 */
export async function findSessionById(
  sessionId: string,
  claudeProjectsDir?: string
): Promise<SessionFile | null> {
  const claudeDir = claudeProjectsDir || getClaudeProjectsDir();

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
