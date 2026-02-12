/**
 * Dashboard - Sessions overview with active sessions as the hero element,
 * compact session history at the bottom, and a window management toolbar.
 *
 * Layout: Header -> Window Toolbar -> Active Sessions (flex:1) -> Session History (compact)
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useJacquesClient } from '../hooks/useJacquesClient';
import { useProjectScope } from '../hooks/useProjectScope.js';
import { useSessionBadges } from '../hooks/useSessionBadges';
import { useOpenSessions } from '../hooks/useOpenSessions';
import { listSessionsByProject, type SessionEntry } from '../api';
import { colors } from '../styles/theme';
import { SectionHeader } from '../components/ui';
import { ActiveSessionViewer } from '../components/ActiveSessionViewer';
import { WorktreeSessionsView } from '../components/WorktreeSessionsView';
import { SessionAssetModal } from '../components/SessionAssetModal';
import { RemoveWorktreeModal } from '../components/RemoveWorktreeModal';
import { WindowToolbar } from '../components/WindowToolbar';
import { getPersistedValue } from '../hooks/usePersistedState';
import { PlanIcon, AgentIcon, StatusDot } from '../components/Icons';
import { ArrowDown, ArrowUp, GitBranch } from 'lucide-react';
import type { Session } from '../types';
import { useShortcutActions } from '../hooks/useShortcutActions';
import { useFocusZone } from '../hooks/useFocusZone';
import { formatTokens, formatSessionTitle } from '../utils/session-display';

// ─── Color Constants ─────────────────────────────────────────

const COLOR = {
  plan: '#34D399',
  agent: '#FF6600',
} as const;

const PALETTE = {
  coral: colors.accent,
  teal: '#2DD4BF',
  blue: '#60A5FA',
  yellow: '#FBBF24',
  muted: colors.textSecondary,
  text: '#E5E7EB',
  textDim: colors.textMuted,
  bg: colors.bgPrimary,
  bgCard: colors.bgSecondary,
  bgHover: colors.bgElevated,
  success: colors.success,
  danger: colors.danger,
};

// ─── Helpers ─────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Types ───────────────────────────────────────────────────

interface SessionListItem {
  id: string;
  title: string;
  displayTitle: string;
  isPlan: boolean;
  source: 'live' | 'saved';
  date: string;
  contextPercent?: number;
  isActive?: boolean;
  status?: string;
  planCount?: number;
  agentCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  project?: string;
  gitBranch?: string;
  gitWorktree?: string;
}

// ─── Data Aggregation ────────────────────────────────────────

function computeStats(liveSessions: Session[], savedSessions: SessionEntry[]) {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const session of liveSessions) {
    if (session.context_metrics) {
      totalInputTokens += session.context_metrics.total_input_tokens || 0;
      totalOutputTokens += session.context_metrics.total_output_tokens || 0;
    }
  }

  for (const session of savedSessions) {
    if (session.tokens) {
      totalInputTokens += session.tokens.input + session.tokens.cacheRead;
      totalOutputTokens += session.tokens.output;
    }
  }

  return { totalSessions: liveSessions.length + savedSessions.length, totalInputTokens, totalOutputTokens };
}

function toSessionListItems(liveSessions: Session[], savedSessions: SessionEntry[]): SessionListItem[] {
  const items: SessionListItem[] = [];
  const seenIds = new Set<string>();

  for (const session of liveSessions) {
    seenIds.add(session.session_id);
    const { isPlan, displayTitle } = formatSessionTitle(session.session_title);
    items.push({
      id: session.session_id,
      title: session.session_title || 'Untitled',
      displayTitle,
      isPlan,
      source: 'live',
      date: new Date(session.registered_at).toISOString(),
      contextPercent: session.context_metrics?.used_percentage ? Math.round(session.context_metrics.used_percentage) : undefined,
      isActive: session.status === 'active' || session.status === 'working',
      status: session.status,
      inputTokens: session.context_metrics?.total_input_tokens || undefined,
      outputTokens: session.context_metrics?.total_output_tokens || undefined,
      project: session.project,
      gitBranch: session.git_branch || undefined,
      gitWorktree: session.git_worktree || undefined,
    });
  }

  for (const session of savedSessions) {
    if (seenIds.has(session.id)) continue;
    seenIds.add(session.id);

    let displayTitle = session.title;
    let isPlan = false;

    if ((session.mode === 'execution' || session.mode === 'acceptEdits') && session.planRefs && session.planRefs.length > 0) {
      const cleanTitle = session.planRefs[0].title.replace(/^Plan:\s*/i, '');
      displayTitle = cleanTitle;
      isPlan = true;
    }

    items.push({
      id: session.id,
      title: session.title,
      displayTitle,
      isPlan,
      source: 'saved',
      date: session.endedAt,
      planCount: session.planCount,
      agentCount: session.subagentIds?.length,
      inputTokens: session.tokens ? session.tokens.input + session.tokens.cacheRead : undefined,
      outputTokens: session.tokens?.output || undefined,
      project: session.projectSlug,
      gitBranch: session.gitBranch || undefined,
      gitWorktree: session.gitWorktree || undefined,
    });
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items;
}

