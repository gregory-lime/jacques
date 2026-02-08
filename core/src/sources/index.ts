/**
 * Sources Module
 *
 * External context sources (Obsidian, Google Docs, Notion).
 */

// Types
export type {
  JacquesConfig,
  ObsidianSourceConfig,
  ObsidianVault,
  ObsidianFile,
  FileTreeNode,
  FlatTreeItem,
  OAuthTokens,
  GoogleDocsSourceConfig,
  NotionSourceConfig,
  GoogleDriveFile,
  NotionPage,
} from "./types.js";
export { getDefaultConfig } from "./types.js";

// Config - Obsidian
export {
  getJacquesConfig,
  saveJacquesConfig,
  isObsidianConfigured,
  configureObsidian,
  getObsidianVaultPath,
} from "./config.js";

// Config - Google Docs
export {
  isGoogleDocsConfigured,
  getGoogleDocsConfig,
  configureGoogleDocs,
  updateGoogleDocsTokens,
  disconnectGoogleDocs,
} from "./config.js";

// Config - Notion
export {
  isNotionConfigured,
  getNotionConfig,
  configureNotion,
  disconnectNotion,
} from "./config.js";

// Obsidian adapter
export {
  detectObsidianVaults,
  validateVaultPath,
  listVaultFiles,
  getVaultName,
  buildFileTree,
  flattenTree,
  getVaultFileTree,
} from "./obsidian.js";

// Google Docs adapter
export {
  refreshGoogleToken,
  listGoogleDriveFiles,
  listAllGoogleDriveFiles,
  exportGoogleDoc,
  getGoogleDriveFile,
  buildGoogleDocsTree,
  flattenGoogleDocsTree,
  getGoogleDocsFileTree,
} from "./googledocs.js";

// Notion adapter
export {
  searchNotionPages,
  listAllNotionPages,
  getNotionPageContent,
  buildNotionTree,
  flattenNotionTree,
  getNotionPageTree,
} from "./notion.js";
