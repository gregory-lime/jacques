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
  detectEmbeddedPlan,
  replaceEmbeddedPlanWithReference,
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
 *
 * Handles embedded plans: When Claude Code starts a session with "Implement the
 * following plan...", the plan is extracted to a separate file and replaced
 * with a reference in the conversation.
 */
export async function saveToArchive(
  context: SavedContext,
  options: SaveToArchiveOptions
): Promise<SaveToArchiveResult> {
  const cwd = options.cwd || process.cwd();
  let entries = options.entries;
  let modifiedContext = context;
  let embeddedPlanFile: string | null = null;

  // 1. Detect and handle embedded plan in first user message
  const embeddedPlan = detectEmbeddedPlan(entries);
  if (embeddedPlan) {
    // Replace embedded plan with reference in entries (for manifest extraction)
    entries = replaceEmbeddedPlanWithReference(entries, embeddedPlan);

    // Also update the context conversation to replace the plan
    modifiedContext = {
      ...context,
      conversation: context.conversation.map((msg) => {
        if (msg.type === "user_message" && msg.content.text) {
          const text = msg.content.text;
          // Check if this is the embedded plan message
          if (/^implement the following plan/i.test(text)) {
            return {
              ...msg,
              content: {
                ...msg.content,
                text: `Implement the following plan:\n\n${embeddedPlan.reference}\n\n(Full plan content saved separately)`,
              },
            };
          }
        }
        return msg;
      }),
    };
  }

  // 2. Extract manifest from (possibly modified) entries
  const manifest = extractManifestFromEntries(
    entries,
    cwd,
    options.jsonlPath,
    {
      userLabel: options.label,
      autoArchived: false,
    }
  );

  // 3. If there was an embedded plan, add it to the manifest's plans
  if (embeddedPlan) {
    // Create a temporary plan file path for the embedded plan
    const tempPlanPath = path.join(cwd, ".jacques", "plans", `embedded-${Date.now()}.md`);
    await fs.mkdir(path.dirname(tempPlanPath), { recursive: true });
    await fs.writeFile(tempPlanPath, embeddedPlan.content, "utf-8");

    manifest.plans.push({
      path: tempPlanPath,
      name: `${slugifyTitle(embeddedPlan.title)}.md`,
      archivedPath: `plans/${slugifyTitle(embeddedPlan.title)}.md`,
    });

    embeddedPlanFile = tempPlanPath;
  }

  // 4. Archive to global ~/.jacques/archive/ AND local .jacques/sessions/
  const archiveResult = await archiveConversation(modifiedContext, manifest, {
    saveToLocal: true,
  });

  // 5. Clean up temporary plan file (it's been copied to archive)
  if (embeddedPlanFile) {
    try {
      await fs.unlink(embeddedPlanFile);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Calculate size for display
  const jsonContent = JSON.stringify(modifiedContext, null, 2);
  const sizeBytes = Buffer.byteLength(jsonContent, "utf-8");

  return {
    filename: archiveResult.filename,
    localPath: archiveResult.localPath || `.jacques/sessions/${archiveResult.filename}`,
    globalPath: archiveResult.conversationPath,
    sizeFormatted: formatFileSize(sizeBytes),
    plansArchived: archiveResult.plansArchived,
  };
}

/**
 * Convert a title to a slug for filenames.
 */
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}
