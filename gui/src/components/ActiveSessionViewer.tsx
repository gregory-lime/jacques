/**
 * Active Session Viewer
 *
 * Fetches and displays an active session's transcript using the existing
 * ConversationViewer component. This allows viewing live sessions with
 * the same rich UI as archived sessions.
 */

import { useState, useEffect, useCallback } from 'react';
import { getSession, type SessionData, type ParsedEntry } from '../api';
import { ConversationViewer } from './Conversation';
import { useOpenSessions } from '../hooks/useOpenSessions';
import type { SavedConversation, ConversationMessage, MessageContent } from '../types';
import { colors } from '../styles/theme';

interface ActiveSessionViewerProps {
  sessionId: string;
  onBack?: () => void;
}

/**
 * Transform ParsedEntry array to ConversationMessage array for the viewer
 */
function transformEntriesToMessages(entries: ParsedEntry[]): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let currentAssistantMessage: ConversationMessage | null = null;
  const seenAgentIds = new Set<string>();

  for (const entry of entries) {
    if (entry.type === 'user_message') {
      // Skip internal command messages
      const text = entry.content.text || '';
      if (
        text.startsWith('<local-command-caveat>') ||
        text.startsWith('<command-name>') ||
        text.startsWith('<local-command-stdout>') ||
        text.startsWith('<command-message>') ||
        text.startsWith('<command-args>') ||
        text.trim().length === 0
      ) {
        continue;
      }

      // Flush any pending assistant message
      if (currentAssistantMessage) {
        messages.push(currentAssistantMessage);
        currentAssistantMessage = null;
      }
      // Add user message
      messages.push({
        id: entry.uuid,
        role: 'user',
        timestamp: new Date(entry.timestamp).getTime(),
        content: entry.content.text ? [{ type: 'text', text: entry.content.text }] : [],
      });
    } else if (entry.type === 'assistant_message') {
      // Flush any pending assistant message
      if (currentAssistantMessage) {
        messages.push(currentAssistantMessage);
      }
      // Start new assistant message
      const content: MessageContent[] = [];
      if (entry.content.thinking) {
        content.push({ type: 'thinking', text: entry.content.thinking });
      }
      if (entry.content.text) {
        content.push({ type: 'text', text: entry.content.text });
      }
      currentAssistantMessage = {
        id: entry.uuid,
        role: 'assistant',
        timestamp: new Date(entry.timestamp).getTime(),
        content,
        tokens: entry.content.usage
          ? {
              input: entry.content.usage.inputTokens,
              output: entry.content.usage.outputTokens,
              cacheCreation: entry.content.usage.cacheCreation,
              cacheRead: entry.content.usage.cacheRead,
            }
          : undefined,
        model: entry.content.model,
        durationMs: entry.content.durationMs,
        costUSD: entry.content.costUSD,
      };
    } else if (entry.type === 'tool_call') {
      if (!currentAssistantMessage) {
        currentAssistantMessage = {
          id: `assistant-${entry.uuid}`,
          role: 'assistant',
          timestamp: new Date(entry.timestamp).getTime(),
          content: [],
          tokens: entry.content.usage
            ? {
                input: entry.content.usage.inputTokens,
                output: entry.content.usage.outputTokens,
                cacheCreation: entry.content.usage.cacheCreation,
                cacheRead: entry.content.usage.cacheRead,
              }
            : undefined,
          model: entry.content.model,
          durationMs: entry.content.durationMs,
          costUSD: entry.content.costUSD,
        };
      } else if (entry.content.usage) {
        if (!currentAssistantMessage.tokens) {
          currentAssistantMessage.tokens = { input: 0, output: 0 };
        }
        currentAssistantMessage.tokens.input =
          (currentAssistantMessage.tokens.input || 0) + (entry.content.usage.inputTokens || 0);
        currentAssistantMessage.tokens.output =
          (currentAssistantMessage.tokens.output || 0) + (entry.content.usage.outputTokens || 0);
        currentAssistantMessage.tokens.cacheCreation =
          (currentAssistantMessage.tokens.cacheCreation || 0) + (entry.content.usage.cacheCreation || 0);
        currentAssistantMessage.tokens.cacheRead =
          (currentAssistantMessage.tokens.cacheRead || 0) + (entry.content.usage.cacheRead || 0);
        if (entry.content.costUSD) {
          currentAssistantMessage.costUSD = (currentAssistantMessage.costUSD || 0) + entry.content.costUSD;
        }
        if (entry.content.durationMs) {
          currentAssistantMessage.durationMs = (currentAssistantMessage.durationMs || 0) + entry.content.durationMs;
        }
      }
      currentAssistantMessage.content.push({
        type: 'tool_use',
        id: entry.uuid,
        name: entry.content.toolName || 'Unknown',
        input: entry.content.toolInput || {},
      });
    } else if (entry.type === 'tool_result') {
      if (currentAssistantMessage) {
        currentAssistantMessage.content.push({
          type: 'tool_result',
          tool_use_id: entry.uuid,
          content: entry.content.toolResultContent || '',
          is_error: false,
        });
      }
    } else if (entry.type === 'agent_progress') {
      const agentId = entry.content.agentId;
      if (!agentId || seenAgentIds.has(agentId)) {
        continue;
      }
      seenAgentIds.add(agentId);

      if (!currentAssistantMessage) {
        currentAssistantMessage = {
          id: `assistant-${entry.uuid}`,
          role: 'assistant',
          timestamp: new Date(entry.timestamp).getTime(),
          content: [],
        };
      }
      currentAssistantMessage.content.push({
        type: 'agent_progress',
        prompt: entry.content.agentPrompt,
        agentId: agentId,
        agentType: entry.content.agentType,
        agentDescription: entry.content.agentDescription,
      });
    } else if (entry.type === 'bash_progress') {
      if (!currentAssistantMessage) {
        currentAssistantMessage = {
          id: `assistant-${entry.uuid}`,
          role: 'assistant',
          timestamp: new Date(entry.timestamp).getTime(),
          content: [],
        };
      }
      currentAssistantMessage.content.push({
        type: 'bash_progress',
        output: entry.content.bashOutput,
        fullOutput: entry.content.bashFullOutput,
        elapsedSeconds: entry.content.bashElapsedSeconds,
        totalLines: entry.content.bashTotalLines,
      });
    } else if (entry.type === 'mcp_progress') {
      if (!currentAssistantMessage) {
        currentAssistantMessage = {
          id: `assistant-${entry.uuid}`,
          role: 'assistant',
          timestamp: new Date(entry.timestamp).getTime(),
          content: [],
        };
      }
      currentAssistantMessage.content.push({
        type: 'mcp_progress',
        status: entry.content.mcpStatus,
        serverName: entry.content.mcpServerName,
        toolName: entry.content.mcpToolName,
      });
    } else if (entry.type === 'web_search') {
      if (!currentAssistantMessage) {
        currentAssistantMessage = {
          id: `assistant-${entry.uuid}`,
          role: 'assistant',
          timestamp: new Date(entry.timestamp).getTime(),
          content: [],
        };
      }
      currentAssistantMessage.content.push({
        type: 'web_search',
        searchType: entry.content.searchType,
        query: entry.content.searchQuery,
        resultCount: entry.content.searchResultCount,
        urls: entry.content.searchUrls,
      });
    }
  }

  // Flush any pending assistant message
  if (currentAssistantMessage) {
    messages.push(currentAssistantMessage);
  }

  return messages;
}

