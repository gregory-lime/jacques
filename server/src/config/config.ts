/**
 * Centralized Server Configuration
 *
 * All configuration values used by the Jacques server.
 * Values are sourced from environment variables with sensible defaults.
 */

import { getClaudeSettingsPath } from '@jacques-ai/core/session';

/**
 * Server configuration object
 */
export const ServerConfig = {
  /** IPC socket path for hook communication (Unix socket or Windows Named Pipe) */
  unixSocketPath: process.env.JACQUES_SOCKET_PATH ||
    (process.platform === 'win32' ? '\\\\.\\pipe\\jacques' : '/tmp/jacques.sock'),

  /** WebSocket port for dashboard connections */
  wsPort: parseInt(process.env.JACQUES_WS_PORT || '4242', 10),

  /** HTTP API port for REST endpoints */
  httpPort: parseInt(process.env.JACQUES_HTTP_PORT || '4243', 10),

  /** Path to Claude Code settings.json */
  claudeSettingsPath: getClaudeSettingsPath(),

  /** Name of the handoff file watched in project directories */
  handoffFilename: '.jacques-handoff.md',

  /** Auto-compact threshold percentage */
  autoCompactThreshold: parseInt(process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE || '95', 10),

  /** Stale session cleanup interval in minutes */
  staleSessionCleanupMinutes: 60,

  /** Focus watcher polling interval in milliseconds */
  focusWatcherPollMs: 2000,

  /** Cleanup interval in minutes */
  cleanupIntervalMinutes: 5,
} as const;

/**
 * Type for the server configuration
 */
export type ServerConfigType = typeof ServerConfig;
