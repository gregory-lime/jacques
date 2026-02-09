/**
 * Archive Store
 *
 * File I/O for the conversation archive system.
 * Handles storing manifests, conversations, and plans to ~/.jacques/archive/
 * and local project .jacques/ directories.
 */

import { promises as fs } from "fs";
import * as path from "path";
import { homedir } from "os";
import type {
  ConversationManifest,
  SearchIndex,
  ArchiveSettings,
  SearchInput,
  SearchOutput,
  SearchResult,
} from "./types.js";
import { getDefaultSearchIndex, getDefaultArchiveSettings } from "./types.js";
import { addToIndex, searchIndex } from "./search-indexer.js";
import type { SavedContext } from "../session/transformer.js";
import { addSessionToIndex, addPlanToIndex } from "../context/indexer.js";
import type { SessionEntry, PlanEntry } from "../context/types.js";
import { slugify, generateArchivePlanFilename } from "./filename-utils.js";

/** Global archive base path */
const GLOBAL_ARCHIVE_PATH = path.join(homedir(), ".jacques", "archive");

/** Global config path */
const GLOBAL_CONFIG_PATH = path.join(homedir(), ".jacques", "config.json");

/** Local project archive directory name */
const LOCAL_ARCHIVE_DIR = ".jacques";

// ============================================================
// Filename Generation
// ============================================================

/**
 * Generate a readable filename for a session.
 * Format: [YYYY-MM-DD]_[HH-MM]_[title-slug]_[4-char-id].json
 * Example: 2026-01-31_14-30_jwt-auth-setup_8d84.json
 */
export function generateSessionFilename(
  manifest: ConversationManifest
): string {
  const date = new Date(manifest.endedAt);
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = date.toTimeString().substring(0, 5).replace(":", "-"); // HH-MM
  const titleSlug = slugify(manifest.title);
  const shortId = manifest.id.substring(0, 4);

  return `${dateStr}_${timeStr}_${titleSlug}_${shortId}.json`;
}

// ============================================================
// Path Helpers
// ============================================================

/**
 * Get the global archive base path.
 */
export function getGlobalArchivePath(): string {
  return GLOBAL_ARCHIVE_PATH;
}

/**
 * Get the path to the global search index.
 */
export function getGlobalIndexPath(): string {
  return path.join(GLOBAL_ARCHIVE_PATH, "index.json");
}

/**
 * Get the path to a manifest in the global archive.
 */
export function getManifestPath(id: string): string {
  return path.join(GLOBAL_ARCHIVE_PATH, "manifests", `${id}.json`);
}

/**
 * Get the path to a conversation in the global archive.
 * Uses projectId (encoded full path) for storage to avoid collisions.
 */
export function getConversationPath(projectId: string, id: string): string {
  return path.join(
    GLOBAL_ARCHIVE_PATH,
    "conversations",
    projectId,
    `${id}.json`
  );
}

/**
 * Get the path to a plan in the global archive.
 * Plans are organized by project: plans/[projectId]/[name].md
 * Uses projectId (encoded full path) for storage to avoid collisions.
 */
export function getPlanPath(projectId: string, planName: string): string {
  return path.join(GLOBAL_ARCHIVE_PATH, "plans", projectId, planName);
}

/**
 * Get the local project archive path.
 */
export function getLocalArchivePath(projectPath: string): string {
  return path.join(projectPath, LOCAL_ARCHIVE_DIR);
}

/**
 * Get the local project archive index path.
 * Uses sessions/index.json to avoid conflict with context/index.json
 */
export function getLocalIndexPath(projectPath: string): string {
  return path.join(projectPath, LOCAL_ARCHIVE_DIR, "sessions", "index.json");
}

// ============================================================
// Directory Setup
// ============================================================

/**
 * Ensure the global archive directory structure exists.
 */
export async function ensureGlobalArchive(): Promise<void> {
  await fs.mkdir(path.join(GLOBAL_ARCHIVE_PATH, "manifests"), {
    recursive: true,
  });
  await fs.mkdir(path.join(GLOBAL_ARCHIVE_PATH, "conversations"), {
    recursive: true,
  });
  await fs.mkdir(path.join(GLOBAL_ARCHIVE_PATH, "plans"), { recursive: true });
  await fs.mkdir(path.join(GLOBAL_ARCHIVE_PATH, "context"), { recursive: true });
}

