/**
 * Source Types
 *
 * Type definitions for external context sources (Obsidian, Google Docs, Notion).
 */

/**
 * OAuth tokens for API access
 */
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

/**
 * Jacques global configuration stored in ~/.jacques/config.json
 */
export interface JacquesConfig {
  version: string;
  /** Path to Claude's .claude directory (defaults to ~/.claude) */
  rootPath?: string;
  sources: {
    obsidian?: ObsidianSourceConfig;
    googleDocs?: GoogleDocsSourceConfig;
    notion?: NotionSourceConfig;
  };
}

/**
 * Obsidian-specific configuration
 */
export interface ObsidianSourceConfig {
  enabled: boolean;
  vaultPath?: string;
  configuredAt?: string;
}

/**
 * Google Docs source configuration
 */
export interface GoogleDocsSourceConfig {
  enabled: boolean;
  client_id?: string;
  client_secret?: string;
  tokens?: OAuthTokens;
  connected_email?: string;
  configured_at?: string;
}

/**
 * Notion source configuration
 */
export interface NotionSourceConfig {
  enabled: boolean;
  client_id?: string;
  client_secret?: string;
  tokens?: OAuthTokens;
  workspace_id?: string;
  workspace_name?: string;
  configured_at?: string;
}

/**
 * Google Drive file from API
 */
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents?: string[];
  size?: string;
}

/**
 * Notion page from API
 */
export interface NotionPage {
  id: string;
  title: string;
  parent_type: "workspace" | "page" | "database";
  parent_id?: string;
  last_edited_time: string;
  icon?: string;
}

/**
 * Detected Obsidian vault from system
 */
export interface ObsidianVault {
  id: string;
  path: string;
  name: string;
  isOpen?: boolean;
}

/**
 * Markdown file within an Obsidian vault
 */
export interface ObsidianFile {
  path: string;
  relativePath: string;
  name: string;
  sizeBytes: number;
  modifiedAt: Date;
}

/**
 * Tree node for file explorer (can be folder or file)
 */
export interface FileTreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  depth: number;
  path: string;
  relativePath: string;
  // For files only
  sizeBytes?: number;
  modifiedAt?: Date;
  // For folders only
  children?: FileTreeNode[];
  fileCount?: number;
}

/**
 * Flattened tree item for rendering (includes expansion state)
 */
export interface FlatTreeItem {
  id: string;
  name: string;
  type: "folder" | "file";
  depth: number;
  path: string;
  relativePath: string;
  sizeBytes?: number;
  modifiedAt?: Date;
  isExpanded?: boolean;
  fileCount?: number;
}

/**
 * Default empty configuration
 */
export function getDefaultConfig(): JacquesConfig {
  return {
    version: "1.0.0",
    sources: {
      obsidian: { enabled: false },
      googleDocs: { enabled: false },
      notion: { enabled: false },
    },
  };
}
