/**
 * @jacques/core
 *
 * Core business logic for Jacques - shared between CLI dashboard and GUI.
 *
 * Modules:
 * - types: Shared type definitions
 * - client: WebSocket client for real-time updates
 * - session: JSONL parsing, filtering, transformation
 * - archive: Cross-project search and archiving
 * - context: Project knowledge management
 * - sources: External source adapters (Obsidian, etc.)
 * - storage: File I/O for saved contexts
 * - utils: Settings and configuration utilities
 */

// Types - core session/websocket types
export type {
  AutoCompactStatus,
  TerminalIdentity,
  ContextMetrics,
  ModelInfo,
  WorkspaceInfo,
  SessionStatus,
  SessionSource,
  Session,
  ServerMessage,
  ClientMessage,
  InitialStateMessage,
  SessionUpdateMessage,
  SessionRemovedMessage,
  FocusChangedMessage,
  ServerStatusMessage,
  AutoCompactToggledMessage,
  HandoffReadyMessage,
  SelectSessionRequest,
  TriggerActionRequest,
  ToggleAutoCompactRequest,
  FocusTerminalRequest,
  FocusTerminalResultMessage,
  TileWindowsRequest,
  MaximizeWindowRequest,
  LaunchSessionRequest,
  CreateWorktreeRequest,
  ListWorktreesRequest,
  RemoveWorktreeRequest,
  WorktreeWithStatus,
} from "./types.js";

// Client
export { JacquesClient } from "./client/index.js";
export type { JacquesClientEvents } from "./client/index.js";

// Session module
export {
  // Detector
  detectCurrentSession,
  listProjectSessions,
  getProjectDirPath,
  encodeProjectPath,
  decodeProjectPath as decodeSessionProjectPath,
  decodeProjectPathNaive as decodeSessionProjectPathNaive,
  findSessionById,
  listSubagentFiles,
  // Parser
  parseJSONL,
  categorizeEntry,
  getEntryStatistics,
  // Transformer
  transformToSavedContext,
  getSessionPreview,
  // Filters
  FilterType,
  FILTER_CONFIGS,
  applyFilter,
  // Token estimator
  estimateTokensForFilters,
  countEntryTokens,
} from "./session/index.js";

// Re-export formatTokenCount from session explicitly
export { formatTokenCount as formatSessionTokenCount } from "./session/index.js";

// Session title formatting
export { formatSessionTitle, isContinueSession } from "./session/index.js";
export type { FormattedSessionTitle } from "./session/index.js";

export type {
  SessionFile,
  SubagentFile,
  DetectorOptions,
  ParsedEntry,
  ParsedEntryType,
  ParsedContent,
  RawEntry,
  RawAssistantEntry,
  RawProgressEntry,
  RawQueueOperationEntry,
  RawSystemEntry,
  RawSummaryEntry,
  ContentBlock,
  SavedContext,
  SessionInfo,
  SessionStatistics,
  DisplayMessage,
  MessageContent,
  MessageMetadata,
  TransformOptions,
  FilterConfig,
  TokenEstimate,
  FilterTokenEstimates,
} from "./session/index.js";

// Archive module
export {
  // Types
  getDefaultSearchIndex,
  // Manifest extractor
  extractManifest,
  extractManifestFromEntries,
  detectPlans,
  getPlansDirectory,
  readPlanContent,
  // Plan extractor
  PLAN_TRIGGER_PATTERNS,
  extractPlanTitle,
  findDuplicatePlan,
  // Search indexer
  tokenize,
  extractPathKeywords,
  extractKeywordsWithFields,
  searchIndex,
  getIndexStats,
  // Archive store
  getGlobalArchivePath,
  getGlobalIndexPath,
  getManifestPath,
  getConversationPath,
  getPlanPath,
  getLocalArchivePath,
  getLocalIndexPath,
  ensureGlobalArchive,
  ensureLocalArchive,
  readGlobalIndex,
  writeGlobalIndex,
  readLocalIndex,
  writeLocalIndex,
  saveManifest,
  readManifest,
  listManifests,
  listAllManifests,
  listManifestsByProject,
  saveConversation,
  readConversation,
  archivePlan,
  isPlanArchived,
  readArchiveSettings,
  writeArchiveSettings,
  archiveConversation,
  searchConversations,
  getArchiveStats,
  // Bulk archive
  decodeProjectPath,
  decodeProjectPathNaive,
  listAllProjects,
  listAllSessions,
  isSessionArchived,
  archiveSessionFile,
  initializeArchive,
  // Plan archiving
  indexEmbeddedPlan,
  generatePlanFilename,
  generateVersionedFilename,
  // Plan cataloger
  catalogPlan,
  // Subagent store
  archiveSubagent,
  readSubagent,
  listSubagentsForSession,
  isSubagentArchived,
  listAllSubagentIds,
  createSubagentReference,
  deleteSubagent,
  getSubagentArchiveStats,
} from "./archive/index.js";

