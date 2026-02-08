/**
 * Context Indexer
 *
 * Reads and writes .jacques/index.json - the unified project knowledge index.
 * Tracks context files, sessions, and plans in a single location.
 */

import { promises as fs } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import type {
  ProjectIndex,
  ContextFile,
  SessionEntry,
  PlanEntry,
  SubagentEntry,
  ContextIndex,
} from "./types.js";
import { getDefaultIndex, migrateIndex } from "./types.js";

const JACQUES_DIR = ".jacques";
const INDEX_FILE = "index.json";

/**
 * Get the path to the index file for a project
 */
export function getIndexPath(cwd: string): string {
  return join(cwd, JACQUES_DIR, INDEX_FILE);
}

/**
 * Read the unified project index from .jacques/index.json
 * Automatically migrates legacy format (files-only) to new format
 */
export async function readProjectIndex(cwd: string): Promise<ProjectIndex> {
  const indexPath = getIndexPath(cwd);

  try {
    if (!existsSync(indexPath)) {
      return getDefaultIndex();
    }

    const content = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(content);

    // Check if this is a legacy format (has 'files' instead of 'context')
    if (parsed.files && !parsed.context) {
      // Migrate legacy format
      return migrateIndex(parsed as ContextIndex);
    }

    // New format - validate and merge with defaults (v2 adds subagents)
    return {
      version: parsed.version || "2.0.0",
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      context: Array.isArray(parsed.context) ? parsed.context : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      subagents: Array.isArray(parsed.subagents) ? parsed.subagents : [],
    };
  } catch {
    return getDefaultIndex();
  }
}

/**
 * Write the project index to .jacques/index.json
 */
export async function writeProjectIndex(
  cwd: string,
  index: ProjectIndex
): Promise<void> {
  const jacquesDir = join(cwd, JACQUES_DIR);
  const indexPath = getIndexPath(cwd);

  // Ensure .jacques directory exists
  await fs.mkdir(jacquesDir, { recursive: true });

  // Update timestamp
  index.updatedAt = new Date().toISOString();

  // Write with pretty formatting
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

// ============================================================
// Context File Operations
// ============================================================

/**
 * Add a context file to the index
 */
export async function addContextToIndex(
  cwd: string,
  file: ContextFile
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);

  const existingIdx = index.context.findIndex((f) => f.id === file.id);
  if (existingIdx >= 0) {
    index.context[existingIdx] = file;
  } else {
    index.context.push(file);
  }

  await writeProjectIndex(cwd, index);
  return index;
}

/**
 * Remove a context file from the index
 */
export async function removeContextFromIndex(
  cwd: string,
  fileId: string
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);
  index.context = index.context.filter((f) => f.id !== fileId);
  await writeProjectIndex(cwd, index);
  return index;
}

// ============================================================
// Session Operations
// ============================================================

/**
 * Add a session to the index
 */
export async function addSessionToIndex(
  cwd: string,
  session: SessionEntry
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);

  const existingIdx = index.sessions.findIndex((s) => s.id === session.id);
  if (existingIdx >= 0) {
    index.sessions[existingIdx] = session;
  } else {
    index.sessions.push(session);
  }

  // Sort sessions by savedAt (newest first)
  index.sessions.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );

  await writeProjectIndex(cwd, index);
  return index;
}

/**
 * Remove a session from the index
 */
export async function removeSessionFromIndex(
  cwd: string,
  sessionId: string
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);
  index.sessions = index.sessions.filter((s) => s.id !== sessionId);
  await writeProjectIndex(cwd, index);
  return index;
}

// ============================================================
// Plan Operations
// ============================================================

/**
 * Add a plan to the index
 */
export async function addPlanToIndex(
  cwd: string,
  plan: PlanEntry
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);

  const existingIdx = index.plans.findIndex((p) => p.id === plan.id);
  if (existingIdx >= 0) {
    // Merge session references
    const existing = index.plans[existingIdx];
    const mergedSessions = [
      ...new Set([...existing.sessions, ...plan.sessions]),
    ];
    index.plans[existingIdx] = { ...plan, sessions: mergedSessions };
  } else {
    index.plans.push(plan);
  }

  // Sort plans by updatedAt (newest first)
  index.plans.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  await writeProjectIndex(cwd, index);
  return index;
}

/**
 * Remove a plan from the index
 */
export async function removePlanFromIndex(
  cwd: string,
  planId: string
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);
  index.plans = index.plans.filter((p) => p.id !== planId);
  await writeProjectIndex(cwd, index);
  return index;
}

// ============================================================
// Subagent Operations
// ============================================================

/**
 * Add a subagent entry to the index
 */
export async function addSubagentToIndex(
  cwd: string,
  entry: SubagentEntry
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);

  const existingIdx = index.subagents.findIndex((s) => s.id === entry.id);
  if (existingIdx >= 0) {
    index.subagents[existingIdx] = entry;
  } else {
    index.subagents.push(entry);
  }

  // Sort subagents by timestamp (newest first)
  index.subagents.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  await writeProjectIndex(cwd, index);
  return index;
}

/**
 * Remove a subagent entry from the index
 */
export async function removeSubagentFromIndex(
  cwd: string,
  subagentId: string
): Promise<ProjectIndex> {
  const index = await readProjectIndex(cwd);
  index.subagents = index.subagents.filter((s) => s.id !== subagentId);
  await writeProjectIndex(cwd, index);
  return index;
}

// ============================================================
// Legacy Compatibility
// ============================================================

/**
 * @deprecated Use readProjectIndex instead
 */
export async function readContextIndex(cwd: string): Promise<ContextIndex> {
  const index = await readProjectIndex(cwd);
  return {
    version: index.version,
    updatedAt: index.updatedAt,
    files: index.context,
  };
}

/**
 * @deprecated Use writeProjectIndex instead
 */
export async function writeContextIndex(
  cwd: string,
  legacyIndex: ContextIndex
): Promise<void> {
  const index = await readProjectIndex(cwd);
  index.context = legacyIndex.files;
  await writeProjectIndex(cwd, index);
}

/**
 * @deprecated Use addContextToIndex instead
 */
export async function addToIndex(
  cwd: string,
  file: ContextFile
): Promise<ContextIndex> {
  const index = await addContextToIndex(cwd, file);
  return {
    version: index.version,
    updatedAt: index.updatedAt,
    files: index.context,
  };
}

/**
 * @deprecated Use removeContextFromIndex instead
 */
export async function removeFromIndex(
  cwd: string,
  fileId: string
): Promise<ContextIndex> {
  const index = await removeContextFromIndex(cwd, fileId);
  return {
    version: index.version,
    updatedAt: index.updatedAt,
    files: index.context,
  };
}

/**
 * Check if a context file exists in the index
 */
export async function fileExistsInIndex(
  cwd: string,
  fileId: string
): Promise<boolean> {
  const index = await readProjectIndex(cwd);
  return index.context.some((f) => f.id === fileId);
}
