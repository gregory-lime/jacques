/**
 * Setup command — starts the interactive TUI setup wizard.
 */

import React from "react";
import { render } from "ink";
import { SetupWizard } from "../components/setup/SetupWizard.js";

/**
 * Start the interactive setup wizard
 */
export async function startSetup(): Promise<void> {
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
    console.log("\nJacques setup complete.");
    process.exit(0);
  }
}
