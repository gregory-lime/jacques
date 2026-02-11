/**
 * Core Types
 *
 * Shared types for the Jacques ecosystem.
 * These are the canonical types used by both CLI dashboard and GUI.
 */

// ============================================================
// Auto-Compact Status
// ============================================================

/**
 * Auto-compact status for Claude Code sessions
 *
 * Known Bug (Issue #18264): Even with autoCompact: false, compaction
 * still triggers at ~78% context usage.
 */
export interface AutoCompactStatus {
  enabled: boolean;
  threshold: number;
  bug_threshold: number | null;
}

// ============================================================
// Session & Metrics Types
// ============================================================

export interface TerminalIdentity {
  tty: string | null;
  terminal_pid: number;
  term_program: string | null;
  iterm_session_id: string | null;
  term_session_id: string | null;
  kitty_window_id: string | null;
  wezterm_pane: string | null;
  vscode_injection: string | null;
  windowid: string | null;
  term: string | null;
}

export interface ContextMetrics {
  used_percentage: number;
  remaining_percentage: number;
  total_input_tokens: number;
  total_output_tokens: number;
  context_window_size: number;
  total_cost_usd?: number;
  total_duration_ms?: number;
  /** True if this is an estimate (not actual from preCompact) */
  is_estimate?: boolean;
}

export interface ModelInfo {
  id: string;
  display_name: string;
}

export interface WorkspaceInfo {
  current_dir: string;
  project_dir: string;
}

export type SessionStatus = "active" | "working" | "idle" | "tool_use" | "waiting" | "awaiting";

export type SessionSource = "claude_code" | "cursor" | string;

export interface Session {
  session_id: string;
  session_title: string | null;
  transcript_path: string | null;
  cwd: string;
  project: string;
  model: ModelInfo | null;
  workspace: WorkspaceInfo | null;
  terminal: TerminalIdentity | null;
  terminal_key: string;
  status: SessionStatus;
  last_activity: number;
  registered_at: number;
  context_metrics: ContextMetrics | null;
  source?: SessionSource | "startup" | "resume" | "clear" | "compact";
  autocompact: AutoCompactStatus | null;
  git_branch?: string | null;
  git_worktree?: string | null;
  /** Canonical git repo root path (main worktree root, shared across all worktrees) */
  git_repo_root?: string | null;
  /** Last tool used (from PostToolUse hook) */
  last_tool_name?: string | null;
  /** Whether the session was launched with --dangerously-skip-permissions */
  is_bypass?: boolean;
  /** Current permission mode (default, plan, acceptEdits, etc.) */
  mode?: string | null;
}

// ============================================================
// WebSocket Messages
// ============================================================

export interface InitialStateMessage {
  type: "initial_state";
  sessions: Session[];
  focused_session_id: string | null;
}

export interface SessionUpdateMessage {
  type: "session_update";
  session: Session;
}

export interface SessionRemovedMessage {
  type: "session_removed";
  session_id: string;
}

export interface FocusChangedMessage {
  type: "focus_changed";
  session_id: string | null;
  session: Session | null;
}

export interface ServerStatusMessage {
  type: "server_status";
  status: "connected" | "disconnected";
  session_count: number;
}

export interface AutoCompactToggledMessage {
  type: "autocompact_toggled";
  enabled: boolean;
  warning?: string;
}

export interface HandoffReadyMessage {
  type: "handoff_ready";
  session_id: string;
  path: string;
}

export interface FocusTerminalResultMessage {
  type: "focus_terminal_result";
  session_id: string;
  success: boolean;
  method: string;
  error?: string;
}

export interface NotificationFiredMessage {
  type: "notification_fired";
  notification: {
    id: string;
    category: string;
    title: string;
    body: string;
    priority: string;
    timestamp: number;
    sessionId?: string;
  };
}

export type ServerMessage =
  | InitialStateMessage
  | SessionUpdateMessage
  | SessionRemovedMessage
  | FocusChangedMessage
  | ServerStatusMessage
  | AutoCompactToggledMessage
  | HandoffReadyMessage
  | FocusTerminalResultMessage
  | NotificationFiredMessage;

export interface SelectSessionRequest {
  type: "select_session";
  session_id: string;
}

export interface TriggerActionRequest {
  type: "trigger_action";
  session_id: string;
  action: "smart_compact" | "new_session" | "save_snapshot";
  options?: Record<string, unknown>;
}

export interface ToggleAutoCompactRequest {
  type: "toggle_autocompact";
  session_id?: string;
}

export interface FocusTerminalRequest {
  type: "focus_terminal";
  session_id: string;
}

export interface TileWindowsRequest {
  type: "tile_windows";
  session_ids: string[];
  layout?: "side-by-side" | "thirds" | "2x2" | "smart";
  display_id?: string;
}

export interface MaximizeWindowRequest {
  type: "maximize_window";
  session_id: string;
}

export interface LaunchSessionRequest {
  type: "launch_session";
  cwd: string;
  preferred_terminal?: string;
  dangerously_skip_permissions?: boolean;
}

export interface CreateWorktreeRequest {
  type: "create_worktree";
  repo_root: string;
  name: string;
  base_branch?: string;
  launch_session?: boolean;
  dangerously_skip_permissions?: boolean;
}

export interface ListWorktreesRequest {
  type: "list_worktrees";
  repo_root: string;
}

export interface RemoveWorktreeRequest {
  type: "remove_worktree";
  repo_root: string;
  worktree_path: string;
  force?: boolean;
  delete_branch?: boolean;
}

export interface WorktreeWithStatus {
  name: string;
  path: string;
  branch: string | null;
  isMain: boolean;
  status: { hasUncommittedChanges: boolean; isMergedToMain: boolean };
}

export type ClientMessage =
  | SelectSessionRequest
  | TriggerActionRequest
  | ToggleAutoCompactRequest
  | FocusTerminalRequest
  | TileWindowsRequest
  | MaximizeWindowRequest
  | LaunchSessionRequest
  | CreateWorktreeRequest
  | ListWorktreesRequest
  | RemoveWorktreeRequest;
