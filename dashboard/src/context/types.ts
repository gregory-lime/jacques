/**
 * Context Types
 *
 * Type definitions for the unified project index (.jacques/index.json)
 * This is the single entry point for all project knowledge:
 * - context: External files imported from Obsidian, Google Docs, etc.
 * - sessions: Saved Claude Code conversations
 * - plans: Implementation plans created during conversations
 */

/**
 * Unified index of all project knowledge (.jacques/index.json)
 */
export interface ProjectIndex {
  version: string;
  updatedAt: string;
  context: ContextFile[];
  sessions: SessionEntry[];
  plans: PlanEntry[];
}

/**
 * A single context file entry (imported from external sources)
 */
export interface ContextFile {
  id: string;
  name: string;
  path: string;
  source: ContextSource;
  sourceFile: string;
  addedAt: string;
  description?: string;
  sizeBytes: number;
  tags?: string[];
}

/**
 * A single session entry (saved conversation)
 */
export interface SessionEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  savedAt: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  messageCount: number;
  toolCallCount: number;
  technologies: string[];
  userLabel?: string;
}

/**
 * A single plan entry
 */
export interface PlanEntry {
  id: string;
  title: string;
  filename: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  sessions: string[];  // Session IDs that used this plan
}

/**
 * Supported context sources
 */
export type ContextSource = "obsidian" | "google_docs" | "notion" | "local";

/**
 * Options for adding a new context file
 */
export interface AddContextOptions {
  cwd: string;
  sourceFile: string;
  name: string;
  source: ContextSource;
  description?: string;
}

/**
 * Default empty index
 */
export function getDefaultIndex(): ProjectIndex {
  return {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    context: [],
    sessions: [],
    plans: [],
  };
}

/**
 * Legacy ContextIndex type for backwards compatibility
 * @deprecated Use ProjectIndex instead
 */
export interface ContextIndex {
  version: string;
  updatedAt: string;
  files: ContextFile[];
}

/**
 * Migrate legacy index to new format
 */
export function migrateIndex(legacy: ContextIndex): ProjectIndex {
  return {
    version: "1.0.0",
    updatedAt: legacy.updatedAt,
    context: legacy.files,
    sessions: [],
    plans: [],
  };
}
