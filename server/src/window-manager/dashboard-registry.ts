/**
 * Dashboard Registry
 *
 * Tracks which terminal window is running the Jacques CLI dashboard.
 * Used to raise the dashboard window to the front after tiling operations,
 * so it stays visible on top of the tiled Claude Code sessions.
 *
 * Only one dashboard at a time; last registration wins.
 */

import type { WebSocket } from 'ws';

export interface DashboardRegistration {
  terminalKey: string;
  ws: WebSocket;
}

export class DashboardRegistry {
  private dashboard: DashboardRegistration | null = null;

  register(terminalKey: string, ws: WebSocket): void {
    this.dashboard = { terminalKey, ws };
  }

  unregister(ws?: WebSocket): void {
    if (!ws || (this.dashboard && this.dashboard.ws === ws)) {
      this.dashboard = null;
    }
  }

  getTerminalKey(): string | null {
    if (!this.dashboard) return null;
    // Auto-clear if WS is no longer open
    if (this.dashboard.ws.readyState !== 1 /* WebSocket.OPEN */) {
      this.dashboard = null;
      return null;
    }
    return this.dashboard.terminalKey;
  }
}
