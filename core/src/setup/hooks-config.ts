/**
 * Jacques hook configuration for Claude Code.
 *
 * Defines the hook entries written to ~/.claude/settings.json.
 */

import { homedir } from "os";
import { join } from "path";

/**
 * Get the Python command for the current platform.
 */
export function getPythonCommand(): string {
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Get the hooks directory path as used in settings.json commands.
 */
export function getHooksDir(): string {
  if (process.platform === "win32") {
    return join(homedir(), ".jacques", "hooks").replace(/\\/g, "/");
  }
  return "~/.jacques/hooks";
}

/**
 * Get the statusLine configuration object.
 */
export function getStatusLineConfig(): { type: string; command: string } {
  const python = getPythonCommand();
  const hooksDir = getHooksDir();
  return {
    type: "command",
    command: `${python} ${hooksDir}/statusline.py`,
  };
}

/**
 * Get the hooks configuration (5 event hooks, no statusLine).
 */
export function getHooksConfig(): Record<string, unknown[]> {
  const python = getPythonCommand();
  const hooksDir = getHooksDir();

  return {
    SessionStart: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `${python} ${hooksDir}/claude-code/register-session.py`,
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `${python} ${hooksDir}/claude-code/pre-tool-use.py`,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `${python} ${hooksDir}/claude-code/report-activity.py`,
          },
        ],
      },
    ],
    Stop: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `${python} ${hooksDir}/claude-code/session-idle.py`,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `${python} ${hooksDir}/claude-code/unregister-session.py`,
          },
        ],
      },
    ],
  };
}

/**
 * Get the full Jacques configuration (hooks + statusLine).
 */
export function getJacquesHooksConfig(): {
  statusLine: { type: string; command: string };
  hooks: Record<string, unknown[]>;
} {
  return {
    statusLine: getStatusLineConfig(),
    hooks: getHooksConfig(),
  };
}
