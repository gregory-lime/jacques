/**
 * Sessions Items Builder
 *
 * Pure functions that build the flat content item list for SessionsExperimentView.
 * Extracted from useSessionsExperiment to enable unit testing without React hooks.
 */

import type { Session, DiscoveredProject, WorktreeWithStatus } from "@jacques-ai/core";
import { getProjectGroupKey } from "@jacques-ai/core";
import type { WorktreeItem } from "../hooks/useWorktrees.js";
import type { ContentItem } from "../hooks/useSessionsExperiment.js";

export interface BuildSessionItemsParams {
  sortedSessions: Session[];
  allProjects: DiscoveredProject[];
  worktrees: WorktreeItem[];
  selectedProject: string | null;
  showAllWorktrees: boolean;
  isCreatingWorktree: boolean;
  removingWorktreePath: string | null;
  repoRoot: string | null;
  worktreesByRepo: Map<string, WorktreeWithStatus[]>;
}

export interface BuildSessionItemsResult {
  items: ContentItem[];
  selectableIndices: number[];
}

/**
 * Build the complete flat item list and selectable indices for the sessions view.
 */
export function buildSessionItems(params: BuildSessionItemsParams): BuildSessionItemsResult {
  const {
    sortedSessions, allProjects, worktrees, selectedProject,
    showAllWorktrees, isCreatingWorktree, removingWorktreePath,
    repoRoot, worktreesByRepo,
  } = params;

  const result: ContentItem[] = [];
  const selectable: number[] = [];

  // Group all sessions by project key
  const sessionsByProject = new Map<string, Session[]>();
  for (const session of sortedSessions) {
    const key = getProjectGroupKey(session);
    const existing = sessionsByProject.get(key) || [];
    existing.push(session);
    sessionsByProject.set(key, existing);
  }

  // Find the current project's data
  const currentProjectData = selectedProject
    ? allProjects.find((p) => p.name === selectedProject)
    : null;

  // Current project first
  if (selectedProject) {
    const currentSessions = sessionsByProject.get(selectedProject) || [];
    sessionsByProject.delete(selectedProject);

    result.push({
      kind: "project-header",
      projectName: selectedProject,
      gitRepoRoot: currentProjectData?.gitRepoRoot || null,
      sessionCount: currentSessions.length,
      isCurrent: true,
    });

    buildCurrentProjectItems(
      currentSessions, result, selectable,
      worktrees, repoRoot, isCreatingWorktree, showAllWorktrees, removingWorktreePath,
      worktreesByRepo,
    );
  }

  // Other projects with active sessions, sorted by session count desc
  const otherProjects = [...sessionsByProject.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const renderedProjects = new Set<string>();
  if (selectedProject) renderedProjects.add(selectedProject);

  for (const [projectKey, projectSessions] of otherProjects) {
    const projectData = allProjects.find((p) => p.name === projectKey);
    renderedProjects.add(projectKey);

    result.push({ kind: "spacer" });

    result.push({
      kind: "project-header",
      projectName: projectKey,
      gitRepoRoot: projectData?.gitRepoRoot || null,
      sessionCount: projectSessions.length,
      isCurrent: false,
    });

    buildOtherProjectItems(
      projectSessions,
      projectData?.gitRepoRoot || null,
      projectData?.projectPaths?.[0] || null,
      result, selectable,
      showAllWorktrees, worktreesByRepo,
    );
  }

  // When details mode is on, also show projects with no active sessions
  if (showAllWorktrees) {
    const inactiveProjects = allProjects
      .filter((p) => !renderedProjects.has(p.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const project of inactiveProjects) {
      result.push({ kind: "spacer" });
      result.push({
        kind: "project-header",
        projectName: project.name,
        gitRepoRoot: project.gitRepoRoot,
        sessionCount: 0,
        isCurrent: false,
      });

      buildOtherProjectItems(
        [], project.gitRepoRoot, project.projectPaths?.[0] || null,
        result, selectable,
        showAllWorktrees, worktreesByRepo,
      );
    }
  }

  return { items: result, selectableIndices: selectable };
}

// ---- Internal helpers ----

/** Extract divergence data from the first session in a group (all share the same branch). */
function getDivergence(sessions: Session[]): { ahead?: number; behind?: number; dirty?: boolean } {
  const first = sessions[0];
  if (!first) return {};
  return {
    ahead: first.git_ahead ?? undefined,
    behind: first.git_behind ?? undefined,
    dirty: first.git_dirty ?? undefined,
  };
}

/**
 * Build worktree-grouped items for the current project (has full WorktreeItem data).
 */
function buildCurrentProjectItems(
  projectSessions: Session[],
  result: ContentItem[],
  selectable: number[],
  worktrees: WorktreeItem[],
  repoRoot: string | null,
  isCreatingWorktree: boolean,
  showAllWorktrees: boolean,
  removingWorktreePath: string | null,
  worktreesByRepo: Map<string, WorktreeWithStatus[]>,
): void {
  // If worktrees haven't loaded yet, use session-derived grouping
  if (worktrees.length === 0) {
    buildOtherProjectItems(
      projectSessions, repoRoot, repoRoot, result, selectable,
      showAllWorktrees, worktreesByRepo,
    );
    // Still show new worktree button if we have repo root
    if (repoRoot) {
      result.push({ kind: "spacer" });
      selectable.push(result.length);
      if (isCreatingWorktree) {
        result.push({ kind: "new-worktree-input" });
      } else {
        result.push({ kind: "new-worktree-button" });
      }
    }
    return;
  }

  // Match sessions to worktrees
  const sessionsByWorktree = new Map<string, Session[]>();
  const unmatched: Session[] = [];

  for (const session of projectSessions) {
    let matched = false;
    const wtId = session.git_worktree || null;
    for (const wt of worktrees) {
      if (
        (wtId === null && wt.isMain) ||
        (wtId !== null && (wtId === wt.name || wtId === wt.branch)) ||
        (session.cwd && (session.cwd === wt.path || session.cwd.startsWith(wt.path + '/')))
      ) {
        const existing = sessionsByWorktree.get(wt.name) || [];
        existing.push(session);
        sessionsByWorktree.set(wt.name, existing);
        matched = true;
        break;
      }
    }
    if (!matched) {
      unmatched.push(session);
    }
  }

  // Determine which worktrees are visible
  let hiddenEmptyCount = 0;
  const visibleWorktrees: WorktreeItem[] = [];
  for (const wt of worktrees) {
    const wtSessions = sessionsByWorktree.get(wt.name) || [];
    if (wt.isMain || wtSessions.length > 0 || showAllWorktrees) {
      visibleWorktrees.push(wt);
    } else {
      hiddenEmptyCount++;
    }
  }
  // hiddenEmptyCount used by show-all-worktrees-button (currently unused but kept for reference)
  void hiddenEmptyCount;

  // Build items per visible worktree
  visibleWorktrees.forEach((wt) => {
    const wtSessions = sessionsByWorktree.get(wt.name) || [];

    if (result.length > 0) {
      result.push({ kind: "spacer" });
    }

    result.push({
      kind: "worktree-header",
      name: wt.name,
      branch: wt.branch,
      isMain: wt.isMain,
      sessionCount: wtSessions.length,
      ...getDivergence(wtSessions),
      dirty: wt.status.hasUncommittedChanges,
      merged: wt.status.isMergedToMain,
    });

    for (const session of wtSessions) {
      selectable.push(result.length);
      result.push({ kind: "session", session });
    }

    // New session button after each worktree's sessions
    selectable.push(result.length);
    result.push({ kind: "new-session-button", worktreePath: wt.path });

    // Remove worktree button (only for non-main worktrees when showing all)
    if (showAllWorktrees && !wt.isMain) {
      selectable.push(result.length);
      if (removingWorktreePath === wt.path) {
        result.push({
          kind: "remove-worktree-confirm",
          worktreePath: wt.path,
          worktreeName: wt.name,
          branch: wt.branch,
          hasUncommittedChanges: wt.status.hasUncommittedChanges,
          isMergedToMain: wt.status.isMergedToMain,
          sessionCount: wtSessions.length,
        });
      } else {
        result.push({
          kind: "remove-worktree-button",
          worktreePath: wt.path,
          worktreeName: wt.name,
        });
      }
    }
  });

  // Unmatched sessions — group by branch for meaningful headers
  if (unmatched.length > 0) {
    const unmatchedGroups = new Map<string, Session[]>();
    for (const session of unmatched) {
      const key = session.git_branch || session.git_worktree || "other";
      const existing = unmatchedGroups.get(key) || [];
      existing.push(session);
      unmatchedGroups.set(key, existing);
    }
    for (const [branchName, groupSessions] of unmatchedGroups) {
      if (visibleWorktrees.length > 0 || result.length > 0) {
        result.push({ kind: "spacer" });
      }
      result.push({
        kind: "worktree-header",
        name: branchName,
        branch: branchName,
        isMain: false,
        sessionCount: groupSessions.length,
        ...getDivergence(groupSessions),
      });
      for (const session of groupSessions) {
        selectable.push(result.length);
        result.push({ kind: "session", session });
      }
    }
  }

  // New worktree button (or input if creating)
  if (repoRoot) {
    result.push({ kind: "spacer" });
    selectable.push(result.length);
    if (isCreatingWorktree) {
      result.push({ kind: "new-worktree-input" });
    } else {
      result.push({ kind: "new-worktree-button" });
    }
  }
}

/**
 * Build worktree-grouped items for other projects (uses worktreesByRepo or session-derived grouping).
 */
function buildOtherProjectItems(
  projectSessions: Session[],
  projectGitRoot: string | null,
  projectPath: string | null,
  result: ContentItem[],
  selectable: number[],
  showAllWorktrees: boolean,
  worktreesByRepo: Map<string, WorktreeWithStatus[]>,
): void {
  // Non-git project: just show sessions and a New Session button
  if (!projectGitRoot) {
    for (const session of projectSessions) {
      selectable.push(result.length);
      result.push({ kind: "session", session });
    }
    const launchCwd = projectSessions[0]?.cwd || projectSessions[0]?.workspace?.project_dir || projectPath;
    if (launchCwd) {
      selectable.push(result.length);
      result.push({ kind: "new-session-button", worktreePath: launchCwd });
    }
    return;
  }

  // Check if we have real worktree data for this project
  const projectWorktrees = projectGitRoot ? worktreesByRepo.get(projectGitRoot) : null;

  if (showAllWorktrees && projectWorktrees && projectWorktrees.length > 0) {
    // Full worktree display using real data
    const sessionsByWt = new Map<string, Session[]>();
    const unmatched: Session[] = [];

    for (const session of projectSessions) {
      let matched = false;
      for (const wt of projectWorktrees) {
        if (
          (session.git_branch && session.git_branch === wt.branch) ||
          (session.git_worktree && (session.git_worktree === wt.name || session.git_worktree === wt.branch)) ||
          (session.cwd && (session.cwd === wt.path || session.cwd.startsWith(wt.path + "/")))
        ) {
          const existing = sessionsByWt.get(wt.name) || [];
          existing.push(session);
          sessionsByWt.set(wt.name, existing);
          matched = true;
          break;
        }
      }
      if (!matched) {
        // No branch info → assign to main
        if (!session.git_branch && !session.git_worktree) {
          const mainWt = projectWorktrees.find((w) => w.isMain);
          if (mainWt) {
            const existing = sessionsByWt.get(mainWt.name) || [];
            existing.push(session);
            sessionsByWt.set(mainWt.name, existing);
            continue;
          }
        }
        unmatched.push(session);
      }
    }

    // Show all worktrees (main first, then alphabetical)
    const sorted = [...projectWorktrees].sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const wt of sorted) {
      const wtSessions = sessionsByWt.get(wt.name) || [];

      if (result.length > 0) {
        result.push({ kind: "spacer" });
      }

      result.push({
        kind: "worktree-header",
        name: wt.name,
        branch: wt.branch,
        isMain: wt.isMain,
        sessionCount: wtSessions.length,
        ...getDivergence(wtSessions),
        dirty: wt.status.hasUncommittedChanges,
        merged: wt.status.isMergedToMain,
      });

      for (const session of wtSessions) {
        selectable.push(result.length);
        result.push({ kind: "session", session });
      }

      selectable.push(result.length);
      result.push({ kind: "new-session-button", worktreePath: wt.path });
    }

    if (unmatched.length > 0) {
      const unmatchedGroups = new Map<string, Session[]>();
      for (const session of unmatched) {
        const key = session.git_branch || session.git_worktree || "other";
        const existing = unmatchedGroups.get(key) || [];
        existing.push(session);
        unmatchedGroups.set(key, existing);
      }
      for (const [branchName, groupSessions] of unmatchedGroups) {
        result.push({ kind: "spacer" });
        result.push({
          kind: "worktree-header",
          name: branchName,
          branch: branchName,
          isMain: false,
          sessionCount: groupSessions.length,
          ...getDivergence(groupSessions),
        });
        for (const session of groupSessions) {
          selectable.push(result.length);
          result.push({ kind: "session", session });
        }
      }
    }

    // New Worktree button
    if (projectGitRoot) {
      result.push({ kind: "spacer" });
      selectable.push(result.length);
      result.push({ kind: "new-worktree-button", targetRepoRoot: projectGitRoot });
    }
    return;
  }

  // Fallback: session-derived grouping
  const wtGroups = new Map<string, Session[]>();
  for (const session of projectSessions) {
    const key = session.git_branch || session.git_worktree || "main";
    const existing = wtGroups.get(key) || [];
    existing.push(session);
    wtGroups.set(key, existing);
  }

  // Ensure master/main always appears
  const hasMainGroup = [...wtGroups.keys()].some((k) => k === "main" || k === "master");
  if (!hasMainGroup && projectGitRoot) {
    wtGroups.set("master", []);
  }

  const sortedKeys = [...wtGroups.keys()].sort((a, b) => {
    if (a === "main" || a === "master") return -1;
    if (b === "main" || b === "master") return 1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const wtSessions = wtGroups.get(key)!;
    const isMain = key === "main" || key === "master";

    if (result.length > 0) {
      result.push({ kind: "spacer" });
    }

    result.push({
      kind: "worktree-header",
      name: key,
      branch: key,
      isMain,
      sessionCount: wtSessions.length,
      ...getDivergence(wtSessions),
    });

    for (const session of wtSessions) {
      selectable.push(result.length);
      result.push({ kind: "session", session });
    }

    // New session button
    const launchCwd = wtSessions[0]?.cwd || wtSessions[0]?.workspace?.project_dir || (isMain ? projectGitRoot : null);
    if (launchCwd) {
      selectable.push(result.length);
      result.push({ kind: "new-session-button", worktreePath: launchCwd });
    }
  }

  // New Worktree button (details mode only)
  if (showAllWorktrees && projectGitRoot) {
    result.push({ kind: "spacer" });
    selectable.push(result.length);
    result.push({ kind: "new-worktree-button", targetRepoRoot: projectGitRoot });
  }
}
