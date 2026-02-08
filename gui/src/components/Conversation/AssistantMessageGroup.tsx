import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Bot, Brain, Wrench, Check, XCircle, FileText } from 'lucide-react';
import type { ConversationMessage, MessageContent, AgentProgressContent, ToolUseContent } from '../../types';
import { colors } from '../../styles/theme';
import { CollapsibleBlock, type CollapsibleBlockRef } from './CollapsibleBlock';
import { CodeBlock } from './CodeBlock';
import { AgentProgressBlock, type AgentProgressBlockRef } from './AgentProgressBlock';
import { BashProgressBlock, type BashProgressBlockRef } from './BashProgressBlock';
import { MCPProgressBlock } from './MCPProgressBlock';
import { WebSearchBlock } from './WebSearchBlock';
import { MarkdownRenderer } from './MarkdownRenderer';
import { estimateContentTokens, formatTokens, estimateTokens } from '../../utils/tokens';

interface AssistantMessageGroupProps {
  messages: ConversationMessage[];
  allExpanded?: boolean;
  sessionId?: string;
  /** Target message index within this group to auto-expand */
  targetMessageIndex?: number;
  /** Target content index within the target message */
  targetContentIndex?: number;
  /** Target content ID (e.g., agentId) */
  targetContentId?: string;
}

interface ContentIndicator {
  type: 'agent' | 'plan' | 'web_search' | 'bash' | 'mcp';
  label: string;
  icon: ReactNode;
  color: string;
  messageIndex: number;
  contentIndex: number;
  id?: string;
}

/**
 * Get the first text content from messages for preview
 */
function getTextPreview(messages: ConversationMessage[]): string {
  for (const msg of messages) {
    for (const content of msg.content) {
      if (content.type === 'text' && content.text.trim()) {
        const text = content.text.trim();
        const firstLine = text.split('\n')[0];
        return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
      }
    }
  }
  return '';
}

/**
 * Extract content indicators from messages
 * Only shows agents - other badges removed for cleaner UI
 */
function extractIndicators(messages: ConversationMessage[]): ContentIndicator[] {
  const indicators: ContentIndicator[] = [];
  const seenAgents = new Set<string>();

  messages.forEach((msg, msgIdx) => {
    msg.content.forEach((content, contentIdx) => {
      if (content.type === 'agent_progress') {
        const agentContent = content as AgentProgressContent;
        const agentType = agentContent.agentType || 'agent';
        if (agentContent.agentId && !seenAgents.has(agentContent.agentId)) {
          seenAgents.add(agentContent.agentId);
          indicators.push({
            type: 'agent',
            label: agentType.charAt(0).toUpperCase() + agentType.slice(1),
            icon: <Bot size={12} />,
            color: '#A78BFA',
            messageIndex: msgIdx,
            contentIndex: contentIdx,
            id: agentContent.agentId,
          });
        }
      }
    });
  });

  return indicators;
}

/**
 * Calculate aggregated stats for all messages
 */
function calculateStats(messages: ConversationMessage[]) {
  let totalTokens = 0;
  let thinkingTokens = 0;
  let toolTokens = 0;
  let textTokens = 0;
  let toolCalls = 0;
  let agentCount = 0;
  const agentIds = new Set<string>();

  messages.forEach(msg => {
    msg.content.forEach(content => {
      const tokens = estimateContentTokens(content);
      totalTokens += tokens;

      if (content.type === 'thinking') {
        thinkingTokens += tokens;
      } else if (content.type === 'tool_use' || content.type === 'tool_result') {
        toolTokens += tokens;
        if (content.type === 'tool_use') toolCalls++;
      } else if (content.type === 'text') {
        textTokens += tokens;
      } else if (content.type === 'agent_progress') {
        const agentContent = content as AgentProgressContent;
        if (agentContent.agentId && !agentIds.has(agentContent.agentId)) {
          agentIds.add(agentContent.agentId);
          agentCount++;
        }
      }
    });
  });

  return { totalTokens, thinkingTokens, toolTokens, textTokens, toolCalls, agentCount };
}

