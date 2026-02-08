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

import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { App } from './components/App.js';
import { JacquesClient } from '@jacques/core';
import type { Session } from '@jacques/core';
import { searchConversations, getArchiveStats } from '@jacques/core';
import { startEmbeddedServer } from '@jacques/server';
import type { EmbeddedServer } from '@jacques/server';

const VERSION = '0.0.7';
const SERVER_URL = process.env.JACQUES_SERVER_URL || 'ws://localhost:4242';

// Embedded server instance (for dashboard command)
let embeddedServer: EmbeddedServer | null = null;

/**
 * Show startup animation with animated dots
 */
async function showStartupAnimation(): Promise<void> {
  const frames = ['.', '..', '...'];
  let frameIndex = 0;

  process.stdout.write('\x1b[?25l'); // Hide cursor
  process.stdout.write('Starting Jacques');

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      // Clear dots and rewrite
      process.stdout.write('\r\x1b[K'); // Clear line
      process.stdout.write(`Starting Jacques${frames[frameIndex]}`);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 300);

    // Run for 900ms (3 frames)
    setTimeout(() => {
      clearInterval(interval);
      process.stdout.write('\r\x1b[K'); // Clear line
      process.stdout.write('\x1b[?25h'); // Show cursor
      resolve();
    }, 900);
  });
}

/**
 * Start the interactive dashboard using Ink
 */
async function startDashboard(): Promise<void> {
  // Auto-rebuild GUI if source is newer than dist
  const __cli_filename = fileURLToPath(import.meta.url);
  const __cli_dirname = dirname(__cli_filename);
  const projectRoot = join(__cli_dirname, '..', '..');
  const guiDistIndex = join(projectRoot, 'gui', 'dist', 'index.html');
  const guiSentinelFiles = [
    join(projectRoot, 'gui', 'src', 'App.tsx'),
    join(projectRoot, 'gui', 'src', 'pages', 'Dashboard.tsx'),
    join(projectRoot, 'gui', 'src', 'components', 'ui', 'index.ts'),
  ];

  // Check if any sentinel source file is newer than the built output
  const distMtime = existsSync(guiDistIndex) ? statSync(guiDistIndex).mtimeMs : 0;
  const needsRebuild = guiSentinelFiles.some(f => {
    try {
      return existsSync(f) && statSync(f).mtimeMs > distMtime;
    } catch {
      return false;
    }
  });

  if (needsRebuild) {
    process.stdout.write(distMtime === 0 ? 'Building GUI...\n' : 'Rebuilding GUI (source changed)...\n');
    try {
      execSync('npm run build:gui', { cwd: projectRoot, stdio: 'pipe' });
    } catch {
      process.stdout.write('Warning: GUI build failed. Serving previous version.\n');
    }
  }

  // Check if we're in a TTY (interactive terminal)
  const isTTY = process.stdin.isTTY && process.stdout.isTTY;

  if (!isTTY) {
    console.log('Jacques dashboard requires an interactive terminal.');
    console.log('Use "jacques status" for a quick snapshot, or run in a TTY.');
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
      error.code === 'EADDRINUSE' ||
      error.message?.includes('already') ||
      error.message?.includes('listening');

    if (isAlreadyRunning) {
      // Server already running — connect to it (this is normal)
      embeddedServer = null;
    } else {
      console.error(`Warning: Could not start embedded server: ${error.message}`);
      // Continue — will try to connect to existing server
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

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });

  // Enter alternate screen buffer to prevent scrolling and ghosting
  // Then clear screen and move cursor to top-left
  process.stdout.write('\x1b[?1049h'); // Enter alternate screen
  process.stdout.write('\x1b[2J');     // Clear entire screen
  process.stdout.write('\x1b[H');      // Move cursor to home position (top-left)

  const { waitUntilExit } = render(React.createElement(App));

  try {
    await waitUntilExit();
  } finally {
    // Exit alternate screen buffer and restore previous content
    process.stdout.write('\x1b[?1049l');

    // Cleanup with timeout to prevent hanging
    const cleanupPromise = cleanup();
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.error('\nCleanup timeout - forcing exit');
        resolve();
      }, 5000);
    });

    await Promise.race([cleanupPromise, timeoutPromise]);

    console.log('\nJacques closed.');

    // Force process exit to ensure all resources are released
    process.exit(0);
  }
}

/**
 * Show status (one-shot)
 */
async function showStatus(): Promise<void> {
  return new Promise((resolve) => {
    const client = new JacquesClient(SERVER_URL);
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.disconnect();
        console.log('Could not connect to Jacques server');
        console.log(`Make sure the server is running: cd server && npm start`);
        resolve();
      }
    }, 3000);
    
    client.on('initial_state', (sessions: Session[], focusedId: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      
      if (sessions.length === 0) {
        console.log('No active Claude Code sessions');
      } else {
        console.log(`\nActive Sessions: ${sessions.length}\n`);
        
        for (const session of sessions) {
          const isFocused = session.session_id === focusedId;
          const marker = isFocused ? '▶' : ' ';
          const title = session.session_title || 'Untitled';
          const model = session.model?.display_name || session.model?.id || '?';
          const pct = session.context_metrics?.used_percentage.toFixed(1) || '?';
          const status = session.status;
          
          console.log(`${marker} [${model}] ${title}`);
          console.log(`   Status: ${status} | Context: ${pct}%`);
          console.log(`   Project: ${session.project}`);
          console.log('');
        }
      }
      
      client.disconnect();
      resolve();
    });
    
    client.on('error', () => {
      // Handled by timeout
    });
    
    client.connect();
  });
}

