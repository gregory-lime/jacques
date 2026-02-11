/**
 * useProjectSelector Hook
 *
 * Fetches discovered projects from the server API and manages
 * the selected project for scoping views.
 */

import { useState, useCallback } from "react";
import type { DiscoveredProject } from "@jacques/core";

export type { DiscoveredProject };

export interface UseProjectSelectorReturn {
  projects: DiscoveredProject[];
  selectedProject: string | null;
  init: () => void;
  reset: () => void;
  setSelectedProject: (name: string | null) => void;
}

const API_BASE = "http://localhost:4243";

export function useProjectSelector(): UseProjectSelectorReturn {
  const [projects, setProjects] = useState<DiscoveredProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const fetchProjects = useCallback(() => {
    fetch(`${API_BASE}/api/projects`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw: unknown) => {
        const data = raw as { projects?: DiscoveredProject[] };
        const list: DiscoveredProject[] = data.projects || [];
        list.sort((a, b) => b.sessionCount - a.sessionCount || a.name.localeCompare(b.name));
        setProjects(list);
      })
      .catch(() => {
        // Silently fail — projects will be empty
      });
  }, []);

  const init = useCallback(() => {
    fetchProjects();
  }, [fetchProjects]);

  const reset = useCallback(() => {
    // No-op — keep projects and selectedProject across view transitions
  }, []);

  return {
    projects,
    selectedProject,
    init,
    reset,
    setSelectedProject,
  };
}
