/**
 * Jacques Server Types
 *
 * Type definitions for sessions, events, and context metrics
 * used throughout the Jacques server and dashboard.
 */
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
/**
 * Session status
 */
export type SessionStatus = 'active' | 'working' | 'idle';
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
}
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
}
/**
 * Idle event from Stop hook
 */
export interface IdleEvent extends BaseEvent {
    event: 'idle';
    terminal_pid: number;
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
export type HookEvent = SessionStartEvent | ActivityEvent | ContextUpdateEvent | IdleEvent | SessionEndEvent;
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
 * Union type for all server → client messages
 */
export type ServerMessage = InitialStateMessage | SessionUpdateMessage | SessionRemovedMessage | FocusChangedMessage | ServerStatusMessage | AutoCompactToggledMessage | HandoffReadyMessage;
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
 * Union type for all client → server messages
 */
export type ClientMessage = SelectSessionRequest | TriggerActionRequest | ToggleAutoCompactRequest;
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
export declare const DEFAULT_CONFIG: ServerConfig;
export {};
//# sourceMappingURL=types.d.ts.map