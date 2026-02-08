/**
 * WebSocket Utilities
 *
 * Shared response helpers to eliminate the repeated
 * `if (ws.readyState === WebSocket.OPEN) { ws.send(...) }` pattern.
 */

import { WebSocket } from 'ws';

/**
 * Send a JSON response to a WebSocket client if the connection is still open.
 */
export function sendWsResponse<T>(ws: WebSocket, response: T): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}
