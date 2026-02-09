import { useState, useEffect } from 'react';
import { FileText, PenTool, Bot, Loader, X, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock } from 'lucide-react';
import { colors } from '../../styles/theme';
import { API_URL } from '../../api/client';
import type { PlanInfo } from './PlanNavigator';
import { MarkdownRenderer } from './MarkdownRenderer';

interface PlanViewerProps {
  plan: PlanInfo;
  sessionId: string;
  /** Full project path for catalog API calls */
  projectPath?: string;
  onClose: () => void;
}

interface Task {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
  timestamp: string;
}

interface TaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  percentage: number;
}

interface TasksResponse {
  tasks: Task[];
  summary: TaskSummary;
}


interface PlanContent {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  messageIndex: number;
  filePath?: string;
  content: string;
}

/**
 * Encode a project path to the dash-encoded format used by Claude Code.
 * e.g., "/Users/gole/Desktop/project" → "-Users-gole-Desktop-project"
 */
function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '-');
}

export function PlanViewer({ plan, sessionId, projectPath, onClose }: PlanViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskSummary | null>(null);
  const [stepsExpanded, setStepsExpanded] = useState(false);

  useEffect(() => {
    const fetchPlanContent = async () => {
      setLoading(true);
      setError(null);

      try {
        // Prefer catalog endpoint when catalogId is available (works for ALL source types)
        if (plan.catalogId && projectPath) {
          const encodedPath = encodeURIComponent(encodeProjectPath(projectPath));
          const response = await fetch(
            `${API_URL}/projects/${encodedPath}/plans/${encodeURIComponent(plan.catalogId)}/content`
          );

          if (response.ok) {
            const data = await response.json();
            setContent(data.content);
            return;
          }
          // Fall through to per-source logic if catalog fetch fails
        }

        // Fallback: use the messageIndex endpoint (handles all source types)
        const response = await fetch(
          `${API_URL}/sessions/${sessionId}/plans/${plan.messageIndex}`
        );

        if (!response.ok) {
          setError(response.status === 404 ? 'Plan content not found' : `Failed to load plan: ${response.statusText}`);
          return;
        }

        const data: PlanContent = await response.json();
        setContent(data.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load plan');
      } finally {
        setLoading(false);
      }
    };

    // Fetch tasks from the session (deduplicated, actual TaskCreate/TaskUpdate calls)
    const fetchTasks = async () => {
      try {
        const response = await fetch(`${API_URL}/sessions/${sessionId}/tasks`);
        if (response.ok) {
          const data: TasksResponse = await response.json();
          setTasks(data.tasks || []);
          setTaskSummary(data.summary || null);
        }
      } catch {
        // Ignore task fetch errors - tasks section just won't show
      }
    };

    fetchPlanContent();
    fetchTasks();
  }, [sessionId, plan.messageIndex, plan.source, plan.agentId, plan.catalogId, projectPath]);

  // Handle keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sourceLabels: Record<string, string> = {
    embedded: 'Embedded',
    write: 'Written',
    agent: 'Agent',
  };
  const sourceIcons: Record<string, JSX.Element> = {
    embedded: <FileText size={24} />,
    write: <PenTool size={24} />,
    agent: <Bot size={24} />,
  };

  // Show combined sources if available
  const allSources = plan.sources || [plan.source];
  const sourceLabel = allSources.length > 1
    ? allSources.map(s => sourceLabels[s] || s).join(' + ') + ' Plan'
    : (sourceLabels[plan.source] || '') + ' Plan';
  const sourceIcon = sourceIcons[plan.source] || <FileText size={24} />;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleSection}>
            <span style={styles.sourceIcon}>{sourceIcon}</span>
            <div>
              <h2 style={styles.title}>{plan.title}</h2>
              <span style={styles.subtitle}>
                {sourceLabel}
                {plan.filePath && (
                  <span style={styles.filePath}> • {plan.filePath}</span>
                )}
              </span>
            </div>
          </div>
          <button style={styles.closeButton} onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar - shows task completion from session */}
        {taskSummary && taskSummary.total > 0 && (
          <div style={styles.progressSection}>
            <div style={styles.progressHeader}>
              <CheckCircle2 size={14} color={taskSummary.percentage === 100 ? colors.success : colors.accent} />
              <span style={styles.progressLabel}>Tasks</span>
              <span style={{
                ...styles.progressPercentage,
                color: taskSummary.percentage === 100 ? colors.success : colors.accent,
              }}>
                {taskSummary.completed}/{taskSummary.total} ({taskSummary.percentage}%)
              </span>
            </div>
            <div style={styles.progressTrack}>
              <div style={{
                ...styles.progressFill,
                width: `${taskSummary.percentage}%`,
                backgroundColor: taskSummary.percentage === 100 ? colors.success : colors.accent,
              }} />
            </div>

            {/* Collapsible Task List */}
            {tasks.length > 0 && (
              <div style={styles.stepsContainer}>
                <button
                  style={styles.stepsToggle}
                  onClick={() => setStepsExpanded(!stepsExpanded)}
                  type="button"
                >
                  {stepsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>Show tasks ({tasks.length})</span>
                </button>

                {stepsExpanded && (
                  <div style={styles.stepsList}>
                    {tasks.map((task) => (
                      <div key={task.id} style={styles.stepItem}>
                        <span style={styles.stepCheckbox}>
                          {task.status === 'completed' ? (
                            <CheckCircle2 size={14} color={colors.success} />
                          ) : task.status === 'in_progress' ? (
                            <Clock size={14} color={colors.warning} />
                          ) : (
                            <Circle size={14} color={colors.textMuted} />
                          )}
                        </span>
                        <span style={{
                          ...styles.stepText,
                          textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                          color: task.status === 'completed' ? colors.textMuted : colors.textSecondary,
                        }}>
                          {task.subject}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div style={styles.content}>
          {loading && (
            <div style={styles.loading}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Loading plan content...
            </div>
          )}

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          {!loading && !error && content && (
            <div style={styles.planContent}>
              <MarkdownRenderer content={content} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.hint}>Press Escape to close</span>
          <button style={styles.closeButtonSecondary} onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: colors.bgSecondary,
    borderRadius: '12px',
    border: `1px solid ${colors.borderSubtle}`,
    width: '80%',
    maxWidth: '900px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  titleSection: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  sourceIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.textMuted,
    marginTop: '2px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: '12px',
    color: colors.textMuted,
    marginTop: '4px',
  },
  filePath: {
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  closeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    color: colors.textMuted,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'color 150ms ease',
  },
  progressSection: {
    padding: '12px 20px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgPrimary,
  },
  progressHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  progressLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textSecondary,
  },
  progressPercentage: {
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace',
    marginLeft: 'auto',
  },
  progressTrack: {
    width: '100%',
    height: '6px',
    backgroundColor: colors.bgInput,
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 300ms ease',
  },
  stepsContainer: {
    marginTop: '12px',
  },
  stepsToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textSecondary,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  stepsList: {
    marginTop: '8px',
    maxHeight: '200px',
    overflowY: 'auto' as const,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    fontSize: '12px',
  },
  stepCheckbox: {
    display: 'inline-flex',
    flexShrink: 0,
  },
  stepText: {
    flex: 1,
    lineHeight: 1.4,
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
    minHeight: '200px',
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
  error: {
    padding: '16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: `1px solid rgba(239, 68, 68, 0.3)`,
    borderRadius: '8px',
    color: '#EF4444',
    fontSize: '13px',
  },
  planContent: {
    padding: '16px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '8px',
    overflow: 'auto',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  hint: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  closeButtonSecondary: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