/**
 * List sessions as JSON
 */
async function listSessions(): Promise<void> {
  return new Promise((resolve) => {
    const client = new JacquesClient(SERVER_URL);
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.disconnect();
        console.log(JSON.stringify({ error: 'Connection timeout', sessions: [] }));
        resolve();
      }
    }, 3000);
    
    client.on('initial_state', (sessions: Session[], focusedId: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      
      console.log(JSON.stringify({
        focused_session_id: focusedId,
        sessions: sessions,
      }, null, 2));
      
      client.disconnect();
      resolve();
    });
    
    client.on('error', () => {
      // Handled by timeout
    });
    
    client.connect();
  });
}

// CLI setup
const program = new Command();

program
  .name('jacques')
  .description('Terminal dashboard for monitoring Claude Code context usage')
  .version(VERSION);

program
  .command('dashboard', { isDefault: true })
  .description('Start the interactive dashboard')
  .action(() => startDashboard());

program
  .command('status')
  .description('Show current session status')
  .action(showStatus);

program
  .command('list')
  .description('List sessions as JSON')
  .action(listSessions);

program
  .command('search <query>')
  .description('Search archived conversations')
  .option('-p, --project <slug>', 'Filter by project slug')
  .option('--from <date>', 'Filter from date (YYYY-MM-DD)')
  .option('--to <date>', 'Filter to date (YYYY-MM-DD)')
  .option('-t, --tech <techs...>', 'Filter by technologies')
  .option('-l, --limit <n>', 'Maximum results (default: 10)', '10')
  .option('--json', 'Output as JSON')
  .action(searchArchive);

program
  .command('archive-stats')
  .description('Show archive statistics')
  .action(showArchiveStats);

program.parse();

/**
 * Search archived conversations
 */
async function searchArchive(
  query: string,
  options: {
    project?: string;
    from?: string;
    to?: string;
    tech?: string[];
    limit: string;
    json?: boolean;
  }
): Promise<void> {
  const limit = parseInt(options.limit, 10) || 10;

  const result = await searchConversations({
    query,
    project: options.project,
    dateFrom: options.from,
    dateTo: options.to,
    technologies: options.tech,
    limit,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  console.log(`\nSearch: "${query}"`);
  if (Object.values(result.filters).some(v => v)) {
    const filters: string[] = [];
    if (result.filters.project) filters.push(`project=${result.filters.project}`);
    if (result.filters.dateFrom) filters.push(`from=${result.filters.dateFrom}`);
    if (result.filters.dateTo) filters.push(`to=${result.filters.dateTo}`);
    if (result.filters.technologies?.length) {
      filters.push(`tech=${result.filters.technologies.join(',')}`);
    }
    console.log(`Filters: ${filters.join(' ')}`);
  }
  console.log(`Results: ${result.totalMatches} total, showing ${result.showing.from}-${result.showing.to}`);
  console.log('');

  if (result.results.length === 0) {
    console.log('No matching conversations found.');
    console.log('');
    console.log('Tips:');
    console.log('  - Try different keywords');
    console.log('  - Save more conversations using the Jacques dashboard');
    return;
  }

  for (const r of result.results) {
    console.log(`${r.rank}. ${r.title}`);
    console.log(`   Project: ${r.project} | Date: ${r.date} | ${r.messageCount} messages`);
    if (r.technologies.length > 0) {
      console.log(`   Tech: ${r.technologies.join(', ')}`);
    }
    if (r.filesModified.length > 0) {
      const files = r.filesModified.slice(0, 3);
      console.log(`   Files: ${files.join(', ')}${r.filesModified.length > 3 ? '...' : ''}`);
    }
    if (r.preview) {
      const preview = r.preview.length > 80 ? r.preview.substring(0, 77) + '...' : r.preview;
      console.log(`   Preview: "${preview}"`);
    }
    console.log('');
  }

  if (result.hasMore) {
    console.log(`Use --limit ${limit + 10} to see more results.`);
  }
}

/**
 * Show archive statistics
 */
async function showArchiveStats(): Promise<void> {
  const stats = await getArchiveStats();

  console.log('\nJacques Archive Statistics');
  console.log('─'.repeat(30));
  console.log(`Conversations: ${stats.totalConversations}`);
  console.log(`Projects: ${stats.totalProjects}`);
  console.log(`Total size: ${stats.sizeFormatted}`);
  console.log('');

  if (stats.totalConversations === 0) {
    console.log('No conversations archived yet.');
    console.log('Use the Jacques dashboard to save conversations.');
  }
}
