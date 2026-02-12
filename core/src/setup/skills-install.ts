/**
 * Jacques skills installation.
 *
 * Copies skill SKILL.md files to ~/.claude/skills/.
 */

import { existsSync, mkdirSync, copyFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { SetupStepResult } from "./types.js";

const SKILLS_TARGET_DIR = join(homedir(), ".claude", "skills");

const SKILLS = [
  { name: "jacques-handoff", file: "SKILL.md" },
  { name: "jacques-continue", file: "SKILL.md" },
];

/**
 * Check if Jacques skills are already installed.
 */
export function skillsAlreadyInstalled(): boolean {
  return SKILLS.every((skill) =>
    existsSync(join(SKILLS_TARGET_DIR, skill.name, skill.file)),
  );
}

/**
 * Install Jacques skills to ~/.claude/skills/.
 *
 * @param skillsSourceDir Absolute path to the source skills directory (repo/skills/)
 */
export function installSkills(skillsSourceDir: string): SetupStepResult {
  const installed: string[] = [];
  const errors: string[] = [];

  for (const skill of SKILLS) {
    const sourceFile = join(skillsSourceDir, skill.name, skill.file);
    const targetDir = join(SKILLS_TARGET_DIR, skill.name);
    const targetFile = join(targetDir, skill.file);

    if (!existsSync(sourceFile)) {
      errors.push(`Source not found: ${sourceFile}`);
      continue;
    }

    try {
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }
      copyFileSync(sourceFile, targetFile);
      installed.push(skill.name);
    } catch (err) {
      errors.push(`${skill.name}: ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) {
    return {
      step: "Install skills",
      success: false,
      message: `Failed to install: ${errors.join(", ")}`,
    };
  }

  return {
    step: "Install skills",
    success: true,
    message: `Installed ${installed.length} skills: ${installed.join(", ")}`,
  };
}
