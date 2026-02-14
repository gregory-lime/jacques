/**
 * Session Factory
 *
 * Creates Session objects from different registration sources.
 * Encapsulates the 3 creation paths that were previously in SessionRegistry:
 * - From hook (SessionStart event)
 * - From process scanner (discovered at startup)
 * - From context update (auto-registration from statusLine)
 */

import type {
  Session,
  SessionSource,
  SessionStartEvent,
  ContextUpdateEvent,
} from '../types.js';
import type { DetectedSession } from '../process-scanner.js';

/**
 * Derive a project name from a directory path.
 * Takes the last non-empty path segment.
 */
export function deriveProjectName(projectDir: string | undefined, cwd: string | undefined): string {
  const dir = projectDir || cwd || '';
  return dir.split('/').filter(Boolean).pop() || 'Unknown Project';
}

/**
 * Create a Session from a SessionStart hook event.
 */
export function createFromHook(event: SessionStartEvent): Session {
  const rawSource = event.source || 'claude_code';
  const source: SessionSource = ['startup', 'clear', 'resume'].includes(rawSource)
    ? 'claude_code'
    : rawSource as SessionSource;

  return {
    session_id: event.session_id,
    source,
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
}

/**
 * Create a Session from a process scanner discovery.
 */
export function createFromDiscovered(discovered: DetectedSession): Session {
  // Build terminal key based on available info
  // Priority: terminalSessionId > tty > pid
  let terminalKey: string;
  if (discovered.terminalSessionId) {
    const prefix = discovered.terminalType?.replace(/\s+/g, '') || 'TERM';
    terminalKey = `DISCOVERED:${prefix}:${discovered.terminalSessionId}`;
  } else if (discovered.tty && discovered.tty !== '?') {
    terminalKey = `DISCOVERED:TTY:${discovered.tty}:${discovered.pid}`;
  } else {
    terminalKey = `DISCOVERED:PID:${discovered.pid}`;
  }

  return {
    session_id: discovered.sessionId,
    source: 'claude_code',
    session_title: discovered.title || `Session in ${discovered.project}`,
    transcript_path: discovered.transcriptPath,
    cwd: discovered.cwd,
    project: discovered.project,
    model: null,
    workspace: null,
    terminal: null,
    terminal_key: terminalKey,
    status: discovered.detectedStatus || 'active',
    last_activity: discovered.lastActivity,
    registered_at: Date.now(),
    context_metrics: discovered.contextMetrics,
    autocompact: null,
    git_branch: discovered.gitBranch,
    git_worktree: discovered.gitWorktree,
    git_repo_root: discovered.gitRepoRoot,
    mode: discovered.mode || null,
    last_tool_name: discovered.lastToolName || null,
  };
}

/**
 * Create a Session from a context_update event (auto-registration).
 */
export function createFromContextUpdate(event: ContextUpdateEvent): Session {
  const source: SessionSource = event.source || 'claude_code';
  const projectName = deriveProjectName(event.project_dir, event.cwd);
  const fallbackTitle = `Session in ${projectName}`;

  return {
    session_id: event.session_id,
    source,
    session_title: fallbackTitle,
    transcript_path: event.transcript_path || null,
    cwd: event.cwd || '',
    project: projectName,
    model: event.model ? {
      id: event.model,
      display_name: event.model_display_name || event.model,
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
}
