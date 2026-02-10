/**
 * WebSocket Client
 *
 * Connects to the Jacques server and receives session updates.
 * Handles reconnection and event dispatching.
 */

import WebSocket from "ws";
import { EventEmitter } from "events";
import type { ServerMessage, ClientMessage, Session } from "../types.js";

const DEFAULT_SERVER_URL = "ws://localhost:4242";
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

export interface JacquesClientOptions {
  /** Suppress console output */
  silent?: boolean;
}

export interface JacquesClientEvents {
  connected: () => void;
  disconnected: () => void;
  initial_state: (sessions: Session[], focusedSessionId: string | null) => void;
  session_update: (session: Session) => void;
  session_removed: (sessionId: string) => void;
  focus_changed: (sessionId: string | null, session: Session | null) => void;
  autocompact_toggled: (enabled: boolean, warning?: string) => void;
  handoff_ready: (sessionId: string, path: string) => void;
  focus_terminal_result: (sessionId: string, success: boolean, method: string, error?: string) => void;
  notification_fired: (notification: { id: string; category: string; title: string; body: string; priority: string; timestamp: number; sessionId?: string }) => void;
  error: (error: Error) => void;
}

/**
 * Jacques WebSocket Client
 *
 * Connects to the Jacques server and emits events for dashboard updates.
 */
export class JacquesClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = RECONNECT_DELAY;
  private shouldReconnect = true;
  private isConnected = false;
  private log: (...args: unknown[]) => void;
  private error: (...args: unknown[]) => void;
  private warn: (...args: unknown[]) => void;

  constructor(serverUrl: string = DEFAULT_SERVER_URL, options: JacquesClientOptions = {}) {
    super();
    this.serverUrl = serverUrl;
    this.log = options.silent ? () => {} : console.log.bind(console);
    this.error = options.silent ? () => {} : console.error.bind(console);
    this.warn = options.silent ? () => {} : console.warn.bind(console);
  }

  /**
   * Connect to the Jacques server
   */
  connect(): void {
    if (this.ws) {
      return;
    }

    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on("open", () => {
        this.isConnected = true;
        this.reconnectDelay = RECONNECT_DELAY;
        this.log("[Client] Connected to Jacques server");
        this.emit("connected");
      });

      this.ws.on("message", (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on("close", () => {
        this.isConnected = false;
        this.ws = null;
        this.log("[Client] Disconnected from Jacques server");
        this.emit("disconnected");
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        this.error(`[Client] WebSocket error: ${err.message}`);
        this.emit("error", err);
      });
    } catch (err) {
      this.error(`[Client] Connection error: ${err}`);
      this.emit("error", err as Error);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as ServerMessage;

      switch (message.type) {
        case "initial_state":
          this.emit("initial_state", message.sessions, message.focused_session_id);
          break;

        case "session_update":
          this.emit("session_update", message.session);
          break;

        case "session_removed":
          this.emit("session_removed", message.session_id);
          break;

        case "focus_changed":
          this.emit("focus_changed", message.session_id, message.session);
          break;

        case "autocompact_toggled":
          this.emit("autocompact_toggled", message.enabled, message.warning);
          break;

        case "handoff_ready":
          this.emit("handoff_ready", message.session_id, message.path);
          break;

        case "focus_terminal_result":
          this.emit("focus_terminal_result", message.session_id, message.success, message.method, message.error);
          break;

        case "notification_fired":
          this.emit("notification_fired", message.notification);
          break;

        default:
          this.warn(
            `[Client] Unknown message type: ${(message as ServerMessage).type}`
          );
      }
    } catch (err) {
      this.error(`[Client] Failed to parse message: ${err}`);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimeout) {
      return;
    }

    this.log(`[Client] Reconnecting in ${this.reconnectDelay / 1000}s...`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  /**
   * Send message to server
   */
  send(message: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.warn("[Client] Cannot send message: not connected");
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (err) {
      this.error(`[Client] Failed to send message: ${err}`);
      return false;
    }
  }

  /**
   * Select a session (request focus change)
   */
  selectSession(sessionId: string): boolean {
    return this.send({
      type: "select_session",
      session_id: sessionId,
    });
  }

  /**
   * Trigger an action on a session
   */
  triggerAction(
    sessionId: string,
    action: "smart_compact" | "new_session" | "save_snapshot",
    options?: Record<string, unknown>
  ): boolean {
    return this.send({
      type: "trigger_action",
      session_id: sessionId,
      action,
      options,
    });
  }

  /**
   * Focus a terminal window for a session
   */
  focusTerminal(sessionId: string): boolean {
    return this.send({
      type: "focus_terminal",
      session_id: sessionId,
    });
  }

  /**
   * Toggle auto-compact setting in ~/.claude/settings.json
   */
  toggleAutoCompact(): boolean {
    return this.send({
      type: "toggle_autocompact",
    });
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      try {
        // Only close if the websocket is open or connecting
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close(1000, "Client disconnecting");
        }
      } catch (err) {
        // Ignore errors during disconnect
      }
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }
}
