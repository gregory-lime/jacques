/**
 * Session Registry
 * 
 * Manages active AI sessions from multiple sources (Claude Code, Cursor, etc.)
 * with focus detection. Focus is determined by terminal focus watcher.
 */

import type {
  Session,
  SessionStatus,
  SessionSource,
  SessionMode,
  SessionStartEvent,
  ActivityEvent,
  ContextUpdateEvent,
  IdleEvent,
  ContextMetrics,
  ModelInfo,
  AutoCompactStatus,
} from './types.js';
import type { Logger } from './logging/logger-factory.js';
import { createLogger } from './logging/logger-factory.js';
import type { DetectedSession } from './process-scanner.js';
import { parseJSONL } from '@jacques/core/session';
import { detectModeAndPlans } from '@jacques/core/cache';
import {
  RECENTLY_ENDED_TTL_MS,
  IDLE_TIMEOUT_MS,
  CLEANUP_INTERVAL_MS,
  PROCESS_VERIFY_INTERVAL_MS,
} from './connection/constants.js';
import { extractPid, extractItermUuid, matchTerminalKeys } from './connection/terminal-key.js';
import { isProcessRunning, isProcessBypass } from './connection/process-detection.js';

export interface SessionRegistryOptions {
  /** Suppress console output */
  silent?: boolean;
  /** Callback when a session is removed (for triggering catalog extraction) */
  onSessionRemoved?: (session: Session) => void;
  /** Optional logger for dependency injection */
  logger?: Logger;
}

/**
 * SessionRegistry - tracks all active AI sessions from all sources
 *
 * Key behaviors:
 * - Sessions are indexed by session_id
 * - Sessions track their source (claude_code, cursor, etc.)
 * - Focus is determined by terminal focus watcher (macOS AppleScript)
 * - New session registration auto-focuses
 * - Sessions can be manually focused via setFocusedSession
 */
export class SessionRegistry {
  private sessions = new Map<string, Session>();
  private focusedSessionId: string | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private processVerifyInterval: NodeJS.Timeout | null = null;
  private logger: Logger;
  private onSessionRemovedCallback?: (session: Session) => void;

  // Track recently ended sessions to prevent re-registration from stale context_update events
  // This fixes the duplicate session issue when /clear is executed
  private recentlyEndedSessions = new Map<string, number>();

  // Debounce timers for awaiting status (PreToolUse → PostToolUse gap)
  private awaitingTimers = new Map<string, NodeJS.Timeout>();

  // CWDs where a session was launched with --dangerously-skip-permissions
  // Used to set bypass mode when the session registers (since Claude Code reports acceptEdits, not bypassPermissions)
  private pendingBypassCwds = new Set<string>();

  constructor(options: SessionRegistryOptions = {}) {
    // Support both old silent flag and new logger injection
    this.logger = options.logger ?? createLogger({ silent: options.silent });
    this.onSessionRemovedCallback = options.onSessionRemoved;
  }

  // Convenience accessors for logging (messages already include [Registry] prefix)
  private get log() { return this.logger.log.bind(this.logger); }
  private get warn() { return this.logger.warn.bind(this.logger); }

  /**
   * Detect session mode (planning/execution) from JSONL transcript
   * @param transcriptPath Path to the session JSONL file
   * @returns The detected mode or null
   */
  private async detectSessionMode(transcriptPath: string | null): Promise<SessionMode> {
    if (!transcriptPath) return null;

    try {
      const entries = await parseJSONL(transcriptPath);
      if (entries.length === 0) return null;

      const { mode } = detectModeAndPlans(entries);
      return mode;
    } catch (err) {
      this.warn(`[Registry] Failed to detect mode from JSONL: ${err}`);
      return null;
    }
  }

