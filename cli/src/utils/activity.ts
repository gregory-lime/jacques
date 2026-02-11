/**
 * CLI Activity Utility
 *
 * Maps session status + last tool name to icon, color, label, and attention state.
 * CLI equivalent of gui/src/utils/activityLabel.ts — same data source, compact labels.
 */

import { ACCENT_COLOR, MUTED_TEXT } from "../components/layout/theme.js";

export interface CliActivityInfo {
  icon: string;
  color: string;
  label: string;
  needsAttention: boolean;
}

const COLORS = {
  working:  ACCENT_COLOR,  // coral — active work
  idle:     MUTED_TEXT,    // gray — calm ready state
  active:   "white",       // white — starting
  awaiting: "#FBBF24",    // amber — needs attention
  plan:     "#34D399",    // green — plan review
} as const;

// Short tool labels for working state (≤9 chars for padEnd)
const TOOL_LABELS: Record<string, string> = {
  Bash:         "cmd",
  Read:         "reading",
  Write:        "writing",
  Edit:         "editing",
  Task:         "subagent",
  Grep:         "search",
  Glob:         "files",
  WebSearch:    "web",
  WebFetch:     "fetch",
  NotebookEdit: "notebook",
};

// Short labels for awaiting state by tool
const AWAITING_LABELS: Record<string, string> = {
  Edit:            "edits",
  Write:           "edits",
  NotebookEdit:    "edits",
  Bash:            "command",
  AskUserQuestion: "question",
  EnterPlanMode:   "plan req",
};

/**
 * Get CLI activity info for a session based on its status and last tool name.
 */
export function getCliActivity(
  status: string | undefined,
  lastToolName?: string | null,
): CliActivityInfo {
  const s = status || "idle";

  // Awaiting = Claude called a tool, waiting for user approval
  if (s === "awaiting" || s === "waiting") {
    // Special case: ExitPlanMode — plan is ready for review (green)
    if (lastToolName === "ExitPlanMode") {
      return { icon: "\u25C9", color: COLORS.plan, label: "plan rdy", needsAttention: true };
    }

    const label = lastToolName ? (AWAITING_LABELS[lastToolName] || "approval") : "approval";
    return { icon: "\u25CE", color: COLORS.awaiting, label, needsAttention: true };
  }

  // Working = Claude is actively processing
  if (s === "working" || s === "tool_use") {
    if (!lastToolName) {
      return { icon: "\u25C9", color: COLORS.working, label: "working", needsAttention: false };
    }

    const known = TOOL_LABELS[lastToolName];
    if (known) {
      return { icon: "\u25C9", color: COLORS.working, label: known, needsAttention: false };
    }

    // MCP tools: mcp__deepwiki__ask_question → "mcp:deepwiki"
    if (lastToolName.startsWith("mcp__")) {
      const server = lastToolName.split("__")[1] || "tool";
      return { icon: "\u25C9", color: COLORS.working, label: `mcp:${server}`, needsAttention: false };
    }

    return { icon: "\u25C9", color: COLORS.working, label: lastToolName.toLowerCase().slice(0, 9), needsAttention: false };
  }

  // Idle = Claude finished, waiting for next user message
  if (s === "idle") {
    return { icon: "\u25CB", color: COLORS.idle, label: "idle", needsAttention: false };
  }

  // Active = just registered
  if (s === "active") {
    return { icon: "\u25CF", color: COLORS.active, label: "active", needsAttention: false };
  }

  // Fallback
  return { icon: "\u25CB", color: MUTED_TEXT, label: s.slice(0, 9), needsAttention: false };
}
