/**
 * Jacques Server Types
 * 
 * Type definitions for sessions, events, and context metrics
 * used throughout the Jacques server and dashboard.
 */

// ============================================================
// Terminal Identity
// ============================================================

/**
 * Terminal-specific identifiers captured from environment
 * Used to uniquely identify terminal instances
 */
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

// ============================================================
// Auto-Compact Status
// ============================================================

/**
 * Auto-compact status for Claude Code sessions
 * 
 * Claude Code has an `autoCompact` setting in ~/.claude/settings.json.
 * Known Bug (Issue #18264): Even with autoCompact: false, compaction 
 * still triggers at ~78% context usage.
 */
export interface AutoCompactStatus {
  /** Whether auto-compact is enabled in settings.json (true if not set) */
  enabled: boolean;
  /** Threshold percentage for auto-compact (95 default, or from CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) */
  threshold: number;
  /** Bug threshold - 78 if disabled due to known bug, null otherwise */
  bug_threshold: number | null;
}

// ============================================================
// Usage Limits (Anthropic Account Rate Limits)
// ============================================================

export interface UsageLimits {
  fiveHour: { utilization: number; resetsAt: string } | null;
  sevenDay: { utilization: number; resetsAt: string } | null;
  extraUsage: {
    isEnabled: boolean;
    utilization: number;
    usedCredits: number;
    monthlyLimit: number;
    resetsAt: string;
  } | null;
  fetchedAt: number;
}

// ============================================================
// Context Metrics
// ============================================================

/**
 * Context window metrics for a session
 * Tracks token usage, limits, and breakdown
 */
export interface ContextMetrics {
  /** Percentage of context window used (0-100) */
  used_percentage: number;
  /** Percentage of context window remaining (0-100) */
  remaining_percentage: number;
  /** Total tokens currently used */
  total_input_tokens: number;
  /** Total output tokens */
  total_output_tokens: number;
  /** Maximum context window size */
  context_window_size: number;
  /** Total cost in USD */
  total_cost_usd?: number;
  /** Total duration in ms */
  total_duration_ms?: number;
  /** True if this is an estimate (not actual from preCompact) */
  is_estimate?: boolean;
}

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  display_name: string;
}

/**
 * Workspace information
 */
export interface WorkspaceInfo {
  current_dir: string;
  project_dir: string;
}

// ============================================================
// Session
// ============================================================

/**
 * Session status
 * - active: just registered, not yet working
 * - working: Claude is actively processing (tools, generation)
 * - idle: Claude finished, waiting for next user message (Stop hook)
 * - awaiting: Claude called a tool, waiting for user approval (PreToolUse debounce)
 */
export type SessionStatus = 'active' | 'working' | 'idle' | 'awaiting';

/**
 * Session mode - from permission_mode hook field or JSONL detection
 *
 * Hook-based (real-time, preferred):
 * - plan: Plan mode (read-only, no changes)
 * - acceptEdits: Auto-accept mode (Claude runs freely)
 * - default: Normal mode (Claude asks before risky actions)
 *
 * JSONL-based (fallback for discovered sessions):
 * - planning: EnterPlanMode tool was called during session
 * - execution: First user message contains plan trigger pattern
 */
export type SessionMode = 'plan' | 'acceptEdits' | 'default' | 'planning' | 'execution' | 'bypass' | null;

/**
 * Session source - identifies which AI tool the session is from
 */
export type SessionSource = 'claude_code' | 'cursor' | string;

/**
 * Complete session representation
 */