// Explicitly export with aliases for conflicting names
export {
  addToIndex as addToArchiveIndex,
  removeFromIndex as removeFromArchiveIndex,
  getDefaultArchiveSettings as getArchiveDefaultSettings,
} from "./archive/index.js";

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
  ArchivedSubagent,
  SubagentReference,
  SubagentTokenStats,
  CatalogPlanInput,
} from "./archive/index.js";

// Context module
export {
  // Types
  getDefaultIndex,
  migrateIndex,
  // Indexer
  getIndexPath,
  readProjectIndex,
  writeProjectIndex,
  addContextToIndex,
  removeContextFromIndex,
  addSessionToIndex,
  removeSessionFromIndex,
  addPlanToIndex,
  removePlanFromIndex,
  addSubagentToIndex,
  removeSubagentFromIndex,
  fileExistsInIndex,
  readContextIndex,
  writeContextIndex,
  // Manager
  generateContextId,
  sanitizeFilename,
  getContextDir,
  addContext,
  removeContext,
  hasContextFiles,
  estimateTokensFromSize,
  countTokens,
  countFileTokens,
  extractTags,
} from "./context/index.js";

// Explicitly export with aliases for conflicting names
export {
  addToIndex as addToContextIndex,
  removeFromIndex as removeFromContextIndex,
  formatFileSize as formatContextFileSize,
  formatTokenCount as formatContextTokenCount,
} from "./context/index.js";

export type {
  ProjectIndex,
  ContextFile,
  SessionEntry,
  PlanEntry,
  SubagentEntry,
  ContextSource,
  AddContextOptions,
  ContextIndex,
} from "./context/index.js";

// Sources module
export {
  // Config - Obsidian
  getDefaultConfig,
  saveJacquesConfig,
  isObsidianConfigured,
  configureObsidian,
  getObsidianVaultPath,
  // Config - Google Docs
  isGoogleDocsConfigured,
  getGoogleDocsConfig,
  configureGoogleDocs,
  updateGoogleDocsTokens,
  disconnectGoogleDocs,
  // Config - Notion
  isNotionConfigured,
  getNotionConfig,
  configureNotion,
  disconnectNotion,
  // Obsidian adapter
  detectObsidianVaults,
  validateVaultPath,
  listVaultFiles,
  getVaultName,
  buildFileTree,
  flattenTree,
  getVaultFileTree,
  // Google Docs adapter
  refreshGoogleToken,
  listGoogleDriveFiles,
  listAllGoogleDriveFiles,
  exportGoogleDoc,
  getGoogleDriveFile,
  buildGoogleDocsTree,
  flattenGoogleDocsTree,
  getGoogleDocsFileTree,
  // Notion adapter
  searchNotionPages,
  listAllNotionPages,
  getNotionPageContent,
  buildNotionTree,
  flattenNotionTree,
  getNotionPageTree,
} from "./sources/index.js";

// Explicitly export with alias for conflicting name
export { getJacquesConfig as getSourcesJacquesConfig } from "./sources/index.js";

export type {
  JacquesConfig as SourcesJacquesConfig,
  ObsidianSourceConfig,
  ObsidianVault,
  ObsidianFile,
  FileTreeNode,
  FlatTreeItem,
  // New types
  OAuthTokens,
  GoogleDocsSourceConfig,
  NotionSourceConfig,
  GoogleDriveFile,
  NotionPage,
} from "./sources/index.js";

// Storage module
export {
  saveContext,
  saveToArchive,
  generateFilename,
  listSavedContexts,
  ensureContextDirectory,
} from "./storage/index.js";

// Explicitly export with alias for conflicting name
export { formatFileSize as formatStorageFileSize } from "./storage/index.js";

export type {
  WriteOptions,
  WriteResult,
  SaveToArchiveOptions,
  SaveToArchiveResult,
} from "./storage/index.js";

// Utils module
export {
  getClaudeSettings,
  setClaudeSettings,
  getAutoCompactEnabled,
  setAutoCompact,
  toggleAutoCompact,
  getAutoCompactThreshold,
  setJacquesConfig,
  getArchiveSettings,
  setArchiveSettings,
  getAutoArchiveEnabled,
  setAutoArchiveEnabled,
  toggleAutoArchive,
  getArchivePath,
  getSkipPermissions,
  setSkipPermissions,
  toggleSkipPermissions,
  // Claude token management
  validateToken,
  verifyToken,
  saveClaudeToken,
  getClaudeToken,
  isClaudeConnected,
  maskToken,
  disconnectClaude,
} from "./utils/index.js";

// Explicitly export with aliases for conflicting names
export {
  getDefaultArchiveSettings as getUtilsDefaultArchiveSettings,
  getJacquesConfig as getUtilsJacquesConfig,
} from "./utils/index.js";

