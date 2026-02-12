/**
 * Setup module — shared logic for Jacques installation.
 *
 * Used by both the TUI setup wizard and legacy configure scripts.
 */

export type {
  PrerequisiteResult,
  SetupOptions,
  SetupStepResult,
  VerificationResult,
  SyncProgress,
  SyncResult,
} from "./types.js";

export { checkPrerequisites } from "./prerequisites.js";

export {
  getPythonCommand,
  getHooksDir,
  getStatusLineConfig,
  getHooksConfig,
  getJacquesHooksConfig,
} from "./hooks-config.js";

export {
  loadClaudeSettings,
  createSettingsBackup,
  mergeHooksIntoSettings,
  writeClaudeSettings,
  hasJacquesConfigured,
} from "./settings-merge.js";

export { createJacquesDir, setupHooksSymlink } from "./hooks-symlink.js";

export { installSkills, skillsAlreadyInstalled } from "./skills-install.js";

export { verifyInstallation } from "./verification.js";