export interface Session {
  /** Unique session identifier from the AI tool */
  session_id: string;
  /** Source identifier (claude_code, cursor, etc.) */
  source: SessionSource;
  /** Human-readable session title (extracted from transcript) */
  session_title: string | null;
  /** Path to the session transcript file */
  transcript_path: string | null;
  /** Current working directory */
  cwd: string;
  /** Project name (derived from cwd) */
  project: string;
  /** Model information */
  model: ModelInfo | null;
  /** Workspace information */
  workspace: WorkspaceInfo | null;
  /** Terminal identity information */
  terminal: TerminalIdentity | null;
  /** Unique terminal key for identification */
  terminal_key: string;
  /** Current session status */
  status: SessionStatus;
  /** Timestamp of last activity */
  last_activity: number;
  /** Timestamp when session was registered */
  registered_at: number;
  /** Context metrics (updated from statusLine) */
  context_metrics: ContextMetrics | null;
  /** Session start reason (startup, resume, clear, compact) */
  start_reason?: 'startup' | 'resume' | 'clear' | 'compact';
  /** Auto-compact status (from ~/.claude/settings.json) */
  autocompact: AutoCompactStatus | null;
  /** Current git branch name */
  git_branch?: string | null;
  /** Git worktree name (if session is in a worktree) */
  git_worktree?: string | null;
  /** Canonical git repo root path (main worktree root, shared across all worktrees) */
  git_repo_root?: string | null;
  /** Session mode: planning if EnterPlanMode was called, execution if started with plan trigger */
  mode?: SessionMode;
  /** Last tool name from PostToolUse activity event */
  last_tool_name?: string | null;
  /** Whether the session was launched with --dangerously-skip-permissions */
  is_bypass?: boolean;
}

// ============================================================
// Hook Events (Unix Socket → Server)
// ============================================================

/**
 * Base event structure
 */
interface BaseEvent {
  event: string;
  timestamp: number;
  session_id: string;
  /** Source identifier (claude_code, cursor, etc.) */
  source?: SessionSource;
}

/**
 * Session start event from SessionStart hook
 */
export interface SessionStartEvent extends BaseEvent {
  event: 'session_start';
  session_title: string | null;
  transcript_path: string | null;
  cwd: string;
  project: string;
  model?: string;
  /** Hook trigger reason (startup, resume, clear, compact) - different from source (AI tool) */
  hook_source?: 'startup' | 'resume' | 'clear' | 'compact';
  terminal: TerminalIdentity | null;
  terminal_key: string;
  /** Auto-compact settings (from ~/.claude/settings.json) */
  autocompact?: AutoCompactStatus;
  /** Git branch detected from project directory */
  git_branch?: string;
  /** Git worktree name */
  git_worktree?: string;
  /** Canonical git repo root path (main worktree root) */
  git_repo_root?: string;
  /** Current permission mode from Claude Code (default, plan, acceptEdits, etc.) */
  permission_mode?: string;
}

/**
 * Pre-tool-use event from PreToolUse hook
 * Fires before a tool executes - used to detect when Claude is waiting for user approval
 */
export interface PreToolUseEvent extends BaseEvent {
  event: 'pre_tool_use';
  tool_name: string;
  terminal_pid: number;
  /** Current permission mode from Claude Code */
  permission_mode?: string;
}

/**
 * Activity event from PostToolUse hook
 */
export interface ActivityEvent extends BaseEvent {
  event: 'activity';
  session_title: string | null;
  tool_name: string;
  terminal_pid: number;
  context_metrics?: ContextMetrics;
  /** Current permission mode from Claude Code */
  permission_mode?: string;
}

/**
 * Context update event from statusLine or hooks
 */
export interface ContextUpdateEvent extends BaseEvent {
  event: 'context_update';
  used_percentage: number;
  remaining_percentage: number;
  context_window_size: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  model: string;
  model_display_name?: string;
  cwd: string;
  project_dir?: string;
  /** True if this is an estimate (from hooks), false if actual (from preCompact) */
  is_estimate?: boolean;
  /** Auto-compact settings (from ~/.claude/settings.json via statusLine) */
  autocompact?: AutoCompactStatus;
  /** Terminal key for focus detection (from statusLine hook) */
  terminal_key?: string;
  /** Terminal PID for bypass detection (from statusLine hook) */
  terminal_pid?: number;
  /** Session title extracted from transcript (from statusLine hook) */
  session_title?: string;
  /** Path to the session transcript file (from statusLine hook) */
  transcript_path?: string;
  /** Git branch detected from project directory */
  git_branch?: string;
  /** Git worktree name (basename of worktree dir) */
  git_worktree?: string;
  /** Canonical git repo root path (main worktree root) */
  git_repo_root?: string;
}

