#!/usr/bin/env node
/**
 * Stop the Jacques server gracefully (cross-platform)
 *
 * Tries PID file first, then falls back to finding processes on the HTTP port.
 * Works on macOS, Linux, and Windows.
 */

import { readFileSync, unlinkSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

const PID_FILE = join(homedir(), '.jacques', 'server.pid');
const isWindows = process.platform === 'win32';
const SOCKET_PATH = isWindows ? null : '/tmp/jacques.sock';
const HTTP_PORT = 4243;

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function killPid(pid) {
  console.log(`Stopping Jacques server (PID: ${pid})...`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }

  // Wait up to 5s for graceful shutdown
  for (let i = 0; i < 50; i++) {
    if (!isProcessAlive(pid)) return true;
    await sleep(100);
  }

  // Force kill if still alive
  if (isProcessAlive(pid)) {
    console.log(`Force killing PID ${pid}...`);
    try {
      process.kill(pid, 'SIGKILL');
      await sleep(500);
    } catch {
      // Already dead
    }
  }
  return true;
}

function findPortPid(port) {
  try {
    if (isWindows) {
      const output = execSync(
        `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess"`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      return output ? parseInt(output, 10) : null;
    } else {
      const output = execSync(`lsof -ti :${port}`, { encoding: 'utf8', timeout: 5000 }).trim();
      return output ? parseInt(output, 10) : null;
    }
  } catch {
    return null;
  }
}

async function main() {
  let stopped = false;

  // Try PID file first
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (pid && isProcessAlive(pid)) {
        stopped = await killPid(pid);
      }
    } catch {
      // Invalid PID file
    }
    try {
      unlinkSync(PID_FILE);
    } catch {
      // Already removed
    }
  }

  // Fallback: kill anything on the HTTP port
  const portPid = findPortPid(HTTP_PORT);
  if (portPid) {
    console.log(`Killing process on port ${HTTP_PORT} (PID: ${portPid})...`);
    stopped = await killPid(portPid);
  }

  // Clean up stale socket (Unix only)
  if (!isWindows && SOCKET_PATH && existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // Ignore
    }
  }

  if (stopped) {
    console.log('Server stopped.');
  } else {
    console.log('No server running.');
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