// ─── Local Components ────────────────────────────────────────

function SkeletonHistoryRow() {
  return (
    <div style={styles.historyRow}>
      <div style={styles.historyRowMain}>
        <div className="jacques-skeleton" style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
        <div className="jacques-skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
        <div className="jacques-skeleton" style={{ width: 48, height: 12, borderRadius: 4, flexShrink: 0 }} />
      </div>
      <div style={styles.historyMetaRow}>
        <div className="jacques-skeleton" style={{ width: 40, height: 11, borderRadius: 3 }} />
        <div className="jacques-skeleton" style={{ width: 40, height: 11, borderRadius: 3 }} />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

const INITIAL_VISIBLE = 10;
const LOAD_INCREMENT = 10;

export function Dashboard() {
  const { sessions: allLiveSessions, focusedSessionId, connected, focusTerminal, tileWindows, maximizeWindow, positionBrowserLayout, smartTileAdd, createWorktree, onCreateWorktreeResult, listWorktrees, removeWorktree, onListWorktreesResult, onRemoveWorktreeResult } = useJacquesClient();
  const { selectedProject, filterSessions } = useProjectScope();
  const { state, openSession } = useOpenSessions();
  const [savedSessionsByProject, setSavedSessionsByProject] = useState<Record<string, SessionEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetModal, setAssetModal] = useState<{ sessionId: string; type: 'plan' | 'agent' } | null>(null);
  const [worktreeCreation, setWorktreeCreation] = useState<{ loading: boolean; error?: string } | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [removeWorktreeModal, setRemoveWorktreeModal] = useState<{ repoRoot: string } | null>(null);

  // Lazy loading state
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [historyCollapsed, setHistoryCollapsed] = useState(() => {
    try { return localStorage.getItem('jacques-history-collapsed') !== 'false'; } catch { return true; }
  });
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadSavedSessions() {
      try {
        setHistoryLoading(true);
        const data = await listSessionsByProject();
        setSavedSessionsByProject(data.projects);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions');
      } finally {
        setHistoryLoading(false);
      }
    }
    loadSavedSessions();
  }, []);

  // Reset visible count when project changes
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [selectedProject]);

  const filteredLiveSessions = useMemo(() => filterSessions(allLiveSessions), [allLiveSessions, filterSessions]);

  const filteredSavedSessions = useMemo(() => {
    if (!selectedProject) return Object.values(savedSessionsByProject).flat();
    return savedSessionsByProject[selectedProject] || [];
  }, [selectedProject, savedSessionsByProject]);

  const stats = useMemo(() => computeStats(filteredLiveSessions, filteredSavedSessions), [filteredLiveSessions, filteredSavedSessions]);
  const sessionList = useMemo(() => toSessionListItems(filteredLiveSessions, filteredSavedSessions), [filteredLiveSessions, filteredSavedSessions]);
  const historyList = useMemo(() => sessionList.filter(s => s.source !== 'live'), [sessionList]);

  // Lazy loading via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + LOAD_INCREMENT, historyList.length));
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [historyList.length]);

  // Badge data for active session cards
  const sessionIds = useMemo(
    () => filteredLiveSessions.map(s => s.session_id),
    [filteredLiveSessions],
  );
  const { badges } = useSessionBadges(sessionIds);

  // ── Handlers ──

  const handleActiveSessionClick = (session: Session) => {
    openSession({
      id: session.session_id,
      type: 'active',
      title: session.session_title || session.project || 'Untitled',
      project: session.project,
    });
  };

  const handleFocusSession = useCallback((sessionId: string) => {
    focusTerminal(sessionId);
  }, [focusTerminal]);

  const handleTileSessions = useCallback((sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2') => {
    tileWindows(sessionIds, layout);
  }, [tileWindows]);

  const handleLaunchSession = useCallback((cwd: string) => {
    const skip = getPersistedValue('dangerouslySkipPermissions', false);
    smartTileAdd(cwd, undefined, skip || undefined);
  }, [smartTileAdd]);

  const handleCreateWorktreeSubmit = useCallback((repoRoot: string, name: string) => {
    setWorktreeCreation({ loading: true });
    const skip = getPersistedValue('dangerouslySkipPermissions', false);
    createWorktree(repoRoot, name, undefined, skip || undefined);
  }, [createWorktree]);

  // Wire up worktree result callback
  useEffect(() => {
    onCreateWorktreeResult((success, worktreePath, _branch, _sessionLaunched, _launchMethod, error) => {
      if (success) {
        setWorktreeCreation(null);
        const dirName = worktreePath?.split(/[\\/]/).pop() || 'worktree';
        import('../components/ui/ToastContainer').then(({ toastStore }) => {
          toastStore.push({
            title: 'Worktree Created',
            body: `Created ${dirName}`,
            priority: 'low',
            category: 'operation',
          });
        });
      } else {
        setWorktreeCreation({ loading: false, error: error || 'Failed to create worktree' });
      }
    });
  }, [onCreateWorktreeResult]);

  // ─── Remove worktree handlers ─────────────────────────────
  const handleManageWorktreesClick = useCallback(() => {
    const repoRoot = filteredLiveSessions.find(s => s.git_repo_root)?.git_repo_root;
    if (repoRoot) {
      setRemoveWorktreeModal({ repoRoot });
    }
  }, [filteredLiveSessions]);

  const handleRemoveWorktreeSuccess = useCallback((worktreePath: string) => {
    const dirName = worktreePath.split(/[\\/]/).pop() || 'worktree';
    import('../components/ui/ToastContainer').then(({ toastStore }) => {
      toastStore.push({
        title: 'Worktree Removed',
        body: `Removed ${dirName}`,
        priority: 'low',
        category: 'operation',
      });
    });
  }, []);

  const handleSessionPlanClick = useCallback((sessionId: string) => {
    setAssetModal({ sessionId, type: 'plan' });
  }, []);

  const handleSessionAgentClick = useCallback((sessionId: string) => {
    setAssetModal({ sessionId, type: 'agent' });
  }, []);

  const handleHistorySessionClick = (item: SessionListItem) => {
    openSession({
      id: item.id,
      type: item.source === 'live' ? 'active' : 'archived',
      title: item.displayTitle,
      project: item.project,
    });
  };

  const toggleHistoryCollapsed = useCallback(() => {
    setHistoryCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('jacques-history-collapsed', String(next)); } catch {}
      return next;
    });
  }, []);

  // ── Keyboard navigation ──────────────────────────────────
  const { setActiveZone } = useFocusZone();
  const { registerAction } = useShortcutActions();
  const [focusedItemIndex, setFocusedItemIndex] = useState(-1);

  // Set focus zone when dashboard is visible
  useEffect(() => {
    setActiveZone('dashboard');
  }, [setActiveZone]);

  // Build flat list of navigable item IDs: active session terminals only
  const flatItemList = useMemo(() => {
    return filteredLiveSessions.map(s => s.session_id);
  }, [filteredLiveSessions]);

  // Track which worktree group each active session belongs to (for J/K jump)
  const worktreeGroupBoundaries = useMemo(() => {
    const boundaries: number[] = [0]; // first group starts at 0
    const seen = new Set<string>();
    for (let i = 0; i < filteredLiveSessions.length; i++) {
      const wt = filteredLiveSessions[i].git_worktree || 'main';
      if (!seen.has(wt)) {
        if (seen.size > 0) boundaries.push(i);
        seen.add(wt);
      }
    }
    return boundaries;
  }, [filteredLiveSessions]);

  // Keyboard-focused item ID (derived from index)
  const keyboardFocusedId = focusedItemIndex >= 0 && focusedItemIndex < flatItemList.length
    ? flatItemList[focusedItemIndex]
    : null;

  // ── Window toolbar handlers ──

  const getTargetSessionId = useCallback((): string | null => {
    if (selectedSessionIds.size > 0) return Array.from(selectedSessionIds)[0];
    if (keyboardFocusedId) return keyboardFocusedId;
    if (focusedSessionId) return focusedSessionId;
    return null;
  }, [selectedSessionIds, keyboardFocusedId, focusedSessionId]);

  const handleMaximize = useCallback(() => {
    const target = getTargetSessionId();
    if (target) maximizeWindow(target);
  }, [getTargetSessionId, maximizeWindow]);

  const handleToolbarTile = useCallback(() => {
    if (selectedSessionIds.size >= 2) {
      const ids = Array.from(selectedSessionIds);
      // Let server auto-tile using smart grid layout
      tileWindows(ids);
    }
  }, [selectedSessionIds, tileWindows]);

  const handleToolbarFocus = useCallback(() => {
    const target = getTargetSessionId();
    if (target) focusTerminal(target);
  }, [getTargetSessionId, focusTerminal]);

  const handleBrowserLayout = useCallback(() => {
    if (selectedSessionIds.size >= 2) {
      const ids = Array.from(selectedSessionIds).slice(0, 2);
      positionBrowserLayout(ids, 'browser-two-terminals');
    } else {
      const target = getTargetSessionId();
      if (target) positionBrowserLayout([target], 'browser-terminal');
    }
  }, [selectedSessionIds, getTargetSessionId, positionBrowserLayout]);

  // Scroll focused item into view
  useEffect(() => {
    if (!keyboardFocusedId) return;
    // Try to find the element by data attribute or class
    const el = document.querySelector(`[data-session-id="${keyboardFocusedId}"]`)
      || document.querySelector(`.is-keyboard-focused`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [keyboardFocusedId]);

  // Register all dashboard keyboard shortcuts
  useEffect(() => {
    const cleanups = [
      // Session navigation
      registerAction('session.next', () => {
        setFocusedItemIndex(prev => Math.min(prev + 1, flatItemList.length - 1));
      }),
      registerAction('session.next-arrow', () => {
        setFocusedItemIndex(prev => Math.min(prev + 1, flatItemList.length - 1));
      }),
      registerAction('session.prev', () => {
        setFocusedItemIndex(prev => Math.max(prev - 1, 0));
      }),
      registerAction('session.prev-arrow', () => {
        setFocusedItemIndex(prev => Math.max(prev - 1, 0));
      }),
      // Worktree group jump
      registerAction('session.next-worktree', () => {
        const currentBoundary = worktreeGroupBoundaries.findIndex(b => b > focusedItemIndex);
        if (currentBoundary >= 0) setFocusedItemIndex(worktreeGroupBoundaries[currentBoundary]);
      }),
      registerAction('session.prev-worktree', () => {
        const idx = [...worktreeGroupBoundaries].reverse().findIndex(b => b < focusedItemIndex);
        if (idx >= 0) setFocusedItemIndex(worktreeGroupBoundaries[worktreeGroupBoundaries.length - 1 - idx]);
      }),
      // Selection
      registerAction('session.toggle-select', () => {
        if (!keyboardFocusedId) return;
        const newSet = new Set(selectedSessionIds);
        if (newSet.has(keyboardFocusedId)) newSet.delete(keyboardFocusedId);
        else newSet.add(keyboardFocusedId);
        setSelectedSessionIds(newSet);
      }),
      registerAction('session.select-all', () => {
        setSelectedSessionIds(new Set(filteredLiveSessions.map(s => s.session_id)));
      }),
      registerAction('session.deselect-all', () => {
        setSelectedSessionIds(new Set());
      }),
      // Focus terminal (Enter) — use keyboard-focused, else fall back to selected/focused/first
      registerAction('session.focus-terminal', () => {
        const target = keyboardFocusedId || getTargetSessionId();
        if (target) focusTerminal(target);
      }),
      // Open transcript (o)
      registerAction('session.open', () => {
        if (!keyboardFocusedId) return;
        const liveSession = filteredLiveSessions.find(s => s.session_id === keyboardFocusedId);
        if (liveSession) handleActiveSessionClick(liveSession);
      }),
      // Tiling
      registerAction('tile.fullscreen', () => {
        const target = keyboardFocusedId || getTargetSessionId();
        if (target) maximizeWindow(target);
      }),
      registerAction('tile.tile-selected', () => handleToolbarTile()),
      registerAction('tile.browser-layout', () => handleBrowserLayout()),
      // Terminal management
      registerAction('terminal.launch', () => {
        if (!keyboardFocusedId) {
          if (filteredLiveSessions[0]?.cwd) handleLaunchSession(filteredLiveSessions[0].cwd);
          return;
        }
        const session = filteredLiveSessions.find(s => s.session_id === keyboardFocusedId);
        if (session?.cwd) handleLaunchSession(session.cwd);
      }),
      registerAction('terminal.manage-worktrees', () => handleManageWorktreesClick()),
      // History toggle
      registerAction('history.toggle', () => toggleHistoryCollapsed()),
    ];
    return () => cleanups.forEach(fn => fn());
  }, [
    registerAction, flatItemList, focusedItemIndex, keyboardFocusedId,
    selectedSessionIds, filteredLiveSessions, historyList,
    worktreeGroupBoundaries, focusTerminal, maximizeWindow,
    handleToolbarTile, handleBrowserLayout,
    handleLaunchSession, handleManageWorktreesClick, toggleHistoryCollapsed,
    getTargetSessionId, setSelectedSessionIds, handleActiveSessionClick,
    handleHistorySessionClick, openSession,
  ]);

  // If viewing an open session, render the viewer
  const activeOpen = state.activeViewId
    ? state.sessions.find(s => s.id === state.activeViewId)
    : null;

  if (activeOpen) {
    return (
      <ActiveSessionViewer
        sessionId={activeOpen.id}
      />
    );
  }

  const hasSelection = selectedSessionIds.size > 0 || !!keyboardFocusedId || !!focusedSessionId;

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (selectedSessionIds.size === 0) return;
    const target = e.target as HTMLElement;
    // Don't deselect when clicking buttons or inputs (e.g. launch, create worktree)
    if (target.closest('button') || target.closest('input')) return;
    setSelectedSessionIds(new Set());
  }, [selectedSessionIds, setSelectedSessionIds]);
  const visibleHistory = historyList.slice(0, visibleCount);

  return (
    <div className="jacques-dashboard" style={styles.viewport}>
      <div style={styles.container}>

        {/* ── Header ── */}
        <header style={styles.header} className="jacques-animate-in">
          <div style={styles.headerLeft}>
            <span style={styles.headerPrefix}>~/</span>
            <h1 style={styles.headerTitle}>
              {selectedProject ? selectedProject.split('/').pop() : 'All Projects'}
            </h1>
            <span style={styles.headerSlash}>/</span>
            <span style={styles.headerPage}>sessions</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.microStat}>
              <ArrowDown size={10} />
              {formatTokens(stats.totalInputTokens)}
            </span>
            <span style={styles.microStat}>
              <ArrowUp size={10} />
              {formatTokens(stats.totalOutputTokens)}
            </span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: connected ? PALETTE.success : PALETTE.danger,
                opacity: connected ? 0.6 : 1,
                flexShrink: 0,
              }}
              title={connected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </header>

        {/* ── Error ── */}
        {error && <div style={styles.errorBanner}>{error}</div>}

        {/* ── Window Toolbar ── */}
        <WindowToolbar
          selectedCount={selectedSessionIds.size}
          hasSelection={hasSelection}
          hasTwoSelected={selectedSessionIds.size >= 2}
          onMaximize={handleMaximize}
          onTileSelected={handleToolbarTile}
          onFocus={handleToolbarFocus}
          onBrowserLayout={handleBrowserLayout}
          onManageWorktrees={handleManageWorktreesClick}
          manageWorktreesDisabled={!filteredLiveSessions.some(s => s.git_repo_root)}
        />

        {/* ── Active Sessions (hero - fills remaining space) ── */}
        <section className="jacques-animate-in" style={styles.activeSection} onClick={handleBackgroundClick}>
          <SectionHeader
            title={`ACTIVE SESSIONS (${filteredLiveSessions.length})`}
            accentColor={PALETTE.coral}
          />

          <WorktreeSessionsView
            sessions={filteredLiveSessions}
            focusedSessionId={focusedSessionId}
            keyboardFocusedId={keyboardFocusedId}
            badges={badges}
            selectedSessionIds={selectedSessionIds}
            onSelectionChange={setSelectedSessionIds}
            onSessionClick={handleActiveSessionClick}
            onFocusSession={handleFocusSession}
            onPlanClick={handleSessionPlanClick}
            onAgentClick={handleSessionAgentClick}
            onTileSessions={handleTileSessions}
            onLaunchSession={handleLaunchSession}
            onCreateWorktreeSubmit={handleCreateWorktreeSubmit}
            worktreeCreation={worktreeCreation || undefined}
          />
        </section>

        {/* ── Session History (collapsible bottom) ── */}
        <section className="jacques-animate-in" style={styles.historySection}>
          <div
            onClick={toggleHistoryCollapsed}
            style={styles.historyBar}
            className="jacques-window-toolbar-btn"
          >
            <span style={{
              color: PALETTE.coral,
              marginRight: '8px',
              fontSize: '10px',
              opacity: 0.8,
              transition: 'transform 0.2s ease',
              display: 'inline-block',
              transform: historyCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            }}>
              {'▸'}
            </span>
            <span style={styles.historyBarLabel}>SESSION HISTORY</span>
            {historyList.length > 0 && (
              <span style={styles.historyBarCount}>{historyList.length}</span>
            )}
          </div>

          {!historyCollapsed && (historyLoading ? (
            <div style={styles.historyList}>
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonHistoryRow key={i} />
              ))}
            </div>
          ) : historyList.length === 0 ? (
            <div style={styles.emptyText}>No sessions yet</div>
          ) : (
            <div className="jacques-dashboard" style={styles.historyScrollable}>
              <div style={styles.historyList}>
                {visibleHistory.map((session, index) => {
                  const isLive = session.source === 'live';
                  const dotColor = isLive
                    ? (session.status === 'working' ? PALETTE.coral : PALETTE.success)
                    : PALETTE.textDim;
                  return (
                    <div
                      key={session.id}
                      data-session-id={session.id}
                      className="jacques-history-row jacques-animate-in"
                      style={{
                        ...styles.historyRow,
                        animationDelay: `${index * 40}ms`,
                      }}
                      onClick={() => handleHistorySessionClick(session)}
                    >
                      {/* Row 1: Status + Title + Date + Context */}
                      <div style={styles.historyRowMain}>
                        <StatusDot
                          size={10}
                          color={dotColor}
                          filled={isLive}
                          style={{
                            flexShrink: 0,
                            filter: isLive && session.status === 'working'
                              ? `drop-shadow(0 0 4px ${dotColor})`
                              : 'none',
                          }}
                        />
                        <div style={styles.historyTitleWrap}>
                          {session.isPlan && (
                            <PlanIcon size={13} color={COLOR.plan} style={{ flexShrink: 0, marginRight: '6px' }} />
                          )}
                          <span style={styles.historyTitle}>{session.displayTitle}</span>
                        </div>
                        <span style={styles.historyDate}>{formatDate(session.date)}</span>
                        {session.contextPercent !== undefined && (
                          <span style={{
                            ...styles.contextBadge,
                            color: session.contextPercent > 70 ? PALETTE.yellow : PALETTE.coral,
                            backgroundColor: session.contextPercent > 70 ? `${PALETTE.yellow}20` : `${PALETTE.coral}20`,
                          }}>
                            {session.contextPercent}%
                          </span>
                        )}
                      </div>

                      {/* Row 2: Git branch/worktree + Tokens + badges */}
                      <div style={styles.historyMetaRow}>
                        {session.gitBranch && (
                          <span style={styles.historyGit}>
                            <GitBranch size={10} color={PALETTE.muted} />
                            <span>{session.gitBranch}</span>
                            {session.gitWorktree && (
                              <span style={{ opacity: 0.6 }}>({session.gitWorktree})</span>
                            )}
                          </span>
                        )}
                        {session.inputTokens !== undefined && (
                          <span style={styles.historyTokens}>
                            <span style={{ color: PALETTE.teal }}>↓</span> {formatTokens(session.inputTokens)}
                          </span>
                        )}
                        {session.outputTokens !== undefined && (
                          <span style={styles.historyTokens}>
                            <span style={{ color: PALETTE.blue }}>↑</span> {formatTokens(session.outputTokens)}
                          </span>
                        )}
                        {session.planCount !== undefined && session.planCount > 0 && (
                          <span style={styles.historyBadge}>
                            <PlanIcon size={11} color={COLOR.plan} />
                            <span>{session.planCount}</span>
                          </span>
                        )}
                        {session.agentCount !== undefined && session.agentCount > 0 && (
                          <span style={styles.historyBadge}>
                            <AgentIcon size={11} color={COLOR.agent} />
                            <span>{session.agentCount}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Sentinel for lazy loading */}
                {visibleCount < historyList.length && (
                  <div ref={sentinelRef} style={{ height: 1 }} />
                )}
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* Session Asset Modal (plans/agents from active session cards) */}
      {assetModal && (
        <SessionAssetModal
          sessionId={assetModal.sessionId}
          type={assetModal.type}
          onClose={() => setAssetModal(null)}
        />
      )}

      {/* Remove Worktree Modal */}
      {removeWorktreeModal && (
        <RemoveWorktreeModal
          repoRoot={removeWorktreeModal.repoRoot}
          activeSessions={filteredLiveSessions}
          onClose={() => setRemoveWorktreeModal(null)}
          onRemoveSuccess={handleRemoveWorktreeSuccess}
          listWorktrees={listWorktrees}
          removeWorktree={removeWorktree}
          onListWorktreesResult={onListWorktreesResult}
          onRemoveWorktreeResult={onRemoveWorktreeResult}
        />
      )}

    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  // Layout
  viewport: {
    width: '100%',
    height: '100%',
    backgroundColor: PALETTE.bg,
    overflow: 'hidden',
  },
  container: {
    height: '100%',
    padding: '24px 32px 0',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    fontSize: '13px',
    color: PALETTE.text,
    lineHeight: 1.6,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    overflow: 'hidden',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '2px',
    minWidth: 0,
  },
  headerPrefix: {
    fontSize: '15px',
    fontWeight: 500,
    color: PALETTE.textDim,
    opacity: 0.5,
    userSelect: 'none' as const,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
    whiteSpace: 'nowrap' as const,
  },
  headerSlash: {
    fontSize: '15px',
    fontWeight: 400,
    color: PALETTE.textDim,
    opacity: 0.3,
    margin: '0 5px',
  },
  headerPage: {
    fontSize: '18px',
    fontWeight: 600,
    color: PALETTE.muted,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  microStat: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    color: PALETTE.textDim,
    fontFamily: 'monospace',
  },

  // Error
  errorBanner: {
    padding: '12px 16px',
    backgroundColor: `${PALETTE.danger}15`,
    border: `1px solid ${PALETTE.danger}40`,
    borderRadius: '4px',
    fontSize: '12px',
    color: PALETTE.danger,
    flexShrink: 0,
  },

  // Active sessions section (hero)
  activeSection: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0,
  },

  // Session history section (collapsible bottom)
  historySection: {
    flexShrink: 0,
    marginTop: 'auto',
    margin: 'auto -32px 0',
    padding: '0 32px',
  },
  historyBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 32px',
    margin: '0 -32px',
    cursor: 'pointer',
    borderTop: `1px solid ${colors.borderSubtle}`,
    userSelect: 'none' as const,
    transition: 'background-color 0.15s ease',
  },
  historyBarLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: PALETTE.muted,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    flex: 1,
  },
  historyBarCount: {
    fontSize: '10px',
    color: PALETTE.textDim,
    fontWeight: 500,
  },

  // Session history
  historyScrollable: {
    maxHeight: '260px',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  historyRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    padding: '12px 16px',
    backgroundColor: PALETTE.bgCard,
    borderRadius: '8px',
    border: `1px solid ${PALETTE.textDim}18`,
    cursor: 'pointer',
  },
  historyRowMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  historyTitleWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
  historyTitle: {
    color: PALETTE.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  historyDate: {
    fontSize: '11px',
    color: PALETTE.muted,
    flexShrink: 0,
  },
  contextBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  historyMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    paddingLeft: '22px',
  },
  historyGit: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: PALETTE.muted,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  },
  historyTokens: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '11px',
    color: PALETTE.muted,
    fontFamily: 'monospace',
  },
  historyBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: PALETTE.muted,
    opacity: 0.5,
  },

  // Shared
  emptyText: {
    fontSize: '12px',
    color: PALETTE.textDim,
    fontStyle: 'italic' as const,
    padding: '12px 0',
  },
};