/**
 * Idle event from Stop hook
 */
export interface IdleEvent extends BaseEvent {
  event: 'idle';
  terminal_pid: number;
  /** Current permission mode from Claude Code */
  permission_mode?: string;
}

/**
 * Session end event from SessionEnd hook
 */
export interface SessionEndEvent extends BaseEvent {
  event: 'session_end';
  terminal_pid: number;
}

/**
 * Union type for all hook events
 */
export type HookEvent =
  | SessionStartEvent
  | PreToolUseEvent
  | ActivityEvent
  | ContextUpdateEvent
  | IdleEvent
  | SessionEndEvent;

// ============================================================
// WebSocket Messages (Server ↔ Dashboard)
// ============================================================

/**
 * Initial state sent to newly connected clients
 */
export interface InitialStateMessage {
  type: 'initial_state';
  sessions: Session[];
  focused_session_id: string | null;
}

/**
 * Session update broadcast
 */
export interface SessionUpdateMessage {
  type: 'session_update';
  session: Session;
}

/**
 * Session removed broadcast
 */
export interface SessionRemovedMessage {
  type: 'session_removed';
  session_id: string;
}

/**
 * Focus changed broadcast
 */
export interface FocusChangedMessage {
  type: 'focus_changed';
  session_id: string | null;
  session: Session | null;
}

/**
 * Server status message
 */
export interface ServerStatusMessage {
  type: 'server_status';
  status: 'connected' | 'disconnected';
  session_count: number;
}

/**
 * Auto-compact toggled response
 */
export interface AutoCompactToggledMessage {
  type: 'autocompact_toggled';
  enabled: boolean;
  warning?: string;
}

/**
 * Handoff file ready notification
 */
export interface HandoffReadyMessage {
  type: 'handoff_ready';
  session_id: string;
  path: string;
}

/**
 * Handoff progress notification
 * Sent during handoff generation to show extractor progress
 */
export interface HandoffProgressMessage {
  type: 'handoff_progress';
  session_id: string;
  stage: 'starting' | 'extracting' | 'synthesizing' | 'writing' | 'complete';
  extractors_done: number;
  extractors_total: number;
  current_extractor?: string;
  output_file?: string;
}

/**
 * Server log message
 * Broadcast to clients for real-time log viewing
 */
export interface ServerLogMessage {
  type: 'server_log';
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  source: string;
}

/**
 * Handoff context response
 * Contains pre-extracted compact context for LLM skill (~2k tokens)
 */
export interface HandoffContextMessage {
  type: 'handoff_context';
  session_id: string;
  /** Compact context for LLM skill consumption */
  context: string;
  /** Estimated token count */
  token_estimate: number;
  /** Raw extracted data for reference */
  data: {
    title: string;
    projectDir: string;
    filesModified: string[];
    toolsUsed: string[];
    recentMessages: string[];
    assistantHighlights: string[];
    decisions: string[];
    technologies: string[];
    blockers: string[];
    totalUserMessages: number;
    totalToolCalls: number;
    plans?: Array<{ path: string; title: string }>;
  };
}

/**
 * Handoff context error response
 */
export interface HandoffContextErrorMessage {
  type: 'handoff_context_error';
  session_id: string;
  error: string;
}

/**
 * Claude operation message
 * Broadcasts Claude Code CLI operations (e.g., LLM handoff) to GUI
 */
