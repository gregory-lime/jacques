/**
 * Hooks symlink management.
 *
 * Creates ~/.jacques/ directory and symlinks ~/.jacques/hooks → source hooks dir.
 */

import {
  existsSync,
  mkdirSync,
  symlinkSync,
  unlinkSync,
  readlinkSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import type { SetupStepResult } from "./types.js";

const JACQUES_DIR = join(homedir(), ".jacques");

/**
 * Create the ~/.jacques/ directory if it doesn't exist.
 */
export function createJacquesDir(): SetupStepResult {
  if (existsSync(JACQUES_DIR)) {
    return {
      step: "Create ~/.jacques/ directory",
      success: true,
      message: "~/.jacques/ already exists",
    };
  }

  try {
    mkdirSync(JACQUES_DIR, { recursive: true });
    return {
      step: "Create ~/.jacques/ directory",
      success: true,
      message: "Created ~/.jacques/",
    };
  } catch (err) {
    return {
      step: "Create ~/.jacques/ directory",
      success: false,
      message: `Failed to create ~/.jacques/: ${(err as Error).message}`,
    };
  }
}

/**
 * Set up the hooks symlink: ~/.jacques/hooks → hooksSourceDir.
 *
 * @param hooksSourceDir Absolute path to the source hooks directory
 */
export function setupHooksSymlink(hooksSourceDir: string): SetupStepResult {
  const hooksTarget = join(JACQUES_DIR, "hooks");

  // Check if symlink already exists and points to the right place
  if (existsSync(hooksTarget)) {
    try {
      const currentTarget = readlinkSync(hooksTarget);
      if (currentTarget === hooksSourceDir) {
        return {
          step: "Set up hooks symlink",
          success: true,
          message: "Hooks symlink already configured",
        };
      }
    } catch {
      // Not a symlink — fall through to remove and recreate
    }

    // Remove existing
    try {
      unlinkSync(hooksTarget);
    } catch (err) {
      return {
        step: "Set up hooks symlink",
        success: false,
        message: `Failed to remove existing hooks: ${(err as Error).message}`,
      };
    }
  }

  // Create symlink (junction on Windows — no admin required)
  try {
    const symlinkType = process.platform === "win32" ? "junction" : "dir";
    symlinkSync(hooksSourceDir, hooksTarget, symlinkType);
    return {
      step: "Set up hooks symlink",
      success: true,
      message: `Created symlink: ~/.jacques/hooks → ${hooksSourceDir}`,
    };
  } catch (err) {
    return {
      step: "Set up hooks symlink",
      success: false,
      message: `Failed to create symlink: ${(err as Error).message}`,
    };
  }
}
