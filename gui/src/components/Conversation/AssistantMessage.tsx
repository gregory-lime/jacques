import { useState, useRef, useEffect } from 'react';
import { Brain, Wrench, MessageCircle, XCircle, Check } from 'lucide-react';
import type { ConversationMessage, MessageContent, AgentProgressContent, BashProgressContent, MCPProgressContent, WebSearchContent } from '../../types';
import { colors } from '../../styles/theme';
import { CollapsibleBlock, type CollapsibleBlockRef } from './CollapsibleBlock';
import { CodeBlock } from './CodeBlock';
import { AgentProgressBlock, type AgentProgressBlockRef } from './AgentProgressBlock';
import { BashProgressBlock, type BashProgressBlockRef } from './BashProgressBlock';
import { MCPProgressBlock } from './MCPProgressBlock';
import { WebSearchBlock } from './WebSearchBlock';
import { estimateContentTokens, formatTokens, estimateTokens } from '../../utils/tokens';

interface AssistantMessageProps {
  message: ConversationMessage;
  allExpanded?: boolean;
  sessionId?: string;
  /** Target content index to auto-expand and scroll to */
  targetContentIndex?: number;
  /** Target content ID (e.g., agentId) to auto-expand and scroll to */
  targetContentId?: string;
}

export function AssistantMessage({ message, allExpanded = false, sessionId, targetContentIndex, targetContentId }: AssistantMessageProps) {
  // Refs for each content block
  const contentRefs = useRef<Map<number, CollapsibleBlockRef | AgentProgressBlockRef | BashProgressBlockRef | null>>(new Map());

  // Handle navigation targeting - expand and scroll to target
  useEffect(() => {
    if (targetContentIndex !== undefined) {
      const ref = contentRefs.current.get(targetContentIndex);
      if (ref) {
        ref.expand();
        // Small delay to let expand animation start
        setTimeout(() => ref.scrollIntoView(), 50);
      }
    }
  }, [targetContentIndex]);

  // Handle content ID targeting (for things like subagents)
  useEffect(() => {
    if (targetContentId) {
      // Find content with matching ID
      message.content.forEach((content, index) => {
        if (content.type === 'agent_progress') {
          const agentContent = content as AgentProgressContent;
          if (agentContent.agentId === targetContentId) {
            const ref = contentRefs.current.get(index);
            if (ref) {
              ref.expand();
              setTimeout(() => ref.scrollIntoView(), 50);
            }
          }
        }
      });
    }
  }, [targetContentId, message.content]);
  const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Use actual tokens if available, otherwise estimate
  const hasActualTokens = message.tokens && (message.tokens.input || message.tokens.output);
  const totalTokens = hasActualTokens
    ? (message.tokens!.input || 0) + (message.tokens!.output || 0)
    : message.content.reduce(
        (sum, content) => sum + estimateContentTokens(content),
        0
      );

  // Calculate tokens by type for breakdown (estimated)
  const tokenBreakdown = {
    text: 0,
    thinking: 0,
    tools: 0,
  };

  message.content.forEach((content) => {
    const tokens = estimateContentTokens(content);
    if (content.type === 'text') {
      tokenBreakdown.text += tokens;
    } else if (content.type === 'thinking') {
      tokenBreakdown.thinking += tokens;
    } else if (content.type === 'tool_use' || content.type === 'tool_result') {
      tokenBreakdown.tools += tokens;
    }
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.role}>Claude</span>
        <div style={styles.headerRight}>
          <div style={styles.tokenBreakdown}>
            {tokenBreakdown.thinking > 0 && (
              <span style={styles.tokenPill} title="Thinking tokens">
                <span style={styles.pillIcon}><Brain size={10} /></span> {formatTokens(tokenBreakdown.thinking)}
              </span>
            )}
            {tokenBreakdown.tools > 0 && (
              <span style={styles.tokenPill} title="Tool tokens">
                <span style={styles.pillIcon}><Wrench size={10} /></span> {formatTokens(tokenBreakdown.tools)}
              </span>
            )}
            {tokenBreakdown.text > 0 && (
              <span style={styles.tokenPill} title="Text tokens">
                <span style={styles.pillIcon}><MessageCircle size={10} /></span> {formatTokens(tokenBreakdown.text)}
              </span>
            )}
          </div>
          <span style={styles.tokenBadge} title={hasActualTokens ? `${totalTokens} tokens (actual)` : `~${totalTokens} tokens (estimated)`}>
            {hasActualTokens ? '' : '~'}{formatTokens(totalTokens)} tok
          </span>
          <span style={styles.timestamp}>{timestamp}</span>
        </div>
      </div>
      <div style={styles.content}>
        {message.content.map((content, index) => (
          <ContentRenderer
            key={index}
            content={content}
            expanded={allExpanded}
            sessionId={sessionId}
            contentRef={(ref) => {
              if (ref) {
                contentRefs.current.set(index, ref);
              } else {
                contentRefs.current.delete(index);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
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
            <pre style={styles.toolInput}>
              {toolInputStr}
            </pre>
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
      return <AgentProgressBlock ref={contentRef as React.Ref<AgentProgressBlockRef>} content={content as AgentProgressContent} expanded={expanded} sessionId={sessionId} />;

    case 'bash_progress':
      return <BashProgressBlock ref={contentRef as React.Ref<BashProgressBlockRef>} content={content as BashProgressContent} expanded={expanded} />;

    case 'mcp_progress':
      return <MCPProgressBlock content={content as MCPProgressContent} />;

    case 'web_search':
      return <WebSearchBlock content={content as WebSearchContent} />;

    default:
      return null;
  }
}

function TextBlock({ text, expanded = false }: { text: string; expanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(expanded);

  // Simple markdown-ish rendering: detect code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  // Check if content is long (>500 chars or >20 lines)
  const lineCount = text.split('\n').length;
  const isLong = text.length > 500 || lineCount > 20;
  const shouldCollapse = isLong && !expanded;
  const showExpanded = isExpanded || expanded;

  // If collapsed, truncate the text
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
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  tokenBreakdown: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  tokenPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '10px',
    color: colors.textMuted,
    backgroundColor: colors.bgSecondary,
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace',
  },
  pillIcon: {
    display: 'inline-flex',
    alignItems: 'center',
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
  role: {
    fontWeight: 600,
    color: colors.accent,
  },
  timestamp: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  content: {
    padding: '16px',
  },
  textBlock: {
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.6,
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
