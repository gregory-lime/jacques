import { useState, useCallback, useMemo, useEffect, createContext, useContext, type ReactNode } from 'react';
import type { Session } from '../types';
import type { DiscoveredProject } from '../api';
import { listProjects } from '../api';
import { getProjectGroupKey } from '../utils/git';

interface ProjectScopeContextValue {
  selectedProject: string | null;
  setSelectedProject: (project: string | null) => void;
  filterSessions: (sessions: Session[]) => Session[];
  archivedProjects: string[];
  setArchivedProjects: (projects: string[]) => void;
  discoveredProjects: DiscoveredProject[];
  refreshProjects: () => Promise<void>;
}

const ProjectScopeContext = createContext<ProjectScopeContextValue | null>(null);

interface ProjectScopeProviderProps {
  children: ReactNode;
}

export function ProjectScopeProvider({ children }: ProjectScopeProviderProps) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [archivedProjects, setArchivedProjects] = useState<string[]>([]);
  const [discoveredProjects, setDiscoveredProjects] = useState<DiscoveredProject[]>([]);

  const filterSessions = useCallback(
    (sessions: Session[]) => {
      if (selectedProject === null) {
        return sessions;
      }
      return sessions.filter((s) => getProjectGroupKey(s) === selectedProject);
    },
    [selectedProject]
  );

  const refreshProjects = useCallback(async () => {
    try {
      const { projects } = await listProjects();
      setDiscoveredProjects(projects);
    } catch {
      // Server may not be running yet
    }
  }, []);

  // Fetch discovered projects on mount
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const value = useMemo(
    () => ({
      selectedProject,
      setSelectedProject,
      filterSessions,
      archivedProjects,
      setArchivedProjects,
      discoveredProjects,
      refreshProjects,
    }),
    [selectedProject, filterSessions, archivedProjects, discoveredProjects, refreshProjects]
  );

  return (
    <ProjectScopeContext.Provider value={value}>
      {children}
    </ProjectScopeContext.Provider>
  );
}

export function useProjectScope() {
  const context = useContext(ProjectScopeContext);
  if (!context) {
    throw new Error('useProjectScope must be used within a ProjectScopeProvider');
  }
  return context;
}
