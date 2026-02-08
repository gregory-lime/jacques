/**
 * Jacques Server
 *
 * Standalone entry point for the Jacques server.
 * Uses the embeddable server module for the actual implementation.
 */

import { startEmbeddedServer } from './start-server.js';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createServer, connect } from 'net';

const PID_FILE = join(homedir(), '.jacques', 'server.pid');
const SOCKET_PATH = '/tmp/jacques.sock';
const WS_PORT = parseInt(process.env.JACQUES_WS_PORT || '4242', 10);
const HTTP_PORT = parseInt(process.env.JACQUES_HTTP_PORT || '4243', 10);

let server: Awaited<ReturnType<typeof startEmbeddedServer>> | null = null;

/**
 * Write PID file for process management
 */
function writePidFile(): void {
  try {
    const dir = join(homedir(), '.jacques');
    if (!existsSync(dir)) {
      const { mkdirSync } = require('fs');
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(PID_FILE, String(process.pid));
  } catch (err) {
    console.error(`[Server] Warning: Could not write PID file: ${err}`);
  }
}

/**
 * Remove PID file on shutdown
 */
function removePidFile(): void {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch {
    // Ignore errors when removing PID file
  }
}

/**
 * Check if a Unix socket has an active listener
 */
function isSocketAlive(path: string): Promise<boolean> {
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
 * Check if a TCP port is available
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port);
  });
}

/**
 * Pre-flight: ensure no other Jacques server is running
 */
async function ensureServerNotRunning(): Promise<void> {
  // 1. Check PID file
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0); // Throws if process doesn't exist
          console.error(`[Server] Jacques server already running (PID: ${pid}).`);
          console.error(`[Server] Stop it first: npm run stop:server`);
          process.exit(1);
        } catch {
          // Process doesn't exist — stale PID file
          unlinkSync(PID_FILE);
        }
      }
    } catch {
      // Can't read PID file — remove it
      try { unlinkSync(PID_FILE); } catch { /* ignore */ }
    }
  }

  // 2. Check if socket is actively listened on
  if (existsSync(SOCKET_PATH)) {
    if (await isSocketAlive(SOCKET_PATH)) {
      console.error(`[Server] Another server is listening on ${SOCKET_PATH}.`);
      console.error(`[Server] Stop it first: npm run stop:server`);
      process.exit(1);
    }
    // Stale socket — will be cleaned up by UnixSocketServer.start()
  }

  // 3. Check port availability
  for (const port of [WS_PORT, HTTP_PORT]) {
    if (!(await isPortFree(port))) {
      console.error(`[Server] Port ${port} is already in use.`);
      console.error(`[Server] Stop the existing server: npm run stop:server`);
      process.exit(1);
    }
  }
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║         JACQUES - Claude Code Context Monitor          ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  // Pre-flight: ensure no other server is running
  await ensureServerNotRunning();

  try {
    // Write PID file for process management
    writePidFile();
    console.log(`[Server] PID: ${process.pid} (written to ${PID_FILE})`);

    server = await startEmbeddedServer({ silent: false });

    console.log('[Server] Waiting for Claude Code sessions...');
    console.log('[Server] Press Ctrl+C to stop');
    console.log('');

  } catch (err) {
    console.error(`[Server] Failed to start: ${err}`);
    removePidFile();
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('');

  if (server) {
    await server.stop();
  }

  // Clean up PID file
  removePidFile();

  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error(`[Server] Uncaught exception: ${err.message}`);
  console.error(err.stack);
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Server] Unhandled rejection: ${reason}`);
  shutdown();
});

// Start the server
start();
