/**
 * Claude Settings Utility
 *
 * Reads and writes ~/.claude/settings.json for auto-compact toggle.
 * Also manages Jacques-specific settings in ~/.jacques/config.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const JACQUES_CONFIG_PATH = join(homedir(), ".jacques", "config.json");
const JACQUES_ARCHIVE_PATH = join(homedir(), ".jacques", "archive");

export interface ClaudeSettings {
  autoCompact?: boolean;
  [key: string]: unknown;
}

/**
 * Read Claude settings from ~/.claude/settings.json
 */
export function getClaudeSettings(): ClaudeSettings {
  try {
    if (!existsSync(CLAUDE_SETTINGS_PATH)) {
      return {};
    }
    const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Write Claude settings to ~/.claude/settings.json
 */
export function setClaudeSettings(settings: ClaudeSettings): boolean {
  try {
    const dir = dirname(CLAUDE_SETTINGS_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current auto-compact status
 */
export function getAutoCompactEnabled(): boolean {
  const settings = getClaudeSettings();
  // Default is true if not explicitly set to false
  return settings.autoCompact !== false;
}

/**
 * Set auto-compact status
 */
export function setAutoCompact(enabled: boolean): boolean {
  const settings = getClaudeSettings();
  settings.autoCompact = enabled;
  return setClaudeSettings(settings);
}

/**
 * Toggle auto-compact status and return new value
 */
export function toggleAutoCompact(): { enabled: boolean; warning?: string } {
  const currentEnabled = getAutoCompactEnabled();
  const newEnabled = !currentEnabled;

  if (setAutoCompact(newEnabled)) {
    return {
      enabled: newEnabled,
      warning: newEnabled
        ? undefined
        : "Known bug: may still trigger at ~78%",
    };
  }

  // Return current value if toggle failed
  return {
    enabled: currentEnabled,
    warning: "Failed to update settings",
  };
}

/**
 * Get auto-compact threshold from environment variable
 */
export function getAutoCompactThreshold(): number {
  const override = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (override) {
    const parsed = parseInt(override, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      return parsed;
    }
  }
  return 95; // Default threshold
}

// ============================================================
// Jacques Archive Settings
// ============================================================

export interface ArchiveSettings {
  autoArchive: boolean;
}

export interface JacquesConfig {
  archive?: ArchiveSettings;
  skipPermissions?: boolean;
  sources?: {
    obsidian?: {
      enabled: boolean;
      vaultPath: string;
    };
  };
  [key: string]: unknown;
}

/**
 * Get default archive settings
 */
export function getDefaultArchiveSettings(): ArchiveSettings {
  return {
    autoArchive: false,
  };
}

/**
 * Read Jacques config from ~/.jacques/config.json
 */
export function getJacquesConfig(): JacquesConfig {
  try {
    if (!existsSync(JACQUES_CONFIG_PATH)) {
      return {};
    }
    const content = readFileSync(JACQUES_CONFIG_PATH, "utf-8");
    return JSON.parse(content) as JacquesConfig;
  } catch {
    return {};
  }
}

/**
 * Write Jacques config to ~/.jacques/config.json
 */
export function setJacquesConfig(config: JacquesConfig): boolean {
  try {
    const dir = dirname(JACQUES_CONFIG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(JACQUES_CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get archive settings
 */
export function getArchiveSettings(): ArchiveSettings {
  const config = getJacquesConfig();
  return {
    ...getDefaultArchiveSettings(),
    ...config.archive,
  };
}

/**
 * Set archive settings
 */
export function setArchiveSettings(settings: ArchiveSettings): boolean {
  const config = getJacquesConfig();
  config.archive = settings;
  return setJacquesConfig(config);
}

/**
 * Get auto-archive enabled status
 */
export function getAutoArchiveEnabled(): boolean {
  return getArchiveSettings().autoArchive;
}

/**
 * Set auto-archive enabled status
 */
export function setAutoArchiveEnabled(enabled: boolean): boolean {
  const settings = getArchiveSettings();
  settings.autoArchive = enabled;
  return setArchiveSettings(settings);
}

/**
 * Toggle auto-archive and return new value
 */
export function toggleAutoArchive(): boolean {
  const current = getAutoArchiveEnabled();
  const newValue = !current;
  setAutoArchiveEnabled(newValue);
  return newValue;
}

/**
 * Get archive path
 */
export function getArchivePath(): string {
  return JACQUES_ARCHIVE_PATH;
}

// ============================================================
// Skip Permissions Setting
// ============================================================

/**
 * Get skip-permissions status from Jacques config
 */
export function getSkipPermissions(): boolean {
  const config = getJacquesConfig();
  return config.skipPermissions === true;
}

/**
 * Set skip-permissions status
 */
export function setSkipPermissions(enabled: boolean): boolean {
  const config = getJacquesConfig();
  config.skipPermissions = enabled;
  return setJacquesConfig(config);
}

/**
 * Toggle skip-permissions and return new value
 */
export function toggleSkipPermissions(): boolean {
  const current = getSkipPermissions();
  const newValue = !current;
  setSkipPermissions(newValue);
  return newValue;
}
