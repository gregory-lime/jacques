/**
 * ChatMessage - Terminal-style message display
 *
 * Clean, minimal design with prompt-style user messages
 * and formatted assistant responses.
 */

import { User, Sparkles } from 'lucide-react';
import { colors } from '../../styles/theme';
import { MarkdownRenderer } from '../Conversation/MarkdownRenderer';
import type { ChatMessage as ChatMessageType } from '../../types';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div style={styles.userContainer}>
        <div style={styles.userHeader}>
          <User size={10} color={colors.textMuted} />
          <span style={styles.userLabel}>you</span>
        </div>
        <div style={styles.userContent}>{message.content}</div>
      </div>
    );
  }

  return (
    <div style={styles.assistantContainer}>
      <div style={styles.assistantHeader}>
        <Sparkles size={10} color={colors.accent} />
        <span style={styles.assistantLabel}>claude</span>
        {message.tools && message.tools.length > 0 && (
          <div style={styles.toolsInline}>
            {message.tools.map((tool, i) => (
              <span key={i} style={styles.toolBadge}>{tool}</span>
            ))}
          </div>
        )}
      </div>
      <div style={styles.assistantContent}>
        <MarkdownRenderer content={message.content} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  userContainer: {
    marginBottom: '20px',
  },
  userHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  userLabel: {
    fontSize: '10px',
    fontWeight: 500,
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'lowercase' as const,
  },
  userContent: {
    paddingLeft: '16px',
    fontSize: '13px',
    color: colors.textPrimary,
    whiteSpace: 'pre-wrap' as const,
    lineHeight: 1.6,
    borderLeft: `1px solid ${colors.borderSubtle}`,
  },
  assistantContainer: {
    marginBottom: '20px',
    padding: '14px 16px',
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    borderLeft: `2px solid ${colors.accent}`,
  },
  assistantHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  },
  assistantLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: colors.textSecondary,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'lowercase' as const,
  },
  toolsInline: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginLeft: 'auto',
  },
  toolBadge: {
    display: 'inline-flex',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 500,
    color: colors.textMuted,
    backgroundColor: colors.bgElevated,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.02em',
  },
  assistantContent: {
    fontSize: '13px',
    lineHeight: 1.6,
  },
};
