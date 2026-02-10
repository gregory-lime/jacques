/**
 * API Module
 *
 * HTTP client for Jacques server API.
 * Re-exports from domain-specific modules.
 */

// Shared client
export { API_URL, streamSSE } from './client';

// Sources
export {
  getSourcesStatus,
  configureGoogleDocs,
  disconnectGoogleDocs,
  configureNotion,
  disconnectNotion,
} from './sources';
export type {
  SourceStatus,
  SourcesStatus,
  GoogleDocsConfig,
  NotionConfig,
} from './sources';

// Server config
export { getRootPath, setRootPath } from './server-config';
export type { RootPathConfig } from './server-config';

// Archive
export {
  getArchiveStats,
  listArchivedConversations,
  listConversationsByProject,
  getArchivedConversation,
  searchArchivedConversations,
  initializeArchive,
  getSubagent,
  listSessionSubagents,
} from './archive';
export type {
  ArchiveStats,
  ConversationManifest,
  ArchiveProgress,
  ArchiveInitResult,
  ArchivedConversation,
  SubagentSummary,
  SubagentTokenStats,
  SubagentReference,
  ArchivedSubagent,
} from './archive';

// Sessions
export {
  getSessionStats,
  listSessions,
  listSessionsByProject,
  listProjects,
  hideProject,
  getSession,
  getSubagentFromSession,
  getSessionPlanContent,
  getSessionWebSearches,
  getSessionBadges,
  getSessionTasks,
} from './sessions';
export type {
  SessionEntry,
  SessionStats,
  ParsedEntry,
  EntryStatistics,
  SessionData,
  SubagentData,
  DiscoveredProject,
  SessionPlanContent,
  SessionWebSearch,
  SessionBadges,
  SessionTask,
  SessionTaskSummary,
  SessionTasksResponse,
} from './sessions';

// Plans
export { getProjectPlanCatalog, getPlanCatalogContent } from './plans';
export type { PlanCatalogEntry, PlanCatalogContent } from './plans';

// Context
export {
  getProjectCatalog,
  getContextFileContent,
  addContextNote,
  updateContextContent,
  deleteContextFile,
} from './context';

// Sync
export { syncSessions } from './sync';
export type { SyncProgress, SyncResult } from './sync';

// Handoffs
export { getProjectHandoffs, getHandoffContent } from './handoffs';
export type { HandoffEntry, HandoffContent } from './handoffs';

// Usage
export { getUsageLimits } from './usage';

// Notifications
export { getNotificationSettings, updateNotificationSettings } from './notifications';
