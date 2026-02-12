/**
 * Prerequisite checks for Jacques setup.
 *
 * Checks Python 3 availability and ~/.claude/ directory existence.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { PrerequisiteResult } from "./types.js";

/**
 * Check all prerequisites and return structured results.
 */
export async function checkPrerequisites(): Promise<PrerequisiteResult[]> {
  const results: PrerequisiteResult[] = [];

  // Check Python 3
  results.push(checkPython());

  // Check ~/.claude/ directory
  results.push(checkClaudeDir());

  return results;
}

function checkPython(): PrerequisiteResult {
  const commands = process.platform === "win32"
    ? ["python", "python3"]
    : ["python3", "python"];

  for (const cmd of commands) {
    try {
      const version = execSync(`${cmd} --version`, {
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      if (version.includes("3.")) {
        return {
          name: "Python 3",
          status: "pass",
          version: `${version} (${cmd})`,
        };
      }
    } catch {
      // Try next command
    }
  }

  return {
    name: "Python 3",
    status: "fail",
    message: "Python 3 not found. Install from https://python.org",
  };
}

function checkClaudeDir(): PrerequisiteResult {
  const claudeDir = join(homedir(), ".claude");

  if (existsSync(claudeDir)) {
    const projectsDir = join(claudeDir, "projects");
    if (existsSync(projectsDir)) {
      return {
        name: "Claude Code",
        status: "pass",
        message: "~/.claude/ directory found with projects",
      };
    }
    return {
      name: "Claude Code",
      status: "warn",
      message: "~/.claude/ exists but no projects/ found — run Claude Code first for full functionality",
    };
  }

  return {
    name: "Claude Code",
    status: "warn",
    message: "~/.claude/ not found — it will be created during setup",
  };
}
