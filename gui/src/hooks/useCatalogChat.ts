/**
 * useCatalogChat - Manages chat state for the context catalog
 *
 * Handles message history, streaming state, and WS communication
 * for the ChatPanel in the Context page.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import type { ChatCallbacks } from './useJacquesClient';

interface UseCatalogChatOptions {
  /** Project path for scoping chat messages */
  projectPath: string | null;
  /** Send chat message via WS */
  sendChatMessage: (projectPath: string, message: string) => void;
  /** Abort active chat via WS */
  abortChat: (projectPath: string) => void;
  /** Register chat callbacks on WS client */
  setChatCallbacks: (callbacks: ChatCallbacks) => void;
  /** Called when catalog may have changed */
  onCatalogRefresh?: () => void;
}

export interface UseCatalogChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentStreamText: string;
  currentTools: string[];
  sendMessage: (text: string) => void;
  abort: () => void;
  clearChat: () => void;
  error: string | null;
}

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

export function useCatalogChat({
  projectPath,
  sendChatMessage,
  abortChat,
  setChatCallbacks,
  onCatalogRefresh,
}: UseCatalogChatOptions): UseCatalogChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [currentTools, setCurrentTools] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Track the current project to clear messages on project change
  const prevProjectRef = useRef(projectPath);

  useEffect(() => {
    if (prevProjectRef.current !== projectPath) {
      setMessages([]);
      setIsStreaming(false);
      setCurrentStreamText('');
      setCurrentTools([]);
      setError(null);
      prevProjectRef.current = projectPath;
    }
  }, [projectPath]);

  // Wire up WS callbacks
  useEffect(() => {
    setChatCallbacks({
      onChatDelta: (path: string, text: string) => {
        if (path !== projectPath) return;
        setCurrentStreamText(prev => prev + text);
      },

      onChatToolEvent: (path: string, toolName: string) => {
        if (path !== projectPath) return;
        setCurrentTools(prev => [...prev, toolName]);
      },

      onChatComplete: (path: string, fullText: string) => {
        if (path !== projectPath) return;
        // Finalize the assistant message
        setMessages(prev => [
          ...prev,
          {
            id: nextMessageId(),
            role: 'assistant',
            content: fullText,
            timestamp: Date.now(),
            tools: currentTools.length > 0 ? [...currentTools] : undefined,
          },
        ]);
        setIsStreaming(false);
        setCurrentStreamText('');
        setCurrentTools([]);
      },

      onChatError: (path: string, reason: string, message: string) => {
        if (path !== projectPath) return;

        if (reason === 'aborted') {
          // If there was accumulated text, save it as a partial message
          if (currentStreamText) {
            setMessages(prev => [
              ...prev,
              {
                id: nextMessageId(),
                role: 'assistant',
                content: currentStreamText + '\n\n*(aborted)*',
                timestamp: Date.now(),
              },
            ]);
          }
        } else if (reason !== 'already_active') {
          setError(message);
        }
        setIsStreaming(false);
        setCurrentStreamText('');
        setCurrentTools([]);
      },

      onCatalogUpdated: (path: string) => {
        if (path !== projectPath) return;
        onCatalogRefresh?.();
      },
    });

    // Cleanup on unmount
    return () => {
      setChatCallbacks({});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, setChatCallbacks, onCatalogRefresh]);

  const sendMessage = useCallback((text: string) => {
    if (!projectPath || !text.trim() || isStreaming) return;

    // Add user message
    setMessages(prev => [
      ...prev,
      {
        id: nextMessageId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      },
    ]);

    setIsStreaming(true);
    setCurrentStreamText('');
    setCurrentTools([]);
    setError(null);

    sendChatMessage(projectPath, text.trim());
  }, [projectPath, isStreaming, sendChatMessage]);

  const abort = useCallback(() => {
    if (!projectPath) return;
    abortChat(projectPath);
  }, [projectPath, abortChat]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setCurrentStreamText('');
    setCurrentTools([]);
    setError(null);
  }, []);

  return {
    messages,
    isStreaming,
    currentStreamText,
    currentTools,
    sendMessage,
    abort,
    clearChat,
    error,
  };
}
