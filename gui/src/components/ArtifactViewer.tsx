import React, { useState } from 'react';
import { X, FileText, Compass, Search, Globe, ScrollText, Loader2, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock } from 'lucide-react';
import { colors, typography } from '../styles/theme';
import { MarkdownRenderer } from './Conversation/MarkdownRenderer';
import type { SessionTask, SessionTaskSummary } from '../api';

export type ArtifactType = 'plan' | 'exploration' | 'research' | 'web-search' | 'handoff';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  timestamp?: string;
  metadata?: {
    sessionId?: string;
    source?: string;
    query?: string;
    urls?: Array<{ title: string; url: string }>;
    tokenEstimate?: number;
    catalogId?: string;
    projectPath?: string;
    messageIndex?: number;
  };
}

interface ArtifactViewerProps {
  artifact: Artifact | null;
  onClose: () => void;
  viewerIndex: 1 | 2;
  loading?: boolean;
  taskSummary?: SessionTaskSummary | null;
  tasks?: SessionTask[];
}

const typeConfig: Record<ArtifactType, { icon: typeof FileText; label: string; color: string }> = {
  plan: { icon: FileText, label: 'Plan', color: '#34D399' },
  exploration: { icon: Compass, label: 'Exploration', color: colors.accent },
  research: { icon: Search, label: 'Research', color: '#A78BFA' },
  'web-search': { icon: Globe, label: 'Web Search', color: '#60A5FA' },
  handoff: { icon: ScrollText, label: 'Handoff', color: '#F59E0B' },
};

export function ArtifactViewer({ artifact, onClose, viewerIndex, loading, taskSummary, tasks }: ArtifactViewerProps) {
  const [stepsExpanded, setStepsExpanded] = useState(false);
  if (!artifact) {
    return (
      <div style={styles.emptyViewer}>
        <div style={styles.emptyContent}>
          <div style={styles.emptyIcon}>
            <div style={styles.emptyIconInner}>
              {viewerIndex}
            </div>
          </div>
          <p style={styles.emptyText}>
            {loading ? 'Loading...' : 'Click an artifact to view'}
          </p>
          <p style={styles.emptyHint}>
            {viewerIndex === 1
              ? 'First item opens here'
              : 'Second item for comparison'}
          </p>
        </div>
      </div>
    );
  }

  const config = typeConfig[artifact.type];
  const Icon = config.icon;
  const isLoadingContent = !artifact.content;

  return (
    <div style={styles.viewer}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={{ ...styles.typeBadge, backgroundColor: `${config.color}15`, color: config.color }}>
            <Icon size={12} />
            <span>{config.label}</span>
          </div>
          <h3 style={styles.title}>{artifact.title}</h3>
        </div>
        <button
          style={styles.closeButton}
          onClick={onClose}
          title="Close viewer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Metadata bar */}
      {artifact.metadata && (
        <div style={styles.metaBar}>
          {artifact.timestamp && (
            <span style={styles.metaItem}>
              {new Date(artifact.timestamp).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {artifact.metadata.source && (
            <span style={styles.metaItem}>
              {artifact.metadata.source}
            </span>
          )}
          {artifact.metadata.tokenEstimate && (
            <span style={styles.metaItem}>
              ~{Math.round(artifact.metadata.tokenEstimate / 1000)}k tokens
            </span>
          )}
        </div>
      )}

      {/* Plan Progress Bar */}
      {artifact.type === 'plan' && taskSummary && taskSummary.total > 0 && (
        <div style={styles.progressSection}>
          <div style={styles.progressHeader}>
            <CheckCircle2 size={14} color={taskSummary.percentage === 100 ? colors.success : '#34D399'} />
            <span style={styles.progressLabel}>Tasks</span>
            <span style={{
              ...styles.progressPercentage,
              color: taskSummary.percentage === 100 ? colors.success : '#34D399',
            }}>
              {taskSummary.completed}/{taskSummary.total} ({taskSummary.percentage}%)
            </span>
          </div>
          <div style={styles.progressTrack}>
            <div style={{
              ...styles.progressFill,
              width: `${taskSummary.percentage}%`,
              backgroundColor: taskSummary.percentage === 100 ? colors.success : '#34D399',
            }} />
          </div>

          {/* Collapsible Task List */}
          {tasks && tasks.length > 0 && (
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
        {isLoadingContent ? (
          <div style={styles.contentLoading}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading content...</span>
          </div>
        ) : artifact.type === 'web-search' && artifact.metadata?.urls ? (
          <div style={styles.webSearchContent}>
            <div style={styles.queryBlock}>
              <span style={styles.queryLabel}>Query:</span>
              <span style={styles.queryText}>{artifact.metadata.query || artifact.title}</span>
            </div>
            <div style={styles.urlList}>
              {artifact.metadata.urls.map((url, i) => (
                <a
                  key={i}
                  href={url.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.urlItem}
                >
                  <span style={styles.urlTitle}>{url.title}</span>
                  <span style={styles.urlHref}>{url.url}</span>
                </a>
              ))}
            </div>
            {artifact.content && (
              <div style={styles.responseBlock}>
                <span style={styles.responseLabel}>Response:</span>
                <MarkdownRenderer content={artifact.content} />
              </div>
            )}
          </div>
        ) : (
          <MarkdownRenderer content={artifact.content} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  emptyViewer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px dashed ${colors.borderSubtle}`,
    borderRadius: '8px',
    backgroundColor: colors.bgSecondary,
  },
  emptyContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  emptyIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: colors.bgElevated,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  emptyIconInner: {
    fontSize: '16px',
    fontWeight: 600,
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
  },
  emptyText: {
    fontSize: '13px',
    color: colors.textSecondary,
    margin: 0,
  },
  emptyHint: {
    fontSize: '11px',
    color: colors.textMuted,
    margin: 0,
  },
  viewer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
    flex: 1,
  },
  typeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 7px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 500,
    color: colors.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: colors.textMuted,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    flexShrink: 0,
  },
  metaBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '6px 14px',
    backgroundColor: colors.bgSecondary,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    fontSize: '11px',
    color: colors.textMuted,
    flexShrink: 0,
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  progressSection: {
    padding: '12px 14px',
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
    fontFamily: typography.fontFamily.mono,
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
    marginTop: '10px',
  },
  stepsToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    fontSize: '11px',
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
    maxHeight: '180px',
    overflowY: 'auto' as const,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 10px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    fontSize: '11px',
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
    padding: '16px',
    overflow: 'auto',
  },
  contentLoading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    height: '100%',
    color: colors.textMuted,
    fontSize: '13px',
  },
  webSearchContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  queryBlock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: colors.bgElevated,
    borderRadius: '6px',
  },
  queryLabel: {
    fontSize: '10px',
    fontWeight: 500,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  queryText: {
    fontSize: '13px',
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  urlList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  urlItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '8px 10px',
    backgroundColor: colors.bgElevated,
    borderRadius: '6px',
    textDecoration: 'none',
    transition: 'background-color 150ms ease',
  },
  urlTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: colors.accent,
  },
  urlHref: {
    fontSize: '10px',
    color: colors.textMuted,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  responseBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  responseLabel: {
    fontSize: '10px',
    fontWeight: 500,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
};