  /**
   * Register a session discovered at startup from process scanning
   * Creates a session with DISCOVERED: terminal key prefix
   * @param discovered Detected session from process scanner
   * @returns The created session, or existing session if already registered
   */
  registerDiscoveredSession(discovered: DetectedSession): Session {
    // Check if session already exists (registered via hooks before scanner finished)
    const existing = this.sessions.get(discovered.sessionId);
    if (existing) {
      this.log(`[Registry] Session already registered, skipping discovery: ${discovered.sessionId}`);
      return existing;
    }

    // Build terminal key based on available info
    // Priority: terminalSessionId > tty > pid
    let terminalKey: string;
    if (discovered.terminalSessionId) {
      // Use terminal-specific session ID (WT_SESSION, ITERM_SESSION_ID, etc.)
      const prefix = discovered.terminalType?.replace(/\s+/g, '') || 'TERM';
      terminalKey = `DISCOVERED:${prefix}:${discovered.terminalSessionId}`;
    } else if (discovered.tty && discovered.tty !== '?') {
      terminalKey = `DISCOVERED:TTY:${discovered.tty}:${discovered.pid}`;
    } else {
      terminalKey = `DISCOVERED:PID:${discovered.pid}`;
    }

    const session: Session = {
      session_id: discovered.sessionId,
      source: 'claude_code',
      session_title: discovered.title || `Session in ${discovered.project}`,
      transcript_path: discovered.transcriptPath,
      cwd: discovered.cwd,
      project: discovered.project,
      model: null, // Unknown until hooks fire
      workspace: null,
      terminal: null, // Not available from process scan
      terminal_key: terminalKey,
      status: 'active',
      last_activity: discovered.lastActivity,
      registered_at: Date.now(),
      context_metrics: discovered.contextMetrics,
      autocompact: null, // Unknown until hooks fire
      git_branch: discovered.gitBranch,
      git_worktree: discovered.gitWorktree,
      git_repo_root: discovered.gitRepoRoot,
      mode: discovered.mode || null,
      last_tool_name: null,
    };

    this.sessions.set(discovered.sessionId, session);

    // Auto-focus if this is the only session
    if (this.sessions.size === 1) {
      this.focusedSessionId = discovered.sessionId;
    }

    const contextInfo = session.context_metrics
      ? `~${session.context_metrics.used_percentage.toFixed(1)}%`
      : 'unknown';
    const terminalInfo = discovered.terminalType || 'Unknown terminal';
    const gitInfo = session.git_branch
      ? ` [${session.git_branch}${session.git_worktree ? `@${session.git_worktree}` : ''}]`
      : '';
    const modeInfo = session.mode ? ` mode=${session.mode}` : '';
    this.log(`[Registry] Discovered session: ${discovered.sessionId} [${discovered.project}]${gitInfo}${modeInfo} - ${contextInfo} (${terminalInfo})`);
    this.log(`[Registry] Terminal key: ${session.terminal_key}`);

    return session;
  }

  /**
   * Register a new session or update an existing auto-registered one
   * @param event SessionStart event data
   * @returns The created/updated session
   */
  registerSession(event: SessionStartEvent): Session {
    // Claude Code sends source as "startup", "clear", "resume" etc. to indicate how session started
    // We need to normalize these to "claude_code" for our internal tracking
    const rawSource = event.source || 'claude_code';
    const source: SessionSource = ['startup', 'clear', 'resume'].includes(rawSource) ? 'claude_code' : rawSource as SessionSource;

    // Clean up any existing sessions with the same terminal_key (different session_id)
    // This handles the case where a new session starts in the same terminal tab
    if (event.terminal_key) {
      for (const [id, session] of this.sessions) {
        if (id !== event.session_id && session.terminal_key === event.terminal_key) {
          this.log(`[Registry] Removing stale session ${id} (same terminal_key as new session ${event.session_id})`);
          this.unregisterSession(id);
        }
      }
    }

    // Check if session was already auto-registered from context_update or discovered at startup
    const existing = this.sessions.get(event.session_id);
    if (existing) {
      // Check if upgrading from a discovered session
      const wasDiscovered = existing.terminal_key?.startsWith('DISCOVERED:');

      // Update the existing session with terminal identity info
      this.log(`[Registry] Updating ${wasDiscovered ? 'discovered' : 'auto-registered'} session with terminal info: ${event.session_id}`);
      existing.terminal = event.terminal;
      existing.terminal_key = event.terminal_key;
      existing.session_title = event.session_title || existing.session_title;
      existing.transcript_path = event.transcript_path || existing.transcript_path;
      if (event.autocompact) {
        existing.autocompact = event.autocompact;
      }
      if (event.git_branch !== undefined) {
        existing.git_branch = event.git_branch || null;
        existing.git_worktree = event.git_worktree || null;
      }
      if (event.git_repo_root !== undefined) {
        existing.git_repo_root = event.git_repo_root || null;
      }
      this.log(`[Registry] Terminal key updated: ${existing.terminal_key}`);
      return existing;
    }

    const session: Session = {
      session_id: event.session_id,
      source: source,
      session_title: event.session_title,
      transcript_path: event.transcript_path,
      cwd: event.cwd,
      project: event.project,
      model: event.model ? { id: event.model, display_name: event.model } : null,
      workspace: null,
      terminal: event.terminal,
      terminal_key: event.terminal_key,
      status: 'active',
      last_activity: event.timestamp,
      registered_at: event.timestamp,
      context_metrics: null,
      autocompact: event.autocompact || null,
      git_branch: event.git_branch || null,
      git_worktree: event.git_worktree || null,
      git_repo_root: event.git_repo_root || null,
      last_tool_name: null,
    };

    this.sessions.set(event.session_id, session);

    // Check if this session was launched with --dangerously-skip-permissions
    if (this.consumePendingBypass(session.cwd)) {
      session.is_bypass = true;
      this.log(`[Registry] Session marked as bypass (launched with --dangerously-skip-permissions): ${event.session_id}`);
    }

    // Set mode from permission_mode if available (bypass is orthogonal to mode)
    this.updateModeFromPermission(session, event.permission_mode);

    // Auto-focus new session
    this.focusedSessionId = event.session_id;

    // Log autocompact status if present
    const acStatus = session.autocompact
      ? `AC:${session.autocompact.enabled ? 'ON' : 'OFF'}@${session.autocompact.threshold}%`
      : 'AC:unknown';
    this.log(`[Registry] Session registered: ${event.session_id} [${source}] - "${session.session_title || 'Untitled'}" (${acStatus})`);
    this.log(`[Registry] Terminal key: ${session.terminal_key}`);

    return session;
  }