/**
 * Ensure the local project archive directory structure exists.
 */
export async function ensureLocalArchive(projectPath: string): Promise<void> {
  const localPath = getLocalArchivePath(projectPath);
  await fs.mkdir(path.join(localPath, "sessions"), { recursive: true });
  await fs.mkdir(path.join(localPath, "plans"), { recursive: true });
  await fs.mkdir(path.join(localPath, "context"), { recursive: true });
}

// ============================================================
// Index Operations
// ============================================================

/**
 * Read the global search index.
 */
export async function readGlobalIndex(): Promise<SearchIndex> {
  try {
    const content = await fs.readFile(getGlobalIndexPath(), "utf-8");
    return JSON.parse(content) as SearchIndex;
  } catch {
    return getDefaultSearchIndex();
  }
}

/**
 * Write the global search index.
 */
export async function writeGlobalIndex(index: SearchIndex): Promise<void> {
  await ensureGlobalArchive();
  await fs.writeFile(getGlobalIndexPath(), JSON.stringify(index, null, 2));
}

/**
 * Read a local project index.
 */
export async function readLocalIndex(projectPath: string): Promise<SearchIndex> {
  try {
    const content = await fs.readFile(getLocalIndexPath(projectPath), "utf-8");
    return JSON.parse(content) as SearchIndex;
  } catch {
    return getDefaultSearchIndex();
  }
}

/**
 * Write a local project index.
 */
export async function writeLocalIndex(
  projectPath: string,
  index: SearchIndex
): Promise<void> {
  await ensureLocalArchive(projectPath);
  await fs.writeFile(
    getLocalIndexPath(projectPath),
    JSON.stringify(index, null, 2)
  );
}

// ============================================================
// Manifest Operations
// ============================================================

/**
 * Save a manifest to the global archive.
 */