export type {
  ClaudeSettings,
  ArchiveSettings as UtilsArchiveSettings,
  JacquesConfig as UtilsJacquesConfig,
} from "./utils/index.js";

// Handoff module
export {
  // Catalog operations
  getHandoffsDir,
  ensureHandoffsDir,
  parseTimestampFromFilename,
  generateHandoffFilename,
  formatHandoffDate,
  estimateTokens as estimateHandoffTokens,
  formatTokenEstimate,
  listHandoffs,
  getHandoffContent,
  hasHandoffs,
  getLatestHandoff,
  // Prompts
  HANDOFF_INVOCATION,
  getHandoffPrompt,
  getHandoffPromptDisplay,
  // Generator
  extractHandoffData,
  formatHandoffMarkdown,
  generateHandoffFromTranscript,
  generateHandoffFromEntries,
  // LLM Generator
  generateHandoffWithLLM,
  isSkillInstalled,
  getSkillPath,
  ClaudeCodeError,
} from "./handoff/index.js";

export type {
  HandoffEntry,
  HandoffCatalog,
  HandoffData,
  HandoffResult,
  LLMHandoffResult,
  LLMHandoffOptions,
  LLMStreamCallbacks,
} from "./handoff/index.js";

// Logging module
export { ClaudeOperationLogger } from "./logging/index.js";

export type { ClaudeOperation } from "./logging/index.js";

// Cache module (hybrid architecture - lightweight index, read JSONL directly)
export {
  // Types
  getDefaultSessionIndex,
  decodeProjectPath as decodeCacheProjectPath,
  // Path helpers
  getCacheDir,
  getIndexPath as getCacheIndexPath,
  ensureCacheDir,
  // Index operations
  readSessionIndex,
  writeSessionIndex,
  extractSessionMetadata,
  listAllProjects as listCacheProjects,
  buildSessionIndex,
  extractContinueTitleFromHandoff,
  getSessionIndex,
  getProjectGroupKey,
  getSessionEntry,
  getSessionsByProject,
  discoverProjects,
  hideProject,
  unhideProject,
  getIndexStats as getCacheIndexStats,
  invalidateIndex,
  detectModeAndPlans,
  computeBranchDivergence,
  checkDirtyStatus,
} from "./cache/index.js";

export type {
  SessionEntry as CacheSessionEntry,
  SessionIndex as CacheSessionIndex,
  DiscoveredProject,
  BranchDivergence,
} from "./cache/index.js";

// Project module (dashboard aggregation)
export {
  getDefaultStatistics,
  aggregateProjectStatistics,
  buildProjectSessionList,
  getProjectPlans,
  readLocalPlanContent,
} from "./project/index.js";

export type { ProjectStatistics, ProjectSessionItem } from "./project/index.js";

// Catalog module (pre-extraction for fast dashboard loading)
export {
  extractSessionCatalog,
  extractExploreResult,
  extractSearchResults,
  createSessionManifest,
  extractProjectCatalog,
  extractAllCatalogs,
} from "./catalog/index.js";

export type {
  SessionManifest,
  ExtractSessionOptions,
  ExtractSessionResult,
  BulkExtractOptions,
  BulkExtractResult,
  CatalogProgress,
} from "./catalog/index.js";

// Plan progress module (track completion status of plan items)
export {
  // Parser
  parsePlanMarkdown,
  normalizeText as normalizePlanText,
  extractKeywords as extractPlanKeywords,
  // Task extraction
  extractTaskSignals,
  getModifiedFiles,
  // Matching
  matchSignalsToPlanItems,
  determineItemStatus,
  isTrackableForProgress,
  // Progress computation
  computePlanProgress,
  computePlanProgressSummary,
  clearProgressCache,
  clearAllProgressCache,
} from "./plan/index.js";

export type {
  PlanItem,
  ParsedPlan,
  TaskSignal,
  PlanItemMatch,
  PlanItemStatus,
  PlanItemProgress,
  PlanProgressSummary,
  PlanProgress,
  PlanProgressListItem,
} from "./plan/index.js";

// Branding module (endearment phrases for CLI header)
export { ENDEARMENT_PHRASES, getRandomEndearment, APP_ENDEARMENT } from "./branding.js";

// Shortcuts module (shared keyboard shortcut definitions)
export {
  SHORTCUTS,
  CATEGORY_LABELS,
  getShortcutsForZone,
  getShortcutById,
  getShortcutsByCategory,
  resolveKeyDisplay,
  matchesShortcut,
  findMatchingShortcut,
  fromKeyboardEvent,
  detectPlatform,
} from "./shortcuts/index.js";

export type {
  ShortcutDef,
  ShortcutCategory,
  FocusZone,
  KeyEvent,
} from "./shortcuts/index.js";
