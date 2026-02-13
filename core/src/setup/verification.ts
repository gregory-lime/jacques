/**
 * Post-installation verification checks.
 */

import { existsSync, readFileSync, readlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { SetupOptions, VerificationResult } from "./types.js";
import { hasJacquesConfigured } from "./settings-merge.js";

/**
 * Run all verification checks after installation.
 */
export function verifyInstallation(options: SetupOptions): VerificationResult[] {
  const results: VerificationResult[] = [];

  // Check ~/.claude/ directory
  const claudeDir = join(homedir(), ".claude");
  results.push({
    check: "~/.claude/ directory",
    status: existsSync(claudeDir) ? "pass" : "fail",
    message: existsSync(claudeDir)
      ? "~/.claude/ directory found"
      : "~/.claude/ directory missing",
  });

  // Check ~/.claude/projects/
  const projectsDir = join(claudeDir, "projects");
  results.push({
    check: "Claude Code projects",
    status: existsSync(projectsDir) ? "pass" : "warn",
    message: existsSync(projectsDir)
      ? "~/.claude/projects/ exists"
      : "~/.claude/projects/ not found — start Claude Code to create it",
  });

  // Check hooks symlink
  const hooksTarget = join(homedir(), ".jacques", "hooks");
  let hooksStatus: "pass" | "fail" = "fail";
  let hooksMessage = "~/.jacques/hooks symlink missing";
  if (existsSync(hooksTarget)) {
    try {
      readlinkSync(hooksTarget);
      hooksStatus = "pass";
      hooksMessage = "~/.jacques/hooks symlink valid";
    } catch {
      hooksStatus = "fail";
      hooksMessage = "~/.jacques/hooks exists but is not a symlink";
    }
  }
  results.push({ check: "Hooks symlink", status: hooksStatus, message: hooksMessage });

  // Check settings.json
  const settingsPath = join(claudeDir, "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, "utf8");
      const settings = JSON.parse(content);
      const hasHooks = settings.hooks && Object.keys(settings.hooks).length > 0;
      results.push({
        check: "settings.json",
        status: hasHooks ? "pass" : "warn",
        message: hasHooks
          ? "settings.json contains Jacques hooks"
          : "settings.json exists but no hooks found",
      });
    } catch {
      results.push({
        check: "settings.json",
        status: "fail",
        message: "settings.json exists but is not valid JSON",
      });
    }
  } else {
    results.push({
      check: "settings.json",
      status: "fail",
      message: "settings.json not found",
    });
  }

  // Check skills if installed
  if (options.installSkills) {
    const skillsDir = join(claudeDir, "skills");
    const handoff = existsSync(join(skillsDir, "jacques-handoff", "SKILL.md"));
    const cont = existsSync(join(skillsDir, "jacques-continue", "SKILL.md"));
    results.push({
      check: "Skills",
      status: handoff && cont ? "pass" : "warn",
      message:
        handoff && cont
          ? "Skills installed (/jacques-handoff, /jacques-continue)"
          : "Some skills missing",
    });
  }

  return results;
}

/**
 * Quick check: is Jacques minimally configured?
 *
 * Checks:
 * 1. ~/.jacques/hooks symlink exists
 * 2. ~/.claude/settings.json has Jacques hooks configured
 *
 * Used by the CLI to gate dashboard startup on first run.
 */
export function isSetupComplete(): boolean {
  const hooksSymlink = join(homedir(), ".jacques", "hooks");
  if (!existsSync(hooksSymlink)) {
    return false;
  }

  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    return false;
  }

  try {
    const content = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(content);
    return hasJacquesConfigured(settings);
  } catch {
    return false;
  }
}
