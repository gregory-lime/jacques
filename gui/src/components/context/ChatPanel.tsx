/**
 * ChatPanel - Terminal-style chat interface for context assistant
 *
 * Clean, monochrome design with command-line aesthetics.
 * Features a prompt-style input and streaming response display.
 */

import { useEffect, useRef } from 'react';
import { Terminal, Loader, Sparkles } from 'lucide-react';
import { colors } from '../../styles/theme';
import { MarkdownRenderer } from '../Conversation/MarkdownRenderer';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SuggestionChips } from './SuggestionChips';
import type { ChatMessage as ChatMessageType, ProjectCatalog } from '../../types';

interface ChatPanelProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  currentStreamText: string;
  currentTools: string[];
  catalog: ProjectCatalog | null;
  error: string | null;
  projectSelected: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  currentStreamText,
  currentTools,
  catalog,
  error,
  projectSelected,
  onSend,
  onAbort,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  // Auto-scroll to bottom when new messages arrive or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentStreamText]);

  // No project selected
  if (!projectSelected) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <Terminal size={20} color={colors.textMuted} strokeWidth={1.5} />
          <div style={styles.emptyText}>
            <span style={styles.emptyPrompt}>$</span> select a project to continue
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header bar */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <Sparkles size={12} color={colors.accent} />
          <span style={styles.headerTitle}>context assistant</span>
        </div>
        <div style={styles.headerRight}>
          {isStreaming && (
            <span style={styles.streamingBadge}>
              <span style={styles.streamingDot} />
              streaming
            </span>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} style={styles.messagesArea}>
        {!hasMessages && !isStreaming ? (
          // Welcome state
          <div style={styles.welcomeState}>
            <div style={styles.welcomeBox}>
              <div style={styles.welcomeHeader}>
                <Terminal size={14} color={colors.accent} strokeWidth={1.5} />
                <span>ready</span>
              </div>
              <div style={styles.welcomeBody}>
                <p style={styles.welcomeLine}>Ask questions about your project context,</p>
                <p style={styles.welcomeLine}>create notes, or organize your knowledge base.</p>
              </div>
              <div style={styles.welcomeHint}>
                <span style={styles.hintKey}>enter</span> to send
                <span style={styles.hintDivider}>|</span>
                <span style={styles.hintKey}>shift+enter</span> for newline
              </div>
            </div>
          </div>
        ) : (
          // Message list
          <>
            {messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {/* Streaming indicator */}
            {isStreaming && (
              <div style={styles.streamingContainer}>
                <div style={styles.streamingHeader}>
                  <span style={styles.streamingIcon}>
                    <Sparkles size={10} color={colors.accent} />
                  </span>
                  <span style={styles.streamingLabel}>claude</span>
                  {currentTools.length > 0 && (
                    <span style={styles.toolIndicator}>
                      {currentTools[currentTools.length - 1]}
                    </span>
                  )}
                </div>
                {currentStreamText ? (
                  <div style={styles.streamingContent}>
                    <MarkdownRenderer content={currentStreamText} />
                  </div>
                ) : (
                  <div style={styles.thinkingRow}>
                    <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>processing...</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Error display */}
        {error && (
          <div style={styles.errorBar}>
            <span style={styles.errorPrefix}>error:</span> {error}
          </div>
        )}
      </div>

      {/* Bottom area: suggestions + input */}
      <div style={styles.inputArea}>
        {!hasMessages && !isStreaming && (
          <SuggestionChips catalog={catalog} onSelect={onSend} />
        )}
        <ChatInput
          onSend={onSend}
          onAbort={onAbort}
          isStreaming={isStreaming}
          disabled={!projectSelected}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    height: '100%',
    overflow: 'hidden',
    backgroundColor: colors.bgPrimary,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerTitle: {
    fontSize: '11px',
    fontWeight: 500,
    color: colors.textSecondary,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '-0.02em',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  streamingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 8px',
    borderRadius: '3px',
    backgroundColor: 'rgba(230, 126, 82, 0.1)',
    fontSize: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    color: colors.accent,
  },
  streamingDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: colors.accent,
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  messagesArea: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
    minHeight: 0,
  },
  inputArea: {
    padding: '16px 24px 20px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    padding: '40px',
  },
  emptyText: {
    fontSize: '12px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
  },
  emptyPrompt: {
    color: colors.accent,
    marginRight: '8px',
  },
  welcomeState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px',
  },
  welcomeBox: {
    maxWidth: '360px',
    padding: '20px 24px',
    borderRadius: '6px',
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgSecondary,
  },
  welcomeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
    fontSize: '12px',
    fontWeight: 500,
    color: colors.textPrimary,
    fontFamily: "'JetBrains Mono', monospace",
  },
  welcomeBody: {
    marginBottom: '16px',
  },
  welcomeLine: {
    margin: '0 0 4px 0',
    fontSize: '12px',
    color: colors.textSecondary,
    lineHeight: 1.6,
  },
  welcomeHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
  },
  hintKey: {
    padding: '2px 5px',
    borderRadius: '3px',
    backgroundColor: colors.bgElevated,
    border: `1px solid ${colors.borderSubtle}`,
    fontSize: '9px',
  },
  hintDivider: {
    opacity: 0.3,
  },
  streamingContainer: {
    marginTop: '16px',
    padding: '12px 16px',
    borderRadius: '6px',
    backgroundColor: colors.bgSecondary,
    borderLeft: `2px solid ${colors.accent}`,
  },
  streamingHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  },
  streamingIcon: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  streamingLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: colors.textSecondary,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'lowercase' as const,
  },
  toolIndicator: {
    marginLeft: 'auto',
    fontSize: '9px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
    padding: '2px 6px',
    borderRadius: '3px',
    backgroundColor: colors.bgElevated,
  },
  streamingContent: {
    fontSize: '13px',
    lineHeight: 1.6,
  },
  thinkingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: colors.textMuted,
    fontFamily: "'JetBrains Mono', monospace",
  },
  errorBar: {
    marginTop: '16px',
    padding: '10px 14px',
    borderRadius: '4px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: `1px solid rgba(239, 68, 68, 0.2)`,
    fontSize: '11px',
    fontFamily: "'JetBrains Mono', monospace",
    color: colors.textSecondary,
  },
  errorPrefix: {
    color: colors.danger,
    fontWeight: 500,
  },
};
