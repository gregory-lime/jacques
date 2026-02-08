/**
 * Unix Socket Server
 * 
 * Listens on /tmp/jacques.sock for hook events and statusLine updates.
 * Events are newline-delimited JSON.
 */

import { createServer, connect, Server, Socket } from 'net';
import { unlinkSync, existsSync } from 'fs';
import type { HookEvent } from './types.js';
import type { Logger } from './logging/logger-factory.js';
import { createLogger } from './logging/logger-factory.js';

/**
 * Event handler callback type
 */
export type EventHandler = (event: HookEvent) => void;

/**
 * Unix Socket Server configuration
 */
export interface UnixSocketConfig {
  socketPath: string;
  onEvent: EventHandler;
  onError?: (error: Error) => void;
  /** Suppress console output */
  silent?: boolean;
  /** Optional logger for dependency injection */
  logger?: Logger;
}

/**
 * Unix Socket Server for receiving hook events
 */
export class UnixSocketServer {
  private server: Server | null = null;
  private socketPath: string;
  private onEvent: EventHandler;
  private onError?: (error: Error) => void;
  private isShuttingDown = false;
  private logger: Logger;

  constructor(config: UnixSocketConfig) {
    this.socketPath = config.socketPath;
    this.onEvent = config.onEvent;
    this.onError = config.onError;
    // Support both old silent flag and new logger injection
    this.logger = config.logger ?? createLogger({ silent: config.silent });
  }

  // Convenience accessors for logging (messages already include [UnixSocket] prefix)
  private get log() { return this.logger.log.bind(this.logger); }
  private get error() { return this.logger.error.bind(this.logger); }
  private get warn() { return this.logger.warn.bind(this.logger); }

  /**
   * Check if a Unix socket has an active listener
   */
  private isSocketAlive(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const client = connect({ path }, () => {
        client.end();
        resolve(true);
      });
      client.on('error', () => resolve(false));
      const timeout = setTimeout(() => { client.destroy(); resolve(false); }, 1000);
      client.on('close', () => clearTimeout(timeout));
    });
  }

  /**
   * Start listening on the IPC socket (Unix socket or Windows Named Pipe)
   */
  async start(): Promise<void> {
    const isWindows = process.platform === 'win32';

    // Clean up old socket if it exists (not needed for Windows Named Pipes)
    if (!isWindows && existsSync(this.socketPath)) {
      if (await this.isSocketAlive(this.socketPath)) {
        throw new Error(`Another Jacques server is listening on ${this.socketPath}`);
      }
      try {
        unlinkSync(this.socketPath);
        this.log(`[UnixSocket] Removed stale socket: ${this.socketPath}`);
      } catch (err) {
        this.error(`[UnixSocket] Failed to remove stale socket: ${err}`);
      }
    } else if (isWindows) {
      // On Windows, check if pipe is already in use
      if (await this.isSocketAlive(this.socketPath)) {
        throw new Error(`Another Jacques server is listening on ${this.socketPath}`);
      }
    }

    return new Promise((resolve, reject) => {

      this.server = createServer((socket: Socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        this.error(`[UnixSocket] Server error: ${err.message}`);
        if (this.onError) {
          this.onError(err);
        }
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        this.log(`[UnixSocket] Listening on: ${this.socketPath}`);
        resolve();
      });
    });
  }

  /**
   * Handle incoming connection
   */
  private handleConnection(socket: Socket): void {
    let buffer = '';

    socket.on('data', (data: Buffer) => {
      buffer += data.toString();

      // Process complete lines (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.processLine(line);
        }
      }
    });

    socket.on('end', () => {
      // Process any remaining data in buffer
      if (buffer.trim()) {
        this.processLine(buffer);
      }
    });

    socket.on('error', (err) => {
      // Ignore connection reset errors during shutdown
      if (this.isShuttingDown) return;

      this.error(`[UnixSocket] Connection error: ${err.message}`);
    });
  }

  /**
   * Process a single line of JSON
   */
  private processLine(line: string): void {
    try {
      const event = JSON.parse(line) as HookEvent;

      // Validate required fields
      if (!event.event || !event.session_id) {
        this.warn(`[UnixSocket] Invalid event (missing event/session_id): ${line.substring(0, 100)}`);
        return;
      }

      // Normalize timestamp: some hooks send seconds (time.time(), date +%s),
      // but the server expects milliseconds (Date.now()). Timestamps below
      // 1e12 are in seconds (valid until year 33658 in millis, ~2001 in seconds).
      if (event.timestamp && event.timestamp < 1e12) {
        event.timestamp = event.timestamp * 1000;
      }

      this.log(`[UnixSocket] Received event: ${event.event} for session ${event.session_id}`);
      this.onEvent(event);

    } catch (err) {
      this.error(`[UnixSocket] Failed to parse JSON: ${(err as Error).message}`);
      this.error(`[UnixSocket] Raw data: ${line.substring(0, 200)}`);
    }
  }

  /**
   * Stop the server and clean up socket
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.isShuttingDown = true;

      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        this.log('[UnixSocket] Server closed');

        // Clean up socket file (not needed for Windows Named Pipes)
        if (process.platform !== 'win32' && existsSync(this.socketPath)) {
          try {
            unlinkSync(this.socketPath);
            this.log(`[UnixSocket] Removed socket: ${this.socketPath}`);
          } catch (err) {
            this.error(`[UnixSocket] Failed to remove socket: ${err}`);
          }
        }

        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Get socket path
   */
  getSocketPath(): string {
    return this.socketPath;
  }
}
