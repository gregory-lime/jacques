/**
 * Cache Module
 *
 * Lightweight session indexing without content duplication.
 * Reads directly from Claude Code JSONL files.
 */

// Types
export type {
  SessionEntry,
  SessionIndex,
  DiscoveredProject,
  PlanRef,
  ExploreAgentRef,
  WebSearchRef,
  GitInfo,
  BranchDivergence,
} from "./types.js";

export {
  getDefaultSessionIndex,
  decodeProjectPath,
} from "./types.js";

// Persistence
export {
  getCacheDir,
  getIndexPath,
  ensureCacheDir,
  readSessionIndex,
  writeSessionIndex,
  getSessionIndex,
  invalidateIndex,
} from "./persistence.js";

// Mode detection
export { detectModeAndPlans } from "./mode-detector.js";
export type { PlanModeCompletion } from "./mode-detector.js";

// Git utilities
export { detectGitInfo, readGitBranchFromJsonl, readWorktreeRepoRoot, computeBranchDivergence, checkDirtyStatus } from "./git-utils.js";

// Metadata extraction & index building
export {
  extractTitle,
  extractTimestamps,
  extractSessionMetadata,
  extractContinueTitleFromHandoff,
  listAllProjects,
  buildSessionIndex,
} from "./metadata-extractor.js";

// Project discovery & query
export {
  getProjectGroupKey,
  discoverProjects,
  getSessionEntry,
  getSessionsByProject,
  getIndexStats,
} from "./project-discovery.js";

// Hidden projects
export {
  getHiddenProjects,
  hideProject,
  unhideProject,
} from "./hidden-projects.js";
