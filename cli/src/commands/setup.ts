/**
 * Setup command — starts the interactive TUI setup wizard.
 */

import React from "react";
import { render } from "ink";
import { SetupWizard } from "../components/setup/SetupWizard.js";

export interface SetupCommandOptions {
  /** If true, return after setup completes instead of calling process.exit(0). */
  returnAfterComplete?: boolean;
}

/**
 * Start the interactive setup wizard
 */
export async function startSetup(options: SetupCommandOptions = {}): Promise<void> {
  // Check TTY
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;
  if (!isTTY) {
    console.log("Setup wizard requires an interactive terminal.");
    process.exit(1);
  }

  // Enter alternate screen buffer
  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[2J");
  process.stdout.write("\x1b[H");

  const { waitUntilExit } = render(React.createElement(SetupWizard));

  try {
    await waitUntilExit();
  } finally {
    // Exit alternate screen buffer
    process.stdout.write("\x1b[?1049l");

    if (options.returnAfterComplete) {
      console.log("\nSetup complete. Starting dashboard...\n");
    } else {
      console.log("\nJacques setup complete.");
      process.exit(0);
    }
  }
}
