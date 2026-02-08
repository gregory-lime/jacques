/**
 * Project Aggregator
 *
 * Aggregates data from multiple sources to build project statistics
 * and session lists for the dashboard.
 *
 * Sources:
 * - Live sessions (from WebSocket/Session registry)
 * - Saved sessions (.jacques/index.json)
 * - Archived sessions (~/.jacques/archive/manifests/)
 * - Handoffs (.jacques/handoffs/)
 * - Plans (.jacques/index.json plans array)
 */

import { promises as fs } from "fs";
import { basename, join } from "path";
import type { Session } from "../types.js";
import type { ProjectIndex, PlanEntry } from "../context/types.js";
import type { ConversationManifest } from "../archive/types.js";
import type { ProjectStatistics, ProjectSessionItem } from "./types.js";
import { getDefaultStatistics } from "./types.js";
import { readProjectIndex } from "../context/indexer.js";
import {
  listAllManifests,
  listManifestsByProject,
} from "../archive/archive-store.js";
import { getHandoffsDir } from "../handoff/catalog.js";

/**
 * Count handoff files in a project
 */
async function countHandoffs(projectPath: string): Promise<number> {
  try {
    const handoffsDir = getHandoffsDir(projectPath);
    const files = await fs.readdir(handoffsDir);
    return files.filter((f) => f.endsWith("-handoff.md")).length;
  } catch {
    return 0;
  }
}

/**
 * Get the project slug (basename) from a path
 */
function getProjectSlug(projectPath: string): string {
  return basename(projectPath);
}

/**
 * Aggregate statistics for a project
 *
 * @param projectPath - Full path to the project directory
 * @param liveSessions - Currently active sessions from the server
 */
export async function aggregateProjectStatistics(
  projectPath: string,
  liveSessions: Session[]
): Promise<ProjectStatistics> {
  const stats = getDefaultStatistics();
  const projectSlug = getProjectSlug(projectPath);

  // 1. Count live sessions for this project
  const projectLiveSessions = liveSessions.filter(
    (s) => s.project === projectSlug || s.cwd === projectPath
  );
  stats.activeSessions = projectLiveSessions.length;

  // Aggregate live session metrics
  for (const session of projectLiveSessions) {
    if (session.context_metrics) {
      stats.totalInputTokens += session.context_metrics.total_input_tokens || 0;
      stats.totalOutputTokens +=
        session.context_metrics.total_output_tokens || 0;
    }
    if (session.model?.display_name) {
      const modelName = session.model.display_name;
      stats.modelUsage[modelName] = (stats.modelUsage[modelName] || 0) + 1;
    }
  }

  // 2. Load saved sessions from .jacques/index.json
  try {
    const index: ProjectIndex = await readProjectIndex(projectPath);
    stats.savedSessions = index.sessions.length;
    stats.totalPlans = index.plans.length;

    // Aggregate saved session metrics
    for (const session of index.sessions) {
      stats.totalDurationMinutes += session.durationMinutes || 0;
    }
  } catch {
    // No local index yet
  }

  // 3. Load archived manifests for this project
  try {
    const manifestsByProject = await listManifestsByProject();
    const projectManifests = manifestsByProject.get(projectSlug) || [];
    stats.archivedSessions = projectManifests.length;

    // Aggregate archive metrics (avoid double-counting with saved)
    const savedIds = new Set<string>();
    try {
      const index = await readProjectIndex(projectPath);
      for (const s of index.sessions) {
        savedIds.add(s.id);
      }
    } catch {
      // No index
    }

    for (const manifest of projectManifests) {
      // Only add duration if not already counted from saved
      if (!savedIds.has(manifest.id)) {
        stats.totalDurationMinutes += manifest.durationMinutes || 0;
      }
      // Count tool calls and messages (only from archive, saved doesn't have this)
      stats.totalAgentCalls += manifest.subagents?.count || 0;
    }
  } catch {
    // No archive
  }

  // 4. Count handoffs
  stats.totalHandoffs = await countHandoffs(projectPath);

  // 5. Calculate total sessions (deduplicated)
  // Live + saved + archived (with overlap consideration)
  stats.totalSessions =
    stats.activeSessions + stats.savedSessions + stats.archivedSessions;

  return stats;
}

/**
 * Build a unified list of sessions for display
 *
 * Combines live, saved, and archived sessions, sorted by date (newest first).
 * Deduplicates sessions that appear in multiple sources.
 *
 * @param projectPath - Full path to the project directory
 * @param liveSessions - Currently active sessions from the server
 * @param focusedSessionId - ID of the currently focused session
 */
export async function buildProjectSessionList(
  projectPath: string,
  liveSessions: Session[],
  focusedSessionId: string | null
): Promise<ProjectSessionItem[]> {
  const items: ProjectSessionItem[] = [];
  const seenIds = new Set<string>();
  const projectSlug = getProjectSlug(projectPath);

  // 1. Add live sessions first (highest priority)
  const projectLiveSessions = liveSessions.filter(
    (s) => s.project === projectSlug || s.cwd === projectPath
  );

  for (const session of projectLiveSessions) {
    seenIds.add(session.session_id);
    items.push({
      id: session.session_id,
      title: session.session_title || "Untitled Session",
      source: "live",
      date: new Date(session.registered_at).toISOString(),
      durationMinutes: Math.round(
        (Date.now() - session.registered_at) / 60000
      ),
      model: session.model?.display_name,
      contextPercent: session.context_metrics?.used_percentage,
      isActive: session.status === "active" || session.status === "working",
      isFocused: session.session_id === focusedSessionId,
    });
  }

  // 2. Add saved sessions from .jacques/index.json
  try {
    const index = await readProjectIndex(projectPath);
    for (const session of index.sessions) {
      if (seenIds.has(session.id)) continue;
      seenIds.add(session.id);
      items.push({
        id: session.id,
        title: session.title,
        source: "saved",
        date: session.endedAt || session.savedAt,
        durationMinutes: session.durationMinutes,
        model: undefined, // Not stored in saved sessions
        contextPercent: undefined,
        isActive: false,
        isFocused: false,
      });
    }
  } catch {
    // No local index
  }

  // 3. Add archived sessions (only if not already in saved)
  try {
    const manifestsByProject = await listManifestsByProject();
    const projectManifests = manifestsByProject.get(projectSlug) || [];

    for (const manifest of projectManifests) {
      if (seenIds.has(manifest.id)) continue;
      seenIds.add(manifest.id);
      items.push({
        id: manifest.id,
        title: manifest.title,
        source: "archived",
        date: manifest.endedAt || manifest.archivedAt,
        durationMinutes: manifest.durationMinutes,
        model: undefined, // Could extract from technologies
        contextPercent: undefined,
        isActive: false,
        isFocused: false,
      });
    }
  } catch {
    // No archive
  }

  // Sort by date (newest first)
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return items;
}

/**
 * Get plans for a project
 */
export async function getProjectPlans(
  projectPath: string
): Promise<PlanEntry[]> {
  try {
    const index = await readProjectIndex(projectPath);
    // Sort by updatedAt (newest first)
    return [...index.plans].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

/**
 * Read the content of a local plan file from .jacques/
 */
export async function readLocalPlanContent(
  projectPath: string,
  plan: PlanEntry
): Promise<string | null> {
  try {
    const planPath = join(projectPath, ".jacques", plan.path);
    return await fs.readFile(planPath, "utf-8");
  } catch {
    return null;
  }
}
