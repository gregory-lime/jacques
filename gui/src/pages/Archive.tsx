import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive as ArchiveIcon, RefreshCw } from 'lucide-react';
import { colors } from '../styles/theme';
import { TerminalPanel, SearchInput, Badge, SectionHeader, EmptyState } from '../components/ui';
import { useOpenSessions } from '../hooks/useOpenSessions';
import {
  getSessionStats,
  listSessionsByProject,
  syncSessions,
  type SessionStats,
  type SessionEntry,
  type SyncProgress,
} from '../api';
import { useProjectScope } from '../hooks/useProjectScope';

// Format date to readable string
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Format token count with K/M suffix
function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(0)}K`;
  }
  return count.toString();
}

export function Archive() {
  const navigate = useNavigate();
  const { openSession } = useOpenSessions();
  const { refreshProjects } = useProjectScope();
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [projectSessions, setProjectSessions] = useState<Record<string, SessionEntry[]>>({});
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SessionEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuildProgress, setRebuildProgress] = useState<SyncProgress | null>(null);
  const [rebuildResult, setRebuildResult] = useState<{ indexed: number } | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const loadSessionData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, sessionsData] = await Promise.all([
        getSessionStats(),
        listSessionsByProject(),
      ]);
      setStats(statsData);
      setProjectSessions(sessionsData.projects);

      const projects = Object.keys(sessionsData.projects);
      if (projects.length === 1) {
        setExpandedProjects(new Set([projects[0]]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessionData();
  }, [loadSessionData]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const query = searchQuery.toLowerCase();
    const allSessions = Object.values(projectSessions).flat();
    const filtered = allSessions.filter(
      (session) =>
        session.title.toLowerCase().includes(query) ||
        session.projectSlug.toLowerCase().includes(query)
    );
    setSearchResults(filtered);
  }, [searchQuery, projectSessions]);

  const handleRebuild = () => {
    setIsRebuilding(true);
    setRebuildProgress(null);
    setRebuildResult(null);

    syncSessions({
      onProgress: (progress) => setRebuildProgress(progress),
      onComplete: (result) => {
        setRebuildResult({ indexed: result.indexed });
        setIsRebuilding(false);
        loadSessionData();
        refreshProjects();
      },
      onError: (errorMsg) => {
        setError(errorMsg);
        setIsRebuilding(false);
      },
    });
  };

  const handleSessionClick = (session: SessionEntry) => {
    openSession({
      id: session.id,
      type: 'archived',
      title: session.title,
      project: session.projectSlug,
    });
    navigate('/');
  };

  const toggleProject = (project: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) {
        next.delete(project);
      } else {
        next.add(project);
      }
      return next;
    });
  };

  const displayProjects = searchResults
    ? { 'Search Results': searchResults }
    : projectSessions;

  const projectNames = Object.keys(displayProjects).sort();

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleSection}>
          <SectionHeader title="Sessions" />
          {stats && (
            <div style={styles.statsBadges}>
              <Badge label={`${stats.totalSessions} sessions`} variant="default" />
              <Badge label={`${stats.totalProjects} projects`} variant="default" />
              <Badge label={stats.sizeFormatted} variant="default" />
            </div>
          )}
        </div>
        <button
          style={{
            ...styles.rebuildButton,
            opacity: isRebuilding ? 0.7 : 1,
            cursor: isRebuilding ? 'not-allowed' : 'pointer',
          }}
          onClick={handleRebuild}
          disabled={isRebuilding}
          type="button"
          title="Sync sessions"
        >
          <RefreshCw
            size={14}
            style={{
              animation: isRebuilding ? 'spin 1s linear infinite' : 'none',
            }}
          />
          {isRebuilding ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {/* Progress bar during rebuild */}
      {rebuildProgress && (
        <TerminalPanel title="rebuilding-index..." showDots={true}>
          <div style={styles.progressHeader}>
            <span style={styles.progressPhase}>
              {rebuildProgress.phase === 'extracting'
                ? 'Extracting catalogs...'
                : rebuildProgress.current?.startsWith('Scanning')
                  ? 'Scanning projects...'
                  : 'Indexing sessions...'}
            </span>
            <span style={styles.progressCount}>
              {rebuildProgress.completed}/{rebuildProgress.total}
            </span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: rebuildProgress.total > 0
                  ? `${(rebuildProgress.completed / rebuildProgress.total) * 100}%`
                  : '0%',
              }}
            />
          </div>
          <div style={styles.progressDetails}>
            <span>{rebuildProgress.current}</span>
          </div>
        </TerminalPanel>
      )}

      {/* Rebuild result */}
      {rebuildResult && !isRebuilding && (
        <div style={styles.resultBanner}>
          Synced: {rebuildResult.indexed} sessions indexed
        </div>
      )}

      {/* Search */}
      <div style={styles.searchSection}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search sessions..."
          resultCount={searchResults !== null ? searchResults.length : undefined}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBanner}>
          {error}
          <button
            style={styles.dismissButton}
            onClick={() => setError(null)}
            type="button"
          >
            x
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.loading}>
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
          Loading sessions...
        </div>
      )}

      {/* Empty state */}
      {!loading && projectNames.length === 0 && (
        <TerminalPanel title="sessions" showDots={true}>
          <EmptyState
            icon={ArchiveIcon}
            title="No sessions found"
            description='Start a Claude Code session in any project to see it here. Click "Rebuild Index" to scan for existing sessions.'
          />
        </TerminalPanel>
      )}

      {/* Project list */}
      {!loading && projectNames.length > 0 && (
        <div style={styles.projectList}>
          {projectNames.map((project) => {
            const sessions = displayProjects[project];
            const isExpanded = expandedProjects.has(project);

            return (
              <TerminalPanel
                key={project}
                title={project}
                showDots={true}
                headerRight={
                  <Badge
                    label={`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
                    variant="default"
                  />
                }
                noPadding={true}
              >
                {/* Project header / toggle */}
                <button
                  style={styles.projectToggle}
                  onClick={() => toggleProject(project)}
                  type="button"
                >
                  <span style={{
                    ...styles.projectIcon,
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                  }}>
                    {'\u25B6'}
                  </span>
                  <span style={styles.projectName}>
                    {sessions.length} session{sessions.length !== 1 ? 's' : ''} — click to {isExpanded ? 'collapse' : 'expand'}
                  </span>
                </button>

                {isExpanded && (
                  <div style={styles.sessionList}>
                    {sessions.map((session, index) => (
                      <button
                        key={session.id}
                        style={styles.sessionCard}
                        onClick={() => handleSessionClick(session)}
                        type="button"
                      >
                        <div style={styles.cardRow}>
                          <span style={styles.lineNum}>{index + 1}</span>
                          <div style={styles.cardContent}>
                            <div style={styles.cardHeader}>
                              <span style={styles.cardTitle}>{session.title}</span>
                              <div style={styles.cardBadges}>
                                {(session.mode === 'planning' || session.mode === 'plan') && (
                                  <Badge label="Planning" variant="planning" />
                                )}
                                {session.mode === 'bypass' && (
                                  <Badge label="Bypass" variant="bypass" />
                                )}
                                {(session.mode === 'execution' || session.mode === 'acceptEdits' || session.mode === 'default') && session.mode !== null && (
                                  <Badge label="Executing" variant="execution" />
                                )}
                                {session.planCount && session.planCount > 0 && (
                                  <Badge label={`${session.planCount} plan${session.planCount > 1 ? 's' : ''}`} variant="plan" />
                                )}
                                {session.hadAutoCompact && (
                                  <Badge label="compacted" variant="compacted" />
                                )}
                              </div>
                              <span style={styles.cardDate}>{formatDate(session.endedAt)}</span>
                            </div>
                            <div style={styles.cardMeta}>
                              <Badge label={`${session.messageCount} msgs`} variant="default" />
                              <Badge label={`${session.toolCallCount} tools`} variant="default" />
                              {session.hasSubagents && (
                                <Badge label={`${session.subagentIds?.length || '?'} agents`} variant="agent" />
                              )}
                              {session.tokens && (
                                <>
                                  <span style={styles.tokenBadge}>
                                    {formatTokenCount(session.tokens.input + session.tokens.cacheCreation + session.tokens.cacheRead)} in
                                  </span>
                                  <span style={styles.tokenBadge}>
                                    {formatTokenCount(session.tokens.output)} out
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </TerminalPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1200px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  statsBadges: {
    display: 'flex',
    gap: '8px',
  },
  rebuildButton: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    backgroundColor: colors.bgSecondary,
    color: colors.textSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 150ms ease',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  progressPhase: {
    fontSize: '13px',
    color: colors.textPrimary,
    fontWeight: 500,
  },
  progressCount: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  progressBar: {
    height: '6px',
    backgroundColor: colors.bgElevated,
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: '3px',
    transition: 'width 200ms ease',
  },
  progressDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: colors.textMuted,
  },
  resultBanner: {
    padding: '12px 16px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.success}`,
    fontSize: '13px',
    color: colors.success,
  },
  searchSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.danger}`,
    fontSize: '13px',
    color: colors.danger,
  },
  dismissButton: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: colors.danger,
    cursor: 'pointer',
    fontSize: '18px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '48px',
    color: colors.textMuted,
    fontSize: '14px',
  },
  projectList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  projectToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 16px',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: colors.textSecondary,
    fontSize: '12px',
  },
  projectIcon: {
    fontSize: '8px',
    color: colors.textMuted,
    transition: 'transform 150ms ease',
  },
  projectName: {
    color: colors.textMuted,
    fontSize: '12px',
  },
  sessionList: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  sessionCard: {
    display: 'block',
    width: '100%',
    padding: '0',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background-color 150ms ease',
  },
  cardRow: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '12px 16px',
  },
  lineNum: {
    width: '32px',
    fontSize: '11px',
    color: colors.textMuted,
    opacity: 0.4,
    textAlign: 'right' as const,
    paddingRight: '12px',
    flexShrink: 0,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    paddingTop: '2px',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: '6px',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: colors.textPrimary,
    lineHeight: 1.3,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  cardBadges: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardDate: {
    fontSize: '11px',
    color: colors.textMuted,
    flexShrink: 0,
  },
  cardMeta: {
    display: 'flex',
    gap: '6px',
    fontSize: '12px',
    color: colors.textSecondary,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  tokenBadge: {
    color: colors.accent,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
    fontWeight: 500,
    fontSize: '11px',
  },
};
