/**
 * Embeddable Server Module
 *
 * Provides a programmatic interface to start the Jacques server.
 * Can be imported and used by the dashboard or run standalone.
 */

import { SessionRegistry } from './session-registry.js';
import { UnixSocketServer } from './unix-socket.js';
import { JacquesWebSocketServer } from './websocket.js';
import { startFocusWatcher } from './focus-watcher.js';
import { createHttpApi, type HttpApiServer } from './http-api.js';
import { startLogInterception, stopLogInterception, addLogListener } from './logger.js';
import { ServerConfig } from './config/config.js';
import { createLogger } from './logging/logger-factory.js';
import { BroadcastService } from './services/broadcast-service.js';
import { NotificationService } from './services/notification-service.js';
import { HandoffWatcher } from './watchers/handoff-watcher.js';
import { EventHandler } from './handlers/event-handler.js';
import { WindowHandler } from './handlers/window-handler.js';
import { WorktreeHandler } from './handlers/worktree-handler.js';
import { SessionHandler } from './handlers/session-handler.js';
import { SettingsHandler } from './handlers/settings-handler.js';
import { scanForActiveSessions } from './process-scanner.js';
import { extractSessionCatalog, getSessionIndex } from '@jacques/core';
import type {
  ClientMessage,
  ServerLogMessage,
  GetHandoffContextRequest,
  FocusTerminalRequest,
  TileWindowsRequest,
  MaximizeWindowRequest,
  PositionBrowserLayoutRequest,
  LaunchSessionRequest,
  CreateWorktreeRequest,
  UpdateNotificationSettingsRequest,
  ChatSendRequest,
  ChatAbortRequest,
  CatalogUpdatedMessage,
  SmartTileAddRequest,
  ListWorktreesRequest,
  RemoveWorktreeRequest,
} from './types.js';
import { TileStateManager } from './window-manager/tile-state.js';
import { ChatService } from './services/chat-service.js';
import { WebSocket } from 'ws';
import { ClaudeOperationLogger } from '@jacques/core';
import { PROCESS_VERIFY_INTERVAL_MS } from './connection/constants.js';

export interface EmbeddedServerOptions {
  /** Suppress console output */
  silent?: boolean;
  /** Unix socket path (default: /tmp/jacques.sock) */
  unixSocketPath?: string;
  /** WebSocket port (default: 4242) */
  wsPort?: number;
  /** HTTP API port (default: 4243) */
  httpPort?: number;
}

export interface EmbeddedServer {
  /** Stop the server and clean up resources */
  stop: () => Promise<void>;
  /** Get the session registry */
  getRegistry: () => SessionRegistry;
  /** Get the WebSocket server */
  getWebSocketServer: () => JacquesWebSocketServer;
}

/**
 * Start the Jacques server programmatically
 */
