#!/usr/bin/env node
/**
 * Jacques CLI
 *
 * Terminal dashboard for monitoring Claude Code sessions.
 * Built with Ink (React for CLIs).
 *
 * Commands:
 *   jacques          - Start the dashboard (also starts embedded server)
 *   jacques status   - Show current status (one-shot)
 *   jacques list     - List sessions as JSON
 *   jacques search   - Search archived conversations
 */

import { Command } from "commander";
import {
  startDashboard,
  showStatus,
  listSessions,
  searchArchive,
  showArchiveStats,
  startSetup,
} from "./commands/index.js";

const VERSION = "0.0.7";

const program = new Command();

program
  .name("jacques")
  .description("Terminal dashboard for monitoring Claude Code context usage")
  .version(VERSION);

program
  .command("dashboard", { isDefault: true })
  .description("Start the interactive dashboard")
  .action(() => startDashboard());

program
  .command("setup")
  .description("Interactive setup wizard for Claude Code integration")
  .action(() => startSetup());

program
  .command("status")
  .description("Show current session status")
  .action(showStatus);

program
  .command("list")
  .description("List sessions as JSON")
  .action(listSessions);

program
  .command("search <query>")
  .description("Search archived conversations")
  .option("-p, --project <slug>", "Filter by project slug")
  .option("--from <date>", "Filter from date (YYYY-MM-DD)")
  .option("--to <date>", "Filter to date (YYYY-MM-DD)")
  .option("-t, --tech <techs...>", "Filter by technologies")
  .option("-l, --limit <n>", "Maximum results (default: 10)", "10")
  .option("--json", "Output as JSON")
  .action(searchArchive);

program
  .command("archive-stats")
  .description("Show archive statistics")
  .action(showArchiveStats);

program.parse();
