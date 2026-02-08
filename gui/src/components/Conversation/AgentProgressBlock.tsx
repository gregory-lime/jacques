import { useState, useEffect, useRef, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { Search, FileText, Bot, Terminal, Loader, AlertTriangle, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import type { AgentProgressContent } from '../../types';
import { colors } from '../../styles/theme';
import { CollapsibleBlock, type CollapsibleBlockRef } from './CollapsibleBlock';
import { SubagentConversation } from './SubagentConversation';
import { MarkdownRenderer } from './MarkdownRenderer';
import { formatTokens } from '../../utils/tokens';
import { getSubagentFromSession, type SubagentData, type ParsedEntry } from '../../api';

interface AgentProgressBlockProps {
  content: AgentProgressContent;
  expanded?: boolean;
  sessionId?: string;
}

export interface AgentProgressBlockRef {
  expand: () => void;
  scrollIntoView: () => void;
}

/**
 * Get icon and color for agent type
 */
function getAgentTypeStyle(agentType?: string): { icon: ReactNode; color: string; label: string } {
  switch (agentType?.toLowerCase()) {
    case 'explore':
      return { icon: <Search size={14} />, color: '#60A5FA', label: 'Explore' };
    case 'plan':
      return { icon: <FileText size={14} />, color: '#34D399', label: 'Plan' };
    case 'general-purpose':
      return { icon: <Bot size={14} />, color: '#A78BFA', label: 'General' };
    case 'bash':
      return { icon: <Terminal size={14} />, color: '#F472B6', label: 'Bash' };
    default:
      return { icon: <Bot size={14} />, color: '#9CA3AF', label: agentType || 'Agent' };
  }
}

/**
 * Extract the final assistant response text from subagent entries
 */
function extractFinalResponse(entries: ParsedEntry[]): string | null {
  // Find the last assistant_message with text content
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'assistant_message' && entry.content?.text) {
      return entry.content.text;
    }
  }
  return null;
}

