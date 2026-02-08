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
import { createLogger, type Logger } from './logging/logger-factory.js';
import { BroadcastService } from './services/broadcast-service.js';
import { NotificationService } from './services/notification-service.js';
import { HandoffWatcher } from './watchers/handoff-watcher.js';
import { EventHandler } from './handlers/event-handler.js';
import { scanForActiveSessions } from './process-scanner.js';
import { extractSessionCatalog, getSessionIndex } from '@jacques/core';
import type {
  ClientMessage,
  AutoCompactToggledMessage,
  ServerLogMessage,
  HandoffContextMessage,
  HandoffContextErrorMessage,
  GetHandoffContextRequest,
  FocusTerminalRequest,
  FocusTerminalResultMessage,
  TileWindowsRequest,
  TileWindowsResultMessage,
  MaximizeWindowRequest,
  MaximizeWindowResultMessage,
  PositionBrowserLayoutRequest,
  PositionBrowserLayoutResultMessage,
  LaunchSessionRequest,
  LaunchSessionResultMessage,
  CreateWorktreeRequest,
  CreateWorktreeResultMessage,
  UpdateNotificationSettingsRequest,
  NotificationSettingsMessage,
  ChatSendRequest,
  ChatAbortRequest,
  CatalogUpdatedMessage,
  SmartTileAddRequest,
  SmartTileAddResultMessage,
  ListWorktreesRequest,
  ListWorktreesResultMessage,
  RemoveWorktreeRequest,
  RemoveWorktreeResultMessage,
} from './types.js';
import { createWorktree, listWorktreesWithStatus, removeWorktree } from './connection/index.js';
import { TileStateManager, validateTileStateWithBounds, validateTileStateBySessions } from './window-manager/tile-state.js';
import { planSmartTileTransition, findFreeSpace } from './window-manager/smart-layouts.js';
import type { ExistingSlot } from './window-manager/smart-layouts.js';
import { ChatService } from './services/chat-service.js';
import { WebSocket } from 'ws';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { getCompactContextForSkill } from '@jacques/core/handoff';
import { ClaudeOperationLogger } from '@jacques/core';
import { activateTerminal } from './terminal-activator.js';
import { launchTerminalSession } from './terminal-launcher.js';
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

  // Create notification service
  const notificationService = new NotificationService({
    broadcast: (msg) => wsServer.broadcast(msg),
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
   * Handle client messages
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

      case 'toggle_autocompact':
        handleToggleAutoCompact(ws);
        break;

      case 'get_handoff_context':
        handleGetHandoffContext(ws, message as GetHandoffContextRequest);
        break;

      case 'focus_terminal':
        handleFocusTerminal(ws, message as FocusTerminalRequest);
        break;

      case 'tile_windows':
        handleTileWindows(ws, message as TileWindowsRequest);
        break;

      case 'maximize_window':
        handleMaximizeWindow(ws, message as MaximizeWindowRequest);
        break;

      case 'position_browser_layout':
        handlePositionBrowserLayout(ws, message as PositionBrowserLayoutRequest);
        break;

      case 'launch_session':
        handleLaunchSession(ws, message as LaunchSessionRequest);
        break;

      case 'create_worktree':
        handleCreateWorktree(ws, message as CreateWorktreeRequest);
        break;

      case 'list_worktrees':
        handleListWorktrees(ws, message as ListWorktreesRequest);
        break;

      case 'remove_worktree':
        handleRemoveWorktree(ws, message as RemoveWorktreeRequest);
        break;

      case 'smart_tile_add':
        handleSmartTileAdd(ws, message as SmartTileAddRequest);
        break;

      case 'update_notification_settings':
        handleUpdateNotificationSettings(ws, message as UpdateNotificationSettingsRequest);
        break;

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

  /**
   * Handle get handoff context request
   * Returns compact pre-extracted context for LLM skill (~2k tokens)
   */
  async function handleGetHandoffContext(
    ws: WebSocket,
    request: GetHandoffContextRequest
  ): Promise<void> {
    const session = registry.getSession(request.session_id);

    if (!session) {
      sendErrorResponse(ws, request.session_id, `Session not found: ${request.session_id}`);
      return;
    }

    if (!session.transcript_path) {
      sendErrorResponse(ws, request.session_id, 'Session has no transcript path');
      return;
    }

    const projectDir = session.workspace?.project_dir || session.cwd;

    try {
      logger.log(`Extracting compact handoff context for session ${request.session_id}`);
      const result = await getCompactContextForSkill(session.transcript_path, projectDir);

      const response: HandoffContextMessage = {
        type: 'handoff_context',
        session_id: request.session_id,
        context: result.context,
        token_estimate: result.tokenEstimate,
        data: {
          title: result.data.title,
          projectDir: result.data.projectDir,
          filesModified: result.data.filesModified,
          toolsUsed: result.data.toolsUsed,
          recentMessages: result.data.recentMessages,
          assistantHighlights: result.data.assistantHighlights,
          decisions: result.data.decisions,
          technologies: result.data.technologies,
          blockers: result.data.blockers,
          totalUserMessages: result.data.totalUserMessages,
          totalToolCalls: result.data.totalToolCalls,
          plans: result.data.plans,
        },
      };

      logger.log(`Compact context extracted: ~${result.tokenEstimate} tokens`);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (err) {
      logger.error(`Failed to extract handoff context: ${err}`);
      sendErrorResponse(
        ws,
        request.session_id,
        `Failed to extract context: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Send error response for handoff context request
   */
  function sendErrorResponse(ws: WebSocket, sessionId: string, error: string): void {
    const errorResponse: HandoffContextErrorMessage = {
      type: 'handoff_context_error',
      session_id: sessionId,
      error,
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorResponse));
    }
  }

  /**
   * Handle toggle auto-compact request
   */
  function handleToggleAutoCompact(ws: WebSocket): void {
    try {
      let settings: Record<string, unknown> = {};
      if (existsSync(ServerConfig.claudeSettingsPath)) {
        try {
          const content = readFileSync(ServerConfig.claudeSettingsPath, 'utf-8');
          settings = JSON.parse(content);
        } catch {
          // Start fresh if file is corrupted
        }
      }

      const currentValue = settings.autoCompact !== false;
      const newValue = !currentValue;
      settings.autoCompact = newValue;

      const dir = dirname(ServerConfig.claudeSettingsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(ServerConfig.claudeSettingsPath, JSON.stringify(settings, null, 2));

      const response: AutoCompactToggledMessage = {
        type: 'autocompact_toggled',
        enabled: newValue,
        warning: newValue ? undefined : 'Known bug: may still trigger at ~78%',
      };

      logger.log(`Auto-compact toggled to: ${newValue ? 'ON' : 'OFF'}`);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }

      // Update all sessions with new autocompact status
      const sessions = registry.getAllSessions();
      for (const session of sessions) {
        session.autocompact = {
          enabled: newValue,
          threshold: ServerConfig.autoCompactThreshold,
          bug_threshold: newValue ? null : 78,
        };
        wsServer.broadcastSessionUpdate(session);
      }
    } catch (err) {
      logger.error(`Failed to toggle auto-compact: ${err}`);
    }
  }

  /**
   * Handle focus terminal request
   * Looks up the session's terminal_key and activates the terminal window
   */
  async function handleFocusTerminal(
    ws: WebSocket,
    request: FocusTerminalRequest
  ): Promise<void> {
    const session = registry.getSession(request.session_id);

    if (!session) {
      const response: FocusTerminalResultMessage = {
        type: 'focus_terminal_result',
        session_id: request.session_id,
        success: false,
        method: 'unsupported',
        error: `Session not found: ${request.session_id}`,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    logger.log(`Focusing terminal for session ${request.session_id} (key: ${session.terminal_key})`);

    if (!session.terminal_key) {
      const response: FocusTerminalResultMessage = {
        type: 'focus_terminal_result',
        session_id: request.session_id,
        success: false,
        method: 'unsupported',
        error: 'Session has no terminal key',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    const result = await activateTerminal(session.terminal_key);

    const response: FocusTerminalResultMessage = {
      type: 'focus_terminal_result',
      session_id: request.session_id,
      success: result.success,
      method: result.method,
      error: result.error,
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }

    if (result.success) {
      logger.log(`Terminal focused via ${result.method} for session ${request.session_id}`);
    } else {
      logger.log(`Terminal focus failed (${result.method}): ${result.error}`);
    }
  }

  /**
   * Handle tile windows request
   * Tiles multiple terminal windows side-by-side or in a grid
   */
  async function handleTileWindows(
    ws: WebSocket,
    request: TileWindowsRequest
  ): Promise<void> {
    const { session_ids, layout: requestedLayout, display_id } = request;

    if (!session_ids || session_ids.length === 0) {
      const response: TileWindowsResultMessage = {
        type: 'tile_windows_result',
        success: false,
        positioned: 0,
        total: 0,
        layout: 'side-by-side',
        errors: ['No session IDs provided'],
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    // Get terminal keys for the requested sessions
    const terminalKeys: string[] = [];
    const errors: string[] = [];

    for (const sessionId of session_ids) {
      const session = registry.getSession(sessionId);
      if (!session) {
        errors.push(`Session not found: ${sessionId}`);
        continue;
      }
      if (!session.terminal_key) {
        errors.push(`Session has no terminal key: ${sessionId}`);
        continue;
      }
      terminalKeys.push(session.terminal_key);
    }

    if (terminalKeys.length === 0) {
      const response: TileWindowsResultMessage = {
        type: 'tile_windows_result',
        success: false,
        positioned: 0,
        total: session_ids.length,
        layout: requestedLayout || 'side-by-side',
        errors,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported, suggestLayout } = await import('./window-manager/index.js');

      if (!isWindowManagementSupported()) {
        const response: TileWindowsResultMessage = {
          type: 'tile_windows_result',
          success: false,
          positioned: 0,
          total: terminalKeys.length,
          layout: requestedLayout || 'side-by-side',
          errors: ['Window management not supported on this platform'],
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
        return;
      }

      const manager = createWindowManager();
      const layout = requestedLayout || suggestLayout(terminalKeys.length);

      // Get target display if specified
      let targetDisplay;
      if (display_id) {
        const displays = await manager.getDisplays();
        targetDisplay = displays.find(d => d.id === display_id);
      }

      logger.log(`Tiling ${terminalKeys.length} windows with layout: ${layout}`);
      const result = await manager.tileWindows(terminalKeys, layout, targetDisplay);

      const response: TileWindowsResultMessage = {
        type: 'tile_windows_result',
        success: result.success,
        positioned: result.positioned,
        total: result.total,
        layout,
        errors: [...errors, ...(result.errors || [])].length > 0 ? [...errors, ...(result.errors || [])] : undefined,
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }

      if (result.success) {
        logger.log(`Tiled ${result.positioned}/${result.total} windows`);

        // Update tile state for smart tiling
        const tileDisplay = targetDisplay || (await manager.getDisplays()).find(d => d.isPrimary) || (await manager.getDisplays())[0];
        if (tileDisplay) {
          const sessions = session_ids
            .map(id => {
              const s = registry.getSession(id);
              return s && s.terminal_key ? { terminalKey: s.terminal_key, sessionId: id } : null;
            })
            .filter((s): s is { terminalKey: string; sessionId: string } => s !== null);
          tileStateManager.buildFromManualTile(tileDisplay.id, tileDisplay.workArea, sessions);
        }
      } else {
        logger.log(`Partial tile: ${result.positioned}/${result.total} windows positioned`);
      }
    } catch (err) {
      logger.error(`Failed to tile windows: ${err}`);
      const response: TileWindowsResultMessage = {
        type: 'tile_windows_result',
        success: false,
        positioned: 0,
        total: terminalKeys.length,
        layout: requestedLayout || 'side-by-side',
        errors: [err instanceof Error ? err.message : String(err)],
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle maximize window request
   * Positions a terminal window to fill the entire work area
   */
  async function handleMaximizeWindow(
    ws: WebSocket,
    request: MaximizeWindowRequest
  ): Promise<void> {
    const session = registry.getSession(request.session_id);

    if (!session || !session.terminal_key) {
      const response: MaximizeWindowResultMessage = {
        type: 'maximize_window_result',
        session_id: request.session_id,
        success: false,
        error: !session ? `Session not found: ${request.session_id}` : 'Session has no terminal key',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported } = await import('./window-manager/index.js');

      if (!isWindowManagementSupported()) {
        const response: MaximizeWindowResultMessage = {
          type: 'maximize_window_result',
          session_id: request.session_id,
          success: false,
          error: 'Window management not supported on this platform',
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
        return;
      }

      const manager = createWindowManager();
      const displays = await manager.getDisplays();
      const primary = displays.find(d => d.isPrimary) || displays[0];

      if (!primary) {
        const response: MaximizeWindowResultMessage = {
          type: 'maximize_window_result',
          session_id: request.session_id,
          success: false,
          error: 'No display available',
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
        return;
      }

      logger.log(`Maximizing window for session ${request.session_id} (key: ${session.terminal_key})`);
      const result = await manager.positionWindow(session.terminal_key, primary.workArea);

      const response: MaximizeWindowResultMessage = {
        type: 'maximize_window_result',
        session_id: request.session_id,
        success: result.success,
        error: result.error,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (err) {
      logger.error(`Failed to maximize window: ${err}`);
      const response: MaximizeWindowResultMessage = {
        type: 'maximize_window_result',
        session_id: request.session_id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle position browser layout request
   * Positions browser and terminal(s) side by side with asymmetric split
   */
  async function handlePositionBrowserLayout(
    ws: WebSocket,
    request: PositionBrowserLayoutRequest
  ): Promise<void> {
    const { session_ids, layout } = request;

    if (!session_ids || session_ids.length === 0) {
      const response: PositionBrowserLayoutResultMessage = {
        type: 'position_browser_layout_result',
        success: false,
        layout,
        error: 'No session IDs provided',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    // Get terminal keys
    const terminalKeys: string[] = [];
    const errors: string[] = [];

    for (const sessionId of session_ids) {
      const session = registry.getSession(sessionId);
      if (!session) {
        errors.push(`Session not found: ${sessionId}`);
        continue;
      }
      if (!session.terminal_key) {
        errors.push(`Session has no terminal key: ${sessionId}`);
        continue;
      }
      terminalKeys.push(session.terminal_key);
    }

    if (terminalKeys.length === 0) {
      const response: PositionBrowserLayoutResultMessage = {
        type: 'position_browser_layout_result',
        success: false,
        layout,
        error: errors.join('; '),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported } = await import('./window-manager/index.js');
      const { calculateBrowserLayout } = await import('./window-manager/layouts.js');

      if (!isWindowManagementSupported()) {
        const response: PositionBrowserLayoutResultMessage = {
          type: 'position_browser_layout_result',
          success: false,
          layout,
          error: 'Window management not supported on this platform',
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
        return;
      }

      const manager = createWindowManager();
      const displays = await manager.getDisplays();
      const primary = displays.find(d => d.isPrimary) || displays[0];

      if (!primary) {
        const response: PositionBrowserLayoutResultMessage = {
          type: 'position_browser_layout_result',
          success: false,
          layout,
          error: 'No display available',
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
        return;
      }

      const validLayout = layout === 'browser-two-terminals' ? 'browser-two-terminals' : 'browser-terminal';
      const geometries = calculateBrowserLayout(primary.workArea, validLayout);

      logger.log(`Positioning browser layout: ${validLayout} with ${terminalKeys.length} terminal(s)`);

      // Position browser window (macOS only for now)
      const macManager = manager as import('./window-manager/macos-manager.js').MacOSWindowManager;
      let browserSuccess = false;
      if (typeof macManager.positionBrowserWindow === 'function') {
        const browserResult = await macManager.positionBrowserWindow(geometries.browser);
        browserSuccess = browserResult.success;
        if (!browserResult.success && browserResult.error) {
          errors.push(`Browser: ${browserResult.error}`);
        }
      } else {
        errors.push('Browser positioning not supported on this platform');
      }

      // Position terminal(s)
      let terminalsPositioned = 0;
      for (let i = 0; i < terminalKeys.length && i < geometries.terminals.length; i++) {
        const result = await manager.positionWindow(terminalKeys[i], geometries.terminals[i]);
        if (result.success) {
          terminalsPositioned++;
        } else if (result.error) {
          errors.push(`Terminal ${i}: ${result.error}`);
        }
        // Small delay between window operations
        if (i < terminalKeys.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const response: PositionBrowserLayoutResultMessage = {
        type: 'position_browser_layout_result',
        success: browserSuccess && terminalsPositioned === Math.min(terminalKeys.length, geometries.terminals.length),
        layout: validLayout,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (err) {
      logger.error(`Failed to position browser layout: ${err}`);
      const response: PositionBrowserLayoutResultMessage = {
        type: 'position_browser_layout_result',
        success: false,
        layout,
        error: err instanceof Error ? err.message : String(err),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle launch session request
   * Opens a new terminal window in the given directory and runs claude
   */
  async function handleLaunchSession(
    ws: WebSocket,
    request: LaunchSessionRequest
  ): Promise<void> {
    const { cwd, preferred_terminal, dangerously_skip_permissions } = request;

    if (!cwd) {
      const response: LaunchSessionResultMessage = {
        type: 'launch_session_result',
        success: false,
        method: 'unsupported',
        cwd: cwd || '',
        error: 'Missing cwd',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    logger.log(`Launching new terminal session in ${cwd}`);

    try {
      const result = await launchTerminalSession({
        cwd,
        preferredTerminal: preferred_terminal,
        dangerouslySkipPermissions: dangerously_skip_permissions,
      });

      const response: LaunchSessionResultMessage = {
        type: 'launch_session_result',
        success: result.success,
        method: result.method,
        cwd,
        error: result.error,
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }

      if (result.success) {
        logger.log(`Launched terminal (${result.method}) in ${cwd}`);
      } else {
        logger.error(`Failed to launch terminal: ${result.error}`);
      }
    } catch (err) {
      logger.error(`Failed to launch terminal: ${err}`);
      const response: LaunchSessionResultMessage = {
        type: 'launch_session_result',
        success: false,
        method: 'unsupported',
        cwd,
        error: err instanceof Error ? err.message : String(err),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle list worktrees request
   * Lists all worktrees with their status (uncommitted changes, merged to main)
   */
  async function handleListWorktrees(
    ws: WebSocket,
    request: ListWorktreesRequest
  ): Promise<void> {
    const { repo_root } = request;

    if (!repo_root) {
      const response: ListWorktreesResultMessage = {
        type: 'list_worktrees_result',
        success: false,
        error: 'Missing repo_root',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    logger.log(`Listing worktrees for ${repo_root}`);

    try {
      const worktrees = await listWorktreesWithStatus(repo_root);

      const response: ListWorktreesResultMessage = {
        type: 'list_worktrees_result',
        success: true,
        worktrees: worktrees.map(w => ({
          name: w.name,
          path: w.path,
          branch: w.branch,
          isMain: w.isMain,
          status: w.status,
        })),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    } catch (err) {
      logger.error(`Failed to list worktrees: ${err}`);
      const response: ListWorktreesResultMessage = {
        type: 'list_worktrees_result',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle remove worktree request
   * Removes a git worktree and optionally deletes its branch
   */
  async function handleRemoveWorktree(
    ws: WebSocket,
    request: RemoveWorktreeRequest
  ): Promise<void> {
    const { repo_root, worktree_path, force, delete_branch } = request;

    if (!repo_root || !worktree_path) {
      const response: RemoveWorktreeResultMessage = {
        type: 'remove_worktree_result',
        success: false,
        error: 'Missing repo_root or worktree_path',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    logger.log(`Removing worktree at ${worktree_path}${force ? ' (force)' : ''}`);

    try {
      const result = await removeWorktree({
        repoRoot: repo_root,
        worktreePath: worktree_path,
        force,
        deleteBranch: delete_branch,
      });

      const response: RemoveWorktreeResultMessage = {
        type: 'remove_worktree_result',
        success: result.success,
        worktree_path: result.success ? worktree_path : undefined,
        branch_deleted: result.branchDeleted,
        error: result.error,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }

      if (result.success) {
        logger.log(`Worktree removed: ${worktree_path}${result.branchDeleted ? ' (branch deleted)' : ''}`);
      }
    } catch (err) {
      logger.error(`Failed to remove worktree: ${err}`);
      const response: RemoveWorktreeResultMessage = {
        type: 'remove_worktree_result',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle create worktree request
   * Creates a new git worktree and optionally launches a Claude session in it
   */
  async function handleCreateWorktree(
    ws: WebSocket,
    request: CreateWorktreeRequest
  ): Promise<void> {
    const { repo_root, name, base_branch, launch_session: shouldLaunch, dangerously_skip_permissions } = request;

    if (!repo_root || !name) {
      const response: CreateWorktreeResultMessage = {
        type: 'create_worktree_result',
        success: false,
        error: 'Missing repo_root or name',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    logger.log(`Creating worktree '${name}' in ${repo_root}`);

    try {
      const result = await createWorktree({
        repoRoot: repo_root,
        name,
        baseBranch: base_branch,
      });

      if (!result.success) {
        const response: CreateWorktreeResultMessage = {
          type: 'create_worktree_result',
          success: false,
          error: result.error,
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
        return;
      }

      let sessionLaunched = false;
      let launchMethod: string | undefined;

      // Launch session in the new worktree (default: true)
      if (shouldLaunch !== false && result.worktreePath) {
        try {
          // Use smart-tile-add logic to position the new terminal
          let targetBounds: { x: number; y: number; width: number; height: number } | undefined;
          try {
            const { createWindowManager, isWindowManagementSupported } = await import('./window-manager/index.js');
            if (isWindowManagementSupported()) {
              const manager = createWindowManager();
              const displays = await manager.getDisplays();

              // Determine target display: tile state → majority vote → primary
              let targetDisplay = tileStateManager.getAnyTileState()
                ? displays.find(d => d.id === tileStateManager.getAnyTileState()!.displayId)
                : null;

              if (!targetDisplay && displays.length > 1) {
                const terminalKeys = registry.getAllSessions().map(s => s.terminal_key).filter(Boolean);
                if (terminalKeys.length > 0 && typeof (manager as any).getTargetDisplayForTerminals === 'function') {
                  targetDisplay = await (manager as any).getTargetDisplayForTerminals(terminalKeys);
                }
              }
              if (!targetDisplay) {
                targetDisplay = displays.find(d => d.isPrimary) || displays[0];
              }

              if (targetDisplay) {
                const workArea = targetDisplay.workArea;
                const tileState = tileStateManager.getTileState(targetDisplay.id);

                // Validate tile state
                let tileStateValid = false;
                if (tileState && tileState.slots.length > 0) {
                  if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
                    tileStateValid = await validateTileStateWithBounds(
                      tileState,
                      (key: string) => (manager as any).getWindowBounds(key),
                    );
                  } else {
                    tileStateValid = validateTileStateBySessions(
                      tileState,
                      (sessionId: string) => registry.getSession(sessionId) !== undefined,
                    );
                  }
                }

                if (tileStateValid && tileState && tileState.slots.length < 8) {
                  // Smart tile: extend existing layout
                  const existingSlots: ExistingSlot[] = tileState.slots.map(s => ({
                    terminalKey: s.terminalKey,
                    sessionId: s.sessionId,
                    column: s.column,
                    row: s.row,
                    geometry: s.geometry,
                  }));

                  const transition = planSmartTileTransition(existingSlots, workArea);
                  if (transition) {
                    // Reposition existing windows
                    for (const repo of transition.repositions) {
                      await manager.positionWindow(repo.terminalKey, repo.newGeometry);
                      await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    targetBounds = transition.newWindowGeometry;

                    // Update tile state
                    const newSlots = [...tileState.slots.map(s => {
                      const repo = transition.repositions.find(r => r.sessionId === s.sessionId);
                      if (repo) {
                        return { ...s, geometry: repo.newGeometry, column: repo.newColumn, row: repo.newRow };
                      }
                      return s;
                    })];
                    newSlots.push({
                      terminalKey: 'PENDING',
                      sessionId: 'PENDING',
                      geometry: transition.newWindowGeometry,
                      column: transition.newColumn,
                      row: transition.newRow,
                    });
                    tileStateManager.setTileState(targetDisplay.id, {
                      displayId: targetDisplay.id,
                      workArea,
                      columnsPerRow: transition.newGrid.columnsPerRow,
                      slots: newSlots,
                      tiledAt: Date.now(),
                    });
                  } else {
                    targetBounds = findFreeSpace(workArea, tileState.slots.map(s => s.geometry));
                  }
                } else {
                  // No valid tile state — use free space
                  const existingBounds: { x: number; y: number; width: number; height: number }[] = [];
                  if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
                    for (const session of registry.getAllSessions()) {
                      if (session.terminal_key) {
                        const bounds = await (manager as any).getWindowBounds(session.terminal_key);
                        if (bounds) existingBounds.push(bounds);
                      }
                    }
                  }
                  targetBounds = findFreeSpace(workArea, existingBounds);
                }
              }
            }
          } catch {
            // Window management not available, launch without targeting
          }

          const launchResult = await launchTerminalSession({
            cwd: result.worktreePath,
            targetBounds,
            dangerouslySkipPermissions: dangerously_skip_permissions,
          });

          sessionLaunched = launchResult.success;
          launchMethod = launchResult.method;

          if (launchResult.success) {
            logger.log(`Launched terminal (${launchResult.method}) in new worktree ${result.worktreePath}`);
          } else {
            logger.warn(`Failed to launch terminal in worktree: ${launchResult.error}`);
          }
        } catch (err) {
          logger.warn(`Failed to launch terminal in worktree: ${err}`);
        }
      }

      const response: CreateWorktreeResultMessage = {
        type: 'create_worktree_result',
        success: true,
        worktree_path: result.worktreePath,
        branch: result.branch,
        session_launched: sessionLaunched,
        launch_method: launchMethod,
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }

      logger.log(`Worktree '${name}' created at ${result.worktreePath}`);
    } catch (err) {
      logger.error(`Failed to create worktree: ${err}`);
      const response: CreateWorktreeResultMessage = {
        type: 'create_worktree_result',
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle smart tile add request.
   * Launches a terminal and smartly tiles it into the existing layout,
   * or places it in free space if no tiled layout is active.
   */
  async function handleSmartTileAdd(
    ws: WebSocket,
    request: SmartTileAddRequest
  ): Promise<void> {
    const { launch_cwd, new_session_id, display_id, dangerously_skip_permissions } = request;

    if (!launch_cwd && !new_session_id) {
      const response: SmartTileAddResultMessage = {
        type: 'smart_tile_add_result',
        success: false,
        repositioned: 0,
        total_tiled: 0,
        used_free_space: false,
        error: 'Missing launch_cwd or new_session_id',
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
      return;
    }

    try {
      const { createWindowManager, isWindowManagementSupported } = await import('./window-manager/index.js');

      if (!isWindowManagementSupported()) {
        // Fall back to plain launch without positioning
        if (launch_cwd) {
          const launchResult = await launchTerminalSession({ cwd: launch_cwd, dangerouslySkipPermissions: dangerously_skip_permissions });
          const response: SmartTileAddResultMessage = {
            type: 'smart_tile_add_result',
            success: launchResult.success,
            repositioned: 0,
            total_tiled: 0,
            used_free_space: true,
            launch_method: launchResult.method,
            error: launchResult.error,
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
          }
        }
        return;
      }

      const manager = createWindowManager();
      const displays = await manager.getDisplays();

      // Determine target display
      let targetDisplay = display_id
        ? displays.find(d => d.id === display_id)
        : null;

      if (!targetDisplay) {
        // Try to get display from tile state
        const anyState = tileStateManager.getAnyTileState();
        if (anyState) {
          targetDisplay = displays.find(d => d.id === anyState.displayId);
        }
      }

      if (!targetDisplay && displays.length > 1) {
        // macOS majority vote
        const terminalKeys = registry.getAllSessions().map(s => s.terminal_key).filter(Boolean);
        if (terminalKeys.length > 0 && typeof (manager as any).getTargetDisplayForTerminals === 'function') {
          targetDisplay = await (manager as any).getTargetDisplayForTerminals(terminalKeys);
        }
      }

      if (!targetDisplay) {
        targetDisplay = displays.find(d => d.isPrimary) || displays[0];
      }

      if (!targetDisplay) {
        const response: SmartTileAddResultMessage = {
          type: 'smart_tile_add_result',
          success: false,
          repositioned: 0,
          total_tiled: 0,
          used_free_space: false,
          error: 'No display available',
        };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response));
        }
        return;
      }

      const workArea = targetDisplay.workArea;
      let tileState = tileStateManager.getTileState(targetDisplay.id);

      // Validate tile state
      let tileStateValid = false;
      if (tileState && tileState.slots.length > 0) {
        if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
          // macOS: validate by reading actual window bounds
          const macManager = manager as any;
          tileStateValid = await validateTileStateWithBounds(
            tileState,
            (key: string) => macManager.getWindowBounds(key),
          );
        } else {
          // Windows/Linux: validate by checking sessions still alive
          tileStateValid = validateTileStateBySessions(
            tileState,
            (sessionId: string) => registry.getSession(sessionId) !== undefined,
          );
        }
      }

      let targetBounds: { x: number; y: number; width: number; height: number };
      let repositioned = 0;
      let totalTiled = 0;
      let usedFreeSpace = false;

      if (tileStateValid && tileState && tileState.slots.length < 8) {
        // Smart tile: extend existing layout
        const existingSlots: ExistingSlot[] = tileState.slots.map(s => ({
          terminalKey: s.terminalKey,
          sessionId: s.sessionId,
          column: s.column,
          row: s.row,
          geometry: s.geometry,
        }));

        const transition = planSmartTileTransition(existingSlots, workArea);

        if (transition) {
          // Reposition existing windows
          for (const repo of transition.repositions) {
            const result = await manager.positionWindow(repo.terminalKey, repo.newGeometry);
            if (result.success) {
              repositioned++;
            } else {
              logger.warn(`Failed to reposition ${repo.terminalKey}: ${result.error}`);
            }
            // Small delay between repositions
            if (transition.repositions.indexOf(repo) < transition.repositions.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }

          targetBounds = transition.newWindowGeometry;
          totalTiled = tileState.slots.length + 1;

          // Update tile state with new grid (will be finalized after launch)
          const newSlots = [...tileState.slots.map((s, i) => {
            const repo = transition.repositions.find(r => r.sessionId === s.sessionId);
            if (repo) {
              return { ...s, geometry: repo.newGeometry, column: repo.newColumn, row: repo.newRow };
            }
            return s;
          })];

          // Add placeholder for the new terminal
          newSlots.push({
            terminalKey: new_session_id ? (registry.getSession(new_session_id)?.terminal_key || 'PENDING') : 'PENDING',
            sessionId: new_session_id || 'PENDING',
            geometry: transition.newWindowGeometry,
            column: transition.newColumn,
            row: transition.newRow,
          });

          tileStateManager.setTileState(targetDisplay.id, {
            displayId: targetDisplay.id,
            workArea,
            columnsPerRow: transition.newGrid.columnsPerRow,
            slots: newSlots,
            tiledAt: Date.now(),
          });
        } else {
          // Beyond 8 — use free space
          const existingBounds = tileState.slots.map(s => s.geometry);
          targetBounds = findFreeSpace(workArea, existingBounds);
          totalTiled = tileState.slots.length;
          usedFreeSpace = true;
        }
      } else {
        // No valid tile state — use free space
        const existingBounds: { x: number; y: number; width: number; height: number }[] = [];

        // On macOS, try to get actual window bounds for free space calculation
        if (process.platform === 'darwin' && typeof (manager as any).getWindowBounds === 'function') {
          const macManager = manager as any;
          const allSessions = registry.getAllSessions();
          for (const session of allSessions) {
            if (session.terminal_key) {
              const bounds = await macManager.getWindowBounds(session.terminal_key);
              if (bounds) existingBounds.push(bounds);
            }
          }
        } else if (tileState) {
          // On Windows/Linux, use tracked bounds
          existingBounds.push(...tileState.slots.map(s => s.geometry));
        }

        targetBounds = findFreeSpace(workArea, existingBounds);
        usedFreeSpace = true;
      }

      // Launch or position the terminal
      let launchMethod: string | undefined;

      if (launch_cwd) {
        const launchResult = await launchTerminalSession({
          cwd: launch_cwd,
          targetBounds,
          dangerouslySkipPermissions: dangerously_skip_permissions,
        });
        launchMethod = launchResult.method;

        if (launchResult.success) {
          logger.log(`Smart tile: launched terminal (${launchResult.method}) in ${launch_cwd}`);
        } else {
          logger.warn(`Smart tile: failed to launch terminal: ${launchResult.error}`);
          const response: SmartTileAddResultMessage = {
            type: 'smart_tile_add_result',
            success: false,
            repositioned,
            total_tiled: totalTiled,
            used_free_space: usedFreeSpace,
            launch_method: launchResult.method,
            error: launchResult.error,
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
          }
          return;
        }
      } else if (new_session_id) {
        const session = registry.getSession(new_session_id);
        if (session?.terminal_key) {
          await manager.positionWindow(session.terminal_key, targetBounds);
        }
      }

      const response: SmartTileAddResultMessage = {
        type: 'smart_tile_add_result',
        success: true,
        repositioned,
        total_tiled: totalTiled,
        used_free_space: usedFreeSpace,
        launch_method: launchMethod,
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }

      logger.log(`Smart tile: ${usedFreeSpace ? 'free-space' : 'grid'} placement, ${repositioned} repositioned, ${totalTiled} total`);
    } catch (err) {
      logger.error(`Smart tile failed: ${err}`);
      const response: SmartTileAddResultMessage = {
        type: 'smart_tile_add_result',
        success: false,
        repositioned: 0,
        total_tiled: 0,
        used_free_space: false,
        error: err instanceof Error ? err.message : String(err),
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response));
      }
    }
  }

  /**
   * Handle update notification settings request
   */
  function handleUpdateNotificationSettings(
    ws: WebSocket,
    request: UpdateNotificationSettingsRequest
  ): void {
    const updated = notificationService.updateSettings(request.settings);
    const response: NotificationSettingsMessage = {
      type: 'notification_settings',
      settings: updated,
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
    logger.log(`Notification settings updated: desktop=${updated.enabled}`);
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
