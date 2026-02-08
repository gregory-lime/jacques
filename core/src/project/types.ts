/**
 * Project Dashboard Types
 *
 * Type definitions for the project dashboard view.
 * Aggregates data from live sessions, saved sessions, and archive.
 */

/**
 * Aggregated statistics for a project
 */
export interface ProjectStatistics {
  /** Total sessions (live + saved + archived) */
  totalSessions: number;
  /** Currently active/live sessions */
  activeSessions: number;
  /** Saved sessions in .jacques/ */
  savedSessions: number;
  /** Archived sessions in global archive */
  archivedSessions: number;

  /** Total input tokens used across all sessions */
  totalInputTokens: number;
  /** Total output tokens used across all sessions */
  totalOutputTokens: number;

  /** Total agent/subagent calls */
  totalAgentCalls: number;
  /** Total web searches performed */
  totalWebSearches: number;
  /** Total auto-compacts that occurred */
  totalAutoCompacts: number;

  /** Total handoff documents created */
  totalHandoffs: number;
  /** Total plans created */
  totalPlans: number;

  /** Total duration across all sessions (minutes) */
  totalDurationMinutes: number;

  /** Model usage: model name -> session count */
  modelUsage: Record<string, number>;
}

/**
 * A session item for display in the dashboard
 */
export interface ProjectSessionItem {
  /** Session ID */
  id: string;
  /** Session title */
  title: string;
  /** Source: live (active), saved (in .jacques), or archived (global) */
  source: "live" | "saved" | "archived";
  /** Display date (ISO string) */
  date: string;
  /** Duration in minutes */
  durationMinutes: number;
  /** Model used (if known) */
  model?: string;
  /** Context percentage (only for live sessions) */
  contextPercent?: number;
  /** Is this session currently active? */
  isActive: boolean;
  /** Is this the focused session? */
  isFocused: boolean;
}

/**
 * Default empty statistics
 */
export function getDefaultStatistics(): ProjectStatistics {
  return {
    totalSessions: 0,
    activeSessions: 0,
    savedSessions: 0,
    archivedSessions: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalAgentCalls: 0,
    totalWebSearches: 0,
    totalAutoCompacts: 0,
    totalHandoffs: 0,
    totalPlans: 0,
    totalDurationMinutes: 0,
    modelUsage: {},
  };
}
