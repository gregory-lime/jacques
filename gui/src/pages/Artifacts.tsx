import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, List, Search, RefreshCw } from 'lucide-react';
import { colors, typography } from '../styles/theme';
import { SectionHeader } from '../components/ui';
import { ArtifactViewer, type Artifact } from '../components/ArtifactViewer';
import { ArtifactGrid } from '../components/ArtifactGrid';
import { ArtifactList } from '../components/ArtifactList';
import { useProjectScope } from '../hooks/useProjectScope';
import {
  listSessionsByProject,
  getSessionPlanContent,
  getSubagentFromSession,
  getSessionWebSearches,
  getProjectHandoffs,
  getHandoffContent,
  getSessionTasks,
  type HandoffEntry,
  type SessionTask,
  type SessionTaskSummary,
} from '../api';

type ViewMode = 'grid' | 'list';

interface ViewerTaskData {
  tasks: SessionTask[];
  summary: SessionTaskSummary;
}

interface ViewerState {
  viewer1: Artifact | null;
  viewer2: Artifact | null;
  viewer1Tasks: ViewerTaskData | null;
  viewer2Tasks: ViewerTaskData | null;
}

export function Artifacts() {
  const { selectedProject } = useProjectScope();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('jacques-artifacts-view');
    return (saved as ViewMode) || 'grid';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [viewers, setViewers] = useState<ViewerState>({ viewer1: null, viewer2: null, viewer1Tasks: null, viewer2Tasks: null });

  // Data state
  const [plans, setPlans] = useState<Artifact[]>([]);
  const [explorations, setExplorations] = useState<Artifact[]>([]);
  const [handoffs, setHandoffs] = useState<Artifact[]>([]);
  const [webSearches, setWebSearches] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Task summaries keyed by artifact ID for plan progress badges
  const [taskSummaries, setTaskSummaries] = useState<Map<string, SessionTaskSummary>>(new Map());

  // Save view mode preference
  useEffect(() => {
    localStorage.setItem('jacques-artifacts-view', viewMode);
  }, [viewMode]);

  // Load artifacts - same approach as Dashboard's aggregateDocuments
  const loadArtifacts = useCallback(async () => {
    if (!selectedProject) {
      setPlans([]);
      setExplorations([]);
      setHandoffs([]);
      setWebSearches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get all sessions grouped by project
      const sessionsResult = await listSessionsByProject();

      // Find sessions for selected project
      const projectSessions = sessionsResult.projects[selectedProject] || [];

      if (projectSessions.length === 0) {
        setPlans([]);
        setExplorations([]);
        setHandoffs([]);
        setWebSearches([]);
        setLoading(false);
        return;
      }

      // Aggregate plans (dedupe by title like Dashboard does)
      const planMap = new Map<string, {
        title: string;
        sessionId: string;
        messageIndex: number;
        source: string;
        timestamp: string;
      }>();

      for (const session of projectSessions) {
        if (session.planRefs) {
          for (const ref of session.planRefs) {
            const title = ref.title.replace(/^Plan:\s*/i, '');
            const key = title.toLowerCase().trim();
            if (!planMap.has(key)) {
              planMap.set(key, {
                title,
                sessionId: session.id,
                messageIndex: ref.messageIndex,
                source: ref.source,
                timestamp: session.endedAt,
              });
            }
          }
        }
      }

      const planArtifacts: Artifact[] = Array.from(planMap.values()).map((p) => ({
        id: `${p.sessionId}-plan-${p.messageIndex}`,
        type: 'plan' as const,
        title: p.title,
        content: '', // Lazy load
        timestamp: p.timestamp,
        metadata: { sessionId: p.sessionId, messageIndex: p.messageIndex, source: p.source },
      }));
      setPlans(planArtifacts);

      // Fetch task summaries for plan sessions (for progress badges)
      const uniqueSessionIds = [...new Set(planArtifacts.map(p => p.metadata?.sessionId).filter(Boolean))] as string[];
      const summaryMap = new Map<string, SessionTaskSummary>();
      await Promise.all(
        uniqueSessionIds.map(async (sid) => {
          try {
            const data = await getSessionTasks(sid);
            if (data.summary && data.summary.total > 0) {
              // Map summary to all plan artifacts from this session
              for (const plan of planArtifacts) {
                if (plan.metadata?.sessionId === sid) {
                  summaryMap.set(plan.id, data.summary);
                }
              }
            }
          } catch {
            // Ignore - session may not exist anymore
          }
        })
      );
      setTaskSummaries(summaryMap);

      // Aggregate explorations (all of them)
      const explorationArtifacts: Artifact[] = [];
      for (const session of projectSessions) {
        if (session.exploreAgents) {
          for (const agent of session.exploreAgents) {
            explorationArtifacts.push({
              id: agent.id,
              type: 'exploration',
              title: agent.description || 'Exploration',
              content: '', // Lazy load
              timestamp: agent.timestamp,
              metadata: { sessionId: session.id, source: session.projectSlug },
            });
          }
        }
      }
      setExplorations(explorationArtifacts);

      // Aggregate web searches (dedupe by query)
      const webMap = new Map<string, Artifact>();
      for (const session of projectSessions) {
        if (session.webSearches) {
          for (const ws of session.webSearches) {
            const key = ws.query.toLowerCase().trim();
            if (!webMap.has(key)) {
              webMap.set(key, {
                id: `${session.id}-ws-${ws.timestamp}`,
                type: 'web-search',
                title: ws.query,
                content: '',
                timestamp: ws.timestamp,
                metadata: { sessionId: session.id, query: ws.query },
              });
            }
          }
        }
      }
      setWebSearches(Array.from(webMap.values()));

      // Load handoffs
      const projectPath = projectSessions[0]?.projectPath;
      if (projectPath) {
        try {
          const encodedPath = encodeURIComponent(projectPath);
          const handoffsResult = await getProjectHandoffs(encodedPath);
          const handoffArtifacts: Artifact[] = handoffsResult.handoffs.map((h: HandoffEntry) => ({
            id: h.filename,
            type: 'handoff' as const,
            title: h.filename.replace(/-handoff\.md$/, '').replace(/-/g, ' '),
            content: '',
            timestamp: h.timestamp,
            metadata: { source: h.filename, tokenEstimate: h.tokenEstimate, projectPath: encodedPath },
          }));
          setHandoffs(handoffArtifacts);
        } catch {
          setHandoffs([]);
        }
      } else {
        setHandoffs([]);
      }

    } catch (err) {
      console.error('Failed to load artifacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  // Load content on click
  const handleSelectArtifact = useCallback(async (artifact: Artifact) => {
    let loaded = artifact;
    let taskData: ViewerTaskData | null = null;

    if (!artifact.content) {
      try {
        if (artifact.type === 'plan' && artifact.metadata?.sessionId) {
          const [planData, tasksResult] = await Promise.all([
            getSessionPlanContent(
              artifact.metadata.sessionId as string,
              artifact.metadata.messageIndex as number
            ),
            getSessionTasks(artifact.metadata.sessionId as string).catch(() => null),
          ]);
          loaded = { ...artifact, content: planData.content };
          if (tasksResult && tasksResult.summary && tasksResult.summary.total > 0) {
            taskData = { tasks: tasksResult.tasks, summary: tasksResult.summary };
          }
        } else if (artifact.type === 'exploration' && artifact.metadata?.sessionId) {
          const data = await getSubagentFromSession(artifact.metadata.sessionId as string, artifact.id);
          const content = data.entries
            .filter((e) => e.type === 'assistant_message')
            .map((e) => e.content.text || '')
            .filter(Boolean)
            .join('\n\n---\n\n');
          loaded = { ...artifact, content: content || data.prompt || '(No content)' };
        } else if (artifact.type === 'web-search' && artifact.metadata?.sessionId) {
          const data = await getSessionWebSearches(artifact.metadata.sessionId as string);
          const search = data.searches.find((s) => s.query === artifact.metadata?.query);
          if (search) {
            // Format URLs as content when response is empty
            let content = search.response || '';
            if (!content && search.urls && search.urls.length > 0) {
              content = '## Sources\n\n' + search.urls.map((u, i) => `${i + 1}. **${u.title}**\n   ${u.url}`).join('\n\n');
            }
            loaded = { ...artifact, content: content || '(No results)', metadata: { ...artifact.metadata, urls: search.urls } };
          }
        } else if (artifact.type === 'handoff' && artifact.metadata?.projectPath) {
          const data = await getHandoffContent(artifact.metadata.projectPath as string, artifact.id);
          const titleMatch = data.content.match(/^#\s+(.+)$/m);
          loaded = { ...artifact, title: titleMatch ? titleMatch[1] : artifact.title, content: data.content };
        }
      } catch (err) {
        console.error('Failed to load content:', err);
        loaded = { ...artifact, content: '(Failed to load content)' };
      }
    } else if (artifact.type === 'plan' && artifact.metadata?.sessionId) {
      // Content already loaded but we may need to fetch tasks
      try {
        const tasksResult = await getSessionTasks(artifact.metadata.sessionId as string);
        if (tasksResult.summary && tasksResult.summary.total > 0) {
          taskData = { tasks: tasksResult.tasks, summary: tasksResult.summary };
        }
      } catch {
        // Ignore
      }
    }

    setViewers((prev) => {
      if (prev.viewer1?.id === loaded.id) return { ...prev, viewer1: loaded, viewer1Tasks: taskData };
      if (prev.viewer2?.id === loaded.id) return { ...prev, viewer2: loaded, viewer2Tasks: taskData };
      if (!prev.viewer1) return { ...prev, viewer1: loaded, viewer1Tasks: taskData };
      if (!prev.viewer2) return { ...prev, viewer2: loaded, viewer2Tasks: taskData };
      return { ...prev, viewer2: loaded, viewer2Tasks: taskData };
    });
  }, []);

  const closeViewer = (index: 1 | 2) => {
    setViewers((prev) => ({
      ...prev,
      [index === 1 ? 'viewer1' : 'viewer2']: null,
      [index === 1 ? 'viewer1Tasks' : 'viewer2Tasks']: null,
    }));
  };

  const selectedIds = new Set<string>();
  if (viewers.viewer1) selectedIds.add(viewers.viewer1.id);
  if (viewers.viewer2) selectedIds.add(viewers.viewer2.id);

  const total = plans.length + explorations.length + handoffs.length + webSearches.length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <SectionHeader title="Artifacts" />
          {!loading && total > 0 && (
            <span style={styles.count}>{total} artifact{total !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div style={styles.headerRight}>
          <div style={styles.searchBox}>
            <Search size={14} style={{ color: colors.textMuted }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>
          <div style={styles.viewToggle}>
            <button
              style={{ ...styles.toggleBtn, ...(viewMode === 'grid' ? styles.toggleActive : {}) }}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              style={{ ...styles.toggleBtn, ...(viewMode === 'list' ? styles.toggleActive : {}) }}
              onClick={() => setViewMode('list')}
            >
              <List size={14} />
            </button>
          </div>
          <button style={styles.refreshBtn} onClick={loadArtifacts} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.error}>
          {error}
          <button onClick={() => setError(null)} style={styles.errorClose}>×</button>
        </div>
      )}

      {!selectedProject && !loading && (
        <div style={styles.empty}>
          <p style={{ margin: 0, fontSize: 15, color: colors.textSecondary }}>Select a project</p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.textMuted }}>Choose from dropdown above</p>
        </div>
      )}

      {selectedProject && (
        <div style={styles.main}>
          <div style={styles.viewers}>
            <ArtifactViewer artifact={viewers.viewer1} onClose={() => closeViewer(1)} viewerIndex={1} loading={loading} taskSummary={viewers.viewer1Tasks?.summary} tasks={viewers.viewer1Tasks?.tasks} />
            <ArtifactViewer artifact={viewers.viewer2} onClose={() => closeViewer(2)} viewerIndex={2} loading={loading} taskSummary={viewers.viewer2Tasks?.summary} tasks={viewers.viewer2Tasks?.tasks} />
          </div>
          <div style={styles.lists}>
            {loading ? (
              <div style={styles.loading}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Loading...</span>
              </div>
            ) : viewMode === 'grid' ? (
              <ArtifactGrid
                plans={plans}
                explorations={explorations}
                handoffs={handoffs}
                webSearches={webSearches}
                onSelectArtifact={handleSelectArtifact}
                selectedIds={selectedIds}
                searchQuery={searchQuery}
                taskSummaries={taskSummaries}
              />
            ) : (
              <ArtifactList
                plans={plans}
                explorations={explorations}
                handoffs={handoffs}
                webSearches={webSearches}
                onSelectArtifact={handleSelectArtifact}
                selectedIds={selectedIds}
                searchQuery={searchQuery}
                taskSummaries={taskSummaries}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '20px 24px',
    gap: '16px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  count: {
    fontSize: '13px',
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '6px',
    border: `1px solid ${colors.borderSubtle}`,
    width: '180px',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textPrimary,
    fontSize: '13px',
    outline: 'none',
  },
  viewToggle: {
    display: 'flex',
    backgroundColor: colors.bgSecondary,
    borderRadius: '6px',
    padding: '2px',
    border: `1px solid ${colors.borderSubtle}`,
  },
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '24px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
  },
  toggleActive: {
    backgroundColor: colors.bgElevated,
    color: colors.textPrimary,
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    color: colors.textMuted,
    cursor: 'pointer',
  },
  error: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: `${colors.danger}10`,
    borderRadius: '6px',
    border: `1px solid ${colors.danger}30`,
    fontSize: '13px',
    color: colors.danger,
  },
  errorClose: {
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.danger,
    cursor: 'pointer',
    fontSize: '18px',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px dashed ${colors.borderSubtle}`,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: 0,
    overflow: 'hidden',
  },
  viewers: {
    flex: 1,
    display: 'flex',
    gap: '16px',
    minHeight: 0,
  },
  lists: {
    flexShrink: 0,
    height: '320px',
    overflow: 'auto',
    borderTop: `1px solid ${colors.borderSubtle}`,
    paddingTop: '12px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    height: '100%',
    color: colors.textMuted,
    fontSize: '14px',
  },
};
