/**
 * WebSocket Server
 * 
 * Broadcasts session updates to connected dashboard clients.
 * Listens on port 4242 by default.
 */

import { WebSocketServer, WebSocket } from 'ws';
import type {
  Session,
  ServerMessage,
  ClientMessage,
  InitialStateMessage,
  SessionUpdateMessage,
  SessionRemovedMessage,
  FocusChangedMessage,
  ClaudeOperationMessage,
  ApiLogMessage,
  CatalogUpdatedMessage,
} from './types.js';
import type { ClaudeOperation } from '@jacques-ai/core';
import type { Logger } from './logging/logger-factory.js';
import { createLogger } from './logging/logger-factory.js';

/**
 * WebSocket Server configuration
 */
export interface WebSocketServerConfig {
  port: number;
  onClientMessage?: (ws: WebSocket, message: ClientMessage) => void;
  onClientDisconnect?: (ws: WebSocket) => void;
  /** Suppress console output */
  silent?: boolean;
  /** Optional logger for dependency injection */
  logger?: Logger;
}

/**
 * State provider interface
 */
export interface StateProvider {
  getAllSessions: () => Session[];
  getFocusedSessionId: () => string | null;
  getFocusedSession: () => Session | null;
  isScanning?: () => boolean;
}

/**
 * WebSocket Server for dashboard clients
 */
export class JacquesWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private port: number;
  private onClientMessage?: (ws: WebSocket, message: ClientMessage) => void;
  private stateProvider: StateProvider | null = null;
  private logger: Logger;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private aliveClients = new WeakSet<WebSocket>();

  private onClientDisconnect?: (ws: WebSocket) => void;

  constructor(config: WebSocketServerConfig) {
    this.port = config.port;
    this.onClientMessage = config.onClientMessage;
    this.onClientDisconnect = config.onClientDisconnect;
    // Support both old silent flag and new logger injection
    this.logger = config.logger ?? createLogger({ silent: config.silent });
  }

  // Convenience accessors for logging (messages already include [WebSocket] prefix)
  private get log() { return this.logger.log.bind(this.logger); }
  private get error() { return this.logger.error.bind(this.logger); }

  /**
   * Set the state provider for initial state
   */
  setStateProvider(provider: StateProvider): void {
    this.stateProvider = provider;
  }

  /**
   * Start the WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws: WebSocket) => {
          this.handleConnection(ws);
        });

        this.wss.on('error', (err) => {
          this.error(`[WebSocket] Server error: ${err.message}`);
          reject(err);
        });

        this.wss.on('listening', () => {
          this.log(`[WebSocket] Listening on port: ${this.port}`);
          this.startHeartbeat();
          resolve();
        });

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle new client connection
   */
  private handleConnection(ws: WebSocket): void {
    this.log('[WebSocket] Client connected');
    this.clients.add(ws);
    this.aliveClients.add(ws);

    ws.on('pong', () => {
      this.aliveClients.add(ws);
    });

    // Send initial state
    if (this.stateProvider) {
      const initialState: InitialStateMessage = {
        type: 'initial_state',
        sessions: this.stateProvider.getAllSessions(),
        focused_session_id: this.stateProvider.getFocusedSessionId(),
        scanning: this.stateProvider.isScanning?.() ?? false,
      };
      this.sendToClient(ws, initialState);
    }

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        this.log(`[WebSocket] Received message: ${message.type}`);

        if (this.onClientMessage) {
          this.onClientMessage(ws, message);
        }
      } catch (err) {
        this.error(`[WebSocket] Invalid message from client: ${err}`);
      }
    });

    ws.on('close', () => {
      this.log('[WebSocket] Client disconnected');
      this.clients.delete(ws);
      if (this.onClientDisconnect) {
        this.onClientDisconnect(ws);
      }
    });

    ws.on('error', (err) => {
      this.error(`[WebSocket] Client error: ${err.message}`);
      this.clients.delete(ws);
    });
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    let sentCount = 0;

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        sentCount++;
      }
    }

    if (sentCount > 0) {
      this.log(`[WebSocket] Broadcast ${message.type} to ${sentCount} client(s)`);
    }
  }

  /**
   * Broadcast session update
   */
  broadcastSessionUpdate(session: Session): void {
    const message: SessionUpdateMessage = {
      type: 'session_update',
      session,
    };
    this.broadcast(message);
  }

  /**
   * Broadcast session removed
   */
  broadcastSessionRemoved(sessionId: string): void {
    this.log(`[WebSocket] Broadcasting session_removed: ${sessionId} to ${this.clients.size} clients`);
    const message: SessionRemovedMessage = {
      type: 'session_removed',
      session_id: sessionId,
    };
    this.broadcast(message);
  }

  /**
   * Broadcast focus change
   */
  broadcastFocusChange(sessionId: string | null, session: Session | null): void {
    const message: FocusChangedMessage = {
      type: 'focus_changed',
      session_id: sessionId,
      session,
    };
    this.broadcast(message);
  }

  /**
   * Broadcast Claude operation (e.g., LLM handoff)
   */
  broadcastClaudeOperation(operation: ClaudeOperation): void {
    const message: ClaudeOperationMessage = {
      type: 'claude_operation',
      operation: {
        id: operation.id,
        timestamp: operation.timestamp,
        operation: operation.operation,
        phase: operation.phase,
        inputTokens: operation.inputTokens,
        outputTokens: operation.outputTokens,
        totalTokens: operation.totalTokens,
        cacheReadTokens: operation.cacheReadTokens,
        durationMs: operation.durationMs,
        success: operation.success,
        errorMessage: operation.errorMessage,
        userPromptChars: operation.userPromptChars,
        systemPromptChars: operation.systemPromptChars,
        userPromptTokensEst: operation.userPromptTokensEst,
        systemPromptTokensEst: operation.systemPromptTokensEst,
        outputLength: operation.outputLength,
        userPromptPreview: operation.userPromptPreview,
        systemPromptPreview: operation.systemPromptPreview,
      },
    };
    this.broadcast(message);
  }

  /**
   * Broadcast catalog update notification
   */
  broadcastCatalogUpdate(projectPath: string, action: CatalogUpdatedMessage['action'], itemId?: string): void {
    const message: CatalogUpdatedMessage = {
      type: 'catalog_updated',
      projectPath,
      action,
      itemId,
    };
    this.broadcast(message);
  }

  /**
   * Broadcast API log
   */
  broadcastApiLog(log: Omit<ApiLogMessage, 'type'>): void {
    const message: ApiLogMessage = {
      type: 'api_log',
      ...log,
    };
    this.broadcast(message);
  }

  /**
   * Start ping/pong heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!this.aliveClients.has(client)) {
          this.log('[WebSocket] Terminating stale client');
          this.clients.delete(client);
          client.terminate();
          continue;
        }
        this.aliveClients.delete(client);
        client.ping();
      }
    }, 30_000);
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Stop the WebSocket server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.wss) {
        resolve();
        return;
      }

      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      // Close all client connections
      for (const client of this.clients) {
        try {
          client.close(1000, 'Server shutting down');
        } catch (err) {
          // Ignore errors during shutdown
        }
      }
      this.clients.clear();

      this.wss.close(() => {
        this.log('[WebSocket] Server closed');
        this.wss = null;
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.wss !== null;
  }
}
