/**
 * Archive Module
 *
 * Cross-project search over saved Claude Code conversations.
 */

// Types
export type {
  ConversationManifest,
  PlanReference,
  SubagentSummary,
  SearchIndex,
  IndexReference,
  ProjectInfo,
  SearchInput,
  SearchOutput,
  SearchResult,
  ArchiveSettings,
  ArchiveProgress,
  ArchiveInitResult,
  SessionFileInfo,
} from "./types.js";

export { getDefaultSearchIndex, getDefaultArchiveSettings } from "./types.js";

// Manifest Extractor
export {
  extractManifest,
  extractManifestFromEntries,
  detectPlans,
  getPlansDirectory,
  readPlanContent,
} from "./manifest-extractor.js";

// Plan Extractor
export {
  PLAN_TRIGGER_PATTERNS,
  detectEmbeddedPlans,
  extractEmbeddedPlans,
  findDuplicatePlan,
  extractPlanTitle,
  generatePlanFingerprint,
  calculateSimilarity,
  indexEmbeddedPlan,
  splitMultiplePlans,
} from "./plan-extractor.js";

export type { DetectedPlan, PlanFingerprint } from "./plan-extractor.js";

// Plan Cataloger
export { catalogPlan } from "./plan-cataloger.js";
export type { CatalogPlanInput } from "./plan-cataloger.js";

// Search Indexer
export {
  tokenize,
  extractPathKeywords,
  extractKeywordsWithFields,
  addToIndex,
  removeFromIndex,
  searchIndex,
  getIndexStats,
} from "./search-indexer.js";

// Archive Store
export {
  // Path helpers
  getGlobalArchivePath,
  getGlobalIndexPath,
  getManifestPath,
  getConversationPath,
  getPlanPath,
  getLocalArchivePath,
  getLocalIndexPath,
  // Directory setup
  ensureGlobalArchive,
  ensureLocalArchive,
  // Index operations
  readGlobalIndex,
  writeGlobalIndex,
  readLocalIndex,
  writeLocalIndex,
  // Manifest operations
  saveManifest,
  readManifest,
  listManifests,
  listAllManifests,
  listManifestsByProject,
  // Conversation operations
  saveConversation,
  readConversation,
  // Plan operations
  archivePlan,
  isPlanArchived,
  // Settings
  readArchiveSettings,
  writeArchiveSettings,
  // Full archive flow
  archiveConversation,
  // Search
  searchConversations,
  // Statistics
  getArchiveStats,
} from "./archive-store.js";

// Bulk Archive
export {
  decodeProjectPath,
  decodeProjectPathNaive,
  listAllProjects,
  listAllSessions,
  isSessionArchived,
  archiveSessionFile,
  initializeArchive,
} from "./bulk-archive.js";

// Subagent Store
export {
  archiveSubagent,
  readSubagent,
  listSubagentsForSession,
  isSubagentArchived,
  listAllSubagentIds,
  createSubagentReference,
  deleteSubagent,
  getSubagentArchiveStats,
} from "./subagent-store.js";

export type {
  ArchivedSubagent,
  SubagentReference,
  SubagentTokenStats,
} from "./subagent-store.js";

// Migration
export {
  migrateToProjectId,
  isMigrationNeeded,
  getMigrationStatus,
  migrateProjectPaths,
} from "./migration.js";

export type { MigrationResult, PathMigrationResult } from "./migration.js";