export async function startEmbeddedServer(
  options: EmbeddedServerOptions = {}
): Promise<EmbeddedServer> {
  const {
    silent = false,
    unixSocketPath = ServerConfig.unixSocketPath,
    wsPort = ServerConfig.wsPort,
    httpPort = ServerConfig.httpPort,
  } = options;

  // Create logger for orchestrator
  const logger = createLogger({ silent, prefix: 'Server' });

  // Initialize core components
  const tileStateManager = new TileStateManager();
  const registry = new SessionRegistry({
    silent,
    // Trigger catalog extraction when a session is removed (Ctrl+C, crash, etc.)
    onSessionRemoved: (session) => {
      // Clean tile state when a session ends
      tileStateManager.removeSession(session.session_id);

      if (session.transcript_path && session.cwd) {
        logger.log(`Triggering catalog extraction for removed session: ${session.session_id}`);
        extractSessionCatalog(session.transcript_path, session.cwd)
          .then((result) => {
            if (result.error) {
              logger.warn(`Catalog extraction failed: ${result.error}`);
            } else if (!result.skipped) {
              logger.log(`Catalog extracted for session ${session.session_id}`);
            }
          })
          .catch((err) => {
            logger.warn(`Catalog extraction error: ${err}`);
          });
      }
    },
  });
  let focusWatcher: { stop: () => void } | null = null;
  let httpServer: HttpApiServer | null = null;

  // Create WebSocket server
  const wsServer = new JacquesWebSocketServer({
    port: wsPort,
    onClientMessage: handleClientMessage,
    silent,
  });

  // Set state provider for WebSocket server
  wsServer.setStateProvider({
    getAllSessions: () => registry.getAllSessions(),
    getFocusedSessionId: () => registry.getFocusedSessionId(),
    getFocusedSession: () => registry.getFocusedSession(),
  });

  // Create broadcast service
  const broadcastService = new BroadcastService({
    wsServer,
    registry,
    logger,
  });

  // Create handoff watcher
  const handoffWatcher = new HandoffWatcher({
    handoffFilename: ServerConfig.handoffFilename,
    broadcast: (msg) => {
      wsServer.broadcast(msg);
      // Also notify the notification service about handoff_ready
      if (msg.type === 'handoff_ready') {
        notificationService.onHandoffReady(msg.session_id, msg.path);
      }
    },
    logger,
  });

  // Create notification service (with click-to-focus callback)
  const notificationService = new NotificationService({
    broadcast: (msg) => wsServer.broadcast(msg),
    focusTerminal: (sessionId) => {
      const session = registry.getSession(sessionId);
      if (session?.terminal_key) {
        import('./terminal-activator.js').then(({ activateTerminal }) => {
          activateTerminal(session.terminal_key).catch(() => {});
        }).catch(() => {});
      }
    },
    logger,
  });

  // Create chat service
  const chatService = new ChatService({
    logger,
    onCatalogChange: (projectPath: string) => {
      const msg: CatalogUpdatedMessage = {
        type: 'catalog_updated',
        projectPath,
        action: 'refresh',
      };
      wsServer.broadcast(msg);
    },
  });

  // Create event handler
  const eventHandler = new EventHandler({
    registry,
    broadcastService,
    handoffWatcher,
    notificationService,
    logger,
  });

  // Create domain handlers
  const windowHandler = new WindowHandler({ registry, tileStateManager, logger });
  const worktreeHandler = new WorktreeHandler({ registry, tileStateManager, logger });
  const sessionHandler = new SessionHandler({ registry, logger });
  const settingsHandler = new SettingsHandler({ registry, wsServer, notificationService, logger });

  // Create Unix socket server
  const unixServer = new UnixSocketServer({
    socketPath: unixSocketPath,
    onEvent: (event) => eventHandler.handleEvent(event),
    onError: (err) => {
      logger.error(`Unix socket error: ${err.message}`);
    },
    silent,
  });

  // Wire up Claude operations to broadcast via WebSocket
  ClaudeOperationLogger.onOperation = (op) => {
    logger.log(`Claude operation: ${op.operation} (${op.inputTokens} in, ${op.outputTokens} out, ${op.durationMs}ms)`);
    wsServer.broadcastClaudeOperation(op);
    // Also check for large operation notifications
    notificationService.onClaudeOperation({
      id: op.id,
      operation: op.operation,
      phase: op.phase,
      totalTokens: op.totalTokens,
      userPromptPreview: op.userPromptPreview,
    });
  };

  /**
   * Handle client messages — thin router that delegates to domain handlers
   */
  function handleClientMessage(ws: WebSocket, message: ClientMessage): void {
    switch (message.type) {
      case 'select_session':
        if (registry.setFocusedSession(message.session_id)) {
          broadcastService.forceBroadcastFocusChange();
        }
        break;

      case 'trigger_action':
        logger.log(`Action requested: ${message.action} for session ${message.session_id}`);
        break;

      // Settings
      case 'toggle_autocompact':
        settingsHandler.handleToggleAutoCompact(ws);
        break;
      case 'get_handoff_context':
        settingsHandler.handleGetHandoffContext(ws, message as GetHandoffContextRequest);
        break;
      case 'update_notification_settings':
        settingsHandler.handleUpdateNotificationSettings(ws, message as UpdateNotificationSettingsRequest);
        break;

      // Session
      case 'focus_terminal':
        sessionHandler.handleFocusTerminal(ws, message as FocusTerminalRequest);
        break;
      case 'launch_session':
        sessionHandler.handleLaunchSession(ws, message as LaunchSessionRequest);
        break;

      // Window management
      case 'tile_windows':
        windowHandler.handleTileWindows(ws, message as TileWindowsRequest);
        break;
      case 'maximize_window':
        windowHandler.handleMaximizeWindow(ws, message as MaximizeWindowRequest);
        break;
      case 'position_browser_layout':
        windowHandler.handlePositionBrowserLayout(ws, message as PositionBrowserLayoutRequest);
        break;
      case 'smart_tile_add':
        windowHandler.handleSmartTileAdd(ws, message as SmartTileAddRequest);
        break;

      // Worktree
      case 'create_worktree':
        worktreeHandler.handleCreateWorktree(ws, message as CreateWorktreeRequest);
        break;
      case 'list_worktrees':
        worktreeHandler.handleListWorktrees(ws, message as ListWorktreesRequest);
        break;
      case 'remove_worktree':
        worktreeHandler.handleRemoveWorktree(ws, message as RemoveWorktreeRequest);
        break;

      // Chat
      case 'chat_send': {
        const chatMsg = message as ChatSendRequest;
        chatService.send(ws, chatMsg.projectPath, chatMsg.message);
        break;
      }
      case 'chat_abort': {
        const abortMsg = message as ChatAbortRequest;
        chatService.abort(abortMsg.projectPath);
        break;
      }

      default:
        logger.error(`Unknown client message type: ${(message as ClientMessage).type}`);
    }
  }

  // Start log interception for broadcasting to GUI.
  // In silent/embedded mode, suppress console output to prevent
  // core module console.error calls from flickering the TUI.
  startLogInterception({ silent });

  // Add log listener to broadcast to WebSocket clients
  const removeLogListener = addLogListener((logMessage: ServerLogMessage) => {
    wsServer.broadcast(logMessage);
  });

  // Start the server
  if (!silent) {
    logger.log('');
    logger.log('Starting Jacques server...');
  }

  try {
    // Start Unix socket server
    await unixServer.start();

    // Start WebSocket server
    await wsServer.start();

    // Start HTTP API server with API log callback
    httpServer = await createHttpApi({
      port: httpPort,
      silent,
      onApiLog: (log) => {
        wsServer.broadcastApiLog(log);
      },
      notificationService,
    });

    // Pre-warm session index cache so first GUI load is fast
    getSessionIndex().catch(() => {});

    // Start stale session cleanup
    registry.startCleanup(ServerConfig.staleSessionCleanupMinutes);

    // Start process verification to detect dead sessions
    registry.startProcessVerification(PROCESS_VERIFY_INTERVAL_MS);

    // Start terminal focus watcher
    focusWatcher = startFocusWatcher(
      {
        onFocusChange: (terminalKey, allKeys) => {
          if (terminalKey) {
            // Try all candidate keys (e.g., ITERM first, then TTY fallback)
            let session = null;
            let matchedKey = terminalKey;
            for (const key of allKeys || [terminalKey]) {
              session = registry.findSessionByTerminalKey(key);
              if (session) {
                matchedKey = key;
                break;
              }
            }
            if (session && session.session_id !== registry.getFocusedSessionId()) {
              logger.log(`Terminal focus detected: ${matchedKey} -> ${session.session_id}`);
              registry.setFocusedSession(session.session_id);
              broadcastService.forceBroadcastFocusChange();
            }
          }
        },
        shouldRetry: () => registry.getFocusedSessionId() === null && registry.getSessionCount() > 0,
      },
      ServerConfig.focusWatcherPollMs,
      { silent }
    );

    if (!silent) {
      logger.log('Jacques server started successfully');
      logger.log(`Unix socket: ${unixSocketPath}`);
      logger.log(`WebSocket:   ws://localhost:${wsPort}`);
      logger.log(`HTTP API:    http://localhost:${httpPort}`);
      logger.log('');
    }

    // Scan for existing Claude sessions at startup
    try {
      logger.log('Scanning for running Claude Code sessions...');
      const discovered = await scanForActiveSessions();
      for (const session of discovered) {
        const registered = registry.registerDiscoveredSession(session);
        broadcastService.broadcastSessionWithFocus(registered);
      }
      if (discovered.length > 0) {
        logger.log(`Found ${discovered.length} active session(s)`);
        // Check if any discovered sessions are running with --dangerously-skip-permissions
        const bypassIds = await registry.detectBypassSessions();
        if (bypassIds.length > 0) {
          logger.log(`Detected ${bypassIds.length} bypass session(s): ${bypassIds.join(', ')}`);
          for (const id of bypassIds) {
            // For bypass sessions, detect mode from JSONL (permission_mode is unreliable)
            const updated = await registry.updateSessionMode(id);
            if (updated) {
              broadcastService.broadcastSessionWithFocus(updated);
            }
          }
        }
      } else {
        logger.log('No active sessions found');
      }
    } catch (err) {
      logger.warn(`Session scan failed: ${err}`);
    }
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'EADDRINUSE') {
      logger.error(`Port already in use. Another Jacques server may be running.`);
      logger.error(`Run: npm run stop:server`);
    } else {
      logger.error(`Failed to start: ${err}`);
    }
    throw err;
  }

  // Return the server interface
  return {
    stop: async () => {
      if (!silent) {
        logger.log('Shutting down...');
      }

      try {
        // Stop watchers and intervals synchronously (fast operations)
        if (focusWatcher) {
          focusWatcher.stop();
          focusWatcher = null;
        }

        registry.stopCleanup();
        handoffWatcher.stopAll();
        chatService.killAll();

        // Remove log listener
        removeLogListener();

        // Stop all servers in parallel (async operations)
        const shutdownPromises: Promise<void>[] = [];

        if (httpServer) {
          shutdownPromises.push(
            httpServer.stop().catch((err) => {
              logger.error(`HTTP API stop error: ${err}`);
            })
          );
        }

        shutdownPromises.push(
          unixServer.stop().catch((err) => {
            logger.error(`UnixSocket stop error: ${err}`);
          }),
          wsServer.stop().catch((err) => {
            logger.error(`WebSocket stop error: ${err}`);
          })
        );

        // Wait for all servers to stop
        await Promise.all(shutdownPromises);

        // Stop log interception last
        stopLogInterception();

        if (!silent) {
          logger.log('Shutdown complete');
        }
      } catch (err) {
        logger.error(`Error during shutdown: ${err}`);
        throw err;
      }
    },
    getRegistry: () => registry,
    getWebSocketServer: () => wsServer,
  };
}
