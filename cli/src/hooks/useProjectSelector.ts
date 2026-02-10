/**
 * useProjectSelector Hook
 *
 * Fetches discovered projects from the server API and manages
 * selection state for the project selector view.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";

export interface DiscoveredProject {
  name: string;
  displayName: string;
  sessionCount: number;
  lastActivity?: string;
  gitRepoRoot?: string;
  worktrees?: string[];
}

export interface UseProjectSelectorReturn {
  projects: DiscoveredProject[];
  selectedProject: string | null;
  loading: boolean;
  error: string | null;
  selectedIndex: number;
  scrollOffset: number;
  open: () => void;
  handleInput: (input: string, key: Key, setCurrentView: (view: DashboardView) => void) => void;
  reset: () => void;
  setSelectedProject: (name: string | null) => void;
}

const API_BASE = "http://localhost:4243";

export function useProjectSelector(): UseProjectSelectorReturn {
  const [projects, setProjects] = useState<DiscoveredProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const open = useCallback(() => {
    setLoading(true);
    setError(null);
    setSelectedIndex(0);
    setScrollOffset(0);

    fetch(`${API_BASE}/api/projects`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw: unknown) => {
        const data = raw as { projects?: Array<{ name: string; displayName?: string; sessionCount?: number; lastActivity?: string; gitRepoRoot?: string; worktrees?: string[] }> };
        const list: DiscoveredProject[] = (data.projects || []).map((p) => ({
          name: p.name,
          displayName: p.displayName || p.name,
          sessionCount: p.sessionCount || 0,
          lastActivity: p.lastActivity,
          gitRepoRoot: p.gitRepoRoot,
          worktrees: p.worktrees,
        }));
        // Sort by session count (most active first), then alphabetically
        list.sort((a, b) => b.sessionCount - a.sessionCount || a.displayName.localeCompare(b.displayName));
        setProjects(list);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to fetch projects");
        setLoading(false);
      });
  }, []);

  const handleInput = useCallback((input: string, key: Key, setCurrentView: (view: DashboardView) => void) => {
    if (key.escape) {
      setCurrentView("main");
      return;
    }

    const VISIBLE_HEIGHT = 7;

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        if (next < scrollOffset) setScrollOffset(next);
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const next = Math.min(projects.length - 1, prev + 1);
        if (next >= scrollOffset + VISIBLE_HEIGHT) {
          setScrollOffset(next - VISIBLE_HEIGHT + 1);
        }
        return next;
      });
      return;
    }

    if (key.return && projects.length > 0) {
      const project = projects[selectedIndex];
      if (project) {
        setSelectedProject(project.name);
        setCurrentView("main");
      }
      return;
    }
  }, [projects, selectedIndex, scrollOffset]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
    setError(null);
  }, []);

  return {
    projects,
    selectedProject,
    loading,
    error,
    selectedIndex,
    scrollOffset,
    open,
    handleInput,
    reset,
    setSelectedProject,
  };
}
