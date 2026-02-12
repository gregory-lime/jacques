/**
 * Claude Code settings.json merge logic.
 *
 * Reads, backs up, merges, and writes ~/.claude/settings.json.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import type { SetupOptions } from "./types.js";
import { getHooksConfig, getStatusLineConfig } from "./hooks-config.js";

const CLAUDE_DIR = join(homedir(), ".claude");
const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

/**
 * Load existing Claude Code settings. Returns null if not found or invalid.
 */
export function loadClaudeSettings(): Record<string, unknown> | null {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return null;
  }
  try {
    const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Create a timestamped backup of the current settings.json.
 * Returns the backup path, or null if no settings to back up.
 */
export function createSettingsBackup(): string | null {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return null;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(CLAUDE_DIR, `settings.backup.${timestamp}.json`);
  try {
    copyFileSync(CLAUDE_SETTINGS_PATH, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Check if a hook command belongs to Jacques.
 */
function isJacquesHook(hook: Record<string, unknown>): boolean {
  return typeof hook.command === "string" && hook.command.includes("jacques");
}

/**
 * Merge Jacques hooks into existing hooks, preserving non-Jacques hooks.
 */
function mergeHooksArrays(
  existing: Record<string, unknown[]>,
  jacques: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const merged = { ...existing };

  for (const [eventType, jacquesGroups] of Object.entries(jacques)) {
    if (!merged[eventType]) {
      merged[eventType] = [];
    }

    for (const jacquesGroup of jacquesGroups as Array<Record<string, unknown>>) {
      const existingIndex = (merged[eventType] as Array<Record<string, unknown>>).findIndex(
        (group) => {
          if (group.matcher !== jacquesGroup.matcher) return false;
          return (group.hooks as Array<Record<string, unknown>>)?.some((h) =>
            isJacquesHook(h),
          );
        },
      );

      if (existingIndex >= 0) {
        (merged[eventType] as unknown[])[existingIndex] = jacquesGroup;
      } else {
        merged[eventType].push(jacquesGroup);
      }
    }
  }

  return merged;
}

/**
 * Merge Jacques configuration into existing settings.
 *
 * - Always merges hooks (5 event hooks)
 * - Optionally sets statusLine based on options
 * - Preserves all other existing settings
 */
export function mergeHooksIntoSettings(
  existing: Record<string, unknown>,
  options: SetupOptions,
): Record<string, unknown> {
  const merged = { ...existing };

  // Merge hooks
  const existingHooks = (merged.hooks ?? {}) as Record<string, unknown[]>;
  merged.hooks = mergeHooksArrays(existingHooks, getHooksConfig());

  // Optionally set statusLine
  if (options.installStatusLine) {
    merged.statusLine = getStatusLineConfig();
  }

  return merged;
}

/**
 * Write merged settings to ~/.claude/settings.json.
 * Creates the directory if needed.
 */
export function writeClaudeSettings(settings: Record<string, unknown>): void {
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true });
  }
  writeFileSync(
    CLAUDE_SETTINGS_PATH,
    JSON.stringify(settings, null, 2) + "\n",
  );
}

/**
 * Check if Jacques hooks are already configured in settings.
 */
export function hasJacquesConfigured(
  settings: Record<string, unknown> | null,
): boolean {
  if (!settings) return false;

  // Check statusLine
  const statusLine = settings.statusLine as Record<string, unknown> | undefined;
  if (
    statusLine?.command &&
    typeof statusLine.command === "string" &&
    statusLine.command.includes("jacques")
  ) {
    return true;
  }

  // Check hooks
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (hooks) {
    for (const groups of Object.values(hooks)) {
      for (const group of groups as Array<Record<string, unknown>>) {
        const hookList = group.hooks as Array<Record<string, unknown>> | undefined;
        if (hookList?.some((h) => isJacquesHook(h))) {
          return true;
        }
      }
    }
  }

  return false;
}
