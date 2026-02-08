/**
 * Activity Label Utility
 *
 * Maps session status + last tool name to a human-readable activity label
 * with semantic color and attention state for the UI.
 */

export interface ActivityInfo {
  /** Human-readable label like "Reading files" */
  label: string;
  /** Hex color for the label text */
  color: string;
  /** Whether this state needs user attention (e.g., awaiting approval) */
  needsAttention: boolean;
  /** Lucide icon name hint (consumer maps to actual component) */
  iconHint: string;
}

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  Bash:       { label: 'Running command',   icon: 'terminal' },
  Read:       { label: 'Reading files',     icon: 'file-text' },
  Write:      { label: 'Writing code',      icon: 'pen-tool' },
  Edit:       { label: 'Editing code',       icon: 'pen-tool' },
  Task:       { label: 'Running subagent',  icon: 'bot' },
  Grep:       { label: 'Searching code',    icon: 'search' },
  Glob:       { label: 'Finding files',     icon: 'search' },
  WebSearch:  { label: 'Searching web',     icon: 'globe' },
  WebFetch:   { label: 'Fetching page',     icon: 'globe' },
  NotebookEdit: { label: 'Editing notebook', icon: 'pen-tool' },
};

// Tool-specific labels for awaiting approval state
const AWAITING_LABELS: Record<string, { label: string; icon: string }> = {
  Edit:            { label: 'Accepting edits',    icon: 'pen-tool' },
  Write:           { label: 'Accepting edits',    icon: 'pen-tool' },
  NotebookEdit:    { label: 'Accepting edits',    icon: 'pen-tool' },
  Bash:            { label: 'Approving command',  icon: 'terminal' },
  AskUserQuestion: { label: 'Choosing option',    icon: 'message-square' },
  EnterPlanMode:   { label: 'Reviewing plan',     icon: 'git-branch' },
};

// Status → color mapping
const COLORS = {
  working:  '#E67E52',    // coral accent — active work
  idle:     '#4ADE80',    // green — calm ready state
  active:   '#4ADE80',    // green — starting
  awaiting: '#FBBF24',    // amber — needs attention
  plan:     '#34D399',    // green — plan review
} as const;

/**
 * Get activity info for a session based on its status and last tool name.
 */
export function getActivityInfo(
  status: 'idle' | 'working' | 'active' | 'awaiting' | string,
  lastToolName?: string | null,
): ActivityInfo {
  // Awaiting = Claude called a tool, waiting for user to approve
  if (status === 'awaiting') {
    // Special case: ExitPlanMode — plan is ready for review (green)
    if (lastToolName === 'ExitPlanMode') {
      return {
        label: 'Reviewing plan',
        color: COLORS.plan,
        needsAttention: true,
        iconHint: 'plan',
      };
    }

    const known = lastToolName ? AWAITING_LABELS[lastToolName] : null;
    return {
      label: known?.label || 'Waiting for approval',
      color: COLORS.awaiting,
      needsAttention: true,
      iconHint: known?.icon || 'shield-check',
    };
  }

  // Idle = Claude finished responding — calm ready state
  if (status === 'idle') {
    return {
      label: 'Ready',
      color: COLORS.idle,
      needsAttention: false,
      iconHint: 'check-circle',
    };
  }

  // Active = just registered, not yet working
  if (status === 'active') {
    return {
      label: 'Starting...',
      color: COLORS.active,
      needsAttention: false,
      iconHint: 'loader',
    };
  }

  // Working — resolve tool name to descriptive label
  if (status === 'working') {
    if (!lastToolName) {
      return {
        label: 'Working...',
        color: COLORS.working,
        needsAttention: false,
        iconHint: 'loader',
      };
    }

    // Check known tools
    const known = TOOL_LABELS[lastToolName];
    if (known) {
      return {
        label: known.label,
        color: COLORS.working,
        needsAttention: false,
        iconHint: known.icon,
      };
    }

    // MCP tools: mcp__deepwiki__ask_question → "MCP: deepwiki"
    if (lastToolName.startsWith('mcp__')) {
      const parts = lastToolName.split('__');
      const serverName = parts[1] || 'tool';
      return {
        label: `MCP: ${serverName}`,
        color: COLORS.working,
        needsAttention: false,
        iconHint: 'plug',
      };
    }

    // Unknown tool — show tool name directly
    return {
      label: `Using ${lastToolName}`,
      color: COLORS.working,
      needsAttention: false,
      iconHint: 'wrench',
    };
  }

  // Fallback
  return {
    label: status,
    color: '#6B7075',
    needsAttention: false,
    iconHint: 'circle',
  };
}