  /**
   * Update session with activity event
   * @param event Activity event data
   * @returns Updated session or null if session not found
   */
  updateActivity(event: ActivityEvent): Session | null {
    const session = this.sessions.get(event.session_id);
    if (!session) {
      this.warn(`[Registry] Activity for unknown session: ${event.session_id}`);
      return null;
    }

    // Cancel any pending awaiting timer (PostToolUse means tool was approved/completed)
    this.cancelAwaitingTimer(event.session_id);

    session.last_activity = event.timestamp;
    session.status = 'working';
    session.last_tool_name = event.tool_name || null;

    // Store terminal_pid if not already known (enables bypass detection for auto-registered sessions)
    this.storeTerminalPid(session, event.terminal_pid);

    // Update mode from permission_mode if available
    this.updateModeFromPermission(session, event.permission_mode);

    // Update title if changed
    if (event.session_title && event.session_title !== session.session_title) {
      session.session_title = event.session_title;
    }

    // Update context metrics if provided
    if (event.context_metrics) {
      session.context_metrics = event.context_metrics;
    }

    return session;
  }

  /**
   * Update session with context data from statusLine or preCompact
   * @param event Context update event data
   * @returns Updated session (auto-creates if not found)
   */
  updateContext(event: ContextUpdateEvent): Session | null {
    let session = this.sessions.get(event.session_id);
    let isNewSession = false;

    // Auto-register session if it doesn't exist
    // This handles the timing issue where statusLine/preCompact fires before SessionStart
    if (!session) {
      // Check if this session was recently ended - don't auto-register
      // This prevents stale context_update events from re-creating ended sessions
      const endedAt = this.recentlyEndedSessions.get(event.session_id);
      if (endedAt && Date.now() - endedAt < RECENTLY_ENDED_TTL_MS) {
        this.log(`[Registry] Ignoring context_update for recently ended session: ${event.session_id}`);
        return null;
      }

      // Determine source from event, default to claude_code for backward compatibility
      const source: SessionSource = event.source || 'claude_code';
      
      this.log(`[Registry] Auto-registering session from context_update: ${event.session_id} [${source}]`);
      
      // Derive project name: prefer project_dir, fall back to cwd
      const projectDir = event.project_dir || event.cwd || '';
      const projectName = projectDir.split('/').filter(Boolean).pop() || 'Unknown Project';
      
      // Generate fallback title with project name
      const fallbackTitle = `Session in ${projectName}`;
      
      session = {
        session_id: event.session_id,
        source: source,
        session_title: fallbackTitle, // Fallback title until activity events provide better one
        transcript_path: event.transcript_path || null,
        cwd: event.cwd || '',
        project: projectName,
        model: event.model ? { 
          id: event.model, 
          display_name: event.model_display_name || event.model 
        } : null,
        workspace: event.project_dir ? {
          current_dir: event.cwd || '',
          project_dir: event.project_dir,
        } : null,
        terminal: null,
        terminal_key: `AUTO:${event.session_id}`,
        status: 'active',
        last_activity: event.timestamp,
        registered_at: event.timestamp,
        context_metrics: null,
        autocompact: event.autocompact || null,
        git_branch: event.git_branch || null,
        git_worktree: event.git_worktree || null,
        git_repo_root: event.git_repo_root || null,
        last_tool_name: null,
      };

      // Check if this session was launched with --dangerously-skip-permissions
      if (this.consumePendingBypass(session.cwd)) {
        session.is_bypass = true;
        this.log(`[Registry] Auto-registered session marked as bypass: ${event.session_id}`);
      }

      this.sessions.set(event.session_id, session);
      isNewSession = true;
    }
    
    // Update source if provided and not already set (or was auto-detected)
    if (event.source && (!session.source || session.source === 'claude_code')) {
      session.source = event.source;
    }

    session.last_activity = event.timestamp;

    // context_update implies Claude is actively processing (statusLine fires during generation)
    // Transition active → working so discovered sessions don't stay stuck on "Starting..."
    if (session.status === 'active') {
      session.status = 'working';
      this.log(`[Registry] Session status: active → working (from context_update)`);
    }

    // Update context metrics
    const metrics: ContextMetrics = {
      used_percentage: event.used_percentage ?? 0,
      remaining_percentage: event.remaining_percentage ?? 100,
      context_window_size: event.context_window_size ?? 0,
      total_input_tokens: event.total_input_tokens ?? 0,
      total_output_tokens: event.total_output_tokens ?? 0,
      is_estimate: event.is_estimate ?? false,
    };
    session.context_metrics = metrics;
    
    // Debug: log context update details (show ~ for estimates)
    const estimateMarker = metrics.is_estimate ? '~' : '';
    this.log(`[Registry] Context updated for ${event.session_id}: ${estimateMarker}${metrics.used_percentage.toFixed(1)}% used, model: ${event.model || 'unchanged'}`);
    
    // Update autocompact status if provided
    if (event.autocompact) {
      session.autocompact = event.autocompact;
    }

    // Update model if provided
    if (event.model) {
      session.model = {
        id: event.model,
        display_name: event.model_display_name || event.model,
      };
    }

    // Update workspace info - prefer project_dir for project name
    if (event.project_dir) {
      session.workspace = {
        current_dir: event.cwd || session.cwd,
        project_dir: event.project_dir,
      };
      // Use project_dir for project name (more accurate than cwd)
      const projectName = event.project_dir.split('/').filter(Boolean).pop();
      if (projectName) {
        session.project = projectName;
      }
    } else if (event.cwd) {
      session.cwd = event.cwd;
      // Only use cwd for project name if we don't have project_dir
      if (!session.workspace?.project_dir) {
        session.project = event.cwd.split('/').filter(Boolean).pop() || event.cwd;
      }
    }

    // Focus is driven by terminal focus watcher, not by events

    // Update terminal_key if provided (from statusLine hook)
    if (event.terminal_key && event.terminal_key !== '' && session.terminal_key.startsWith('AUTO:')) {
      this.log(`[Registry] Updating terminal_key from context_update: ${session.terminal_key} -> ${event.terminal_key}`);

      // Clean up any existing sessions with the same terminal_key (same logic as registerSession)
      // This handles the case where an older session in the same terminal tab still has this terminal_key
      for (const [id, existingSession] of this.sessions) {
        if (id !== event.session_id && existingSession.terminal_key === event.terminal_key) {
          this.log(`[Registry] Removing stale session ${id} (same terminal_key as updated session ${event.session_id})`);
          this.unregisterSession(id);
        }
      }

      session.terminal_key = event.terminal_key;
    }

    // Update session_title if provided and different (from statusLine hook reading transcript)
    if (event.session_title && event.session_title.trim() !== '' && event.session_title !== session.session_title) {
      const oldTitle = session.session_title;
      session.session_title = event.session_title.trim();
      this.log(`[Registry] Session title updated: "${oldTitle}" -> "${session.session_title}"`);
    }

    // Update transcript_path if provided and not already set (from statusLine hook)
    if (event.transcript_path && !session.transcript_path) {
      session.transcript_path = event.transcript_path;
      this.log(`[Registry] Transcript path set: ${session.transcript_path}`);
    }

    // Update git branch if provided AND non-empty (from statusLine hook)
    // Don't let empty strings overwrite existing good values
    if (event.git_branch !== undefined && event.git_branch) {
      if (event.git_branch !== session.git_branch) {
        this.log(`[Registry] Git branch updated: "${session.git_branch}" -> "${event.git_branch}"`);
      }
      session.git_branch = event.git_branch;
    }
    if (event.git_worktree !== undefined && event.git_worktree) {
      session.git_worktree = event.git_worktree;
    }

    // Update git_repo_root if provided AND non-empty (from statusLine hook)
    if (event.git_repo_root !== undefined && event.git_repo_root) {
      if (event.git_repo_root !== session.git_repo_root) {
        this.log(`[Registry] Git repo root updated: "${session.git_repo_root}" -> "${event.git_repo_root}"`);
      }
      session.git_repo_root = event.git_repo_root;
    }

    // Store terminal_pid for bypass detection (statusLine sends PID)
    if (event.terminal_pid) {
      this.storeTerminalPid(session, event.terminal_pid);
    }

    if (isNewSession) {
      // Auto-focus newly registered sessions (same as registerSession)
      this.focusedSessionId = event.session_id;
      this.log(`[Registry] Session auto-registered: ${event.session_id} - Project: "${session.project}"`);
    }

    return session;
  }

