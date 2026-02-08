import { useState, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { colors } from '../styles/theme';
import type { Session } from '../types';
import type { DiscoveredProject } from '../api';
import { getProjectGroupKey } from '../utils/git';

export interface ProjectInfo {
  name: string;
  sessionCount: number;
  isActive: boolean; // Has running sessions
  lastActivity?: number;
  isGitProject?: boolean;
  gitRepoRoot?: string | null;
  projectPaths?: string[];
}

interface ProjectSelectorProps {
  sessions: Session[];
  archivedProjects?: string[];
  discoveredProjects?: DiscoveredProject[];
  selectedProject: string | null;
  onSelectProject: (project: string | null) => void;
  onLaunchSession?: (cwd: string, preferredTerminal?: string, dangerouslySkipPermissions?: boolean) => void;
  onCreateWorktree?: (repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => void;
  onHideProject?: (name: string) => void;
}

export function ProjectSelector({
  sessions,
  archivedProjects = [],
  discoveredProjects = [],
  selectedProject,
  onSelectProject,
  onLaunchSession,
  // onCreateWorktree reserved for future worktree creation UI
  onHideProject,
}: ProjectSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const projects = useMemo(() => {
    const projectMap = new Map<string, ProjectInfo>();

    if (discoveredProjects.length > 0) {
      // Primary source: use discovered projects (correctly grouped by git repo root)
      for (const dp of discoveredProjects) {
        const activeSessions = sessions.filter(
          (s) => getProjectGroupKey(s) === dp.name
        );

        projectMap.set(dp.name, {
          name: dp.name,
          sessionCount: activeSessions.length > 0 ? activeSessions.length : dp.sessionCount,
          isActive: activeSessions.length > 0,
          lastActivity: activeSessions.length > 0
            ? Math.max(...activeSessions.map((s) => s.last_activity))
            : dp.lastActivity
              ? new Date(dp.lastActivity).getTime()
              : undefined,
          isGitProject: dp.isGitProject,
          gitRepoRoot: dp.gitRepoRoot,
          projectPaths: dp.projectPaths,
        });
      }
    } else {
      // Fallback: derive from sessions only (pre-sync)
      sessions.forEach((session) => {
        const name = getProjectGroupKey(session) || 'unknown';
        const existing = projectMap.get(name);

        if (existing) {
          existing.sessionCount++;
          existing.lastActivity = Math.max(
            existing.lastActivity || 0,
            session.last_activity
          );
        } else {
          projectMap.set(name, {
            name,
            sessionCount: 1,
            isActive: true,
            lastActivity: session.last_activity,
          });
        }
      });

      // Add archived projects (no active sessions)
      archivedProjects.forEach((name) => {
        if (!projectMap.has(name)) {
          projectMap.set(name, {
            name,
            sessionCount: 0,
            isActive: false,
          });
        }
      });
    }

    // Sort: active first (by last activity), then by last activity, then alphabetically
    return Array.from(projectMap.values()).sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      if (a.lastActivity && b.lastActivity) {
        return (b.lastActivity || 0) - (a.lastActivity || 0);
      }
      if (a.lastActivity && !b.lastActivity) return -1;
      if (!a.lastActivity && b.lastActivity) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [sessions, archivedProjects, discoveredProjects]);

  const activeCount = projects.filter((p) => p.isActive).length;

  // Current scope display
  const scopeLabel = selectedProject || 'Select Project';

  const handleProjectClick = (projectName: string) => {
    onSelectProject(projectName);
    setIsExpanded(false);
  };

  const handleHide = (e: React.MouseEvent, project: ProjectInfo) => {
    e.stopPropagation();
    if (!onHideProject) return;
    onHideProject(project.name);
  };

  const handleLaunch = (e: React.MouseEvent, project: ProjectInfo) => {
    e.stopPropagation();
    if (!onLaunchSession) return;
    // Launch in the first project path (main worktree for git projects)
    const cwd = project.projectPaths?.[0] || project.gitRepoRoot;
    if (cwd) {
      onLaunchSession(cwd);
    }
  };

  return (
    <div style={styles.container}>
      {/* Collapsed scope indicator */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        style={styles.scopeButton}
        aria-expanded={isExpanded}
        aria-haspopup="listbox"
      >
        <div style={styles.scopeContent}>
          <span style={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
          <span style={styles.scopeLabel}>{scopeLabel}</span>
        </div>
      </button>

      {/* Expanded project list */}
      {isExpanded && (
        <div style={styles.dropdown}>
          {/* Active projects section */}
          {activeCount > 0 && (
            <>
              <div style={styles.sectionLabel}>ACTIVE</div>
              {projects
                .filter((p) => p.isActive)
                .map((project) => (
                  <button
                    key={project.name}
                    type="button"
                    onClick={() => handleProjectClick(project.name)}
                    style={{
                      ...styles.projectItem,
                      ...(selectedProject === project.name
                        ? styles.projectItemSelected
                        : {}),
                    }}
                  >
                    <span
                      style={{
                        ...styles.projectIndicator,
                        color: colors.success,
                      }}
                    >
                      {selectedProject === project.name ? '◉' : '●'}
                    </span>
                    <span style={styles.projectName}>{project.name}</span>
                    <span style={styles.sessionBadge}>
                      {project.sessionCount}
                    </span>
                    {onLaunchSession && (
                      <button
                        type="button"
                        onClick={(e) => handleLaunch(e, project)}
                        style={styles.launchButton}
                        title="Launch new session"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                    {onHideProject && (
                      <button
                        type="button"
                        onClick={(e) => handleHide(e, project)}
                        style={styles.hideButton}
                        title="Hide project"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </button>
                ))}
            </>
          )}

          {/* Archived projects section */}
          {projects.some((p) => !p.isActive) && (
            <>
              {activeCount > 0 && <div style={styles.divider} />}
              <div style={{ ...styles.sectionLabel, marginTop: activeCount > 0 ? '2px' : '0' }}>
                ARCHIVED
              </div>
              {projects
                .filter((p) => !p.isActive)
                .map((project) => (
                  <button
                    key={project.name}
                    type="button"
                    onClick={() => handleProjectClick(project.name)}
                    style={{
                      ...styles.projectItem,
                      ...(selectedProject === project.name
                        ? styles.projectItemSelected
                        : {}),
                    }}
                  >
                    <span style={styles.projectIndicator}>
                      {selectedProject === project.name ? '◉' : '○'}
                    </span>
                    <span
                      style={{
                        ...styles.projectName,
                        color: colors.textMuted,
                      }}
                    >
                      {project.name}
                    </span>
                    <span style={styles.sessionBadge}>
                      {project.sessionCount > 0 ? project.sessionCount : '0'}
                    </span>
                    {onLaunchSession && (project.projectPaths?.[0] || project.gitRepoRoot) && (
                      <button
                        type="button"
                        onClick={(e) => handleLaunch(e, project)}
                        style={styles.launchButton}
                        title="Launch new session"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                    {onHideProject && (
                      <button
                        type="button"
                        onClick={(e) => handleHide(e, project)}
                        style={styles.hideButton}
                        title="Hide project"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </button>
                ))}
            </>
          )}

          {/* Empty state */}
          {projects.length === 0 && (
            <div style={styles.emptyState}>No projects yet</div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    padding: '0 8px',
    marginBottom: '8px',
  },
  scopeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 12px',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    textAlign: 'left',
  },
  scopeContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: '10px',
    width: '12px',
    flexShrink: 0,
  },
  scopeLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: '8px',
    right: '8px',
    marginTop: '4px',
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    padding: '6px',
    zIndex: 100,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  projectItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 10px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 100ms ease',
    textAlign: 'left',
  },
  projectItemSelected: {
    backgroundColor: colors.bgElevated,
  },
  projectIndicator: {
    fontSize: '8px',
    width: '16px',
    textAlign: 'center',
    color: colors.textMuted,
    flexShrink: 0,
  },
  projectName: {
    flex: 1,
    fontSize: '13px',
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sessionBadge: {
    fontSize: '11px',
    color: colors.textMuted,
    flexShrink: 0,
  },
  launchButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    padding: 0,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    cursor: 'pointer',
    color: colors.textMuted,
    flexShrink: 0,
    transition: 'all 100ms ease',
  },
  hideButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    color: colors.textMuted,
    flexShrink: 0,
    opacity: 0.5,
    transition: 'all 100ms ease',
  },
  divider: {
    height: '1px',
    backgroundColor: colors.borderSubtle,
    margin: '6px 0',
  },
  sectionLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: colors.textMuted,
    padding: '4px 10px',
    letterSpacing: '0.05em',
  },
  emptyState: {
    padding: '16px',
    textAlign: 'center',
    fontSize: '13px',
    color: colors.textMuted,
  },
};
