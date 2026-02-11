/**
 * Project Discovery
 *
 * Discovers projects from ~/.claude/projects/, groups by git repo root,
 * merges worktrees, and provides session query helpers.
 */

import * as path from "path";
import type { SessionEntry, SessionIndex, DiscoveredProject } from "./types.js";
import { getSessionIndex } from "./persistence.js";
import { detectGitInfo } from "./git-utils.js";
import { getHiddenProjects } from "./hidden-projects.js";
import { listAllProjects } from "./metadata-extractor.js";

/**
 * Get the project group key for a session.
 * Uses basename of gitRepoRoot when available (groups worktrees together).
 * Canonical implementation — CLI imports this; GUI mirrors it for browser compat.
 */
export function getProjectGroupKey(session: { git_repo_root?: string | null; project: string }): string {
  if (session.git_repo_root) {
    return session.git_repo_root.split("/").pop() || session.project;
  }
  return session.project;
}

/**
 * Get a single session entry by ID
 */
export async function getSessionEntry(
  sessionId: string
): Promise<SessionEntry | null> {
  const index = await getSessionIndex();
  return index.sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Get sessions grouped by project.
 * Uses basename of gitRepoRoot when available to group worktrees together.
 */
export async function getSessionsByProject(): Promise<
  Map<string, SessionEntry[]>
> {
  const index = await getSessionIndex();
  const byProject = new Map<string, SessionEntry[]>();

  for (const session of index.sessions) {
    // Group by git repo root basename when available (groups worktrees together)
    const groupKey = session.gitRepoRoot
      ? path.basename(session.gitRepoRoot)
      : session.projectSlug;
    const existing = byProject.get(groupKey) || [];
    existing.push(session);
    byProject.set(groupKey, existing);
  }

  return byProject;
}

/**
 * Get index statistics
 */
export async function getIndexStats(): Promise<{
  totalSessions: number;
  totalProjects: number;
  totalSizeBytes: number;
  lastScanned: string;
}> {
  const index = await getSessionIndex();

  // Count unique projects
  const projects = new Set(index.sessions.map((s) => s.projectSlug));

  // Sum file sizes
  const totalSize = index.sessions.reduce((sum, s) => sum + s.fileSizeBytes, 0);

  return {
    totalSessions: index.sessions.length,
    totalProjects: projects.size,
    totalSizeBytes: totalSize,
    lastScanned: index.lastScanned,
  };
}

/**
 * Discover all projects from ~/.claude/projects/, grouped by git repo root.
 * Git worktrees of the same repo are merged into a single project entry.
 * Non-git projects are standalone entries.
 */
export async function discoverProjects(): Promise<DiscoveredProject[]> {
  const rawProjects = await listAllProjects();
  const index = await getSessionIndex();

  // Build a lookup: encoded directory name -> sessions
  // Uses the encoded dir (literal folder name in ~/.claude/projects/) rather than
  // decoded projectPath, because the session index cache may have been built with
  // stale/naive path decoding. The encoded dir name is always stable.
  const sessionsByEncodedDir = new Map<string, SessionEntry[]>();
  for (const session of index.sessions) {
    const encodedDir = path.basename(path.dirname(session.jsonlPath));
    const existing = sessionsByEncodedDir.get(encodedDir) || [];
    existing.push(session);
    sessionsByEncodedDir.set(encodedDir, existing);
  }

  const projectMap = new Map<string, DiscoveredProject>();

  for (const raw of rawProjects) {
    const encodedDir = path.basename(raw.encodedPath);
    const matchingSessions = sessionsByEncodedDir.get(encodedDir) || [];

    // Determine group key and git repo root
    let groupKey: string;
    let gitRepoRoot: string | null = null;
    let isGitProject = false;

    // First: check if any indexed session has gitRepoRoot
    const sessionWithGit = matchingSessions.find((s) => s.gitRepoRoot);
    if (sessionWithGit?.gitRepoRoot) {
      gitRepoRoot = sessionWithGit.gitRepoRoot;
      groupKey = path.basename(gitRepoRoot);
      isGitProject = true;
    } else {
      // No git info in index — probe the filesystem
      const gitInfo = await detectGitInfo(raw.projectPath);
      if (gitInfo.repoRoot) {
        gitRepoRoot = gitInfo.repoRoot;
        groupKey = path.basename(gitInfo.repoRoot);
        isGitProject = true;
      } else {
        // Non-git project: standalone entry
        groupKey = raw.projectSlug;
        isGitProject = false;
      }
    }

    // Find most recent activity among matching sessions
    let latestActivity: string | null = null;
    for (const s of matchingSessions) {
      if (s.endedAt && (!latestActivity || s.endedAt > latestActivity)) {
        latestActivity = s.endedAt;
      }
    }

    // Merge into existing group or create new
    const existing = projectMap.get(groupKey);
    if (existing) {
      existing.projectPaths.push(raw.projectPath);
      existing.encodedPaths.push(raw.encodedPath);
      existing.sessionCount += matchingSessions.length;
      if (latestActivity && (!existing.lastActivity || latestActivity > existing.lastActivity)) {
        existing.lastActivity = latestActivity;
      }
    } else {
      projectMap.set(groupKey, {
        name: groupKey,
        gitRepoRoot,
        isGitProject,
        projectPaths: [raw.projectPath],
        encodedPaths: [raw.encodedPath],
        sessionCount: matchingSessions.length,
        lastActivity: latestActivity,
      });
    }
  }

  // Second pass: merge non-git projects that have gitBranch into matching git projects.
  // This handles deleted worktrees whose directories no longer exist on disk —
  // detectGitInfo fails but the JSONL sessions still have gitBranch set.
  const nonGitKeys = Array.from(projectMap.entries())
    .filter(([, p]) => !p.isGitProject)
    .map(([key]) => key);
  const gitProjects = Array.from(projectMap.values()).filter((p) => p.isGitProject && p.gitRepoRoot);

  for (const key of nonGitKeys) {
    const project = projectMap.get(key);
    if (!project) continue;

    // Check if any session in this project had a git branch
    const allSessions = project.encodedPaths.flatMap((ep) => sessionsByEncodedDir.get(path.basename(ep)) || []);
    const hasGitBranch = allSessions.some((s) => s.gitBranch);
    if (!hasGitBranch) continue;

    // Find a git project in the same parent directory
    const projectParent = path.dirname(project.projectPaths[0]);
    const matchingGit = gitProjects.find(
      (gp) => gp.gitRepoRoot && path.dirname(gp.gitRepoRoot) === projectParent
    );
    if (!matchingGit) continue;

    // Merge into the git project
    matchingGit.projectPaths.push(...project.projectPaths);
    matchingGit.encodedPaths.push(...project.encodedPaths);
    matchingGit.sessionCount += project.sessionCount;
    if (project.lastActivity && (!matchingGit.lastActivity || project.lastActivity > matchingGit.lastActivity)) {
      matchingGit.lastActivity = project.lastActivity;
    }
    projectMap.delete(key);
  }

  // Filter out hidden projects
  const hidden = await getHiddenProjects();
  if (hidden.size > 0) {
    for (const [key, project] of projectMap) {
      if (hidden.has(project.name)) {
        projectMap.delete(key);
      }
    }
  }

  // Sort: most recent activity first, then alphabetically
  return Array.from(projectMap.values()).sort((a, b) => {
    if (a.lastActivity && b.lastActivity) {
      return b.lastActivity.localeCompare(a.lastActivity);
    }
    if (a.lastActivity && !b.lastActivity) return -1;
    if (!a.lastActivity && b.lastActivity) return 1;
    return a.name.localeCompare(b.name);
  });
}