export interface ClaudeOperationMessage {
  type: 'claude_operation';
  operation: {
    /** Unique identifier for this operation */
    id: string;
    /** ISO timestamp when operation started */
    timestamp: string;
    /** Operation type (e.g., "llm-handoff") */
    operation: string;
    /** Phase: "start" when beginning, "complete" when done */
    phase: 'start' | 'complete';
    /** Input tokens used by the LLM */
    inputTokens: number;
    /** Output tokens generated by the LLM */
    outputTokens: number;
    /** Total tokens (input + output) */
    totalTokens: number;
    /** Cache read tokens (if any) */
    cacheReadTokens?: number;
    /** Duration in milliseconds */
    durationMs: number;
    /** Whether the operation succeeded */
    success: boolean;
    /** Error message if operation failed */
    errorMessage?: string;
    /** Character count of user prompt */
    userPromptChars: number;
    /** Character count of system prompt */
    systemPromptChars: number;
    /** Estimated tokens for user prompt (~4 chars/token) */
    userPromptTokensEst?: number;
    /** Estimated tokens for system prompt (~4 chars/token) */
    systemPromptTokensEst?: number;
    /** Output content length (chars) */
    outputLength?: number;
    /** Truncated preview of user prompt */
    userPromptPreview?: string;
    /** Truncated preview of system prompt */
    systemPromptPreview?: string;
  };
}

/**
 * Focus terminal result message
 * Sent back to the client that requested terminal focus
 */
export interface FocusTerminalResultMessage {
  type: 'focus_terminal_result';
  session_id: string;
  success: boolean;
  method: string;
  error?: string;
}

// ============================================================
// Notification System (re-exported from @jacques/core)
// ============================================================

import type {
  NotificationCategory as _NotificationCategory,
  NotificationSettings as _NotificationSettings,
  NotificationItem as _NotificationItem,
} from '@jacques/core/notifications';

export type NotificationCategory = _NotificationCategory;
export type NotificationSettings = _NotificationSettings;
export type NotificationItem = _NotificationItem;

/**
 * Notification settings message (server → client)
 */
export interface NotificationSettingsMessage {
  type: 'notification_settings';
  settings: NotificationSettings;
}

/**
 * Notification fired message (server → client)
 * Sent when the server detects and fires a notification
 */
export interface NotificationFiredMessage {
  type: 'notification_fired';
  notification: NotificationItem;
}

/**
 * Client request to update notification settings
 */
export interface UpdateNotificationSettingsRequest {
  type: 'update_notification_settings';
  settings: Partial<NotificationSettings>;
}

/**
 * API log message
 * Broadcasts HTTP API requests to GUI for debugging
 */
export interface ApiLogMessage {
  type: 'api_log';
  /** HTTP method (GET, POST, DELETE) */
  method: string;
  /** Request path (e.g., /api/sources/status) */
  path: string;
  /** HTTP status code */
  status: number;
  /** Request duration in milliseconds */
  durationMs: number;
  /** Timestamp when request completed */
  timestamp: number;
}

// ============================================================
// Chat Messages (WebSocket: Client ↔ Server)
// ============================================================

/**
 * Client sends a chat message
 */
export interface ChatSendRequest {
  type: 'chat_send';
  projectPath: string;
  message: string;
}

/**
 * Client requests abort of active chat
 */
export interface ChatAbortRequest {
  type: 'chat_abort';
  projectPath: string;
}

/**
 * Server streams a text delta back
 */
export interface ChatDeltaMessage {
  type: 'chat_delta';
  projectPath: string;
  text: string;
}

/**
 * Server notifies about a tool being used
 */
export interface ChatToolEventMessage {
  type: 'chat_tool_event';
  projectPath: string;
  toolName: string;
}

/**
 * Server signals chat completion
 */
