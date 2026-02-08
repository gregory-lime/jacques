/**
 * Storage Writer
 *
 * Saves context JSON files to .context/saved/ directory and global archive.
 * Naming convention: [YYYY-MM-DD]_[session-id-short]_[optional-label].json
 */

import { promises as fs } from "fs";
import * as path from "path";
import type { SavedContext } from "../session/transformer.js";
import { FilterType, FILTER_CONFIGS } from "../session/filters.js";
import type { ParsedEntry } from "../session/parser.js";
import {
  extractManifestFromEntries,
  archiveConversation,
} from "../archive/index.js";

export interface WriteOptions {
  /** Working directory (where .context/ will be created) */
  cwd?: string;
  /** Optional user-provided label */
  label?: string;
  /** Filter type applied */
  filterType?: FilterType;
}

export interface WriteResult {
  /** Full path to the saved file */
  filePath: string;
  /** Relative path from cwd */
  relativePath: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Human-readable file size */
  sizeFormatted: string;
}

/**
 * Save context to .context/saved/ directory.
 */
export async function saveContext(
  context: SavedContext,
  options: WriteOptions = {}
): Promise<WriteResult> {
  const cwd = options.cwd || process.cwd();
  const label = options.label;
  const filterType = options.filterType || FilterType.EVERYTHING;

  // Ensure .context/saved/ directory exists
  const savedDir = path.join(cwd, ".context", "saved");
  await fs.mkdir(savedDir, { recursive: true });

  // Generate filename
  const filename = generateFilename(context.session.id, filterType, label);
  const filePath = path.join(savedDir, filename);
  const relativePath = path.join(".context", "saved", filename);

  // Serialize to JSON with pretty formatting
  const jsonContent = JSON.stringify(context, null, 2);

  // Write to file
  await fs.writeFile(filePath, jsonContent, "utf-8");

  // Get file size
  const stats = await fs.stat(filePath);
  const sizeBytes = stats.size;

  return {
    filePath,
    relativePath,
    sizeBytes,
    sizeFormatted: formatFileSize(sizeBytes),
  };
}

/**
 * Generate a filename for the saved context.
 * Format: [YYYY-MM-DD]_[session-id-short]_[filter-suffix]_[optional-label].json
 */
export function generateFilename(
  sessionId: string,
  filterType: FilterType,
  label?: string
): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const shortId = sessionId.substring(0, 8);
  const suffix = FILTER_CONFIGS[filterType].suffix;

  if (label && label.trim()) {
    // Sanitize label: only alphanumeric, dash, underscore
    const sanitizedLabel = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 50); // Limit length
    return `${date}_${shortId}${suffix}_${sanitizedLabel}.json`;
  }

  return `${date}_${shortId}${suffix}.json`;
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * List all saved context files in .context/saved/
 */
export async function listSavedContexts(
  cwd?: string
): Promise<
  Array<{
    filePath: string;
    filename: string;
    modifiedAt: Date;
    sizeBytes: number;
  }>
> {
  const baseDir = cwd || process.cwd();
  const savedDir = path.join(baseDir, ".context", "saved");

  try {
    await fs.access(savedDir);
  } catch {
    return []; // Directory doesn't exist
  }

  const files = await fs.readdir(savedDir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const fileInfos = await Promise.all(
    jsonFiles.map(async (filename) => {
      const filePath = path.join(savedDir, filename);
      const stats = await fs.stat(filePath);
      return {
        filePath,
        filename,
        modifiedAt: stats.mtime,
        sizeBytes: stats.size,
      };
    })
  );

  // Sort by modification time (most recent first)
  return fileInfos.sort(
    (a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime()
  );
}

/**
 * Check if .context/ directory exists and create if needed.
 */
export async function ensureContextDirectory(cwd?: string): Promise<string> {
  const baseDir = cwd || process.cwd();
  const contextDir = path.join(baseDir, ".context", "saved");
  await fs.mkdir(contextDir, { recursive: true });
  return contextDir;
}

// ============================================================
// Archive-Enabled Save
// ============================================================

export interface SaveToArchiveOptions {
  /** Working directory (project path) */
  cwd?: string;
  /** Optional user-provided label */
  label?: string;
  /** Filter type applied */
  filterType?: FilterType;
  /** Original JSONL file path */
  jsonlPath: string;
  /** Parsed entries (for manifest extraction) */
  entries: ParsedEntry[];
}

export interface SaveToArchiveResult {
  /** Session filename (readable format) */
  filename: string;
  /** Local project path */
  localPath: string;
  /** Global archive path */
  globalPath: string;
  /** File size formatted */
  sizeFormatted: string;
  /** Plans that were archived */
  plansArchived: string[];
}

/**
 * Save context to both global archive and local project .jacques/sessions/.
 * This is the main save function that archives conversations for cross-project search.
 *
 * Filename format: YYYY-MM-DD_HH-MM_title-slug_id.json
 * Example: 2026-01-31_14-30_jwt-auth-setup_8d84.json
 */
export async function saveToArchive(
  context: SavedContext,
  options: SaveToArchiveOptions
): Promise<SaveToArchiveResult> {
  const cwd = options.cwd || process.cwd();

  // 1. Extract manifest from entries
  const manifest = await extractManifestFromEntries(
    options.entries,
    cwd,
    options.jsonlPath,
    {
      userLabel: options.label,
      autoArchived: false,
    }
  );

  // 2. Archive to global ~/.jacques/archive/ AND local .jacques/sessions/
  const archiveResult = await archiveConversation(context, manifest, {
    saveToLocal: true,
  });

  // Calculate size for display
  const jsonContent = JSON.stringify(context, null, 2);
  const sizeBytes = Buffer.byteLength(jsonContent, "utf-8");

  return {
    filename: archiveResult.filename,
    localPath:
      archiveResult.localPath ||
      `.jacques/sessions/${archiveResult.filename}`,
    globalPath: archiveResult.conversationPath,
    sizeFormatted: formatFileSize(sizeBytes),
    plansArchived: archiveResult.plansArchived,
  };
}
