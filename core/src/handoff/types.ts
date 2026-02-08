/**
 * Handoff Types
 *
 * Type definitions for the session handoff feature.
 */

/**
 * A handoff entry in the catalog
 */
export interface HandoffEntry {
  /** Filename of the handoff (e.g., "2026-01-31T14-30-00-handoff.md") */
  filename: string;
  /** Parsed timestamp from the filename */
  timestamp: Date;
  /** Full path to the handoff file */
  path: string;
  /** Estimated token count (content.length / 4.5) */
  tokenEstimate: number;
}

/**
 * Result of listing handoffs
 */
export interface HandoffCatalog {
  /** Directory where handoffs are stored */
  directory: string;
  /** List of handoff entries, sorted by timestamp (newest first) */
  entries: HandoffEntry[];
}