/**
 * Transform session data to SavedConversation format for the viewer
 */
function transformToSavedConversation(data: SessionData): SavedConversation {
  const messages = transformEntriesToMessages(data.entries);

  return {
    id: data.metadata.id,
    sessionId: data.metadata.id,
    title: data.metadata.title,
    project: data.metadata.projectSlug,
    projectPath: data.metadata.projectPath,
    date: data.metadata.endedAt.split('T')[0],
    messages,
    metadata: {
      messageCount: data.metadata.messageCount,
      toolCallCount: data.metadata.toolCallCount,
      estimatedTokens: 0,
      actualTokens: {
        input: data.statistics.totalInputTokens,
        output: data.statistics.totalOutputTokens,
        cacheCreation: data.statistics.totalCacheCreation > 0 ? data.statistics.totalCacheCreation : undefined,
        cacheRead: data.statistics.totalCacheRead > 0 ? data.statistics.totalCacheRead : undefined,
      },
      subagents: data.subagents && data.subagents.length > 0
        ? {
            count: data.subagents.length,
            totalTokens: 0,
            ids: data.subagents.map(s => s.id),
          }
        : undefined,
      hadAutoCompact: data.metadata.hadAutoCompact,
      planRefs: data.metadata.planRefs,
    },
  };
}

export function ActiveSessionViewer({ sessionId, onBack }: ActiveSessionViewerProps) {
  const { viewDashboard } = useOpenSessions();
  const handleBack = onBack || viewDashboard;
  const [conversation, setConversation] = useState<SavedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awaitingFirstResponse, setAwaitingFirstResponse] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAwaitingFirstResponse(false);
    try {
      const data = await getSession(sessionId);
      // Check if session is awaiting first response
      if (data.awaitingFirstResponse || data.entries.length === 0) {
        setAwaitingFirstResponse(true);
        setConversation(null);
      } else {
        const saved = transformToSavedConversation(data);
        setConversation(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}>◐</div>
        <span>Loading session...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <button style={styles.backButton} onClick={handleBack} type="button">
          ← Back
        </button>
        <div style={styles.errorContent}>
          <span style={styles.errorIcon}>⚠️</span>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryButton} onClick={loadSession} type="button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (awaitingFirstResponse) {
    return (
      <div style={styles.awaitingContainer}>
        <button style={styles.backButton} onClick={handleBack} type="button">
          ← Back
        </button>
        <div style={styles.awaitingContent}>
          <span style={styles.awaitingIcon}>⏳</span>
          <p style={styles.awaitingText}>Waiting for first response...</p>
          <p style={styles.awaitingHint}>This session just started. Content will appear after Claude responds.</p>
          <button style={styles.retryButton} onClick={loadSession} type="button">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return null;
  }

  return <ConversationViewer conversation={conversation} onBack={handleBack} />;
}

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
    color: colors.textMuted,
    fontSize: '14px',
  },
  spinner: {
    fontSize: '32px',
    animation: 'spin 1s linear infinite',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    padding: '16px',
  },
  backButton: {
    padding: '8px 12px',
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    cursor: 'pointer',
    fontSize: '13px',
    alignSelf: 'flex-start',
    marginBottom: '24px',
  },
  errorContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '16px',
  },
  errorIcon: {
    fontSize: '48px',
  },
  errorText: {
    color: colors.danger,
    fontSize: '14px',
    margin: 0,
  },
  retryButton: {
    padding: '8px 16px',
    backgroundColor: colors.accent,
    color: colors.textPrimary,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  awaitingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    padding: '16px',
  },
  awaitingContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: '16px',
  },
  awaitingIcon: {
    fontSize: '48px',
  },
  awaitingText: {
    color: colors.textSecondary,
    fontSize: '16px',
    fontWeight: 500,
    margin: 0,
  },
  awaitingHint: {
    color: colors.textMuted,
    fontSize: '13px',
    margin: 0,
    textAlign: 'center' as const,
    maxWidth: '300px',
  },
};