export function AssistantMessageGroup({
  messages,
  allExpanded = false,
  sessionId,
  targetMessageIndex,
  targetContentIndex,
  targetContentId,
}: AssistantMessageGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [manualCollapse, setManualCollapse] = useState(false);
  const [expandedTarget, setExpandedTarget] = useState<{ msgIdx: number; contentIdx: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef<Map<string, CollapsibleBlockRef | AgentProgressBlockRef | BashProgressBlockRef | null>>(new Map());

  // Get timestamp from first message
  const timestamp = new Date(messages[0].timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Calculate stats
  const stats = useMemo(() => calculateStats(messages), [messages]);

  // Extract indicators
  const indicators = useMemo(() => extractIndicators(messages), [messages]);

  // Get text preview
  const preview = useMemo(() => getTextPreview(messages), [messages]);

  // Handle navigation target
  useEffect(() => {
    if (targetMessageIndex !== undefined || targetContentId) {
      setIsExpanded(true);

      // Find the target content
      if (targetContentId) {
        messages.forEach((msg, msgIdx) => {
          msg.content.forEach((content, contentIdx) => {
            if (content.type === 'agent_progress') {
              const agentContent = content as AgentProgressContent;
              if (agentContent.agentId === targetContentId) {
                setExpandedTarget({ msgIdx, contentIdx });
                setTimeout(() => {
                  const key = `${msgIdx}-${contentIdx}`;
                  const ref = contentRefs.current.get(key);
                  if (ref) {
                    ref.expand();
                    setTimeout(() => ref.scrollIntoView(), 50);
                  }
                }, 100);
              }
            }
          });
        });
      } else if (targetMessageIndex !== undefined && targetContentIndex !== undefined) {
        setExpandedTarget({ msgIdx: targetMessageIndex, contentIdx: targetContentIndex });
        setTimeout(() => {
          const key = `${targetMessageIndex}-${targetContentIndex}`;
          const ref = contentRefs.current.get(key);
          if (ref) {
            ref.expand();
            setTimeout(() => ref.scrollIntoView(), 50);
          }
        }, 100);
      }
    }
  }, [targetMessageIndex, targetContentIndex, targetContentId, messages]);

  // Handle indicator click
  const handleIndicatorClick = (indicator: ContentIndicator) => {
    setIsExpanded(true);
    setExpandedTarget({ msgIdx: indicator.messageIndex, contentIdx: indicator.contentIndex });
    setTimeout(() => {
      const key = `${indicator.messageIndex}-${indicator.contentIndex}`;
      const ref = contentRefs.current.get(key);
      if (ref) {
        ref.expand();
        setTimeout(() => ref.scrollIntoView(), 50);
      }
    }, 100);
  };

  const showExpanded = manualCollapse ? false : (isExpanded || allExpanded);

  const handleToggle = () => {
    if (allExpanded && !manualCollapse) {
      // User wants to collapse while allExpanded is on — override locally
      setManualCollapse(true);
    } else if (allExpanded && manualCollapse) {
      // User wants to re-expand while allExpanded is on — remove override
      setManualCollapse(false);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  // Reset manual collapse when allExpanded changes
  useEffect(() => {
    setManualCollapse(false);
  }, [allExpanded]);

  return (
    <div style={styles.container} ref={containerRef}>
      {/* Header */}
      <div
        style={styles.header}
        onClick={handleToggle}
      >
        <div style={styles.headerLeft}>
          <span style={styles.expandToggle}>
            {showExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span style={styles.role}>Claude</span>

          {/* Indicators */}
          <div style={styles.indicators}>
            {indicators.map((ind, idx) => (
              <button
                key={`${ind.type}-${idx}`}
                type="button"
                style={{ ...styles.indicator, backgroundColor: `${ind.color}20`, color: ind.color }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleIndicatorClick(ind);
                }}
                title={`Jump to ${ind.label}`}
              >
                <span style={styles.indicatorIcon}>{ind.icon}</span> {ind.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.headerRight}>
          {stats.thinkingTokens > 0 && (
            <span style={styles.tokenPill} title="Thinking tokens">
              <Brain size={10} /> {formatTokens(stats.thinkingTokens)}
            </span>
          )}
          {stats.toolCalls > 0 && (
            <span style={styles.tokenPill} title="Tool calls">
              <Wrench size={10} /> {stats.toolCalls}
            </span>
          )}
          {stats.agentCount > 0 && (
            <span style={styles.tokenPill} title="Agents">
              <Bot size={10} /> {stats.agentCount}
            </span>
          )}
          <span style={styles.tokenBadge} title={`~${stats.totalTokens} tokens`}>
            {formatTokens(stats.totalTokens)} tok
          </span>
          <span style={styles.timestamp}>{timestamp}</span>
        </div>
      </div>

      {/* Preview (when collapsed) */}
      {!showExpanded && preview && (
        <div style={styles.preview} onClick={() => setIsExpanded(true)}>
          {preview}
        </div>
      )}

      {/* Content (when expanded) */}
      {showExpanded && (
        <div className="jacques-expand-content" style={styles.content}>
          {messages.map((message, msgIdx) => (
            <div key={message.id} style={styles.messageBlock}>
              {message.content.map((content, contentIdx) => {
                const key = `${msgIdx}-${contentIdx}`;
                const isTarget = expandedTarget?.msgIdx === msgIdx && expandedTarget?.contentIdx === contentIdx;

                return (
                  <ContentRenderer
                    key={key}
                    content={content}
                    expanded={allExpanded || isTarget}
                    sessionId={sessionId}
                    contentRef={(ref) => {
                      if (ref) {
                        contentRefs.current.set(key, ref);
                      } else {
                        contentRefs.current.delete(key);
                      }
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Code file extensions that should NOT be considered plans
 */
const CODE_FILE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less', '.sass',
  '.html', '.htm', '.xml', '.svg',
  '.json', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.prisma',
];

/**
 * Check if a file path is a code file (not a plan)
 */
function isCodeFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return CODE_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Check if content looks like a markdown plan (not code)
 */
function looksLikeMarkdownPlan(content: string): boolean {
  // Must have a markdown heading
  if (!content.includes('#')) return false;

  // Should not start with import/export/const/function (code patterns)
  const firstNonEmptyLine = content.split('\n').find(line => line.trim().length > 0) || '';
  const codePatterns = [
    /^import\s+/,
    /^export\s+/,
    /^const\s+/,
    /^let\s+/,
    /^var\s+/,
    /^function\s+/,
    /^class\s+/,
    /^interface\s+/,
    /^type\s+/,
    /^def\s+/,
    /^from\s+.*\s+import/,
    /^package\s+/,
    /^use\s+/,
    /^#include/,
    /^#!\//,
  ];
  if (codePatterns.some(pattern => pattern.test(firstNonEmptyLine.trim()))) {
    return false;
  }

  // Must have reasonable markdown structure
  const hasHeading = /^#+\s+.+/m.test(content);
  const hasListOrParagraph = /^[-*]\s+.+/m.test(content) || content.split('\n\n').length > 1;

  return hasHeading && hasListOrParagraph;
}

/**
 * Extract title from plan content
 */
function extractPlanTitle(content: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= 50) {
    return firstLine;
  }
  return firstLine.substring(0, 47) + '...';
}

/**
 * Check if a Write tool call is writing a plan file
 */
function isWritingPlanFile(toolContent: ToolUseContent): { isPlan: boolean; filePath?: string; content?: string; title?: string } {
  if (toolContent.name !== 'Write') {
    return { isPlan: false };
  }

  const input = toolContent.input as { file_path?: string; content?: string };
  const filePath = input?.file_path || '';
  const fileContent = input?.content || '';

  // Skip code files
  if (isCodeFile(filePath)) {
    return { isPlan: false };
  }

  // Check if path looks like a plan file AND content looks like markdown
  const pathLooksLikePlan =
    filePath.toLowerCase().includes('plan') ||
    filePath.endsWith('.plan.md') ||
    filePath.includes('.jacques/plans/') ||
    filePath.includes('.claude/plans/');

  if (pathLooksLikePlan && looksLikeMarkdownPlan(fileContent)) {
    const title = extractPlanTitle(fileContent);
    return {
      isPlan: true,
      filePath,
      content: fileContent,
      title: title.startsWith('Plan:') ? title : `Plan: ${title}`,
    };
  }

  return { isPlan: false };
}

interface ContentRendererProps {
  content: MessageContent;
  expanded?: boolean;
  sessionId?: string;
  contentRef?: (ref: CollapsibleBlockRef | AgentProgressBlockRef | BashProgressBlockRef | null) => void;
}

function ContentRenderer({ content, expanded = false, sessionId, contentRef }: ContentRendererProps) {
  switch (content.type) {
    case 'text':
      return <TextBlock text={content.text} expanded={expanded} />;

    case 'thinking': {
      const thinkingTokens = estimateTokens(content.text);
      return (
        <CollapsibleBlock
          ref={contentRef}
          title="Thinking"
          icon={<Brain size={14} />}
          summary={`${formatTokens(thinkingTokens)} tok`}
          defaultExpanded={expanded}
        >
          <div style={styles.thinkingContent}>{content.text}</div>
        </CollapsibleBlock>
      );
    }

    case 'tool_use': {
      // Check if this is a Write tool writing a plan file
      const planInfo = isWritingPlanFile(content as ToolUseContent);
      if (planInfo.isPlan && planInfo.content) {
        const planTokens = estimateTokens(planInfo.content);
        return (
          <CollapsibleBlock
            ref={contentRef}
            title={planInfo.title || 'Plan'}
            icon={<FileText size={14} />}
            summary={`${formatTokens(planTokens)} tok`}
            defaultExpanded={expanded}
            headerStyle={{ backgroundColor: 'rgba(52, 211, 153, 0.1)', borderLeft: '3px solid #34D399' }}
          >
            <div style={styles.planContent}>
              <MarkdownRenderer content={planInfo.content} />
            </div>
          </CollapsibleBlock>
        );
      }

      // Regular tool display
      const toolInputStr = JSON.stringify(content.input, null, 2);
      const toolTokens = estimateTokens(content.name) + estimateTokens(toolInputStr);
      return (
        <CollapsibleBlock
          ref={contentRef}
          title={`Tool: ${content.name}`}
          icon={<Wrench size={14} />}
          summary={`${getToolSummary(content.name, content.input)} · ${formatTokens(toolTokens)} tok`}
          defaultExpanded={expanded}
        >
          <div style={styles.toolContent}>
            <pre style={styles.toolInput}>{toolInputStr}</pre>
          </div>
        </CollapsibleBlock>
      );
    }

    case 'tool_result': {
      const resultTokens = estimateTokens(content.content);
      return (
        <CollapsibleBlock
          ref={contentRef}
          title="Tool Result"
          icon={content.is_error ? <XCircle size={14} /> : <Check size={14} />}
          summary={content.is_error ? 'Error' : `${formatTokens(resultTokens)} tok`}
          defaultExpanded={expanded}
        >
          <div style={{
            ...styles.toolResult,
            ...(content.is_error ? styles.toolResultError : {}),
          }}>
            {content.content}
          </div>
        </CollapsibleBlock>
      );
    }

    case 'code':
      return <CodeBlock code={content.code} language={content.language} />;

    case 'agent_progress':
      return (
        <AgentProgressBlock
          ref={contentRef as React.Ref<AgentProgressBlockRef>}
          content={content as AgentProgressContent}
          expanded={expanded}
          sessionId={sessionId}
        />
      );

    case 'bash_progress':
      return (
        <BashProgressBlock
          ref={contentRef as React.Ref<BashProgressBlockRef>}
          content={content}
          expanded={expanded}
        />
      );

    case 'mcp_progress':
      return <MCPProgressBlock content={content} />;

    case 'web_search':
      return <WebSearchBlock content={content} />;

    default:
      return null;
  }
}

function TextBlock({ text, expanded = false }: { text: string; expanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(expanded);

  const parts = text.split(/(```[\s\S]*?```)/g);
  const lineCount = text.split('\n').length;
  const isLong = text.length > 500 || lineCount > 20;
  const shouldCollapse = isLong && !expanded;
  const showExpanded = isExpanded || expanded;

  const displayParts = shouldCollapse && !showExpanded
    ? text.slice(0, 400).split(/(```[\s\S]*?```)/g)
    : parts;

  return (
    <div style={styles.textBlock}>
      {displayParts.map((part, index) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
          if (match) {
            return (
              <CodeBlock
                key={index}
                language={match[1]}
                code={match[2].trim()}
              />
            );
          }
        }
        return <span key={index}>{part}</span>;
      })}
      {shouldCollapse && !showExpanded && (
        <button
          style={styles.expandTextButton}
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          ... Show more ({lineCount} lines)
        </button>
      )}
    </div>
  );
}

function getToolSummary(name: string, input: Record<string, unknown>): string {
  if (name === 'Read' && typeof input.file_path === 'string') {
    return input.file_path.split('/').pop() || '';
  }
  if (name === 'Write' && typeof input.file_path === 'string') {
    return input.file_path.split('/').pop() || '';
  }
  if (name === 'Edit' && typeof input.file_path === 'string') {
    return input.file_path.split('/').pop() || '';
  }
  if (name === 'Bash' && typeof input.command === 'string') {
    const cmd = input.command as string;
    return cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd;
  }
  return '';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: colors.bgSecondary,
    borderRadius: '8px',
    border: `1px solid ${colors.borderSubtle}`,
    overflow: 'hidden',
    marginBottom: '16px',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    minHeight: '44px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
    cursor: 'pointer',
    transition: 'background-color 150ms ease',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  expandToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.textMuted,
  },
  role: {
    fontWeight: 600,
    color: colors.accent,
  },
  indicators: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  indicator: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  indicatorIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tokenPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    color: colors.textMuted,
    backgroundColor: colors.bgSecondary,
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
  },
  tokenBadge: {
    fontSize: '11px',
    color: colors.textSecondary,
    backgroundColor: colors.bgSecondary,
    padding: '2px 8px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  timestamp: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  preview: {
    padding: '12px 16px',
    color: colors.textSecondary,
    fontSize: '14px',
    cursor: 'pointer',
    borderTop: `1px solid ${colors.borderSubtle}`,
  },
  content: {
    padding: '16px',
  },
  messageBlock: {
    marginBottom: '8px',
  },
  textBlock: {
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.6,
    marginBottom: '12px',
  },
  thinkingContent: {
    color: colors.textSecondary,
    fontStyle: 'italic' as const,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.5,
    fontSize: '13px',
  },
  toolContent: {
    fontSize: '13px',
  },
  toolInput: {
    margin: 0,
    padding: '8px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto',
    color: colors.textSecondary,
  },
  planContent: {
    padding: 0,
    fontSize: '14px',
    lineHeight: 1.6,
  },
  toolResult: {
    whiteSpace: 'pre-wrap' as const,
    fontSize: '12px',
    color: colors.textSecondary,
    maxHeight: '300px',
    overflow: 'auto',
  },
  toolResultError: {
    color: colors.danger,
  },
  expandTextButton: {
    display: 'inline-block',
    padding: '4px 8px',
    marginTop: '8px',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '4px',
    color: colors.accent,
    fontSize: '12px',
    cursor: 'pointer',
  },
};
