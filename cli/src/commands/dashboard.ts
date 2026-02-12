/**
 * Dashboard command — starts the interactive TUI.
 */

import React from "react";
import { render } from "ink";
import { execSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { App } from "../components/App.js";
import { startEmbeddedServer } from "@jacques-ai/server";
import type { EmbeddedServer } from "@jacques-ai/server";

// Embedded server instance
let embeddedServer: EmbeddedServer | null = null;

/**
 * Show startup animation with animated dots
 */
async function showStartupAnimation(): Promise<void> {
  const frames = [".", "..", "..."];
  let frameIndex = 0;

  process.stdout.write("\x1b[?25l"); // Hide cursor
  process.stdout.write("Starting Jacques");

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      process.stdout.write("\r\x1b[K"); // Clear line
      process.stdout.write(`Starting Jacques${frames[frameIndex]}`);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 300);

    // Run for 900ms (3 frames)
    setTimeout(() => {
      clearInterval(interval);
      process.stdout.write("\r\x1b[K"); // Clear line
      process.stdout.write("\x1b[?25h"); // Show cursor
      resolve();
    }, 900);
  });
}

/**
 * Start the interactive dashboard using Ink
 */
export async function startDashboard(): Promise<void> {
  // Auto-rebuild GUI if source is newer than dist
  const __cli_filename = fileURLToPath(import.meta.url);
  const __cli_dirname = dirname(__cli_filename);
  const projectRoot = join(__cli_dirname, "..", "..", "..");
  const guiDistIndex = join(projectRoot, "gui", "dist", "index.html");
  const guiSentinelFiles = [
    join(projectRoot, "gui", "src", "App.tsx"),
    join(projectRoot, "gui", "src", "pages", "Dashboard.tsx"),
    join(projectRoot, "gui", "src", "components", "ui", "index.ts"),
  ];

  // Check if any sentinel source file is newer than the built output
  const distMtime = existsSync(guiDistIndex)
    ? statSync(guiDistIndex).mtimeMs
    : 0;
  const needsRebuild = guiSentinelFiles.some((f) => {
    try {
      return existsSync(f) && statSync(f).mtimeMs > distMtime;
    } catch {
      return false;
    }
  });

  if (needsRebuild) {
    // Ensure GUI deps are installed before attempting build
    const guiNodeModules = join(projectRoot, "gui", "node_modules");
    if (!existsSync(guiNodeModules)) {
      try {
        execSync("npm install", {
          cwd: join(projectRoot, "gui"),
          stdio: "pipe",
        });
      } catch {
        // GUI deps install failed — skip build
      }
    }

    process.stdout.write(
      distMtime === 0
        ? "Building GUI...\n"
        : "Rebuilding GUI (source changed)...\n",
    );
    try {
      execSync("npm run build:gui", { cwd: projectRoot, stdio: "pipe" });
    } catch {
      process.stdout.write(
        "Warning: GUI build failed. Serving previous version.\n",
      );
    }
  }

  // Check if we're in a TTY (interactive terminal)
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;

  if (!isTTY) {
    console.log("Jacques dashboard requires an interactive terminal.");
    console.log(
      'Use "jacques status" for a quick snapshot, or run in a TTY.',
    );
    process.exit(1);
  }

  // Show startup animation
  await showStartupAnimation();

  // Start embedded server (silent mode)
  try {
    embeddedServer = await startEmbeddedServer({ silent: true });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    const isAlreadyRunning =
      error.code === "EADDRINUSE" ||
      error.message?.includes("already") ||
      error.message?.includes("listening");

    if (isAlreadyRunning) {
      embeddedServer = null;
    } else {
      console.error(
        `Warning: Could not start embedded server: ${error.message}`,
      );
      embeddedServer = null;
    }
  }

  // Setup cleanup handlers
  const cleanup = async () => {
    if (embeddedServer) {
      try {
        await embeddedServer.stop();
      } catch {
        // Silently ignore cleanup errors
      } finally {
        embeddedServer = null;
      }
    }
  };

  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  // Enter alternate screen buffer to prevent scrolling and ghosting
  process.stdout.write("\x1b[?1049h"); // Enter alternate screen
  process.stdout.write("\x1b[?1007h"); // Alternate scroll mode: mouse wheel → arrow keys
  process.stdout.write("\x1b[2J"); // Clear entire screen
  process.stdout.write("\x1b[H"); // Move cursor to home position

  // Wrap stdout.write with synchronized output (DEC private mode 2026).
  // iTerm2 and other modern terminals buffer all writes between the begin/end
  // markers and paint them in a single frame, eliminating flicker.
  const origWrite = process.stdout.write.bind(process.stdout);
  let syncActive = false;
  process.stdout.write = function (chunk: unknown, encodingOrCb?: unknown, cb?: unknown): boolean {
    if (!syncActive) {
      syncActive = true;
      origWrite("\x1b[?2026h");
      queueMicrotask(() => {
        origWrite("\x1b[?2026l");
        syncActive = false;
      });
    }
    return origWrite(chunk as string | Uint8Array, encodingOrCb as BufferEncoding, cb as () => void);
  } as typeof process.stdout.write;

  const { waitUntilExit } = render(React.createElement(App), { patchConsole: true });

  try {
    await waitUntilExit();
  } finally {
    // Restore original stdout.write before cleanup output
    process.stdout.write = origWrite;

    // Exit alternate screen buffer
    process.stdout.write("\x1b[?1007l"); // Disable alternate scroll mode
    process.stdout.write("\x1b[?1049l");

    // Cleanup with timeout to prevent hanging
    const cleanupPromise = cleanup();
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.error("\nCleanup timeout - forcing exit");
        resolve();
      }, 5000);
    });

    await Promise.race([cleanupPromise, timeoutPromise]);

    console.log("\nJacques closed.");

    process.exit(0);
  }
}
