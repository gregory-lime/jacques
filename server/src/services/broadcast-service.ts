/**
 * Broadcast Service
 *
 * Unified broadcasting service that combines session updates
 * with focus change notifications. Eliminates repeated broadcast
 * patterns in event handlers.
 */

import type { Session } from '../types.js';
import type { JacquesWebSocketServer } from '../websocket.js';
import type { SessionRegistry } from '../session-registry.js';
import type { Logger } from '../logging/logger-factory.js';
import { createLogger } from '../logging/logger-factory.js';

/**
 * Configuration for the BroadcastService
 */
export interface BroadcastServiceConfig {
  /** WebSocket server for broadcasting */
  wsServer: JacquesWebSocketServer;
  /** Session registry for focus information */
  registry: SessionRegistry;
  /** Optional logger */
  logger?: Logger;
}

/**
 * BroadcastService - handles unified session and focus broadcasting
 *
 * Instead of calling:
 *   wsServer.broadcastSessionUpdate(session);
 *   broadcastFocusChange();
 *
 * Use:
 *   broadcastService.broadcastSessionWithFocus(session);
 */
export class BroadcastService {
  private wsServer: JacquesWebSocketServer;
  private registry: SessionRegistry;
  private logger: Logger;
  private lastBroadcastedFocusId: string | null | undefined = undefined;

  constructor(config: BroadcastServiceConfig) {
    this.wsServer = config.wsServer;
    this.registry = config.registry;
    this.logger = config.logger ?? createLogger({ silent: true });
  }

  /**
   * Broadcast a session update along with focus change
   *
   * @param session The session that was updated
   */
  broadcastSessionWithFocus(session: Session): void {
    this.wsServer.broadcastSessionUpdate(session);
    this.broadcastFocusChange();
  }

  /**
   * Broadcast session removal along with focus change
   *
   * @param sessionId The ID of the removed session
   */
  broadcastSessionRemovedWithFocus(sessionId: string): void {
    this.wsServer.broadcastSessionRemoved(sessionId);
    this.forceBroadcastFocusChange();
  }

  /**
   * Broadcast only the session update (no focus change)
   *
   * Use when focus should not be affected (e.g., idle status)
   *
   * @param session The session that was updated
   */
  broadcastSessionUpdate(session: Session): void {
    this.wsServer.broadcastSessionUpdate(session);
  }

  /**
   * Broadcast only the focus change (skips if focus hasn't changed)
   */
  broadcastFocusChange(): void {
    const focusedId = this.registry.getFocusedSessionId();
    if (focusedId === this.lastBroadcastedFocusId) return;
    this.lastBroadcastedFocusId = focusedId;
    const focusedSession = focusedId ? this.registry.getSession(focusedId) ?? null : null;
    this.wsServer.broadcastFocusChange(focusedId, focusedSession);
  }

  /**
   * Force broadcast focus change (used when focus must be re-sent, e.g. session removal)
   */
  forceBroadcastFocusChange(): void {
    const focusedId = this.registry.getFocusedSessionId();
    this.lastBroadcastedFocusId = focusedId;
    const focusedSession = focusedId ? this.registry.getSession(focusedId) ?? null : null;
    this.wsServer.broadcastFocusChange(focusedId, focusedSession);
  }
}
