import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import type { Session, ClaudeOperation, ApiLog, WorktreeWithStatus } from '../types';
import type { NotificationItem } from '@jacques/core/notifications';
import { toastStore } from '../components/ui/ToastContainer';
import { notificationStore } from '../components/ui/NotificationStore';

// WebSocket URL - the GUI connects to the Jacques server
// In production (served from HTTP API), we're on port 4243, WebSocket is on 4242
// In dev mode (Vite on 5173), WebSocket is on 4242
const SERVER_URL = import.meta.env.VITE_JACQUES_SERVER_URL || 'ws://localhost:4242';

// Server log type
export interface ServerLog {
  type: 'server_log';
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  source: string;
}

// Simplified WebSocket client for browser use
// The full JacquesClient uses Node.js EventEmitter which isn't available in browsers
class BrowserJacquesClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  public onConnected?: () => void;
  public onDisconnected?: () => void;
  public onInitialState?: (sessions: Session[], focusedId: string | null) => void;
  public onSessionUpdate?: (session: Session) => void;
  public onSessionRemoved?: (sessionId: string) => void;
  public onFocusChanged?: (sessionId: string | null, session: Session | null) => void;
  public onAutocompactToggled?: (enabled: boolean) => void;
  public onServerLog?: (log: ServerLog) => void;
  public onClaudeOperation?: (operation: ClaudeOperation) => void;
  public onApiLog?: (log: ApiLog) => void;
  public onHandoffReady?: (sessionId: string, path: string) => void;
  public onChatDelta?: (projectPath: string, text: string) => void;
  public onChatToolEvent?: (projectPath: string, toolName: string) => void;
  public onChatComplete?: (projectPath: string, fullText: string, inputTokens: number, outputTokens: number) => void;
  public onChatError?: (projectPath: string, reason: string, message: string) => void;
  public onCatalogUpdated?: (projectPath: string, action: string, itemId?: string) => void;
  public onNotificationFired?: (notification: NotificationItem) => void;
  public onSmartTileAddResult?: (success: boolean, repositioned: number, totalTiled: number, usedFreeSpace: boolean, launchMethod?: string, error?: string) => void;
  public onLaunchResult?: (success: boolean, method: string, cwd: string, error?: string) => void;
  public onCreateWorktreeResult?: (success: boolean, worktreePath?: string, branch?: string, sessionLaunched?: boolean, launchMethod?: string, error?: string) => void;
  public onListWorktreesResult?: (success: boolean, worktrees?: WorktreeWithStatus[], error?: string) => void;
  public onRemoveWorktreeResult?: (success: boolean, worktreePath?: string, branchDeleted?: boolean, error?: string) => void;

  connect() {
    if (this.disposed) return;
    // Close any existing connection before opening a new one
    if (this.ws) {
      this.ws.onclose = null; // Prevent triggering reconnect
      this.ws.close();
      this.ws = null;
    }
    try {
      this.ws = new WebSocket(SERVER_URL);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.onConnected?.();
      };

      this.ws.onclose = () => {
        this.onDisconnected?.();
        if (!this.disposed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // Will trigger onclose
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch {
          // Ignore parse errors
        }
      };
    } catch {
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    }
  }

  disconnect() {
    this.disposed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect on intentional close
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(message: { type: string; [key: string]: unknown }) {
    switch (message.type) {
      case 'initial_state':
        this.onInitialState?.(
          message.sessions as Session[],
          message.focused_session_id as string | null
        );
        break;
      case 'session_update':
        this.onSessionUpdate?.(message.session as Session);
        break;
      case 'session_removed':
        this.onSessionRemoved?.(message.session_id as string);
        break;
      case 'focus_changed':
        this.onFocusChanged?.(
          message.session_id as string | null,
          message.session as Session | null
        );
        break;
      case 'autocompact_toggled':
        this.onAutocompactToggled?.(message.enabled as boolean);
        break;
      case 'server_log':
        this.onServerLog?.(message as unknown as ServerLog);
        break;
      case 'claude_operation':
        this.onClaudeOperation?.(message.operation as unknown as ClaudeOperation);
        break;
      case 'api_log':
        this.onApiLog?.({
          method: message.method as string,
          path: message.path as string,
          status: message.status as number,
          durationMs: message.durationMs as number,
          timestamp: message.timestamp as number,
        });
        break;
      case 'handoff_ready':
        this.onHandoffReady?.(
          message.session_id as string,
          message.path as string,
        );
        break;
      case 'chat_delta':
        this.onChatDelta?.(
          message.projectPath as string,
          message.text as string,
        );
        break;
      case 'chat_tool_event':
        this.onChatToolEvent?.(
          message.projectPath as string,
          message.toolName as string,
        );
        break;
      case 'chat_complete':
        this.onChatComplete?.(
          message.projectPath as string,
          message.fullText as string,
          message.inputTokens as number,
          message.outputTokens as number,
        );
        break;
      case 'chat_error':
        this.onChatError?.(
          message.projectPath as string,
          message.reason as string,
          message.message as string,
        );
        break;
      case 'catalog_updated':
        this.onCatalogUpdated?.(
          message.projectPath as string,
          message.action as string,
          message.itemId as string | undefined,
        );
        break;
      case 'smart_tile_add_result':
        this.onSmartTileAddResult?.(
          message.success as boolean,
          message.repositioned as number,
          message.total_tiled as number,
          message.used_free_space as boolean,
          message.launch_method as string | undefined,
          message.error as string | undefined,
        );
        break;
      case 'launch_session_result':
        this.onLaunchResult?.(
          message.success as boolean,
          message.method as string,
          message.cwd as string,
          message.error as string | undefined,
        );
        break;
      case 'create_worktree_result':
        this.onCreateWorktreeResult?.(
          message.success as boolean,
          message.worktree_path as string | undefined,
          message.branch as string | undefined,
          message.session_launched as boolean | undefined,
          message.launch_method as string | undefined,
          message.error as string | undefined,
        );
        break;
      case 'list_worktrees_result':
        this.onListWorktreesResult?.(
          message.success as boolean,
          message.worktrees as WorktreeWithStatus[] | undefined,
          message.error as string | undefined,
        );
        break;
      case 'remove_worktree_result':
        this.onRemoveWorktreeResult?.(
          message.success as boolean,
          message.worktree_path as string | undefined,
          message.branch_deleted as boolean | undefined,
          message.error as string | undefined,
        );
        break;
      case 'notification_fired':
        this.onNotificationFired?.(message.notification as unknown as NotificationItem);
        break;
    }
  }

  selectSession(sessionId: string) {
    this.send({ type: 'select_session', session_id: sessionId });
  }

  triggerAction(sessionId: string, action: string) {
    this.send({ type: 'trigger_action', session_id: sessionId, action });
  }

  toggleAutoCompact() {
    this.send({ type: 'toggle_autocompact' });
  }

  focusTerminal(sessionId: string) {
    this.send({ type: 'focus_terminal', session_id: sessionId });
  }

  tileWindows(sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2' | 'smart') {
    this.send({
      type: 'tile_windows',
      session_ids: sessionIds,
      layout,
    });
  }

  maximizeWindow(sessionId: string) {
    this.send({ type: 'maximize_window', session_id: sessionId });
  }

  positionBrowserLayout(sessionIds: string[], layout: string) {
    this.send({
      type: 'position_browser_layout',
      session_ids: sessionIds,
      layout,
    });
  }

  sendChatMessage(projectPath: string, message: string) {
    this.send({ type: 'chat_send', projectPath, message });
  }

  abortChat(projectPath: string) {
    this.send({ type: 'chat_abort', projectPath });
  }

  launchSession(cwd: string, preferredTerminal?: string, dangerouslySkipPermissions?: boolean) {
    this.send({
      type: 'launch_session',
      cwd,
      preferred_terminal: preferredTerminal,
      dangerously_skip_permissions: dangerouslySkipPermissions,
    });
  }

  createWorktree(repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) {
    this.send({
      type: 'create_worktree',
      repo_root: repoRoot,
      name,
      base_branch: baseBranch,
      dangerously_skip_permissions: dangerouslySkipPermissions,
    });
  }

  listWorktrees(repoRoot: string) {
    this.send({
      type: 'list_worktrees',
      repo_root: repoRoot,
    });
  }

  removeWorktree(repoRoot: string, worktreePath: string, force?: boolean, deleteBranch?: boolean) {
    this.send({
      type: 'remove_worktree',
      repo_root: repoRoot,
      worktree_path: worktreePath,
      force,
      delete_branch: deleteBranch,
    });
  }

  smartTileAdd(cwd?: string, sessionId?: string, dangerouslySkipPermissions?: boolean) {
    this.send({
      type: 'smart_tile_add',
      launch_cwd: cwd,
      new_session_id: sessionId,
      dangerously_skip_permissions: dangerouslySkipPermissions,
    });
  }

  private send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  getIsConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export interface JacquesState {
  sessions: Session[];
  focusedSessionId: string | null;
  connected: boolean;
  initialStateReceived: boolean;
  lastUpdate: number;
  serverLogs: ServerLog[];
  claudeOperations: ClaudeOperation[];
  apiLogs: ApiLog[];
}

export interface ChatCallbacks {
  onChatDelta?: (projectPath: string, text: string) => void;
  onChatToolEvent?: (projectPath: string, toolName: string) => void;
  onChatComplete?: (projectPath: string, fullText: string, inputTokens: number, outputTokens: number) => void;
  onChatError?: (projectPath: string, reason: string, message: string) => void;
  onCatalogUpdated?: (projectPath: string, action: string, itemId?: string) => void;
}

export interface UseJacquesClientReturn extends JacquesState {
  initialStateReceived: boolean;
  selectSession: (sessionId: string) => void;
  triggerAction: (
    sessionId: string,
    action: 'smart_compact' | 'new_session' | 'save_snapshot'
  ) => void;
  toggleAutoCompact: () => void;
  focusTerminal: (sessionId: string) => void;
  tileWindows: (sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2' | 'smart') => void;
  maximizeWindow: (sessionId: string) => void;
  positionBrowserLayout: (sessionIds: string[], layout: string) => void;
  smartTileAdd: (cwd?: string, sessionId?: string, dangerouslySkipPermissions?: boolean) => void;
  launchSession: (cwd: string, preferredTerminal?: string, dangerouslySkipPermissions?: boolean) => void;
  createWorktree: (repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => void;
  onCreateWorktreeResult: (callback: (success: boolean, worktreePath?: string, branch?: string, sessionLaunched?: boolean, launchMethod?: string, error?: string) => void) => void;
  listWorktrees: (repoRoot: string) => void;
  removeWorktree: (repoRoot: string, worktreePath: string, force?: boolean, deleteBranch?: boolean) => void;
  onListWorktreesResult: (callback: (success: boolean, worktrees?: WorktreeWithStatus[], error?: string) => void) => void;
  onRemoveWorktreeResult: (callback: (success: boolean, worktreePath?: string, branchDeleted?: boolean, error?: string) => void) => void;
  sendChatMessage: (projectPath: string, message: string) => void;
  abortChat: (projectPath: string) => void;
  setChatCallbacks: (callbacks: ChatCallbacks) => void;
}

const MAX_LOGS = 100;
const MAX_CLAUDE_OPS = 50;
const MAX_API_LOGS = 100;

// Context for sharing a single WebSocket connection across all components
const JacquesClientContext = createContext<UseJacquesClientReturn | null>(null);

export function useJacquesClient(): UseJacquesClientReturn {
  const ctx = useContext(JacquesClientContext);
  if (!ctx) throw new Error('useJacquesClient must be used within JacquesClientProvider');
  return ctx;
}

function useJacquesClientInternal(): UseJacquesClientReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [initialStateReceived, setInitialStateReceived] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [claudeOperations, setClaudeOperations] = useState<ClaudeOperation[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [client, setClient] = useState<BrowserJacquesClient | null>(null);
  const chatCallbacksRef = useRef<ChatCallbacks>({});
  const createWorktreeCallbackRef = useRef<((success: boolean, worktreePath?: string, branch?: string, sessionLaunched?: boolean, launchMethod?: string, error?: string) => void) | null>(null);
  const listWorktreesCallbackRef = useRef<((success: boolean, worktrees?: WorktreeWithStatus[], error?: string) => void) | null>(null);
  const removeWorktreeCallbackRef = useRef<((success: boolean, worktreePath?: string, branchDeleted?: boolean, error?: string) => void) | null>(null);
  const clientRef = useRef<BrowserJacquesClient | null>(null);

  useEffect(() => {
    // Prevent double-connection in React StrictMode
    if (clientRef.current) return;
    const jacquesClient = new BrowserJacquesClient();
    clientRef.current = jacquesClient;

    // Event handlers
    jacquesClient.onConnected = () => {
      setConnected(true);
      setLastUpdate(Date.now());
    };

    jacquesClient.onDisconnected = () => {
      setConnected(false);
      setLastUpdate(Date.now());
    };

    jacquesClient.onInitialState = (initialSessions: Session[], initialFocusedId: string | null) => {
      setSessions(initialSessions);
      setFocusedSessionId(initialFocusedId);
      setInitialStateReceived(true);
      setLastUpdate(Date.now());
    };

    jacquesClient.onSessionUpdate = (session: Session) => {
      setSessions(prev => {
        const index = prev.findIndex(s => s.session_id === session.session_id);
        let newSessions: Session[];
        if (index >= 0) {
          newSessions = [...prev];
          newSessions[index] = session;
        } else {
          newSessions = [...prev, session];
        }
        // Sort by last activity (most recent first)
        return newSessions.sort((a, b) => b.last_activity - a.last_activity);
      });
      setLastUpdate(Date.now());
    };

    jacquesClient.onSessionRemoved = (sessionId: string) => {
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      setFocusedSessionId(prev => {
        if (prev === sessionId) {
          return null;
        }
        return prev;
      });
      setLastUpdate(Date.now());
    };

    jacquesClient.onFocusChanged = (sessionId: string | null, session: Session | null) => {
      setFocusedSessionId(sessionId);

      if (session) {
        setSessions(prev => {
          const index = prev.findIndex(s => s.session_id === session.session_id);
          if (index >= 0) {
            const newSessions = [...prev];
            newSessions[index] = session;
            return newSessions.sort((a, b) => b.last_activity - a.last_activity);
          }
          return [...prev, session].sort((a, b) => b.last_activity - a.last_activity);
        });
      }

      setLastUpdate(Date.now());
    };

    jacquesClient.onAutocompactToggled = (enabled: boolean) => {
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
    };

    jacquesClient.onServerLog = (log: ServerLog) => {
      setServerLogs(prev => {
        const newLogs = [...prev, log];
        // Keep only the last MAX_LOGS entries
        if (newLogs.length > MAX_LOGS) {
          return newLogs.slice(-MAX_LOGS);
        }
        return newLogs;
      });
    };

    jacquesClient.onClaudeOperation = (operation: ClaudeOperation) => {
      setClaudeOperations(prev => {
        const newOps = [...prev, operation];
        // Keep only the last MAX_CLAUDE_OPS entries
        if (newOps.length > MAX_CLAUDE_OPS) {
          return newOps.slice(-MAX_CLAUDE_OPS);
        }
        return newOps;
      });
    };

    jacquesClient.onApiLog = (log: ApiLog) => {
      setApiLogs(prev => {
        const newLogs = [...prev, log];
        // Keep only the last MAX_API_LOGS entries
        if (newLogs.length > MAX_API_LOGS) {
          return newLogs.slice(-MAX_API_LOGS);
        }
        return newLogs;
      });
    };

    jacquesClient.onHandoffReady = (_sessionId: string, path: string) => {
      const filename = path.split('/').pop() ?? 'handoff';
      toastStore.push({
        title: 'Handoff Ready',
        body: `Generated ${filename}`,
        priority: 'medium',
        category: 'handoff',
      });
    };

    // Server-driven notifications — push to toast + notification store + browser notification
    jacquesClient.onNotificationFired = (notification: NotificationItem) => {
      // In-app toast (ephemeral)
      toastStore.push({
        title: notification.title,
        body: notification.body,
        priority: notification.priority,
        category: notification.category,
      });
      // Persistent notification history
      notificationStore.push({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        priority: notification.priority,
        category: notification.category,
        timestamp: notification.timestamp,
        sessionId: notification.sessionId,
      });
      // Browser notification when tab is unfocused
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && !document.hasFocus()) {
        new Notification(notification.title, {
          body: notification.body,
          tag: `jacques-${notification.category}-${notification.id}`,
          icon: '/jacsub.png',
        });
      }
    };

    // Wire chat callbacks through ref (allows updating without re-creating client)
    jacquesClient.onChatDelta = (projectPath, text) => {
      chatCallbacksRef.current.onChatDelta?.(projectPath, text);
    };
    jacquesClient.onChatToolEvent = (projectPath, toolName) => {
      chatCallbacksRef.current.onChatToolEvent?.(projectPath, toolName);
    };
    jacquesClient.onChatComplete = (projectPath, fullText, inputTokens, outputTokens) => {
      chatCallbacksRef.current.onChatComplete?.(projectPath, fullText, inputTokens, outputTokens);
    };
    jacquesClient.onChatError = (projectPath, reason, message) => {
      chatCallbacksRef.current.onChatError?.(projectPath, reason, message);
    };
    jacquesClient.onCatalogUpdated = (projectPath, action, itemId) => {
      chatCallbacksRef.current.onCatalogUpdated?.(projectPath, action, itemId);
    };

    jacquesClient.onSmartTileAddResult = (success, repositioned, totalTiled, usedFreeSpace, launchMethod, error) => {
      if (success) {
        const placement = usedFreeSpace ? 'free-space' : `grid (${totalTiled} tiled)`;
        toastStore.push({
          title: 'Terminal Added',
          body: `${launchMethod || 'terminal'} placed via ${placement}${repositioned > 0 ? `, ${repositioned} repositioned` : ''}`,
          priority: 'low',
          category: 'handoff',
        });
      } else {
        toastStore.push({
          title: 'Smart Tile Failed',
          body: error || 'Could not add terminal to tile',
          priority: 'high',
          category: 'handoff',
        });
      }
    };

    jacquesClient.onLaunchResult = (success, method, cwd, error) => {
      const dirName = cwd.split('/').pop() || cwd;
      if (success) {
        toastStore.push({
          title: 'Session Launched',
          body: `Opened ${method} in ${dirName}`,
          priority: 'low',
          category: 'handoff',
        });
      } else {
        toastStore.push({
          title: 'Launch Failed',
          body: error || 'Could not open terminal',
          priority: 'high',
          category: 'handoff',
        });
      }
    };

    jacquesClient.onCreateWorktreeResult = (success, worktreePath, branch, sessionLaunched, launchMethod, error) => {
      createWorktreeCallbackRef.current?.(success, worktreePath, branch, sessionLaunched, launchMethod, error);
    };

    jacquesClient.onListWorktreesResult = (success, worktrees, error) => {
      listWorktreesCallbackRef.current?.(success, worktrees, error);
    };

    jacquesClient.onRemoveWorktreeResult = (success, worktreePath, branchDeleted, error) => {
      removeWorktreeCallbackRef.current?.(success, worktreePath, branchDeleted, error);
    };

    // Connect
    jacquesClient.connect();
    setClient(jacquesClient);

    // Cleanup on unmount
    return () => {
      jacquesClient.disconnect();
      clientRef.current = null;
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
    client?.tileWindows(sessionIds, layout);
  }, [client]);

  const maximizeWindow = useCallback((sessionId: string) => {
    client?.maximizeWindow(sessionId);
  }, [client]);

  const positionBrowserLayout = useCallback((sessionIds: string[], layout: string) => {
    client?.positionBrowserLayout(sessionIds, layout);
  }, [client]);

  const sendChatMessage = useCallback((projectPath: string, message: string) => {
    client?.sendChatMessage(projectPath, message);
  }, [client]);

  const abortChat = useCallback((projectPath: string) => {
    client?.abortChat(projectPath);
  }, [client]);

  const smartTileAdd = useCallback((cwd?: string, sessionId?: string, dangerouslySkipPermissions?: boolean) => {
    client?.smartTileAdd(cwd, sessionId, dangerouslySkipPermissions);
  }, [client]);

  const launchSession = useCallback((cwd: string, preferredTerminal?: string, dangerouslySkipPermissions?: boolean) => {
    client?.launchSession(cwd, preferredTerminal, dangerouslySkipPermissions);
  }, [client]);

  const createWorktreeAction = useCallback((repoRoot: string, name: string, baseBranch?: string, dangerouslySkipPermissions?: boolean) => {
    client?.createWorktree(repoRoot, name, baseBranch, dangerouslySkipPermissions);
  }, [client]);

  const onCreateWorktreeResult = useCallback((callback: (success: boolean, worktreePath?: string, branch?: string, sessionLaunched?: boolean, launchMethod?: string, error?: string) => void) => {
    createWorktreeCallbackRef.current = callback;
  }, []);

  const listWorktreesAction = useCallback((repoRoot: string) => {
    client?.listWorktrees(repoRoot);
  }, [client]);

  const removeWorktreeAction = useCallback((repoRoot: string, worktreePath: string, force?: boolean, deleteBranch?: boolean) => {
    client?.removeWorktree(repoRoot, worktreePath, force, deleteBranch);
  }, [client]);

  const onListWorktreesResult = useCallback((callback: (success: boolean, worktrees?: WorktreeWithStatus[], error?: string) => void) => {
    listWorktreesCallbackRef.current = callback;
  }, []);

  const onRemoveWorktreeResult = useCallback((callback: (success: boolean, worktreePath?: string, branchDeleted?: boolean, error?: string) => void) => {
    removeWorktreeCallbackRef.current = callback;
  }, []);

  const setChatCallbacks = useCallback((callbacks: ChatCallbacks) => {
    chatCallbacksRef.current = callbacks;
  }, []);


  return {
    sessions,
    focusedSessionId,
    connected,
    initialStateReceived,
    lastUpdate,
    serverLogs,
    claudeOperations,
    apiLogs,
    selectSession,
    triggerAction,
    toggleAutoCompact,
    focusTerminal,
    tileWindows,
    maximizeWindow,
    positionBrowserLayout,
    smartTileAdd,
    launchSession,
    createWorktree: createWorktreeAction,
    onCreateWorktreeResult,
    listWorktrees: listWorktreesAction,
    removeWorktree: removeWorktreeAction,
    onListWorktreesResult,
    onRemoveWorktreeResult,
    sendChatMessage,
    abortChat,
    setChatCallbacks,
  };
}

// Provider component — renders once at the app root, creates the single WebSocket connection
export function JacquesClientProvider({ children }: { children: React.ReactNode }) {
  const value = useJacquesClientInternal();
  return React.createElement(JacquesClientContext.Provider, { value }, children);
}