export const AgentProgressBlock = forwardRef<AgentProgressBlockRef, AgentProgressBlockProps>(function AgentProgressBlock({ content, expanded = false, sessionId }, ref) {
  const [showFullConversation, setShowFullConversation] = useState(false);
  const [responseExpanded, setResponseExpanded] = useState(false);
  const [subagentData, setSubagentData] = useState<SubagentData | null>(null);
  const [loadingResponse, setLoadingResponse] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [forceExpanded, setForceExpanded] = useState(false);
  const collapsibleRef = useRef<CollapsibleBlockRef>(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    expand: () => {
      setForceExpanded(true);
      collapsibleRef.current?.expand();
    },
    scrollIntoView: () => {
      collapsibleRef.current?.scrollIntoView();
    },
  }));

  // Get agent type styling
  const typeStyle = getAgentTypeStyle(content.agentType);

  const agentLabel = content.agentType
    ? `${typeStyle.label} Agent`
    : content.agentId
    ? `Agent ${content.agentId.slice(0, 7)}`
    : 'Subagent';

  // Build summary with tokens and message count if available
  const promptPreview = content.prompt
    ? content.prompt.length > 60
      ? content.prompt.slice(0, 60) + '...'
      : content.prompt
    : 'Subagent task';

  const stats: string[] = [];
  if (content.messageCount) {
    stats.push(`${content.messageCount} msgs`);
  }
  if (content.tokenCount) {
    stats.push(`${formatTokens(content.tokenCount)} tok`);
  }
  const statsSuffix = stats.length > 0 ? ` (${stats.join(', ')})` : '';

  const summary = promptPreview + statsSuffix;

  // Check if we can show the full conversation (need agentId and sessionId)
  const canShowFullConversation = !!content.agentId && !!sessionId;

  // Auto-fetch subagent data on mount to show response immediately
  useEffect(() => {
    if (!content.agentId || !sessionId || subagentData || loadingResponse) {
      return;
    }

    setLoadingResponse(true);
    getSubagentFromSession(sessionId, content.agentId)
      .then((data) => {
        setSubagentData(data);
        setResponseError(null);
      })
      .catch((err) => {
        setResponseError(err.message || 'Failed to load response');
      })
      .finally(() => {
        setLoadingResponse(false);
      });
  }, [content.agentId, sessionId, subagentData, loadingResponse]);

  // Extract final response from subagent data
  const finalResponse = subagentData ? extractFinalResponse(subagentData.entries) : null;
  // Calculate if response needs collapsing (more than ~7-8 lines, roughly 400 chars)
  const lineCount = finalResponse ? finalResponse.split('\n').length : 0;
  const isLongResponse = finalResponse && (lineCount > 8 || finalResponse.length > 600);

  // Get detailed token stats from subagent data
  // totalInput = freshInput + cacheRead (cumulative across all turns)
  // Note: cacheCreation is a subset of freshInput, not additional tokens
  const tokenStats = subagentData?.statistics?.tokens;
  const totalInput = tokenStats?.totalInput || 0;
  const totalOutput = tokenStats?.totalOutput || 0;
  const cacheCreation = tokenStats?.cacheCreation || 0;
  const cacheRead = tokenStats?.cacheRead || 0;
  const freshInput = tokenStats?.freshInput || 0;
  const hasCacheStats = cacheCreation > 0 || cacheRead > 0;

  return (
    <CollapsibleBlock
      ref={collapsibleRef}
      title={agentLabel}
      icon={typeStyle.icon}
      summary={summary}
      defaultExpanded={expanded}
      forceExpanded={forceExpanded}
    >
      <div style={styles.container}>
        {/* Stats bar */}
        <div style={styles.statsBar}>
          {content.agentType && (
            <span style={{ ...styles.typeBadge, backgroundColor: typeStyle.color }}>
              <span style={styles.badgeIcon}>{typeStyle.icon}</span> {typeStyle.label}
            </span>
          )}
          {content.model && (
            <span style={styles.modelBadge}>{content.model}</span>
          )}
          {/* Show detailed token stats from subagent data */}
          {tokenStats ? (
            <>
              <span style={styles.tokenBadge}>
                {formatTokens(totalInput)} in
              </span>
              <span style={styles.tokenBadge}>
                {formatTokens(totalOutput)} out
              </span>
              {hasCacheStats && (
                <span style={styles.cacheBadge} title={`Fresh: ${formatTokens(freshInput)}, Cache write: ${formatTokens(cacheCreation)}, Cache read: ${formatTokens(cacheRead)}`}>
                  ({formatTokens(cacheRead)} cached)
                </span>
              )}
            </>
          ) : content.tokenCount ? (
            <span style={styles.tokenBadge}>
              {formatTokens(content.tokenCount)} tokens
            </span>
          ) : null}
          {subagentData?.statistics?.messageCount && (
            <span style={styles.messageBadge}>
              {subagentData.statistics.messageCount} msgs
            </span>
          )}
        </div>

        {/* Query (Task) */}
        {content.prompt && !showFullConversation && (
          <div style={styles.section}>
            <div style={styles.label}>Query:</div>
            <pre style={styles.queryContent}>{content.prompt}</pre>
          </div>
        )}

        {/* Response (Final Answer) */}
        {!showFullConversation && (
          <div style={styles.section}>
            <div style={styles.label}>Response:</div>
            {loadingResponse ? (
              <div style={styles.loadingResponse}>
                <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Loading response...
              </div>
            ) : responseError ? (
              <div style={styles.errorResponse}>
                <AlertTriangle size={14} /> {responseError}
              </div>
            ) : finalResponse ? (
              // Check if this is a Plan agent - render response as Markdown
              content.agentType?.toLowerCase() === 'plan' ? (
                <div style={styles.planResponseContainer}>
                  <MarkdownRenderer content={finalResponse} />
                </div>
              ) : (
                <div style={styles.responseContainer}>
                  <pre style={{
                    ...styles.responseContent,
                    ...(isLongResponse && !responseExpanded ? styles.responseCollapsed : {}),
                  }}>
                    {finalResponse}
                  </pre>
                  {isLongResponse && (
                    <button
                      type="button"
                      style={styles.expandResponseButton}
                      onClick={() => setResponseExpanded(!responseExpanded)}
                    >
                      <span style={styles.expandIcon}>
                        {responseExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </span>
                      {responseExpanded ? 'Show less' : 'Show full response'}
                    </button>
                  )}
                </div>
              )
            ) : (
              <div style={styles.noResponse}>
                Click to load agent response
              </div>
            )}
          </div>
        )}

        {/* Toggle for full conversation */}
        {canShowFullConversation && (
          <button
            type="button"
            style={{
              ...styles.toggleButton,
              ...(showFullConversation ? styles.toggleButtonActive : {}),
            }}
            onClick={() => setShowFullConversation(!showFullConversation)}
          >
            <span style={styles.expandIcon}>
              {showFullConversation ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            {showFullConversation ? 'Hide Full Conversation' : 'View Full Conversation'}
          </button>
        )}

        {/* Full subagent conversation (lazy loaded) */}
        {showFullConversation && content.agentId && sessionId && (
          <div style={styles.fullConversation}>
            <SubagentConversation
              agentId={content.agentId}
              sessionId={sessionId}
              promptPreview={content.prompt}
            />
          </div>
        )}
      </div>
    </CollapsibleBlock>
  );
});

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  typeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'white',
  },
  badgeIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  modelBadge: {
    padding: '4px 10px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px',
    fontSize: '13px',
    color: colors.textMuted,
    fontWeight: 500,
  },
  tokenBadge: {
    padding: '4px 10px',
    backgroundColor: 'rgba(230, 126, 82, 0.15)',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace',
    color: colors.accentOrange,
    fontWeight: 600,
  },
  messageBadge: {
    padding: '4px 10px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px',
    fontSize: '13px',
    color: colors.textMuted,
    fontWeight: 500,
  },
  cacheBadge: {
    padding: '4px 10px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px',
    fontSize: '12px',
    color: colors.textMuted,
    fontStyle: 'italic' as const,
    cursor: 'help',
  },
  toggleButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    color: colors.accent,
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  toggleButtonActive: {
    backgroundColor: colors.bgElevated,
    borderColor: colors.accent,
  },
  fullConversation: {
    marginTop: '4px',
    padding: '12px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '6px',
    border: `1px solid ${colors.borderSubtle}`,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  queryContent: {
    margin: 0,
    padding: '12px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '6px',
    fontSize: '13px',
    color: colors.textSecondary,
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '150px',
    overflow: 'auto',
    border: `1px solid ${colors.borderSubtle}`,
  },
  loadingResponse: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    color: colors.textMuted,
    fontSize: '12px',
  },
  errorResponse: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '12px',
    color: colors.warning,
    fontSize: '12px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
  },
  noResponse: {
    padding: '12px',
    color: colors.textMuted,
    fontSize: '12px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
    fontStyle: 'italic' as const,
  },
  responseContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  planResponseContainer: {
    padding: '12px 16px',
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderRadius: '6px',
    borderLeft: '3px solid #34D399',
    fontSize: '14px',
    lineHeight: 1.6,
  },
  responseContent: {
    margin: 0,
    padding: '12px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
    fontSize: '13px',
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.5,
    overflow: 'auto',
    border: `1px solid ${colors.borderSubtle}`,
  },
  responseCollapsed: {
    // Show ~7-8 lines by default (14px * 1.5 line-height * 8 lines ≈ 168px)
    maxHeight: '168px',
    overflow: 'hidden',
    position: 'relative' as const,
  },
  expandResponseButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    color: colors.textMuted,
    fontSize: '11px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
    transition: 'all 150ms ease',
  },
  expandIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
};
