/**
 * Utils module exports
 */

export {
  // Claude settings
  getClaudeSettings,
  setClaudeSettings,
  getAutoCompactEnabled,
  setAutoCompact,
  toggleAutoCompact,
  getAutoCompactThreshold,
  // Jacques config
  getJacquesConfig,
  setJacquesConfig,
  // Archive settings
  getDefaultArchiveSettings,
  getArchiveSettings,
  setArchiveSettings,
  getAutoArchiveEnabled,
  setAutoArchiveEnabled,
  toggleAutoArchive,
  getArchivePath,
  getSkipPermissions,
  setSkipPermissions,
  toggleSkipPermissions,
} from "./settings.js";

export type {
  ClaudeSettings,
  ArchiveSettings,
  JacquesConfig,
} from "./settings.js";

// Claude token management
export {
  validateToken,
  verifyToken,
  saveClaudeToken,
  getClaudeToken,
  isClaudeConnected,
  maskToken,
  disconnectClaude,
} from "./claude-token.js";
