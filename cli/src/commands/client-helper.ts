/**
 * Shared helper for CLI commands that need a temporary JacquesClient connection.
 */

import { JacquesClient } from "@jacques/core";
import type { Session } from "@jacques/core";

const SERVER_URL = process.env.JACQUES_SERVER_URL || "ws://localhost:4242";

export interface InitialState {
  sessions: Session[];
  focusedId: string | null;
}

/**
 * Connect to the Jacques server, wait for initial_state, and run the action.
 * Automatically handles timeout and cleanup.
 */
export async function withJacquesClient(
  action: (state: InitialState) => void,
  timeoutMs = 3000,
): Promise<void> {
  return new Promise((resolve) => {
    const client = new JacquesClient(SERVER_URL);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.disconnect();
        console.log("Could not connect to Jacques server");
        console.log("Make sure the server is running: cd server && npm start");
        resolve();
      }
    }, timeoutMs);

    client.on("initial_state", (sessions: Session[], focusedId: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      action({ sessions, focusedId });

      client.disconnect();
      resolve();
    });

    client.on("error", () => {
      // Handled by timeout
    });

    client.connect();
  });
}
