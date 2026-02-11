/**
 * useJacquesClient Hook
 * 
 * React hook that wraps the JacquesClient WebSocket connection
 * and provides reactive state for the dashboard.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { JacquesClient } from '@jacques/core';
import type { Session, WorktreeWithStatus } from '@jacques/core';

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

export interface LaunchSessionResult {
  success: boolean;
  method: string;
  cwd: string;
  error?: string;
}

export interface CreateWorktreeResult {
  success: boolean;
  worktreePath?: string;
  branch?: string;
  sessionLaunched?: boolean;
  error?: string;
}

export interface ListWorktreesResult {
  success: boolean;
  repoRoot?: string;
  worktrees?: WorktreeWithStatus[];
  error?: string;
}

export interface RemoveWorktreeResult {
  success: boolean;
  worktreePath?: string;
  branchDeleted?: boolean;
  error?: string;
}

export interface UseJacquesClientReturn extends JacquesState {
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
  // Window management
  tileWindows: (sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2' | 'smart') => void;
  maximizeWindow: (sessionId: string) => void;
  // Session launching
  launchSession: (cwd: string, dangerouslySkipPermissions?: boolean) => void;
  launchSessionResult: LaunchSessionResult | null;
  // Worktree operations
  createWorktree: (repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => void;
  listWorktrees: (repoRoot: string) => void;
  removeWorktree: (repoRoot: string, path: string, force?: boolean, deleteBranch?: boolean) => void;
  createWorktreeResult: CreateWorktreeResult | null;
  listWorktreesResult: ListWorktreesResult | null;
  worktreesByRepo: Map<string, WorktreeWithStatus[]>;
  removeWorktreeResult: RemoveWorktreeResult | null;
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
  const [launchSessionResult, setLaunchSessionResult] = useState<LaunchSessionResult | null>(null);
  const [createWorktreeResult, setCreateWorktreeResult] = useState<CreateWorktreeResult | null>(null);
  const [listWorktreesResult, setListWorktreesResult] = useState<ListWorktreesResult | null>(null);
  const [worktreesByRepo, setWorktreesByRepo] = useState<Map<string, WorktreeWithStatus[]>>(new Map());
  const [removeWorktreeResult, setRemoveWorktreeResult] = useState<RemoveWorktreeResult | null>(null);
  const clientRef = useRef<JacquesClient | null>(null);

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

    // Extended message handlers (result events from server)
    jacquesClient.on('launch_session_result', (msg: Record<string, unknown>) => {
      setLaunchSessionResult({
        success: msg.success as boolean,
        method: msg.method as string,
        cwd: msg.cwd as string,
        error: msg.error as string | undefined,
      });
      setTimeout(() => setLaunchSessionResult(null), 5000);
    });

    jacquesClient.on('create_worktree_result', (msg: Record<string, unknown>) => {
      setCreateWorktreeResult({
        success: msg.success as boolean,
        worktreePath: msg.worktree_path as string | undefined,
        branch: msg.branch as string | undefined,
        sessionLaunched: msg.session_launched as boolean | undefined,
        error: msg.error as string | undefined,
      });
    });

    jacquesClient.on('list_worktrees_result', (msg: Record<string, unknown>) => {
      const repoRoot = msg.repo_root as string | undefined;
      const worktrees = msg.worktrees as WorktreeWithStatus[] | undefined;
      setListWorktreesResult({
        success: msg.success as boolean,
        repoRoot,
        worktrees,
        error: msg.error as string | undefined,
      });
      // Accumulate in per-repo map
      if (repoRoot && worktrees) {
        setWorktreesByRepo(prev => {
          const next = new Map(prev);
          next.set(repoRoot, worktrees);
          return next;
        });
      }
    });

    jacquesClient.on('remove_worktree_result', (msg: Record<string, unknown>) => {
      setRemoveWorktreeResult({
        success: msg.success as boolean,
        worktreePath: msg.worktree_path as string | undefined,
        branchDeleted: msg.branch_deleted as boolean | undefined,
        error: msg.error as string | undefined,
      });
    });

    // Connect
    jacquesClient.connect();
    setClient(jacquesClient);
    clientRef.current = jacquesClient;

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

  const tileWindows = useCallback((sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2' | 'smart') => {
    client?.send({ type: 'tile_windows', session_ids: sessionIds, layout });
  }, [client]);

  const maximizeWindow = useCallback((sessionId: string) => {
    client?.send({ type: 'maximize_window', session_id: sessionId });
  }, [client]);

  const launchSession = useCallback((cwd: string, dangerouslySkipPermissions?: boolean) => {
    client?.send({ type: 'launch_session', cwd, dangerously_skip_permissions: dangerouslySkipPermissions });
  }, [client]);

  const createWorktree = useCallback((repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => {
    client?.send({
      type: 'create_worktree',
      repo_root: repoRoot,
      name,
      base_branch: baseBranch,
      launch_session: true,
      dangerously_skip_permissions: dangerouslySkipPermissions,
    });
  }, [client]);

  const listWorktrees = useCallback((repoRoot: string) => {
    client?.send({ type: 'list_worktrees', repo_root: repoRoot });
  }, [client]);

  const removeWorktree = useCallback((repoRoot: string, path: string, force?: boolean, deleteBranch?: boolean) => {
    client?.send({
      type: 'remove_worktree',
      repo_root: repoRoot,
      worktree_path: path,
      force,
      delete_branch: deleteBranch,
    });
  }, [client]);

  return {
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
    tileWindows,
    maximizeWindow,
    launchSession,
    launchSessionResult,
    createWorktree,
    listWorktrees,
    removeWorktree,
    createWorktreeResult,
    listWorktreesResult,
    worktreesByRepo,
    removeWorktreeResult,
  };
}