export async function saveManifest(
  manifest: ConversationManifest
): Promise<void> {
  await ensureGlobalArchive();
  const manifestPath = getManifestPath(manifest.id);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Read a manifest from the global archive.
 */
export async function readManifest(
  id: string
): Promise<ConversationManifest | null> {
  try {
    const content = await fs.readFile(getManifestPath(id), "utf-8");
    return JSON.parse(content) as ConversationManifest;
  } catch {
    return null;
  }
}

/**
 * List all manifest IDs in the global archive.
 */
export async function listManifests(): Promise<string[]> {
  try {
    const manifestsDir = path.join(GLOBAL_ARCHIVE_PATH, "manifests");
    const files = await fs.readdir(manifestsDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

/**
 * List all manifests with full data, sorted by date (newest first).
 */
export async function listAllManifests(): Promise<ConversationManifest[]> {
  const ids = await listManifests();
  const manifests: ConversationManifest[] = [];

  for (const id of ids) {
    const manifest = await readManifest(id);
    if (manifest) {
      manifests.push(manifest);
    }
  }

  // Sort by endedAt descending (newest first)
  manifests.sort(
    (a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()
  );

  return manifests;
}

/**
 * List all manifests grouped by project.
 * Returns a Map with projectId as keys (for uniqueness), sorted manifests as values.
 * Falls back to projectSlug for old manifests without projectId.
 */
export async function listManifestsByProject(): Promise<
  Map<string, ConversationManifest[]>
> {
  const manifests = await listAllManifests();
  const byProject = new Map<string, ConversationManifest[]>();

  for (const manifest of manifests) {
    // Use projectId if available, fallback to projectSlug for old data
    const key = manifest.projectId || manifest.projectSlug;
    const existing = byProject.get(key) || [];
    existing.push(manifest);
    byProject.set(key, existing);
  }

  return byProject;
}

// ============================================================
// Conversation Operations
// ============================================================

/**
 * Save a conversation to both global and local archives.
 * Uses readable filename format: YYYY-MM-DD_HH-MM_title-slug_id.json
 */
export async function saveConversation(
  conversation: SavedContext,
  manifest: ConversationManifest,
  options: { saveToLocal?: boolean } = {}
): Promise<{
  globalPath: string;
  localPath?: string;
  filename: string;
}> {
  // Generate readable filename
  const filename = generateSessionFilename(manifest);

  // Save to global archive (conversations/[projectId]/[filename])
  // Use projectId (encoded path) for unique directory naming
  await ensureGlobalArchive();
  const globalDir = path.join(
    GLOBAL_ARCHIVE_PATH,
    "conversations",
    manifest.projectId
  );
  await fs.mkdir(globalDir, { recursive: true });
  const globalPath = path.join(globalDir, filename);
  await fs.writeFile(globalPath, JSON.stringify(conversation, null, 2));

  // Optionally save to local project archive (sessions/[filename])
  let localPath: string | undefined;
  if (options.saveToLocal !== false) {
    await ensureLocalArchive(manifest.projectPath);
    const localDir = path.join(
      getLocalArchivePath(manifest.projectPath),
      "sessions"
    );
    await fs.mkdir(localDir, { recursive: true });
    localPath = path.join(localDir, filename);
    await fs.writeFile(localPath, JSON.stringify(conversation, null, 2));

    // Update the unified project index
    const sessionEntry: SessionEntry = {
      id: manifest.id,
      title: manifest.title,
      filename,
      path: `sessions/${filename}`,
      savedAt: manifest.archivedAt,
      startedAt: manifest.startedAt,
      endedAt: manifest.endedAt,
      durationMinutes: manifest.durationMinutes,
      messageCount: manifest.messageCount,
      toolCallCount: manifest.toolCallCount,
      technologies: manifest.technologies,
      userLabel: manifest.userLabel,
    };
    await addSessionToIndex(manifest.projectPath, sessionEntry);
  }

  return { globalPath, localPath, filename };
}

/**
 * Read a conversation from the global archive.
 * @param projectId The projectId (encoded path) or projectSlug for old data
 */
export async function readConversation(
  projectId: string,
  id: string
): Promise<SavedContext | null> {
  try {
    const convPath = getConversationPath(projectId, id);
    const content = await fs.readFile(convPath, "utf-8");
    return JSON.parse(content) as SavedContext;
  } catch {
    return null;
  }
}

// ============================================================
// Plan Operations
// ============================================================

/**
 * Archive a plan file (copy to archive if not already there).
 * Uses project subdirectories and readable naming.
 * Extracts title from the plan's # heading for the filename.
 */
export async function archivePlan(
  planPath: string,
  options: {
    saveToLocal?: boolean;
    projectPath?: string;
    projectId?: string;
    projectSlug?: string;
    sessionId?: string;
  } = {}
): Promise<string | null> {
  try {
    const content = await fs.readFile(planPath, "utf-8");

    // Generate readable filename using the plan's actual title
    const stats = await fs.stat(planPath);
    const filename = generateArchivePlanFilename(planPath, {
      content,
      createdAt: stats.mtime,
    });
    // Use projectId for storage, derive from path if not provided
    const projectId =
      options.projectId ||
      (options.projectPath ? options.projectPath.replace(/\//g, "-") : "unknown");

    // Save to global archive (plans/[projectId]/[filename])
    const globalPlanPath = getPlanPath(projectId, filename);
    await ensureGlobalArchive();
    await fs.mkdir(path.dirname(globalPlanPath), { recursive: true });
    await fs.writeFile(globalPlanPath, content);

    // Optionally save to local project archive
    if (options.saveToLocal !== false && options.projectPath) {
      await ensureLocalArchive(options.projectPath);
      const localPlanDir = path.join(
        getLocalArchivePath(options.projectPath),
        "plans"
      );
      await fs.mkdir(localPlanDir, { recursive: true });
      const localPlanPath = path.join(localPlanDir, filename);
      await fs.writeFile(localPlanPath, content);

      // Extract title from plan content (first # heading)
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : path.basename(planPath, ".md");

      // Update the unified project index
      const shortHash = Buffer.from(planPath)
        .toString("base64")
        .substring(0, 6);
      const planEntry: PlanEntry = {
        id: slugify(path.basename(planPath, ".md")) + "-" + shortHash,
        title,
        filename,
        path: `plans/${filename}`,
        createdAt: stats.mtime.toISOString(),
        updatedAt: new Date().toISOString(),
        sessions: options.sessionId ? [options.sessionId] : [],
      };
      await addPlanToIndex(options.projectPath, planEntry);
    }

    return globalPlanPath;
  } catch {
    return null;
  }
}

/**
 * Check if a plan is already archived.
 * @param projectId The projectId (encoded path) to check
 */
export async function isPlanArchived(
  projectId: string,
  planName: string
): Promise<boolean> {
  try {
    await fs.access(getPlanPath(projectId, planName));
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Archive Settings
// ============================================================

/**
 * Read archive settings from global config.
 */
export async function readArchiveSettings(): Promise<ArchiveSettings> {
  try {
    const content = await fs.readFile(GLOBAL_CONFIG_PATH, "utf-8");
    const config = JSON.parse(content);
    return {
      ...getDefaultArchiveSettings(),
      ...config.archive,
    };
  } catch {
    return getDefaultArchiveSettings();
  }
}

/**
 * Write archive settings to global config.
 */
export async function writeArchiveSettings(
  settings: ArchiveSettings
): Promise<void> {
  // Read existing config
  let config: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(GLOBAL_CONFIG_PATH, "utf-8");
    config = JSON.parse(content);
  } catch {
    // File doesn't exist, start fresh
  }

  // Update archive settings
  config.archive = settings;

  // Write back
  await fs.mkdir(path.dirname(GLOBAL_CONFIG_PATH), { recursive: true });
  await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ============================================================
// Full Archive Flow
// ============================================================

/**
 * Helper: Update session link for an already-archived plan.
 */
async function updatePlanSessionLink(
  projectPath: string,
  planFilename: string,
  sessionId: string,
  planContent: string
): Promise<void> {
  const { readProjectIndex } = await import("../context/indexer.js");
  const index = await readProjectIndex(projectPath);

  // Find the plan entry by filename
  const existingPlan = index.plans.find((p) => p.filename === planFilename);

  if (existingPlan) {
    // Update with merged session IDs
    const titleMatch = planContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : path.basename(planFilename, ".md");

    const updatedPlan: PlanEntry = {
      ...existingPlan,
      updatedAt: new Date().toISOString(),
      sessions: [...new Set([...existingPlan.sessions, sessionId])],
    };

    await addPlanToIndex(projectPath, updatedPlan);
  }
}

/**
 * Archive a conversation (full flow).
 * 1. Save manifest to global archive
 * 2. Save conversation to global (and optionally local) archive
 * 3. Archive any new plans
 * 4. Update global search index
 *
 * Note: Local project index is updated automatically by saveConversation
 */
export async function archiveConversation(
  conversation: SavedContext,
  manifest: ConversationManifest,
  options: { saveToLocal?: boolean } = {}
): Promise<{
  manifestPath: string;
  conversationPath: string;
  localPath?: string;
  filename: string;
  plansArchived: string[];
}> {
  // 1. Save manifest
  await saveManifest(manifest);
  const manifestPath = getManifestPath(manifest.id);

  // 2. Save conversation (also updates unified project index)
  const {
    globalPath: conversationPath,
    localPath,
    filename,
  } = await saveConversation(conversation, manifest, options);

  // 3. Archive plans
  const plansArchived: string[] = [];
  for (const planRef of manifest.plans) {
    try {
      // Read plan content to extract title for filename
      const planContent = await fs.readFile(planRef.path, "utf-8");
      const planStats = await fs.stat(planRef.path);
      const planFilename = generateArchivePlanFilename(planRef.path, {
        content: planContent,
        createdAt: planStats.mtime,
      });

      const isArchived = await isPlanArchived(manifest.projectId, planFilename);
      if (!isArchived) {
        const archivedPath = await archivePlan(planRef.path, {
          saveToLocal: options.saveToLocal,
          projectPath: manifest.projectPath,
          projectId: manifest.projectId,
          sessionId: manifest.id,
        });
        if (archivedPath) {
          plansArchived.push(archivedPath);
        }
      } else {
        // Plan already archived, just update session link
        if (options.saveToLocal !== false && manifest.projectPath) {
          await updatePlanSessionLink(
            manifest.projectPath,
            planFilename,
            manifest.id,
            planContent
          );
        }
      }
    } catch {
      // Plan file may not exist anymore, skip it
    }
  }

  // 4. Update global search index
  const index = await readGlobalIndex();
  addToIndex(index, manifest);
  await writeGlobalIndex(index);

  return {
    manifestPath,
    conversationPath,
    localPath,
    filename,
    plansArchived,
  };
}

// ============================================================
// Search Operations
// ============================================================

/**
 * Search conversations with filters.
 */
export async function searchConversations(
  input: SearchInput
): Promise<SearchOutput> {
  const index = await readGlobalIndex();

  // Get initial results from index
  const indexResults = searchIndex(index, input.query);

  // Load manifests and apply filters
  const filteredResults: Array<{
    manifest: ConversationManifest;
    score: number;
  }> = [];

  for (const { id, score } of indexResults) {
    const manifest = await readManifest(id);
    if (!manifest) continue;

    // Apply filters
    // Support filtering by either projectId or projectSlug for backward compatibility
    if (input.project && manifest.projectId !== input.project && manifest.projectSlug !== input.project) {
      continue;
    }

    if (input.dateFrom && manifest.endedAt < input.dateFrom) {
      continue;
    }

    if (input.dateTo && manifest.endedAt > input.dateTo) {
      continue;
    }

    if (input.technologies && input.technologies.length > 0) {
      const hasTech = input.technologies.some((t) =>
        manifest.technologies.includes(t.toLowerCase())
      );
      if (!hasTech) continue;
    }

    filteredResults.push({ manifest, score });
  }

  // Apply pagination
  const limit = Math.min(input.limit || 10, 50);
  const offset = input.offset || 0;
  const totalMatches = filteredResults.length;
  const paginatedResults = filteredResults.slice(offset, offset + limit);

  // Transform to SearchResult format
  const results: SearchResult[] = paginatedResults.map(
    ({ manifest, score }, idx) => ({
      rank: offset + idx + 1,
      id: manifest.id,
      score,
      title: manifest.title,
      project: manifest.projectSlug,
      date: manifest.endedAt.split("T")[0],
      preview: manifest.userQuestions[0] || "",
      filesModified: manifest.filesModified.slice(0, 5),
      technologies: manifest.technologies,
      messageCount: manifest.messageCount,
      durationMinutes: manifest.durationMinutes,
    })
  );

  return {
    query: input.query,
    filters: {
      project: input.project,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      technologies: input.technologies,
    },
    totalMatches,
    showing: {
      from: offset + 1,
      to: Math.min(offset + limit, totalMatches),
    },
    hasMore: offset + limit < totalMatches,
    results,
  };
}

// ============================================================
// Statistics
// ============================================================

/**
 * Get archive statistics.
 */
export async function getArchiveStats(): Promise<{
  totalConversations: number;
  totalProjects: number;
  totalSizeBytes: number;
  sizeFormatted: string;
}> {
  const index = await readGlobalIndex();

  // Calculate total size
  let totalSizeBytes = 0;
  try {
    const manifestIds = await listManifests();
    for (const id of manifestIds) {
      try {
        const stats = await fs.stat(getManifestPath(id));
        totalSizeBytes += stats.size;
      } catch {
        // Skip missing files
      }
    }

    // Add conversation sizes
    const convDir = path.join(GLOBAL_ARCHIVE_PATH, "conversations");
    totalSizeBytes += await calculateDirectorySize(convDir);
  } catch {
    // Archive doesn't exist yet
  }

  return {
    totalConversations: index.metadata.totalConversations,
    totalProjects: Object.keys(index.projects).length,
    totalSizeBytes,
    sizeFormatted: formatFileSize(totalSizeBytes),
  };
}

/**
 * Calculate total size of a directory recursively.
 */
async function calculateDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(fullPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(fullPath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return totalSize;
}

/**
 * Format file size in human-readable format.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