export interface ChatCompleteMessage {
  type: 'chat_complete';
  projectPath: string;
  fullText: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Server signals a chat error
 */
export interface ChatErrorMessage {
  type: 'chat_error';
  projectPath: string;
  reason: 'aborted' | 'timeout' | 'process_error' | 'spawn_failed' | 'already_active';
  message: string;
}

/**
 * Server notifies that project catalog was updated
 */
export interface CatalogUpdatedMessage {
  type: 'catalog_updated';
  projectPath: string;
  action: 'add' | 'update' | 'delete' | 'refresh';
  itemId?: string;
}

/**
 * Union type for all server → client messages
 */
export type ServerMessage =
  | InitialStateMessage
  | SessionUpdateMessage
  | SessionRemovedMessage
  | FocusChangedMessage
  | ServerStatusMessage
  | AutoCompactToggledMessage
  | HandoffReadyMessage
  | HandoffProgressMessage
  | ServerLogMessage
  | HandoffContextMessage
  | HandoffContextErrorMessage
  | ClaudeOperationMessage
  | ApiLogMessage
  | FocusTerminalResultMessage
  | TileWindowsResultMessage
  | MaximizeWindowResultMessage
  | PositionBrowserLayoutResultMessage
  | LaunchSessionResultMessage
  | CreateWorktreeResultMessage
  | ListWorktreesResultMessage
  | RemoveWorktreeResultMessage
  | NotificationSettingsMessage
  | NotificationFiredMessage
  | ChatDeltaMessage
  | ChatToolEventMessage
  | ChatCompleteMessage
  | ChatErrorMessage
  | CatalogUpdatedMessage;

/**
 * Client request to select a session
 */
export interface SelectSessionRequest {
  type: 'select_session';
  session_id: string;
}

/**
 * Client request to trigger an action
 */
export interface TriggerActionRequest {
  type: 'trigger_action';
  session_id: string;
  action: 'smart_compact' | 'new_session' | 'save_snapshot';
  options?: Record<string, unknown>;
}

/**
 * Client request to toggle auto-compact setting
 */
export interface ToggleAutoCompactRequest {
  type: 'toggle_autocompact';
  session_id?: string;
}

/**
 * Client request to get compact handoff context for LLM skill
 */
export interface GetHandoffContextRequest {
  type: 'get_handoff_context';
  session_id: string;
}

/**
 * Client request to focus a terminal window
 */
export interface FocusTerminalRequest {
  type: 'focus_terminal';
  session_id: string;
}

/**
 * Client request to tile multiple terminal windows
 */
export interface TileWindowsRequest {
  type: 'tile_windows';
  session_ids: string[];
  layout?: 'side-by-side' | 'thirds' | '2x2' | 'smart';
  display_id?: string;
}

/**
 * Tile windows result message
 */
export interface TileWindowsResultMessage {
  type: 'tile_windows_result';
  success: boolean;
  positioned: number;
  total: number;
  layout: 'side-by-side' | 'thirds' | '2x2' | 'smart';
  errors?: string[];
}

/**
 * Client request to maximize a terminal window to full screen
 */
export interface MaximizeWindowRequest {
  type: 'maximize_window';
  session_id: string;
}

/**
 * Maximize window result message
 */
export interface MaximizeWindowResultMessage {
  type: 'maximize_window_result';
  session_id: string;
  success: boolean;
  error?: string;
}

/**
 * Client request to position browser and terminal(s) side by side
 */
export interface PositionBrowserLayoutRequest {
  type: 'position_browser_layout';
  session_ids: string[];
  layout: 'browser-terminal' | 'browser-two-terminals';
}

/**
 * Position browser layout result message
 */
export interface PositionBrowserLayoutResultMessage {
  type: 'position_browser_layout_result';
  success: boolean;
  layout: string;
  error?: string;
}

/**
 * Client request to launch a new terminal session running claude
 */
export interface LaunchSessionRequest {
  type: 'launch_session';
  cwd: string;
  preferred_terminal?: string;
  dangerously_skip_permissions?: boolean;
}

/**
 * Launch session result message
 */
export interface LaunchSessionResultMessage {
  type: 'launch_session_result';
  success: boolean;
  method: string;
  cwd: string;
  error?: string;
}

/**
 * Client request to create a new git worktree and optionally launch a session in it
 */
export interface CreateWorktreeRequest {
  type: 'create_worktree';
  /** Canonical git repo root (from session.git_repo_root) */
  repo_root: string;
  /** Worktree name (used as directory suffix and branch name) */
  name: string;
  /** Optional base branch (defaults to HEAD) */
  base_branch?: string;
  /** Whether to launch a Claude session in the new worktree (default true) */
  launch_session?: boolean;
  dangerously_skip_permissions?: boolean;
}

/**
 * Create worktree result message
 */
export interface CreateWorktreeResultMessage {
  type: 'create_worktree_result';
  success: boolean;
  worktree_path?: string;
  branch?: string;
  session_launched?: boolean;
  launch_method?: string;
  error?: string;
}

/**
 * Client request to list all worktrees with their status
 */
export interface ListWorktreesRequest {
  type: 'list_worktrees';
  repo_root: string;
}

/**
 * List worktrees result message
 */
export interface ListWorktreesResultMessage {
  type: 'list_worktrees_result';
  success: boolean;
  repo_root?: string;
  worktrees?: Array<{
    name: string;
    path: string;
    branch: string | null;
    isMain: boolean;
    status: { hasUncommittedChanges: boolean; isMergedToMain: boolean };
  }>;
  error?: string;
}

/**
 * Client request to remove a git worktree
 */
export interface RemoveWorktreeRequest {
  type: 'remove_worktree';
  repo_root: string;
  worktree_path: string;
  force?: boolean;
  delete_branch?: boolean;
}

/**
 * Remove worktree result message
 */
export interface RemoveWorktreeResultMessage {
  type: 'remove_worktree_result';
  success: boolean;
  worktree_path?: string;
  branch_deleted?: boolean;
  error?: string;
}

/**
 * Smart Tile Add request — launch a terminal and smartly tile it into the existing layout.
 * If an existing tiled layout is tracked, extends it (up to 8 windows).
 * Otherwise, places the terminal in the least-occupied area.
 */
export interface SmartTileAddRequest {
  type: 'smart_tile_add';
  /** CWD to launch a new terminal in */
  launch_cwd?: string;
  /** Or: session ID of an already-running terminal to add to the tile */
  new_session_id?: string;
  /** Target display (optional, auto-detected via majority vote or tile state) */
  display_id?: string;
  /** Launch with --dangerously-skip-permissions */
  dangerously_skip_permissions?: boolean;
}

/**
 * Result of a smart tile add operation
 */
export interface SmartTileAddResultMessage {
  type: 'smart_tile_add_result';
  success: boolean;
  /** How many existing windows were repositioned */
  repositioned: number;
  /** Total windows in the tile after the operation */
  total_tiled: number;
  /** Whether the operation fell back to free-space placement */
  used_free_space: boolean;
  /** The launch method used (if a terminal was launched) */
  launch_method?: string;
  error?: string;
}

/**
 * Union type for all client → server messages
 */
export type ClientMessage =
  | SelectSessionRequest
  | TriggerActionRequest
  | ToggleAutoCompactRequest
  | GetHandoffContextRequest
  | FocusTerminalRequest
  | TileWindowsRequest
  | MaximizeWindowRequest
  | PositionBrowserLayoutRequest
  | LaunchSessionRequest
  | CreateWorktreeRequest
  | ListWorktreesRequest
  | RemoveWorktreeRequest
  | SmartTileAddRequest
  | UpdateNotificationSettingsRequest
  | ChatSendRequest
  | ChatAbortRequest;

// ============================================================
// Configuration
// ============================================================

/**
 * Jacques server configuration
 */
export interface ServerConfig {
  unix_socket_path: string;
  websocket_port: number;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default server configuration
 */
export const DEFAULT_CONFIG: ServerConfig = {
  unix_socket_path: '/tmp/jacques.sock',
  websocket_port: 4242,
  log_level: 'info',
};