  /**
   * Update session mode by detecting from JSONL transcript.
   * Call this after session registration or context updates to detect mode changes.
   *
   * @param sessionId Session ID to update mode for
   * @returns Updated session or null if not found, with mode detected from JSONL
   */
  async updateSessionMode(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Only detect mode if we have a transcript path
    if (!session.transcript_path) {
      return session;
    }

    try {
      const newMode = await this.detectSessionMode(session.transcript_path);

      // Only update and log if mode changed
      if (newMode !== session.mode) {
        const oldMode = session.mode;
        session.mode = newMode;
        if (newMode) {
          this.log(`[Registry] Session mode changed: ${sessionId} - ${oldMode || 'null'} -> ${newMode}`);
        }
      }
    } catch (err) {
      this.warn(`[Registry] Failed to update mode for ${sessionId}: ${err}`);
    }

    return session;
  }

  /**
   * Mark session as idle
   * @param sessionId Session ID
   * @param permissionMode Optional permission mode from hook event
   * @returns Updated session or null if session not found
   */
  setSessionIdle(sessionId: string, permissionMode?: string, terminalPid?: number): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.warn(`[Registry] Idle event for unknown session: ${sessionId}`);
      return null;
    }

    // Store terminal_pid if not already known (enables bypass detection for auto-registered sessions)
    if (terminalPid) {
      this.storeTerminalPid(session, terminalPid);
    }

    // Cancel any pending awaiting timer
    this.cancelAwaitingTimer(sessionId);

    session.status = 'idle';
    this.updateModeFromPermission(session, permissionMode);
    this.log(`[Registry] Session idle: ${sessionId}`);

    return session;
  }

  /**
   * Start debounced awaiting status for a session.
   * Called when PreToolUse fires. If PostToolUse arrives within the debounce window,
   * the timer is cancelled and awaiting status is never broadcast.
   *
   * @param sessionId Session ID
   * @param toolName Tool that is pending approval
   * @param permissionMode Optional permission mode from hook event
   * @param onTimeout Callback to broadcast the session update when timer fires
   */
  setSessionAwaiting(
    sessionId: string,
    toolName: string,
    permissionMode: string | undefined,
    onTimeout: (session: Session) => void,
    terminalPid?: number,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Store terminal_pid if not already known (enables bypass detection for auto-registered sessions)
    if (terminalPid) {
      this.storeTerminalPid(session, terminalPid);
    }

    // Update mode immediately even if awaiting doesn't broadcast
    this.updateModeFromPermission(session, permissionMode);

    // Cancel any existing timer for this session
    this.cancelAwaitingTimer(sessionId);

    // Start debounce timer (1 second)
    const timer = setTimeout(() => {
      this.awaitingTimers.delete(sessionId);
      // Set awaiting if PostToolUse hasn't fired yet (session is still working or active)
      const currentSession = this.sessions.get(sessionId);
      if (currentSession && (currentSession.status === 'working' || currentSession.status === 'active')) {
        currentSession.status = 'awaiting';
        currentSession.last_tool_name = toolName;
        this.log(`[Registry] Session awaiting approval: ${sessionId} (${toolName})`);
        onTimeout(currentSession);
      }
    }, 1000);

    this.awaitingTimers.set(sessionId, timer);
  }

  /**
   * Cancel a pending awaiting timer for a session
   */
  private cancelAwaitingTimer(sessionId: string): void {
    const timer = this.awaitingTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.awaitingTimers.delete(sessionId);
    }
  }

  /**
   * Update session mode from permission_mode hook field.
   * Only updates if permissionMode is provided and is a valid value.
   */
  private updateModeFromPermission(session: Session, permissionMode?: string): void {
    if (!permissionMode) return;
    const validModes = ['default', 'plan', 'acceptEdits', 'dontAsk', 'bypassPermissions'];
    if (!validModes.includes(permissionMode)) return;

    // 'bypassPermissions' is a clear signal the session is running with --dangerously-skip-permissions.
    // Mark it immediately (don't wait for async PID check) and skip mode mapping since
    // bypassPermissions doesn't indicate plan vs exec — that's detected via JSONL scanning.
    if (permissionMode === 'bypassPermissions') {
      if (!session.is_bypass) {
        session.is_bypass = true;
        this.log(`[Registry] Session marked as bypass from permission_mode: ${session.session_id}`);
      }
      return;
    }

    // For confirmed bypass sessions, only trust 'plan' from hooks.
    // Other modes (acceptEdits, default) are unreliable for bypass — use JSONL detection instead.
    if (session.is_bypass && permissionMode !== 'plan') return;

    // Map to SessionMode values
    const newMode: SessionMode = permissionMode === 'plan' ? 'plan'
      : permissionMode === 'acceptEdits' ? 'acceptEdits'
      : 'default';

    if (newMode !== session.mode) {
      const oldMode = session.mode;
      session.mode = newMode;
      this.log(`[Registry] Session mode changed: ${session.session_id} - ${oldMode || 'null'} -> ${newMode} (from permission_mode: ${permissionMode})`);
    }
  }

  /**
   * Mark a CWD as expecting a bypass session (launched with --dangerously-skip-permissions).
   * When a session registers from this CWD, its mode will be set to 'bypass'.
   * Auto-expires after 60s.
   */
  markPendingBypass(cwd: string): void {
    const normalized = cwd.replace(/\/+$/, '');
    this.pendingBypassCwds.add(normalized);
    this.log(`[Registry] Marked pending bypass for: ${normalized}`);
    // Auto-expire after 60s
    setTimeout(() => {
      this.pendingBypassCwds.delete(normalized);
    }, 60_000);
  }

  /**
   * Check if a CWD has a pending bypass flag, and consume it if so.
   */
  private consumePendingBypass(cwd: string): boolean {
    const normalized = cwd.replace(/\/+$/, '');
    if (this.pendingBypassCwds.has(normalized)) {
      this.pendingBypassCwds.delete(normalized);
      return true;
    }
    return false;
  }

  /**
   * Unregister a session
   * @param sessionId Session ID
   */
  unregisterSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.warn(`[Registry] Unregister for unknown session: ${sessionId}`);
      return;
    }

    // Cancel any pending awaiting timer
    this.cancelAwaitingTimer(sessionId);

    // Track this session as recently ended to prevent re-registration
    // from stale context_update events (fixes duplicate sessions on /clear)
    this.recentlyEndedSessions.set(sessionId, Date.now());

    // Call the removal callback before deleting (for catalog extraction, etc.)
    if (this.onSessionRemovedCallback) {
      try {
        this.onSessionRemovedCallback(session);
      } catch (err) {
        this.warn(`[Registry] onSessionRemoved callback error: ${err}`);
      }
    }

    this.sessions.delete(sessionId);
    this.log(`[Registry] Session removed: ${sessionId}`);

    // Clear focus if this was the focused session
    if (this.focusedSessionId === sessionId) {
      // Focus most recent remaining session
      const remaining = Array.from(this.sessions.values())
        .sort((a, b) => b.last_activity - a.last_activity);
      this.focusedSessionId = remaining[0]?.session_id || null;

      if (this.focusedSessionId) {
        this.log(`[Registry] Focus shifted to: ${this.focusedSessionId}`);
      }
    }
  }

  /**
   * Get a session by ID
   * @param sessionId Session ID
   * @returns Session or undefined
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions sorted by last activity (most recent first)
   * @returns Array of sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.last_activity - a.last_activity);
  }

  /**
   * Get the focused session ID
   * @returns Focused session ID or null
   */
  getFocusedSessionId(): string | null {
    return this.focusedSessionId;
  }

  /**
   * Get the focused session
   * @returns Focused session or null
   */
  getFocusedSession(): Session | null {
    if (!this.focusedSessionId) return null;
    return this.sessions.get(this.focusedSessionId) || null;
  }

  /**
   * Manually set the focused session
   * @param sessionId Session ID to focus
   * @returns true if session exists and was focused
   */
  setFocusedSession(sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) {
      this.warn(`[Registry] Cannot focus unknown session: ${sessionId}`);
      return false;
    }
    this.focusedSessionId = sessionId;
    this.log(`[Registry] Focus set to: ${sessionId}`);
    return true;
  }

  /**
   * Get the number of active sessions
   * @returns Session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Check if a session exists
   * @param sessionId Session ID
   * @returns true if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Find a session by terminal key
   * @param terminalKey Terminal key to search for
   * @returns Session or null if not found
   */
  findSessionByTerminalKey(terminalKey: string): Session | null {
    for (const session of this.sessions.values()) {
      if (session.terminal_key && matchTerminalKeys(session.terminal_key, terminalKey)) {
        return session;
      }
    }
    return null;
  }

  /**
   * Clear all sessions (for testing or reset)
   */
  clear(): void {
    // Cancel all awaiting timers
    for (const timer of this.awaitingTimers.values()) {
      clearTimeout(timer);
    }
    this.awaitingTimers.clear();
    this.sessions.clear();
    this.recentlyEndedSessions.clear();
    this.focusedSessionId = null;
    this.log('[Registry] All sessions cleared');
  }

  /**
   * Clean up expired entries from the recently-ended sessions map
   */
  private cleanupRecentlyEnded(): void {
    const now = Date.now();
    let cleanedCount = 0;
    for (const [id, timestamp] of this.recentlyEndedSessions) {
      if (now - timestamp > RECENTLY_ENDED_TTL_MS) {
        this.recentlyEndedSessions.delete(id);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.log(`[Registry] Cleaned up ${cleanedCount} expired recently-ended session entries`);
    }
  }

  /**
   * Start periodic cleanup of stale sessions
   * @param maxIdleMinutes Maximum idle time before a session is removed (default: 60 minutes)
   */
  startCleanup(maxIdleMinutes: number = 60): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    const runCleanup = (): void => {
      const cutoff = Date.now() - (maxIdleMinutes * 60 * 1000);
      const staleSessionIds: string[] = [];

      for (const [id, session] of this.sessions) {
        if (session.status === 'idle' && session.last_activity < cutoff) {
          staleSessionIds.push(id);
        }
      }

      for (const id of staleSessionIds) {
        this.log(`[Registry] Cleaning up stale session: ${id}`);
        this.unregisterSession(id);
      }

      if (staleSessionIds.length > 0) {
        this.log(`[Registry] Cleaned up ${staleSessionIds.length} stale session(s)`);
      }

      // Also clean up recently-ended session tracking
      this.cleanupRecentlyEnded();
    };

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
    this.log(`[Registry] Stale session cleanup started (threshold: ${maxIdleMinutes} minutes)`);
  }

  /**
   * Stop periodic cleanup of stale sessions
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.log('[Registry] Stale session cleanup stopped');
    }
    if (this.processVerifyInterval) {
      clearInterval(this.processVerifyInterval);
      this.processVerifyInterval = null;
    }
  }

  /**
   * Get PID for a session from any available source.
   * Priority: terminal_key → session.terminal.terminal_pid
   */
  private getSessionPid(session: Session): number | null {
    // First try terminal_key (DISCOVERED:TTY:xxx:PID or PID:xxx format)
    const keyPid = extractPid(session.terminal_key);
    if (keyPid !== null) {
      return keyPid;
    }

    // Fall back to terminal.terminal_pid (from hooks)
    if (session.terminal?.terminal_pid) {
      return session.terminal.terminal_pid;
    }

    return null;
  }

  /**
   * Store terminal_pid on a session if not already known.
   * When a PID is first stored, checks if the process is running with
   * --dangerously-skip-permissions and marks the session accordingly.
   * This handles auto-registered sessions that initially lack PID info.
   */
  private storeTerminalPid(session: Session, terminalPid: number): void {
    if (!terminalPid || terminalPid <= 0) return;

    // Store the PID on the terminal object if not already known
    const existingPid = this.getSessionPid(session);
    if (existingPid === null) {
      if (!session.terminal) {
        session.terminal = {
          tty: null,
          terminal_pid: terminalPid,
          term_program: null,
          iterm_session_id: null,
          term_session_id: null,
          kitty_window_id: null,
          wezterm_pane: null,
          vscode_injection: null,
          windowid: null,
          term: null,
        };
      } else if (!session.terminal.terminal_pid) {
        session.terminal.terminal_pid = terminalPid;
      }
      this.log(`[Registry] Stored terminal_pid ${terminalPid} for session ${session.session_id}`);
    }

    // Now check if this process is bypass (async, non-blocking)
    if (!session.is_bypass) {
      isProcessBypass(terminalPid).then((bypass: boolean) => {
        if (bypass) {
          session.is_bypass = true;
          this.log(`[Registry] Detected bypass from stored PID ${terminalPid} for session ${session.session_id}`);
        }
      }).catch(() => {});
    }
  }

  /**
   * Verify sessions are still valid:
   * 1. Process is still running (checks all PID sources)
   * 2. CWD is not in Trash
   * 3. Session is not idle beyond timeout
   *
   * Removes sessions that fail any of these checks.
   */
  async verifyProcesses(): Promise<void> {
    const sessionsToRemove: string[] = [];
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      // 1. Check if process is still running (using ALL PID sources)
      const pid = this.getSessionPid(session);
      if (pid !== null) {
        const isRunning = await isProcessRunning(pid);
        if (!isRunning) {
          this.log(`[Registry] Process ${pid} no longer running for session ${id}`);
          sessionsToRemove.push(id);
          continue;
        }
      }

      // 2. Check if CWD is in Trash or doesn't exist
      if (session.cwd && session.cwd.includes('.Trash')) {
        this.log(`[Registry] CWD in Trash for session ${id}: ${session.cwd}`);
        sessionsToRemove.push(id);
        continue;
      }

      // 3. Check for idle timeout (no activity in X hours)
      if (now - session.last_activity > IDLE_TIMEOUT_MS) {
        const hoursIdle = ((now - session.last_activity) / (1000 * 60 * 60)).toFixed(1);
        this.log(`[Registry] Session ${id} idle for ${hoursIdle}h, marking as stale`);
        sessionsToRemove.push(id);
        continue;
      }
    }

    for (const id of sessionsToRemove) {
      this.log(`[Registry] Removing stale/dead session: ${id}`);
      this.unregisterSession(id);
    }

    if (sessionsToRemove.length > 0) {
      this.log(`[Registry] Removed ${sessionsToRemove.length} stale/dead session(s)`);
    }
  }

  /**
   * Detect bypass sessions by checking each session's actual process command line.
   * Only checks sessions that have a known PID (from terminal_key or terminal.terminal_pid).
   *
   * Sessions without PIDs (e.g., auto-registered iTerm sessions) will get their PID
   * from the next activity/pre_tool_use/idle hook event, which triggers storeTerminalPid()
   * and its own bypass check.
   *
   * @returns Array of session IDs that were updated
   */
  async detectBypassSessions(): Promise<string[]> {
    const updated: string[] = [];

    for (const [id, session] of this.sessions) {
      if (session.is_bypass) continue;

      const pid = this.getSessionPid(session);
      if (pid === null) continue;

      const bypass = await isProcessBypass(pid);
      if (bypass) {
        session.is_bypass = true;
        updated.push(id);
        this.log(`[Registry] Detected bypass from PID ${pid} for session ${id}`);
      }
    }

    return updated;
  }

  /**
   * Start periodic process verification
   * @param intervalMs Interval between checks in milliseconds (default: 30 seconds)
   */
  startProcessVerification(intervalMs: number = PROCESS_VERIFY_INTERVAL_MS): void {
    if (this.processVerifyInterval) {
      return; // Already running
    }

    // Run immediately on start
    this.verifyProcesses().catch((err) => {
      this.warn(`[Registry] Process verification failed: ${err}`);
    });

    // Then run periodically
    this.processVerifyInterval = setInterval(() => {
      this.verifyProcesses().catch((err) => {
        this.warn(`[Registry] Process verification failed: ${err}`);
      });
    }, intervalMs);

    this.log(`[Registry] Process verification started (interval: ${intervalMs / 1000}s)`);
  }
}
