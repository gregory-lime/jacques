/**
 * useJacquesClient Hook
 * 
 * React hook that wraps the JacquesClient WebSocket connection
 * and provides reactive state for the dashboard.
 */

import { useState, useEffect, useCallback } from 'react';
import { JacquesClient } from '@jacques/core';
import type { Session } from '@jacques/core';

const SERVER_URL = process.env.JACQUES_SERVER_URL || 'ws://localhost:4242';

export interface JacquesState {
  sessions: Session[];
  focusedSessionId: string | null;
  connected: boolean;
  lastUpdate: number;
}

export interface FocusTerminalResult {
  sessionId: string;
  success: boolean;
  method: string;
  error?: string;
}

export interface UseJacquesClientReturn extends JacquesState {
  client: JacquesClient | null;
  selectSession: (sessionId: string) => void;
  triggerAction: (
    sessionId: string,
    action: 'smart_compact' | 'new_session' | 'save_snapshot'
  ) => void;
  toggleAutoCompact: () => void;
  focusTerminal: (sessionId: string) => void;
  focusTerminalResult: FocusTerminalResult | null;
  handoffReady: boolean;
  handoffPath: string | null;
}

export function useJacquesClient(): UseJacquesClientReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [client, setClient] = useState<JacquesClient | null>(null);
  const [handoffReady, setHandoffReady] = useState(false);
  const [handoffPath, setHandoffPath] = useState<string | null>(null);
  const [focusTerminalResult, setFocusTerminalResult] = useState<FocusTerminalResult | null>(null);

  useEffect(() => {
    const jacquesClient = new JacquesClient(SERVER_URL, { silent: true });

    // Event handlers
    jacquesClient.on('connected', () => {
      setConnected(true);
      setLastUpdate(Date.now());
    });

    jacquesClient.on('disconnected', () => {
      setConnected(false);
      setLastUpdate(Date.now());
    });

    jacquesClient.on('initial_state', (initialSessions: Session[], initialFocusedId: string | null) => {
      setSessions(initialSessions);
      setFocusedSessionId(initialFocusedId);
      setLastUpdate(Date.now());
    });

    jacquesClient.on('session_update', (session: Session) => {
      setSessions(prev => {
        const index = prev.findIndex(s => s.session_id === session.session_id);
        let newSessions: Session[];
        if (index >= 0) {
          newSessions = [...prev];
          newSessions[index] = session;
        } else {
          newSessions = [...prev, session];
        }
        // Stable sort by registration time (oldest first)
        return newSessions.sort((a, b) => a.registered_at - b.registered_at);
      });
      setLastUpdate(Date.now());
    });

    jacquesClient.on('session_removed', (sessionId: string) => {
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      setFocusedSessionId(prev => {
        if (prev === sessionId) {
          // Focus the first remaining session
          return null; // Will be set by next state
        }
        return prev;
      });
      setLastUpdate(Date.now());
    });

    jacquesClient.on('focus_changed', (sessionId: string | null, session: Session | null) => {
      setFocusedSessionId(sessionId);

      // Also update the session in our local state with fresh data
      if (session) {
        setSessions(prev => {
          const index = prev.findIndex(s => s.session_id === session.session_id);
          if (index >= 0) {
            const newSessions = [...prev];
            newSessions[index] = session;
            return newSessions.sort((a, b) => a.registered_at - b.registered_at);
          }
          return [...prev, session].sort((a, b) => a.registered_at - b.registered_at);
        });
      }

      setLastUpdate(Date.now());
    });

    jacquesClient.on('autocompact_toggled', (enabled: boolean, _warning?: string) => {
      // Update all sessions with new autocompact status
      setSessions(prev => prev.map(session => ({
        ...session,
        autocompact: session.autocompact ? {
          ...session.autocompact,
          enabled,
          bug_threshold: enabled ? null : 78,
        } : {
          enabled,
          threshold: 95,
          bug_threshold: enabled ? null : 78,
        },
      })));
      setLastUpdate(Date.now());
      // Warning is handled silently in dashboard mode
    });

    jacquesClient.on('focus_terminal_result', (sessionId: string, success: boolean, method: string, error?: string) => {
      setFocusTerminalResult({ sessionId, success, method, error });
      setLastUpdate(Date.now());
      // Auto-clear after 3 seconds
      setTimeout(() => setFocusTerminalResult(null), 3000);
    });

    jacquesClient.on('handoff_ready', (sessionId: string, path: string) => {
      if (sessionId === focusedSessionId || !focusedSessionId) {
        setHandoffReady(true);
        setHandoffPath(path);
      }
      setLastUpdate(Date.now());
    });

    // Connect
    jacquesClient.connect();
    setClient(jacquesClient);

    // Cleanup on unmount
    return () => {
      // Only disconnect if connected
      if (jacquesClient.getIsConnected()) {
        jacquesClient.disconnect();
      }
    };
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    client?.selectSession(sessionId);
  }, [client]);

  const triggerAction = useCallback((
    sessionId: string,
    action: 'smart_compact' | 'new_session' | 'save_snapshot'
  ) => {
    client?.triggerAction(sessionId, action);
  }, [client]);

  const toggleAutoCompact = useCallback(() => {
    client?.toggleAutoCompact();
  }, [client]);

  const focusTerminal = useCallback((sessionId: string) => {
    client?.focusTerminal(sessionId);
  }, [client]);

  return {
    client,
    sessions,
    focusedSessionId,
    connected,
    lastUpdate,
    selectSession,
    triggerAction,
    toggleAutoCompact,
    focusTerminal,
    focusTerminalResult,
    handoffReady,
    handoffPath,
  };
}
