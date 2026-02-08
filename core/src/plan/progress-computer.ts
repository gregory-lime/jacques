/**
 * Progress Computer
 *
 * Orchestrates plan progress computation:
 * 1. Parse plan markdown
 * 2. Load linked sessions
 * 3. Extract task signals
 * 4. Match signals to plan items
 * 5. Compute and cache progress
 */

import { promises as fs } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { homedir } from "os";
import { parseJSONL } from "../session/parser.js";
import type { PlanEntry } from "../context/types.js";
import { readSessionIndex, type SessionEntry } from "../cache/session-index.js";
import { parsePlanMarkdown } from "./plan-parser.js";
import { extractTaskSignals } from "./task-extractor.js";
import {
  matchSignalsToPlanItems,
  determineItemStatus,
  isTrackableForProgress,
} from "./progress-matcher.js";
import type {
  PlanProgress,
  PlanProgressSummary,
  PlanProgressListItem,
  TaskSignal,
  PlanItemProgress,
} from "./types.js";

/** Cache directory for plan progress */
const PROGRESS_CACHE_DIR = join(homedir(), ".jacques", "cache", "plan-progress");

/**
 * Compute full progress for a plan.
 *
 * @param plan - The plan entry from the project index
 * @param planContent - The markdown content of the plan
 * @param cwd - The project working directory
 */
export async function computePlanProgress(
  plan: PlanEntry,
  planContent: string,
  cwd: string
): Promise<PlanProgress> {
  // 1. Parse plan markdown
  const parsedPlan = parsePlanMarkdown(planContent);

  // 2. Compute cache key
  const cacheKey = await computeCacheKey(plan, planContent);

  // 3. Check cache
  const cached = await readProgressCache(plan.id);
  if (cached && cached.cacheKey === cacheKey) {
    return cached;
  }

  // 4. Load sessions and extract signals
  const allSignals: TaskSignal[] = [];
  const sessionIds: string[] = [];
  const sessionIndex = await readSessionIndex();

  for (const sessionId of plan.sessions) {
    const sessionEntry = sessionIndex.sessions.find((s) => s.id === sessionId);
    if (!sessionEntry?.jsonlPath) {
      continue;
    }

    try {
      const entries = await parseJSONL(sessionEntry.jsonlPath);
      const signals = extractTaskSignals(entries, sessionId);
      allSignals.push(...signals);
      sessionIds.push(sessionId);
    } catch {
      // Session file not found or unreadable, skip
      continue;
    }
  }

  // 5. Match signals to plan items
  const matches = matchSignalsToPlanItems(parsedPlan.items, allSignals);

  // 6. Build per-item progress
  const itemProgress: PlanItemProgress[] = [];
  for (const item of parsedPlan.items) {
    if (!isTrackableForProgress(item)) {
      continue;
    }

    const match = matches.get(item.id) || null;
    const status = determineItemStatus(item, match);

    itemProgress.push({
      planItemId: item.id,
      status,
      bestMatch: match,
    });
  }

  // 7. Compute summary
  const summary = computeSummary(itemProgress);

  // 8. Build result
  const progress: PlanProgress = {
    planId: plan.id,
    computedAt: new Date().toISOString(),
    items: itemProgress,
    summary,
    sessionIds,
    cacheKey,
  };

  // 9. Save to cache
  await writeProgressCache(plan.id, progress);

  return progress;
}

/**
 * Compute a lightweight progress summary for list views.
 * Faster than full progress - only computes the percentage.
 */
export async function computePlanProgressSummary(
  plan: PlanEntry,
  planContent: string,
  cwd: string
): Promise<PlanProgressListItem> {
  try {
    const progress = await computePlanProgress(plan, planContent, cwd);
    return {
      planId: plan.id,
      percentage: progress.summary.percentage,
      loading: false,
    };
  } catch {
    return {
      planId: plan.id,
      percentage: 0,
      loading: false,
    };
  }
}

/**
 * Compute cache key from plan content and session file modification times.
 */
async function computeCacheKey(
  plan: PlanEntry,
  planContent: string
): Promise<string> {
  const hash = createHash("sha256");

  // Include plan content
  hash.update(planContent);

  // Include session file mtimes
  const sessionIndex = await readSessionIndex();
  const mtimes: string[] = [];

  for (const sessionId of plan.sessions) {
    const sessionEntry = sessionIndex.sessions.find((s) => s.id === sessionId);
    if (sessionEntry?.modifiedAt) {
      mtimes.push(sessionEntry.modifiedAt);
    }
  }

  // Sort for deterministic key
  mtimes.sort();
  hash.update(mtimes.join(","));

  return hash.digest("hex").substring(0, 16);
}

/**
 * Compute summary statistics from item progress.
 */
function computeSummary(items: PlanItemProgress[]): PlanProgressSummary {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;

  for (const item of items) {
    switch (item.status) {
      case "completed":
        completed++;
        break;
      case "in_progress":
        inProgress++;
        break;
      case "not_started":
        notStarted++;
        break;
    }
  }

  const total = items.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    inProgress,
    notStarted,
    percentage,
  };
}

/**
 * Read progress from cache.
 */
async function readProgressCache(planId: string): Promise<PlanProgress | null> {
  try {
    const cachePath = join(PROGRESS_CACHE_DIR, `${planId}.json`);
    const content = await fs.readFile(cachePath, "utf-8");
    return JSON.parse(content) as PlanProgress;
  } catch {
    return null;
  }
}

/**
 * Write progress to cache.
 */
async function writeProgressCache(
  planId: string,
  progress: PlanProgress
): Promise<void> {
  try {
    await fs.mkdir(PROGRESS_CACHE_DIR, { recursive: true });
    const cachePath = join(PROGRESS_CACHE_DIR, `${planId}.json`);
    await fs.writeFile(cachePath, JSON.stringify(progress, null, 2), "utf-8");
  } catch {
    // Cache write failures are non-blocking
  }
}

/**
 * Clear the progress cache for a plan.
 */
export async function clearProgressCache(planId: string): Promise<void> {
  try {
    const cachePath = join(PROGRESS_CACHE_DIR, `${planId}.json`);
    await fs.unlink(cachePath);
  } catch {
    // Ignore errors if file doesn't exist
  }
}

/**
 * Clear all progress cache.
 */
export async function clearAllProgressCache(): Promise<void> {
  try {
    await fs.rm(PROGRESS_CACHE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}
