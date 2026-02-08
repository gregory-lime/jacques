/**
 * Cache Module
 *
 * Lightweight session indexing without content duplication.
 * Reads directly from Claude Code JSONL files.
 */

export {
  // Types
  type SessionEntry,
  type SessionIndex,
  type DiscoveredProject,
  // Constants
  getDefaultSessionIndex,
  decodeProjectPath,
  // Path helpers
  getCacheDir,
  getIndexPath,
  ensureCacheDir,
  // Index operations
  readSessionIndex,
  writeSessionIndex,
  extractSessionMetadata,
  listAllProjects,
  buildSessionIndex,
  getSessionIndex,
  getSessionEntry,
  getSessionsByProject,
  discoverProjects,
  hideProject,
  unhideProject,
  getIndexStats,
  invalidateIndex,
  detectModeAndPlans,
} from "./session-index.js";
