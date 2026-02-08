import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useMatch, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  BookOpen,
  Settings,
  Terminal,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { colors, typography } from '../styles/theme';
import { ProjectSelector } from './ProjectSelector';
import { useJacquesClient } from '../hooks/useJacquesClient';
import { useProjectScope } from '../hooks/useProjectScope.js';
import { getProjectGroupKey } from '../utils/git';
import { getSourcesStatus, hideProject } from '../api';
import type { SourcesStatus } from '../api';
import { MultiLogPanel } from './MultiLogPanel';
import { SidebarSessionList } from './SidebarSessionList';
import { SectionHeader, ToastContainer, NotificationCenter } from './ui';
import { NotificationProvider } from '../hooks/useNotifications';
import { useSessionBadges } from '../hooks/useSessionBadges';
import { usePersistedState } from '../hooks/usePersistedState';
import { useOpenSessions } from '../hooks/useOpenSessions';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useShortcutActions } from '../hooks/useShortcutActions';
import { CommandPalette } from './CommandPalette';
import { ShortcutHelpOverlay } from './ShortcutHelpOverlay';

const PROJECT_TABS = ['sessions', 'artifacts', 'context'] as const;

const navItems = [
  { tab: 'sessions', label: 'Sessions', Icon: LayoutDashboard },
  { tab: 'artifacts', label: 'Artifacts', Icon: Layers },
  { tab: 'context', label: 'Context', Icon: BookOpen },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessions, serverLogs, claudeOperations, apiLogs, launchSession, createWorktree } = useJacquesClient();
  const { selectedProject, setSelectedProject, archivedProjects, setArchivedProjects, discoveredProjects, refreshProjects } = useProjectScope();
  const [sourceStatus, setSourceStatus] = useState<SourcesStatus>({
    obsidian: { connected: false },
    googleDocs: { connected: false },
    notion: { connected: false },
  });

  // Extract project slug and current tab from URL via pattern matching
  // Match both /:projectSlug/:tab and /:projectSlug/sessions/:sessionId
  const tabMatch = useMatch('/:projectSlug/:tab');
  const sessionMatch = useMatch('/:projectSlug/sessions/:sessionId');

  const validTab = tabMatch?.params.tab && (PROJECT_TABS as readonly string[]).includes(tabMatch.params.tab);
  const projectSlug = sessionMatch?.params.projectSlug || (validTab ? tabMatch!.params.projectSlug! : null);
  const currentTab = sessionMatch ? 'sessions' : (validTab ? tabMatch!.params.tab! : null);

  // Sync URL project slug → ProjectScopeProvider context
  useEffect(() => {
    if (projectSlug) {
      setSelectedProject(projectSlug);
      localStorage.setItem('jacques:lastProjectSlug', projectSlug);
    }
  }, [projectSlug, setSelectedProject]);

  // For nav links: use URL slug when on project pages, fallback to context for global pages
  const navProjectSlug = projectSlug || selectedProject;

  // Session badges for notification detection (plan count, auto-compact)
  const sessionIds = sessions.map(s => s.session_id);
  const { badges } = useSessionBadges(sessionIds);

  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState('sidebarCollapsed', false);
  const [showLogs, setShowLogs] = usePersistedState('showLogs', false);
  const { viewDashboard } = useOpenSessions();

  // ── Keyboard shortcuts ──────────────────────────────────
  useKeyboardShortcuts();
  const { registerAction } = useShortcutActions();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);

  // Register global + navigation shortcuts
  useEffect(() => {
    const cleanups = [
      registerAction('global.command-palette', () => setShowCommandPalette(prev => !prev)),
      registerAction('global.help', () => setShowHelpOverlay(prev => !prev)),
      registerAction('global.escape', () => {
        if (showCommandPalette) setShowCommandPalette(false);
        else if (showHelpOverlay) setShowHelpOverlay(false);
      }),
      registerAction('nav.sessions', () => navProjectSlug && navigate(`/${navProjectSlug}/sessions`)),
      registerAction('nav.artifacts', () => navProjectSlug && navigate(`/${navProjectSlug}/artifacts`)),
      registerAction('nav.context', () => navProjectSlug && navigate(`/${navProjectSlug}/context`)),
      registerAction('nav.archive', () => navigate('/archive')),
      registerAction('nav.settings', () => navigate('/settings')),
      registerAction('nav.sidebar-toggle', () => setSidebarCollapsed(!sidebarCollapsed)),
    ];
    return () => cleanups.forEach(fn => fn());
  }, [registerAction, navigate, navProjectSlug, showCommandPalette, showHelpOverlay, sidebarCollapsed, setSidebarCollapsed]);

  // Load source status
  useEffect(() => {
    async function loadSourceStatus() {
      try {
        const status = await getSourcesStatus();
        setSourceStatus(status);
      } catch (error) {
        console.error('Failed to load source status:', error);
      }
    }
    loadSourceStatus();
  }, [location.pathname]);

  // Recompute archived projects when discovered projects or active sessions change
  useEffect(() => {
    if (discoveredProjects.length === 0) return;
    const activeProjectNames = new Set(
      sessions.map((s) => getProjectGroupKey(s))
    );
    const archived = discoveredProjects
      .map((p) => p.name)
      .filter((name) => !activeProjectNames.has(name));
    setArchivedProjects(archived);
  }, [discoveredProjects, sessions, setArchivedProjects]);

  const handleHideProject = async (name: string) => {
    try {
      await hideProject(name);
      await refreshProjects();
    } catch (err) {
      console.error('Failed to hide project:', err);
    }
  };

  // Handle project selection from dropdown → navigate to new URL
  const handleSelectProject = (project: string | null) => {
    if (project) {
      const tab = currentTab || 'sessions';
      navigate(`/${project}/${tab}`);
    }
  };

  return (
    <NotificationProvider
      sessions={sessions}
      claudeOperations={claudeOperations}
      badges={badges}
    >
    <div style={styles.container}>
      <ToastContainer />
      {/* Sidebar */}
      <aside
        style={{
          ...styles.sidebar,
          width: sidebarCollapsed ? '56px' : '280px',
          transition: 'width 200ms ease',
        }}
        id="sidebar"
      >
        {/* Logo/Title + Collapse Toggle */}
        <div style={{
          ...styles.logoSection,
          padding: sidebarCollapsed ? '0 0 12px' : '0 12px 12px 16px',
          flexDirection: sidebarCollapsed ? 'column' : 'row',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
        }}>
          {sidebarCollapsed ? (
            <>
              <button
                style={styles.collapseButton}
                onClick={() => setSidebarCollapsed(false)}
                title="Expand sidebar"
              >
                <ChevronsRight size={16} />
              </button>
              <button
                style={styles.logoButton}
                onClick={() => navProjectSlug && navigate(`/${navProjectSlug}/sessions`)}
                title="Go to sessions"
              >
                <img src="/jacsub.png" alt="Jacques" style={styles.mascot} />
              </button>
            </>
          ) : (
            <>
              <button
                style={styles.logoButton}
                onClick={() => navProjectSlug && navigate(`/${navProjectSlug}/sessions`)}
                title="Go to sessions"
              >
                <img src="/jacsub.png" alt="Jacques" style={styles.mascot} />
                <span style={styles.logoText}>Jacques</span>
              </button>
              <button
                style={styles.collapseButton}
                onClick={() => setSidebarCollapsed(true)}
                title="Collapse sidebar"
              >
                <ChevronsLeft size={16} />
              </button>
            </>
          )}
        </div>

        {/* Block art separator */}
        {!sidebarCollapsed && (
          <div style={styles.blockSeparator}>
            <div style={{
              height: '1px',
              background: `linear-gradient(90deg, transparent, ${colors.accent}40, transparent)`,
            }} />
          </div>
        )}

        {/* Project Scope Selector */}
        {!sidebarCollapsed && (
          <ProjectSelector
            sessions={sessions}
            archivedProjects={archivedProjects}
            discoveredProjects={discoveredProjects}
            selectedProject={projectSlug}
            onSelectProject={handleSelectProject}
            onLaunchSession={launchSession}
            onCreateWorktree={createWorktree}
            onHideProject={handleHideProject}
          />
        )}

        {/* Navigation */}
        <nav style={{
          ...styles.nav,
          padding: sidebarCollapsed ? '0 4px' : '0 8px',
        }}>
          {navItems.map((item) => {
            const isActive = currentTab === item.tab;
            const linkPath = navProjectSlug ? `/${navProjectSlug}/${item.tab}` : '/';

            // When clicking Sessions, always reset to dashboard view (clear activeViewId)
            const handleClick = item.tab === 'sessions'
              ? (e: React.MouseEvent) => {
                  viewDashboard();
                  if (isActive && sessionMatch) {
                    e.preventDefault();
                    navigate(linkPath);
                  }
                }
              : undefined;

            return (
              <React.Fragment key={item.tab}>
                <NavLink
                  to={linkPath}
                  onClick={handleClick}
                  style={{
                    ...styles.navLink,
                    ...(isActive ? styles.navLinkActive : {}),
                    ...(sidebarCollapsed ? {
                      justifyContent: 'center',
                      padding: '8px',
                      gap: '0',
                    } : {}),
                  }}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {isActive && !sidebarCollapsed && <span style={styles.activeIndicator} />}
                  <item.Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.6 }} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </NavLink>
                {item.tab === 'sessions' && !sidebarCollapsed && <SidebarSessionList />}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Sources Section */}
        {!sidebarCollapsed && (
          <div style={styles.sourcesSection}>
            <Link to="/sources" style={styles.sectionHeaderLink}>
              <SectionHeader title="Sources" accentColor={colors.accent} />
            </Link>
            {[
              { key: 'obsidian' as const, label: 'Obsidian' },
              { key: 'googleDocs' as const, label: 'Google Docs' },
              { key: 'notion' as const, label: 'Notion' },
            ].map(({ key, label }) => (
              <Link
                key={key}
                to="/sources"
                style={{
                  ...styles.sourceItem,
                  color: sourceStatus[key].connected ? colors.textSecondary : colors.textMuted,
                }}
              >
                <span>{label}</span>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: sourceStatus[key].connected ? colors.success : colors.textMuted,
                    opacity: sourceStatus[key].connected ? 1 : 0.4,
                    marginLeft: 'auto',
                    flexShrink: 0,
                  }}
                />
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          ...styles.sidebarFooter,
          ...(sidebarCollapsed ? { marginTop: 'auto' } : {}),
        }}>
          <div style={{
            display: 'flex',
            alignItems: sidebarCollapsed ? 'center' : 'center',
            gap: '4px',
            flexDirection: sidebarCollapsed ? 'column' : 'row',
          }}>
            {!sidebarCollapsed ? (
              <NavLink
                to="/settings"
                style={{
                  ...styles.navLink,
                  ...(location.pathname === '/settings' ? styles.navLinkActive : {}),
                  flex: 1,
                }}
              >
                {location.pathname === '/settings' && <span style={styles.activeIndicator} />}
                <Settings size={16} style={{ flexShrink: 0, opacity: location.pathname === '/settings' ? 1 : 0.6 }} />
                <span>Settings</span>
              </NavLink>
            ) : (
              <NavLink
                to="/settings"
                style={{
                  ...styles.navLink,
                  ...(location.pathname === '/settings' ? styles.navLinkActive : {}),
                  justifyContent: 'center',
                  padding: '8px',
                }}
                title="Settings"
              >
                <Settings size={16} style={{ flexShrink: 0, opacity: location.pathname === '/settings' ? 1 : 0.6 }} />
              </NavLink>
            )}

            <NotificationCenter />

            <button
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, border: 'none', borderRadius: '6px',
                cursor: 'pointer', transition: 'all 150ms ease', flexShrink: 0,
                backgroundColor: showLogs ? colors.bgElevated : 'transparent',
                color: showLogs ? colors.accent : colors.textMuted,
              }}
              onClick={() => setShowLogs(!showLogs)}
              title={showLogs ? 'Hide logs' : 'Show logs'}
            >
              <Terminal size={16} />
            </button>

          </div>
        </div>
      </aside>

      {/* Content Area */}
      <div style={styles.contentArea}>
        <main style={styles.main}>
          <Outlet />
        </main>

        {showLogs && (
          <MultiLogPanel
            serverLogs={serverLogs}
            apiLogs={apiLogs}
            claudeOperations={claudeOperations}
          />
        )}
      </div>
    </div>
    {showCommandPalette && (
      <CommandPalette onClose={() => setShowCommandPalette(false)} />
    )}
    {showHelpOverlay && (
      <ShortcutHelpOverlay onClose={() => setShowHelpOverlay(false)} />
    )}
    </NotificationProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
  },
  contentArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  sidebar: {
    backgroundColor: colors.bgSecondary,
    borderRight: `1px solid ${colors.borderSubtle}`,
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 0',
    flexShrink: 0,
    overflow: 'hidden',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '0 12px 12px 16px',
    flexDirection: 'row' as const,
  },
  logoButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '8px',
    transition: 'opacity 150ms ease',
    textDecoration: 'none',
  },
  mascot: {
    width: '36px',
    height: '36px',
    objectFit: 'contain' as const,
  },
  logoText: {
    fontSize: '20px',
    fontWeight: 600,
    color: colors.accent,
    letterSpacing: '0.5px',
    fontFamily: typography.fontFamily.sans,
  },
  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    flexShrink: 0,
    backgroundColor: 'transparent',
    color: colors.textMuted,
  },
  blockSeparator: {
    padding: '0 16px 16px',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '0 8px',
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: '6px',
    color: colors.textSecondary,
    textDecoration: 'none',
    transition: 'all 150ms ease',
    fontSize: '13px',
    position: 'relative' as const,
  },
  navLinkActive: {
    backgroundColor: colors.bgElevated,
    color: colors.accent,
  },
  activeIndicator: {
    position: 'absolute' as const,
    left: '-8px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '2px',
    height: '16px',
    backgroundColor: colors.accent,
    borderRadius: '0 2px 2px 0',
  },
  sourcesSection: {
    marginTop: 'auto',
    padding: '16px 8px 0',
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  sectionHeaderLink: {
    textDecoration: 'none',
    display: 'block',
    padding: '0 12px',
  },
  sourceItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    color: colors.textSecondary,
    fontSize: '13px',
    textDecoration: 'none',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 150ms ease',
  },
  sidebarFooter: {
    padding: '12px 8px 0',
    borderTop: `1px solid ${colors.borderSubtle}`,
    marginTop: '16px',
  },
  main: {
    flex: 1,
    padding: 0,
    overflow: 'auto',
    minHeight: 0,
  },
};
