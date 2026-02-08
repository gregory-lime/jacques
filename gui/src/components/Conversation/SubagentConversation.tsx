import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, Wrench, Check } from 'lucide-react';
import { colors } from '../../styles/theme';
import { getSubagentFromSession, type SubagentData, type ParsedEntry } from '../../api';
import { formatTokens } from '../../utils/tokens';

interface SubagentConversationProps {
  agentId: string;
  sessionId: string;
  promptPreview?: string;
}

export function SubagentConversation({ agentId, sessionId, promptPreview }: SubagentConversationProps) {
  const [subagent, setSubagent] = useState<SubagentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSubagent() {
      setLoading(true);
      setError(null);
      try {
        const result = await getSubagentFromSession(sessionId, agentId);
        if (!cancelled) {
          setSubagent(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load subagent');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSubagent();

    return () => {
      cancelled = true;
    };
  }, [agentId, sessionId]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading subagent conversation...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <span style={styles.errorIcon}><AlertTriangle size={16} /></span>
        <span>{error}</span>
        {promptPreview && (
          <div style={styles.fallbackPrompt}>
            <strong>Task prompt:</strong> {promptPreview}
          </div>
        )}
      </div>
    );
  }

  if (!subagent) {
    return (
      <div style={styles.errorContainer}>
        <span>Subagent not found</span>
        {promptPreview && (
          <div style={styles.fallbackPrompt}>
            <strong>Task prompt:</strong> {promptPreview}
          </div>
        )}
      </div>
    );
  }

  const totalTokens = subagent.statistics.tokens.totalInput + subagent.statistics.tokens.totalOutput;

  return (
    <div style={styles.container}>
      {/* Header with stats */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.agentId}>Agent {agentId}</span>
          {subagent.model && <span style={styles.model}>{subagent.model}</span>}
        </div>
        <div style={styles.headerRight}>
          <span style={styles.stat}>
            {formatTokens(subagent.statistics.tokens.totalInput)} in
          </span>
          <span style={styles.statDivider}>•</span>
          <span style={styles.stat}>
            {formatTokens(subagent.statistics.tokens.totalOutput)} out
          </span>
          <span style={styles.statDivider}>•</span>
          <span style={styles.statTotal}>
            {formatTokens(totalTokens)} total
          </span>
          <span style={styles.statDivider}>•</span>
          <span style={styles.stat}>
            {subagent.statistics.messageCount} msgs
          </span>
        </div>
      </div>

      {/* Task prompt */}
      <div style={styles.promptSection}>
        <div style={styles.promptLabel}>Task:</div>
        <div style={styles.promptText}>{subagent.prompt}</div>
      </div>

      {/* Conversation messages */}
      <div style={styles.messagesContainer}>
        {subagent.entries.map((entry, idx) => (
          <SubagentMessage key={entry.uuid || idx} entry={entry} />
        ))}
      </div>
    </div>
  );
}

interface SubagentMessageProps {
  entry: ParsedEntry;
}

function SubagentMessage({ entry }: SubagentMessageProps) {
  // Determine message type
  const isUser = entry.type === 'user_message';
  const isTool = entry.type === 'tool_call';
  const isToolResult = entry.type === 'tool_result';
  const isAssistant = entry.type === 'assistant_message';

  // Extract text content
  const text = entry.content?.text;
  const thinking = entry.content?.thinking;
  const toolName = entry.content?.toolName;
  const toolInput = entry.content?.toolInput;
  const toolResult = entry.content?.toolResultContent;

  // Skip non-displayable entries (hooks, system events, summaries)
  if (
    entry.type === 'hook_progress' ||
    entry.type === 'turn_duration' ||
    entry.type === 'system_event' ||
    entry.type === 'summary' ||
    entry.type === 'bash_progress' ||
    entry.type === 'mcp_progress' ||
    entry.type === 'web_search'
  ) {
    return null;
  }

  // Tool calls - show tool name and brief input summary
  if (isTool && toolName) {
    const inputSummary = getToolInputSummary(toolName, toolInput);
    return (
      <div style={styles.toolMessage}>
        <span style={styles.toolIcon}><Wrench size={12} /></span>
        <span style={styles.toolName}>{toolName}</span>
        {inputSummary && <span style={styles.toolSummary}>{inputSummary}</span>}
      </div>
    );
  }

  // Tool results - show truncated result
  if (isToolResult && toolResult) {
    const truncated = toolResult.length > 150
      ? toolResult.slice(0, 150) + '...'
      : toolResult;
    return (
      <div style={styles.toolResultMessage}>
        <span style={styles.toolResultIcon}><Check size={12} /></span>
        <pre style={styles.toolResultContent}>{truncated}</pre>
      </div>
    );
  }

  // Skip tool entries without useful content
  if (isTool || isToolResult) {
    return null;
  }

  // User and assistant messages
  if (!isUser && !isAssistant) {
    return null;
  }

  // Skip empty messages
  if (!text && !thinking) {
    return null;
  }

  return (
    <div style={{
      ...styles.message,
      ...(isUser ? styles.userMessage : styles.assistantMessage),
    }}>
      <div style={styles.messageRole}>
        {isUser ? 'User' : 'Assistant'}
      </div>
      {thinking && (
        <div style={styles.thinkingBlock}>
          <span style={styles.thinkingLabel}>Thinking:</span>
          <pre style={styles.thinkingContent}>
            {thinking.length > 500 ? thinking.slice(0, 500) + '...' : thinking}
          </pre>
        </div>
      )}
      {text && (
        <div style={styles.messageText}>{text}</div>
      )}
    </div>
  );
}

// Get a brief summary of tool input for display
function getToolInputSummary(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return '';

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      if (typeof input.file_path === 'string') {
        const path = input.file_path;
        return path.split('/').pop() || path;
      }
      break;
    case 'Bash':
      if (typeof input.command === 'string') {
        const cmd = input.command;
        return cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd;
      }
      break;
    case 'Glob':
      if (typeof input.pattern === 'string') {
        return input.pattern;
      }
      break;
    case 'Grep':
      if (typeof input.pattern === 'string') {
        return input.pattern;
      }
      break;
  }

  return '';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    color: colors.textMuted,
    fontSize: '13px',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '16px',
    color: colors.warning,
    fontSize: '13px',
  },
  errorIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  fallbackPrompt: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px',
    fontSize: '12px',
    color: colors.textSecondary,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px',
    borderLeft: `3px solid ${colors.accentOrange}`,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  agentId: {
    fontWeight: 600,
    color: colors.textPrimary,
    fontSize: '13px',
  },
  model: {
    padding: '2px 6px',
    backgroundColor: colors.bgElevated,
    borderRadius: '3px',
    fontSize: '11px',
    color: colors.textMuted,
  },
  stat: {
    color: colors.textSecondary,
  },
  statTotal: {
    color: colors.accentOrange,
    fontWeight: 500,
  },
  statDivider: {
    color: colors.textMuted,
  },
  promptSection: {
    padding: '8px 12px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
    border: `1px solid ${colors.borderSubtle}`,
  },
  promptLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  promptText: {
    fontSize: '13px',
    color: colors.textSecondary,
    lineHeight: 1.5,
  },
  messagesContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    maxHeight: '400px',
    overflow: 'auto',
  },
  message: {
    padding: '10px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  userMessage: {
    backgroundColor: colors.bgSecondary,
    borderLeft: `2px solid ${colors.accent}`,
  },
  assistantMessage: {
    backgroundColor: colors.bgElevated,
    borderLeft: `2px solid ${colors.textMuted}`,
  },
  messageRole: {
    fontSize: '11px',
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  messageText: {
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap' as const,
  },
  thinkingBlock: {
    marginBottom: '8px',
    padding: '6px 8px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
    opacity: 0.8,
  },
  thinkingLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    display: 'block',
    marginBottom: '4px',
  },
  thinkingContent: {
    margin: 0,
    fontSize: '12px',
    color: colors.textMuted,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'inherit',
  },
  toolMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: colors.bgSecondary,
    borderRadius: '4px',
    fontSize: '12px',
    color: colors.textMuted,
  },
  toolIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  toolName: {
    fontWeight: 500,
    color: colors.textSecondary,
  },
  toolSummary: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: '11px',
  },
  toolResultMessage: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    padding: '4px 10px',
    backgroundColor: colors.bgPrimary,
    borderRadius: '4px',
    fontSize: '11px',
    color: colors.textMuted,
  },
  toolResultIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: colors.success,
  },
  toolResultContent: {
    flex: 1,
    margin: 0,
    fontFamily: 'monospace',
    fontSize: '11px',
    whiteSpace: 'pre-wrap' as const,
    overflow: 'hidden',
    maxHeight: '40px',
    color: colors.textSecondary,
  },
};
