/**
 * SessionAssetModal - Modal for viewing session plans or subagents
 *
 * Single item: full-width content view
 * Multiple items: sidebar list + content view
 *
 * Reuses patterns from ContentModal (overlay/chrome) and PlanViewer (progress/tasks).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Loader, FileText, Compass, Globe,
  CheckCircle2, ChevronDown, ChevronRight, Circle, Clock,
} from 'lucide-react';
import { colors } from '../styles/theme';
import { MarkdownRenderer } from './Conversation/MarkdownRenderer';
import {
  getSession,
  getSessionPlanContent,
  getSubagentFromSession,
  getSessionTasks,
  type SessionTask,
  type SessionTaskSummary,
} from '../api';

// ─── Types ───────────────────────────────────────────────────

interface SessionAssetModalProps {
  sessionId: string;
  type: 'plan' | 'agent';
  onClose: () => void;
}

interface PlanRef {
  title: string;
  source: 'embedded' | 'write' | 'agent';
  messageIndex: number;
  filePath?: string;
  agentId?: string;
  catalogId?: string;
}

interface AgentRef {
  id: string;
  sessionId: string;
}

interface LoadedContent {
  markdown: string;
  tasks?: SessionTask[];
  taskSummary?: SessionTaskSummary;
}

// ─── Helpers ────────────────────────────────────────────────

function agentDisplayName(agentId: string): string {
  // Agent IDs often look like "explore_a0630b9_explore-artifacts-page-colors"
  // or "plan_abc123_plan-something"
  const parts = agentId.split('_');
  if (parts.length >= 3) {
    return parts.slice(2).join('_').replace(/-/g, ' ');
  }
  return agentId.replace(/-/g, ' ');
}

function agentType(agentId: string): 'explore' | 'plan' | 'search' | 'general' {
  const lower = agentId.toLowerCase();
  if (lower.startsWith('explore')) return 'explore';
  if (lower.startsWith('plan')) return 'plan';
  if (lower.includes('search') || lower.includes('web')) return 'search';
  return 'general';
}

const AGENT_ICON_CONFIG = {
  explore: { icon: Compass, color: '#FF6600' },
  plan: { icon: FileText, color: '#34D399' },
  search: { icon: Globe, color: '#60A5FA' },
  general: { icon: Compass, color: '#FF6600' },
} as const;

// ─── Component ──────────────────────────────────────────────

export function SessionAssetModal({ sessionId, type, onClose }: SessionAssetModalProps) {
  const [planRefs, setPlanRefs] = useState<PlanRef[]>([]);
  const [agentRefs, setAgentRefs] = useState<AgentRef[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepsExpanded, setStepsExpanded] = useState(false);

  const items = type === 'plan' ? planRefs : agentRefs;
  const hasMultiple = items.length > 1;

  // Esc key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Load session metadata
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getSession(sessionId);
        if (cancelled) return;

        if (type === 'plan') {
          const refs = data.metadata.planRefs || [];
          setPlanRefs(refs);
          if (refs.length === 0) {
            setError('No plans found in this session');
          }
        } else {
          const refs = data.subagents || [];
          setAgentRefs(refs);
          if (refs.length === 0) {
            setError('No subagents found in this session');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId, type]);

  // Load content for selected item
  const loadContent = useCallback(async (index: number) => {
    setContentLoading(true);
    setContent(null);
    setStepsExpanded(false);
    try {
      if (type === 'plan') {
        const ref = planRefs[index];
        if (!ref) return;

        // Fetch plan content and tasks in parallel
        const [planData, tasksData] = await Promise.all([
          getSessionPlanContent(sessionId, ref.messageIndex),
          getSessionTasks(sessionId).catch(() => null),
        ]);

        setContent({
          markdown: planData.content,
          tasks: tasksData?.tasks,
          taskSummary: tasksData?.summary,
        });
      } else {
        const ref = agentRefs[index];
        if (!ref) return;

        const data = await getSubagentFromSession(sessionId, ref.id);
        // Get the last assistant message as the main content
        const assistantTexts = data.entries
          .filter(e => e.type === 'assistant_message' && e.content.text)
          .map(e => e.content.text!);

        setContent({
          markdown: assistantTexts.length > 0
            ? assistantTexts[assistantTexts.length - 1]
            : '*No response available*',
        });
      }
    } catch (err) {
      setContent({
        markdown: `*Error loading content: ${err instanceof Error ? err.message : 'Unknown error'}*`,
      });
    } finally {
      setContentLoading(false);
    }
  }, [type, planRefs, agentRefs, sessionId]);

  // Auto-load content when items are ready or selection changes
  useEffect(() => {
    if (items.length > 0 && selectedIndex < items.length) {
      loadContent(selectedIndex);
    }
  }, [items, selectedIndex, loadContent]);

  const handleItemSelect = (index: number) => {
    if (index !== selectedIndex) {
      setSelectedIndex(index);
    }
  };

  // ─── Title ─────────────────────────────────────────────────

  const title = type === 'plan'
    ? `Plans (${items.length})`
    : `Subagents (${items.length})`;

  // ─── Render ────────────────────────────────────────────────

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div
        style={{
          ...modalStyles.modal,
          maxWidth: hasMultiple ? '960px' : '820px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chrome bar */}
        <div style={modalStyles.chromeBar}>
          <div style={modalStyles.chromeLeft}>
            <span style={modalStyles.chromeTitle}>
              {loading ? (type === 'plan' ? 'Plans' : 'Subagents') : title}
            </span>
          </div>
          <button
            type="button"
            style={modalStyles.closeButton}
            onClick={onClose}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div style={modalStyles.loadingContainer}>
            <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading...</span>
          </div>
        ) : error ? (
          <div style={modalStyles.errorContainer}>{error}</div>
        ) : (
          <div style={modalStyles.body}>
            {/* Sidebar (multi-item only) */}
            {hasMultiple && (
              <div style={modalStyles.sidebar}>
                {items.map((item, i) => {
                  const isActive = i === selectedIndex;

                  if (type === 'plan') {
                    const ref = item as PlanRef;
                    return (
                      <button
                        key={i}
                        type="button"
                        style={{
                          ...modalStyles.sidebarItem,
                          backgroundColor: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                          borderLeftColor: isActive ? '#34D399' : 'transparent',
                        }}
                        onClick={() => handleItemSelect(i)}
                      >
                        <FileText size={14} color="#34D399" style={{ flexShrink: 0 }} />
                        <span style={modalStyles.sidebarText}>{ref.title}</span>
                      </button>
                    );
                  } else {
                    const ref = item as AgentRef;
                    const aType = agentType(ref.id);
                    const iconCfg = AGENT_ICON_CONFIG[aType];
                    const IconComp = iconCfg.icon;
                    return (
                      <button
                        key={i}
                        type="button"
                        style={{
                          ...modalStyles.sidebarItem,
                          backgroundColor: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                          borderLeftColor: isActive ? iconCfg.color : 'transparent',
                        }}
                        onClick={() => handleItemSelect(i)}
                      >
                        <IconComp size={14} color={iconCfg.color} style={{ flexShrink: 0 }} />
                        <span style={modalStyles.sidebarText}>{agentDisplayName(ref.id)}</span>
                      </button>
                    );
                  }
                })}
              </div>
            )}

            {/* Content area */}
            <div style={modalStyles.contentArea}>
              {contentLoading ? (
                <div style={modalStyles.loadingContainer}>
                  <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Loading content...</span>
                </div>
              ) : content ? (
                <>
                  {/* Progress bar (plans only) */}
                  {type === 'plan' && content.taskSummary && content.taskSummary.total > 0 && (
                    <div style={modalStyles.progressSection}>
                      <div style={modalStyles.progressHeader}>
                        <CheckCircle2
                          size={14}
                          color={content.taskSummary.percentage === 100 ? colors.success : colors.accent}
                        />
                        <span style={modalStyles.progressLabel}>Tasks</span>
                        <span style={{
                          ...modalStyles.progressPercentage,
                          color: content.taskSummary.percentage === 100 ? colors.success : colors.accent,
                        }}>
                          {content.taskSummary.completed}/{content.taskSummary.total} ({content.taskSummary.percentage}%)
                        </span>
                      </div>
                      <div style={modalStyles.progressTrack}>
                        <div style={{
                          ...modalStyles.progressFill,
                          width: `${content.taskSummary.percentage}%`,
                          backgroundColor: content.taskSummary.percentage === 100 ? colors.success : colors.accent,
                        }} />
                      </div>

                      {/* Collapsible task list */}
                      {content.tasks && content.tasks.length > 0 && (
                        <div style={{ marginTop: '10px' }}>
                          <button
                            type="button"
                            style={modalStyles.stepsToggle}
                            onClick={() => setStepsExpanded(!stepsExpanded)}
                          >
                            {stepsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>Show tasks ({content.tasks.length})</span>
                          </button>

                          {stepsExpanded && (
                            <div style={modalStyles.stepsList}>
                              {content.tasks.map((task) => (
                                <div key={task.id} style={modalStyles.stepItem}>
                                  <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                                    {task.status === 'completed' ? (
                                      <CheckCircle2 size={14} color={colors.success} />
                                    ) : task.status === 'in_progress' ? (
                                      <Clock size={14} color={colors.warning} />
                                    ) : (
                                      <Circle size={14} color={colors.textMuted} />
                                    )}
                                  </span>
                                  <span style={{
                                    flex: 1,
                                    fontSize: '12px',
                                    lineHeight: 1.4,
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

                  {/* Markdown content */}
                  <div style={modalStyles.markdownArea}>
                    <MarkdownRenderer content={content.markdown} />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={modalStyles.footer}>
          <span style={modalStyles.footerHint}>Esc to close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px',
    backdropFilter: 'blur(4px)',
  },
  modal: {
    width: '100%',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: colors.bgSecondary,
    borderRadius: '10px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.4)',
  },
  chromeBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  chromeLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  chromeTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textPrimary,
  },
  closeButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: colors.textMuted,
    cursor: 'pointer',
    flexShrink: 0,
  },

  // Body layout
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },

  // Sidebar
  sidebar: {
    width: '200px',
    flexShrink: 0,
    borderRight: `1px solid ${colors.borderSubtle}`,
    overflowY: 'auto' as const,
    backgroundColor: colors.bgPrimary,
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '12px',
    color: colors.textSecondary,
    transition: 'all 150ms ease',
  },
  sidebarText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    minWidth: 0,
  },

  // Content area
  contentArea: {
    flex: 1,
    overflow: 'auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },

  // Progress section (plans only)
  progressSection: {
    padding: '12px 20px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgPrimary,
    flexShrink: 0,
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

  // Markdown
  markdownArea: {
    flex: 1,
    padding: '20px 24px',
    overflow: 'auto',
  },

  // Loading / Error
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '48px 0',
    color: colors.textMuted,
    fontSize: '13px',
    flex: 1,
  },
  errorContainer: {
    padding: '24px',
    color: '#EF4444',
    fontSize: '13px',
    textAlign: 'center' as const,
  },

  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '8px 16px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  footerHint: {
    fontSize: '11px',
    color: colors.textMuted,
  },
};
