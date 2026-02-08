/**
 * Jacques Configuration
 *
 * Reads and writes ~/.jacques/config.json for external source settings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import type { JacquesConfig, GoogleDocsSourceConfig, NotionSourceConfig, OAuthTokens } from "./types.js";
import { getDefaultConfig } from "./types.js";

const JACQUES_DIR = join(homedir(), ".jacques");
const JACQUES_CONFIG_PATH = join(JACQUES_DIR, "config.json");
const DEFAULT_CLAUDE_DIR = join(homedir(), ".claude");

/**
 * Read Jacques configuration from ~/.jacques/config.json
 */
export function getJacquesConfig(): JacquesConfig {
  try {
    if (!existsSync(JACQUES_CONFIG_PATH)) {
      return getDefaultConfig();
    }
    const content = readFileSync(JACQUES_CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(content) as Partial<JacquesConfig>;

    // Merge with defaults to ensure all fields exist
    const defaults = getDefaultConfig();
    return {
      version: parsed.version || defaults.version,
      rootPath: parsed.rootPath,
      sources: {
        obsidian: {
          enabled: parsed.sources?.obsidian?.enabled ?? defaults.sources.obsidian?.enabled ?? false,
          vaultPath: parsed.sources?.obsidian?.vaultPath,
          configuredAt: parsed.sources?.obsidian?.configuredAt,
        },
        googleDocs: {
          enabled: parsed.sources?.googleDocs?.enabled ?? false,
          client_id: parsed.sources?.googleDocs?.client_id,
          client_secret: parsed.sources?.googleDocs?.client_secret,
          tokens: parsed.sources?.googleDocs?.tokens,
          connected_email: parsed.sources?.googleDocs?.connected_email,
          configured_at: parsed.sources?.googleDocs?.configured_at,
        },
        notion: {
          enabled: parsed.sources?.notion?.enabled ?? false,
          client_id: parsed.sources?.notion?.client_id,
          client_secret: parsed.sources?.notion?.client_secret,
          tokens: parsed.sources?.notion?.tokens,
          workspace_id: parsed.sources?.notion?.workspace_id,
          workspace_name: parsed.sources?.notion?.workspace_name,
          configured_at: parsed.sources?.notion?.configured_at,
        },
      },
    };
  } catch {
    return getDefaultConfig();
  }
}

/**
 * Write Jacques configuration to ~/.jacques/config.json
 */
export function saveJacquesConfig(config: JacquesConfig): boolean {
  try {
    if (!existsSync(JACQUES_DIR)) {
      mkdirSync(JACQUES_DIR, { recursive: true });
    }
    writeFileSync(JACQUES_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Obsidian is configured with a valid vault path
 */
export function isObsidianConfigured(): boolean {
  const config = getJacquesConfig();
  return (
    config.sources.obsidian?.enabled === true &&
    typeof config.sources.obsidian?.vaultPath === "string" &&
    config.sources.obsidian.vaultPath.length > 0
  );
}

/**
 * Configure Obsidian vault path
 */
export function configureObsidian(vaultPath: string): boolean {
  const config = getJacquesConfig();
  config.sources.obsidian = {
    enabled: true,
    vaultPath,
    configuredAt: new Date().toISOString(),
  };
  return saveJacquesConfig(config);
}

/**
 * Get configured Obsidian vault path, or null if not configured
 */
export function getObsidianVaultPath(): string | null {
  const config = getJacquesConfig();
  if (isObsidianConfigured()) {
    return config.sources.obsidian?.vaultPath || null;
  }
  return null;
}

// ===== Google Docs Configuration =====

/**
 * Check if Google Docs is configured with valid tokens
 */
export function isGoogleDocsConfigured(): boolean {
  const config = getJacquesConfig();
  return (
    config.sources.googleDocs?.enabled === true &&
    typeof config.sources.googleDocs?.tokens?.access_token === "string" &&
    config.sources.googleDocs.tokens.access_token.length > 0
  );
}

/**
 * Get Google Docs configuration
 */
export function getGoogleDocsConfig(): GoogleDocsSourceConfig | null {
  const config = getJacquesConfig();
  if (config.sources.googleDocs?.enabled) {
    return config.sources.googleDocs;
  }
  return null;
}

/**
 * Configure Google Docs with OAuth tokens
 */
export function configureGoogleDocs(options: {
  client_id: string;
  client_secret: string;
  tokens: OAuthTokens;
  connected_email?: string;
}): boolean {
  const config = getJacquesConfig();
  config.sources.googleDocs = {
    enabled: true,
    client_id: options.client_id,
    client_secret: options.client_secret,
    tokens: options.tokens,
    connected_email: options.connected_email,
    configured_at: new Date().toISOString(),
  };
  return saveJacquesConfig(config);
}

/**
 * Update Google Docs tokens (e.g., after refresh)
 */
export function updateGoogleDocsTokens(tokens: OAuthTokens): boolean {
  const config = getJacquesConfig();
  if (config.sources.googleDocs) {
    config.sources.googleDocs.tokens = tokens;
    return saveJacquesConfig(config);
  }
  return false;
}

/**
 * Disconnect Google Docs
 */
export function disconnectGoogleDocs(): boolean {
  const config = getJacquesConfig();
  config.sources.googleDocs = { enabled: false };
  return saveJacquesConfig(config);
}

// ===== Notion Configuration =====

/**
 * Check if Notion is configured with valid tokens
 */
export function isNotionConfigured(): boolean {
  const config = getJacquesConfig();
  return (
    config.sources.notion?.enabled === true &&
    typeof config.sources.notion?.tokens?.access_token === "string" &&
    config.sources.notion.tokens.access_token.length > 0
  );
}

/**
 * Get Notion configuration
 */
export function getNotionConfig(): NotionSourceConfig | null {
  const config = getJacquesConfig();
  if (config.sources.notion?.enabled) {
    return config.sources.notion;
  }
  return null;
}

/**
 * Configure Notion with OAuth tokens
 */
export function configureNotion(options: {
  client_id: string;
  client_secret: string;
  tokens: OAuthTokens;
  workspace_id?: string;
  workspace_name?: string;
}): boolean {
  const config = getJacquesConfig();
  config.sources.notion = {
    enabled: true,
    client_id: options.client_id,
    client_secret: options.client_secret,
    tokens: options.tokens,
    workspace_id: options.workspace_id,
    workspace_name: options.workspace_name,
    configured_at: new Date().toISOString(),
  };
  return saveJacquesConfig(config);
}

/**
 * Disconnect Notion
 */
export function disconnectNotion(): boolean {
  const config = getJacquesConfig();
  config.sources.notion = { enabled: false };
  return saveJacquesConfig(config);
}

// ===== Root Catalog Path Configuration =====

/**
 * Get the root catalog path (where Claude stores sessions)
 * Returns configured path or default ~/.claude
 */
export function getRootCatalogPath(): string {
  const config = getJacquesConfig();
  return config.rootPath || DEFAULT_CLAUDE_DIR;
}

/**
 * Set the root catalog path
 */
export function setRootCatalogPath(path: string): boolean {
  const config = getJacquesConfig();
  config.rootPath = path;
  return saveJacquesConfig(config);
}

/**
 * Detect the default catalog path and check if it exists
 * Returns the default path and whether it was found
 */
export function detectDefaultCatalogPath(): { path: string; exists: boolean } {
  return {
    path: DEFAULT_CLAUDE_DIR,
    exists: existsSync(DEFAULT_CLAUDE_DIR),
  };
}
