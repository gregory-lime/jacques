/**
 * Session Registry
 *
 * Manages active AI sessions from multiple sources (Claude Code, Cursor, etc.)
 * with focus detection. Focus is determined by terminal focus watcher.
 *
 * Delegates to:
 * - SessionFactory: Session object creation from hooks, discovery, and context updates
 * - ProcessMonitor: Process verification, bypass detection, PID management
 * - CleanupService: Recently-ended tracking and stale session cleanup
 */

import type {
  Session,
  SessionSource,
  SessionMode,
  SessionStartEvent,
  ActivityEvent,
  ContextUpdateEvent,
  ContextMetrics,
} from './types.js';
import type { Logger } from './logging/logger-factory.js';
import { createLogger } from './logging/logger-factory.js';
import type { DetectedSession } from './process-scanner.js';
import { readFile } from 'fs/promises';
import { parseJSONL } from '@jacques-ai/core/session';
import { detectModeAndPlans } from '@jacques-ai/core/cache';
import { matchTerminalKeys } from './connection/terminal-key.js';
import {
  createFromHook,
  createFromDiscovered,
  createFromContextUpdate,
} from './session/session-factory.js';
import { ProcessMonitor } from './session/process-monitor.js';
import { CleanupService } from './session/cleanup-service.js';

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
  private logger: Logger;
  private onSessionRemovedCallback?: (session: Session) => void;

  // Debounce timers for awaiting status (PreToolUse → PostToolUse gap)
  private awaitingTimers = new Map<string, NodeJS.Timeout>();

  // Delegates
  private processMonitor: ProcessMonitor;
  private cleanupService: CleanupService;

  constructor(options: SessionRegistryOptions = {}) {
    // Support both old silent flag and new logger injection
    this.logger = options.logger ?? createLogger({ silent: options.silent });
    this.onSessionRemovedCallback = options.onSessionRemoved;

    // Initialize delegates with callbacks into this registry
    this.processMonitor = new ProcessMonitor({
      callbacks: {
        getSession: (id) => this.sessions.get(id),
        getAllSessions: () => Array.from(this.sessions.entries()),
        removeSession: (id) => this.unregisterSession(id),
      },
      logger: this.logger,
    });

    this.cleanupService = new CleanupService({
      callbacks: {
        getAllSessions: () => Array.from(this.sessions.entries()),
        removeSession: (id) => this.unregisterSession(id),
      },
      logger: this.logger,
    });
  }

  // Convenience accessors for logging (messages already include [Registry] prefix)
  private get log() { return this.logger.log.bind(this.logger); }
  private get warn() { return this.logger.warn.bind(this.logger); }

  /**
   * Detect session mode (planning/execution) from JSONL transcript.
   *
   * For plan mode detection, scans raw JSONL text for EnterPlanMode/ExitPlanMode
   * tool names. This is more reliable than parsed entries because the parser only
   * captures the first tool_use block per assistant message — ExitPlanMode can be
   * bundled with other tools (Edit, Write) and get silently dropped.
   */
  private async detectSessionMode(transcriptPath: string | null): Promise<SessionMode> {
    if (!transcriptPath) return null;

    try {
      // Raw text scan for plan mode — catches all tool_use blocks regardless of position
      const raw = await readFile(transcriptPath, 'utf-8');
      const enterPlanIdx = raw.lastIndexOf('"name":"EnterPlanMode"');
      const exitPlanIdx = raw.lastIndexOf('"name":"ExitPlanMode"');
      // Also check spaced variant: "name": "EnterPlanMode"
      const enterPlanIdxSpaced = raw.lastIndexOf('"name": "EnterPlanMode"');
      const exitPlanIdxSpaced = raw.lastIndexOf('"name": "ExitPlanMode"');
      const lastEnter = Math.max(enterPlanIdx, enterPlanIdxSpaced);
      const lastExit = Math.max(exitPlanIdx, exitPlanIdxSpaced);

      if (lastEnter > lastExit) {
        return 'planning';
      }

      // Fall back to parsed detection for execution mode
      const entries = await parseJSONL(transcriptPath);
      if (entries.length === 0) return null;

      const { mode } = detectModeAndPlans(entries);
      // If plan mode was explicitly exited (ExitPlanMode in JSONL) but parsed
      // detection found no specific mode, return 'default' to clear stale 'planning'
      if (!mode && lastExit !== -1 && lastExit > lastEnter) {
        return 'default';
      }
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

    const session = createFromDiscovered(discovered);
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
    // Clean up any existing sessions in the same terminal (different session_id)
    // This handles /clear, autocompact, and same-terminal reuse
    for (const [id, session] of this.sessions) {
      if (id !== event.session_id && this.isStaleSessionForNewRegistration(session, event)) {
        this.log(`[Registry] Removing stale session ${id} (same terminal as new session ${event.session_id})`);
        this.unregisterSession(id);
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
      const newTitle = event.session_title?.trim();
      if (newTitle && !newTitle.startsWith('<local-command') && !newTitle.startsWith('<command-')) {
        existing.session_title = event.session_title;
      }
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

    const session = createFromHook(event);
    this.sessions.set(event.session_id, session);

    // Check if this session was launched with --dangerously-skip-permissions
    if (this.processMonitor.consumePendingBypass(session.cwd)) {
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
    this.log(`[Registry] Session registered: ${event.session_id} [${session.source}] - "${session.session_title || 'Untitled'}" (${acStatus})`);
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
    this.processMonitor.storeTerminalPid(session, event.terminal_pid);

    // Update mode from permission_mode if available
    this.updateModeFromPermission(session, event.permission_mode);

    // Update title if changed (filter internal command titles to prevent flickering)
    if (event.session_title && event.session_title !== session.session_title) {
      const trimmed = event.session_title.trim();
      if (!trimmed.startsWith('<local-command') && !trimmed.startsWith('<command-')) {
        session.session_title = event.session_title;
      }
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
      if (this.cleanupService.wasRecentlyEnded(event.session_id)) {
        this.log(`[Registry] Ignoring context_update for recently ended session: ${event.session_id}`);
        return null;
      }

      // Determine source from event, default to claude_code for backward compatibility
      const source: SessionSource = event.source || 'claude_code';

      this.log(`[Registry] Auto-registering session from context_update: ${event.session_id} [${source}]`);

      session = createFromContextUpdate(event);

      // Check if this session was launched with --dangerously-skip-permissions
      if (this.processMonitor.consumePendingBypass(session.cwd)) {
        session.is_bypass = true;
        this.log(`[Registry] Auto-registered session marked as bypass: ${event.session_id}`);
      }

      this.sessions.set(event.session_id, session);
      isNewSession = true;

      // Clean up stale sessions from the same terminal (e.g., after /clear or autocompact).
      // Uses PID and terminal_key matching since context_update carries both.
      const newPid = event.terminal_pid ?? null;
      if (newPid && newPid > 0) {
        for (const [id, existing] of this.sessions) {
          if (id !== event.session_id) {
            const existingPid = this.processMonitor.getSessionPid(existing);
            if (existingPid === newPid) {
              this.log(`[Registry] Removing stale session ${id} (same PID ${newPid} as auto-registered session ${event.session_id})`);
              this.unregisterSession(id);
            }
          }
        }
      }
      if (event.terminal_key && event.terminal_key !== '') {
        for (const [id, existing] of this.sessions) {
          if (id !== event.session_id && matchTerminalKeys(existing.terminal_key, event.terminal_key)) {
            this.log(`[Registry] Removing stale session ${id} (same terminal as auto-registered session ${event.session_id})`);
            this.unregisterSession(id);
          }
        }
      }
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
    // Allow upgrading AUTO: (hook-registered) and DISCOVERED: (process-scanner) keys
    const canUpgradeKey = session.terminal_key.startsWith('AUTO:') || session.terminal_key.startsWith('DISCOVERED:');
    if (event.terminal_key && event.terminal_key !== '' && canUpgradeKey) {
      this.log(`[Registry] Updating terminal_key from context_update: ${session.terminal_key} -> ${event.terminal_key}`);

      // Clean up any existing sessions with matching terminal_key (same logic as registerSession)
      for (const [id, existingSession] of this.sessions) {
        if (id !== event.session_id && matchTerminalKeys(existingSession.terminal_key, event.terminal_key)) {
          this.log(`[Registry] Removing stale session ${id} (same terminal_key as updated session ${event.session_id})`);
          this.unregisterSession(id);
        }
      }

      session.terminal_key = event.terminal_key;
    }

    // Update session_title if provided and different (from statusLine hook reading transcript)
    // Filter internal command titles to prevent flickering with "Active Session"
    if (event.session_title && event.session_title.trim() !== '' && event.session_title !== session.session_title
      && !event.session_title.trim().startsWith('<local-command') && !event.session_title.trim().startsWith('<command-')) {
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
      this.processMonitor.storeTerminalPid(session, event.terminal_pid);
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
   */
  async updateSessionMode(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    if (!session.transcript_path) {
      return session;
    }

    try {
      const newMode = await this.detectSessionMode(session.transcript_path);

      if (newMode && newMode !== session.mode) {
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
   */
  setSessionIdle(sessionId: string, permissionMode?: string, terminalPid?: number): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.warn(`[Registry] Idle event for unknown session: ${sessionId}`);
      return null;
    }

    if (terminalPid) {
      this.processMonitor.storeTerminalPid(session, terminalPid);
    }

    this.cancelAwaitingTimer(sessionId);

    session.status = 'idle';
    this.updateModeFromPermission(session, permissionMode);
    this.log(`[Registry] Session idle: ${sessionId}`);

    return session;
  }

  /**
   * Start debounced awaiting status for a session.
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

    if (terminalPid) {
      this.processMonitor.storeTerminalPid(session, terminalPid);
    }

    this.updateModeFromPermission(session, permissionMode);
    this.cancelAwaitingTimer(sessionId);

    const timer = setTimeout(() => {
      this.awaitingTimers.delete(sessionId);
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
   */
  private updateModeFromPermission(session: Session, permissionMode?: string): void {
    if (!permissionMode) return;
    const validModes = ['default', 'plan', 'acceptEdits', 'dontAsk', 'bypassPermissions'];
    if (!validModes.includes(permissionMode)) return;

    if (permissionMode === 'bypassPermissions') {
      if (!session.is_bypass) {
        session.is_bypass = true;
        this.log(`[Registry] Session marked as bypass from permission_mode: ${session.session_id}`);
      }
      return;
    }

    if (session.is_bypass && permissionMode !== 'plan') return;

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
   * Mark a CWD as expecting a bypass session.
   * Delegates to ProcessMonitor.
   */
  markPendingBypass(cwd: string): void {
    this.processMonitor.markPendingBypass(cwd);
  }

  /**
   * Check if an existing session should be considered stale when a new session registers.
   *
   * Matches by:
   * 1. Terminal key (smart matching handles DISCOVERED/iTerm/TTY normalization)
   * 2. PID (same Claude Code process after /clear or autocompact)
   */
  private isStaleSessionForNewRegistration(existing: Session, event: SessionStartEvent): boolean {
    // Strategy 1: Smart terminal key matching
    if (existing.terminal_key && event.terminal_key) {
      if (matchTerminalKeys(existing.terminal_key, event.terminal_key)) {
        return true;
      }
    }

    // Strategy 2: PID matching (handles AUTO: keys where terminal keys can't match)
    const newPid = event.terminal?.terminal_pid ?? null;
    if (newPid && newPid > 0) {
      const existingPid = this.processMonitor.getSessionPid(existing);
      if (existingPid === newPid) {
        return true;
      }
    }

    return false;
  }

  /**
   * Unregister a session
   */
  unregisterSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.warn(`[Registry] Unregister for unknown session: ${sessionId}`);
      return;
    }

    this.cancelAwaitingTimer(sessionId);

    // Track this session as recently ended to prevent re-registration
    this.cleanupService.markRecentlyEnded(sessionId);

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
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions sorted by last activity (most recent first)
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.last_activity - a.last_activity);
  }

  /**
   * Get the focused session ID
   */
  getFocusedSessionId(): string | null {
    return this.focusedSessionId;
  }

  /**
   * Get the focused session
   */
  getFocusedSession(): Session | null {
    if (!this.focusedSessionId) return null;
    return this.sessions.get(this.focusedSessionId) || null;
  }

  /**
   * Manually set the focused session
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
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Find a session by terminal key
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
    for (const timer of this.awaitingTimers.values()) {
      clearTimeout(timer);
    }
    this.awaitingTimers.clear();
    this.sessions.clear();
    this.cleanupService.clear();
    this.focusedSessionId = null;
    this.log('[Registry] All sessions cleared');
  }

  /**
   * Start periodic cleanup of stale sessions.
   * Delegates to CleanupService.
   */
  startCleanup(maxIdleMinutes: number = 60): void {
    this.cleanupService.startCleanup(maxIdleMinutes);
  }

  /**
   * Stop periodic cleanup of stale sessions.
   */
  stopCleanup(): void {
    this.cleanupService.stopCleanup();
    this.processMonitor.stopProcessVerification();
  }

  /**
   * Verify sessions are still valid.
   * Delegates to ProcessMonitor.
   */
  async verifyProcesses(): Promise<void> {
    return this.processMonitor.verifyProcesses();
  }

  /**
   * Detect bypass sessions by checking process command lines.
   * Delegates to ProcessMonitor.
   */
  async detectBypassSessions(): Promise<string[]> {
    return this.processMonitor.detectBypassSessions();
  }

  /**
   * Start periodic process verification.
   * Delegates to ProcessMonitor.
   */
  startProcessVerification(intervalMs?: number): void {
    this.processMonitor.startProcessVerification(intervalMs);
  }
}
