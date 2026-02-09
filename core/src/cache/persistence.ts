/**
 * Persistence
 *
 * Session index file I/O and caching with build deduplication.
 */

import { promises as fs } from "fs";
import * as path from "path";
import type { SessionIndex } from "./types.js";
import { getDefaultSessionIndex, JACQUES_CACHE_PATH, SESSION_INDEX_FILE } from "./types.js";
import { isNotFoundError, getErrorMessage } from "../logging/error-utils.js";
import { createLogger, type Logger } from "../logging/logger.js";

const logger: Logger = createLogger({ prefix: "[Cache]" });

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  return JACQUES_CACHE_PATH;
}

/**
 * Get the session index file path
 */
export function getIndexPath(): string {
  return path.join(JACQUES_CACHE_PATH, SESSION_INDEX_FILE);
}

/**
 * Ensure cache directory exists
 */
export async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(JACQUES_CACHE_PATH, { recursive: true });
}

/**
 * Read the session index from disk
 */
export async function readSessionIndex(): Promise<SessionIndex> {
  try {
    const indexPath = getIndexPath();
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content) as SessionIndex;
  } catch (err) {
    if (!isNotFoundError(err)) {
      logger.warn("Failed to read session index:", getErrorMessage(err));
    }
    return getDefaultSessionIndex();
  }
}

/**
 * Write the session index to disk
 */
export async function writeSessionIndex(index: SessionIndex): Promise<void> {
  await ensureCacheDir();
  const indexPath = getIndexPath();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * In-flight build promise — deduplicates concurrent buildSessionIndex() calls.
 * When multiple callers (e.g. /api/sessions/by-project and /api/projects)
 * request the index simultaneously, only one build runs.
 */
let buildInProgress: Promise<SessionIndex> | null = null;

/**
 * Get the session index, building if necessary.
 * Concurrent calls that trigger a rebuild share a single build.
 * @param maxAge Maximum age in milliseconds before rebuilding (default: 5 minutes)
 */
export async function getSessionIndex(
  options?: { maxAge?: number }
): Promise<SessionIndex> {
  const { maxAge = 5 * 60 * 1000 } = options || {};

  const existing = await readSessionIndex();

  // Check if index is fresh enough
  const lastScanned = new Date(existing.lastScanned).getTime();
  const age = Date.now() - lastScanned;

  if (age < maxAge && existing.sessions.length > 0) {
    return existing;
  }

  // Deduplicate concurrent builds
  if (buildInProgress) {
    return buildInProgress;
  }

  // Dynamic import to avoid circular dependency:
  // persistence -> metadata-extractor -> persistence (via writeSessionIndex)
  const { buildSessionIndex } = await import("./metadata-extractor.js");

  buildInProgress = buildSessionIndex().finally(() => {
    buildInProgress = null;
  });
  return buildInProgress;
}

/**
 * Invalidate the index (force rebuild on next read)
 */
export async function invalidateIndex(): Promise<void> {
  try {
    const indexPath = getIndexPath();
    await fs.unlink(indexPath);
  } catch {
    // Index doesn't exist, nothing to do
  }
}
