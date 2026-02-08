/**
 * Archive Module
 *
 * Cross-project search over saved Claude Code conversations.
 */

// Types
export type {
  ConversationManifest,
  PlanReference,
  SearchIndex,
  IndexReference,
  ProjectInfo,
  SearchInput,
  SearchOutput,
  SearchResult,
  ArchiveSettings,
} from "./types.js";

export {
  getDefaultSearchIndex,
  getDefaultArchiveSettings,
} from "./types.js";

// Manifest Extractor
export {
  extractManifest,
  extractManifestFromEntries,
  detectPlans,
  detectEmbeddedPlan,
  replaceEmbeddedPlanWithReference,
  getPlansDirectory,
  readPlanContent,
} from "./manifest-extractor.js";

export type { EmbeddedPlan } from "./manifest-extractor.js";

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
  // Conversation operations
  saveConversation,
  readConversation,
  // Plan operations
  archivePlan,
  isPlanArchivedById,
  linkSessionToPlan,
  generatePlanId,
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
