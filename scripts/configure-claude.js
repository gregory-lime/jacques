#!/usr/bin/env node
/**
 * Jacques Claude Code Configuration Script
 * 
 * Automatically configures Claude Code hooks in ~/.claude/settings.json
 * 
 * Features:
 * - Creates backup of existing settings
 * - Merges Jacques hooks with existing hooks
 * - Validates configuration
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg) {
  console.log(msg);
}

function success(msg) {
  console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`);
}

function warn(msg) {
  console.log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`);
}

function error(msg) {
  console.log(`${COLORS.red}✗${COLORS.reset} ${msg}`);
}

function header(msg) {
  console.log(`\n${COLORS.bold}${COLORS.cyan}${msg}${COLORS.reset}`);
}

const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const CLAUDE_DIR = join(homedir(), '.claude');

// Use 'python' on Windows, 'python3' on Unix
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
// Use platform-appropriate home path prefix
const HOOKS_DIR = process.platform === 'win32'
  ? join(homedir(), '.jacques', 'hooks').replace(/\\/g, '/')
  : '~/.jacques/hooks';

// Jacques hook configuration
const JACQUES_HOOKS = {
  statusLine: {
    type: "command",
    command: `${PYTHON} ${HOOKS_DIR}/statusline.py`
  },
  hooks: {
    SessionStart: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `${PYTHON} ${HOOKS_DIR}/claude-code/register-session.py`
          }
        ]
      }
    ],
    PreToolUse: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `${PYTHON} ${HOOKS_DIR}/claude-code/pre-tool-use.py`
          }
        ]
      }
    ],
    PostToolUse: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `${PYTHON} ${HOOKS_DIR}/claude-code/report-activity.py`
          }
        ]
      }
    ],
    Stop: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `${PYTHON} ${HOOKS_DIR}/claude-code/session-idle.py`
          }
        ]
      }
    ],
    SessionEnd: [
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command: `${PYTHON} ${HOOKS_DIR}/claude-code/unregister-session.py`
          }
        ]
      }
    ]
  }
};

async function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

function loadExistingSettings() {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return null;
  }
  
  try {
    const content = readFileSync(CLAUDE_SETTINGS_PATH, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    error(`Failed to parse existing settings: ${err.message}`);
    return null;
  }
}

function createBackup() {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return null;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(CLAUDE_DIR, `settings.backup.${timestamp}.json`);
  
  try {
    copyFileSync(CLAUDE_SETTINGS_PATH, backupPath);
    return backupPath;
  } catch (err) {
    error(`Failed to create backup: ${err.message}`);
    return null;
  }
}

function isJacquesHook(hook) {
  return hook.command && hook.command.includes('jacques');
}

function mergeHooks(existing, jacques) {
  const merged = { ...existing };
  
  for (const [eventType, jacquesHookGroups] of Object.entries(jacques)) {
    if (!merged[eventType]) {
      merged[eventType] = [];
    }
    
    for (const jacquesGroup of jacquesHookGroups) {
      // Check if Jacques hook already exists
      const existingIndex = merged[eventType].findIndex(group => {
        if (group.matcher !== jacquesGroup.matcher) return false;
        return group.hooks?.some(h => isJacquesHook(h));
      });
      
      if (existingIndex >= 0) {
        // Update existing
        merged[eventType][existingIndex] = jacquesGroup;
      } else {
        // Add new
        merged[eventType].push(jacquesGroup);
      }
    }
  }
  
  return merged;
}

function mergeSettings(existing, jacques) {
  const merged = { ...existing };
  
  // Merge statusLine
  merged.statusLine = jacques.statusLine;
  
  // Merge hooks
  if (!merged.hooks) {
    merged.hooks = {};
  }
  merged.hooks = mergeHooks(merged.hooks, jacques.hooks);
  
  return merged;
}

function hasJacquesConfigured(settings) {
  if (!settings) return false;
  
  // Check statusLine
  const hasStatusLine = settings.statusLine?.command?.includes('jacques');
  
  // Check hooks
  const hasHooks = settings.hooks && Object.values(settings.hooks).some(groups =>
    groups.some(group => group.hooks?.some(h => isJacquesHook(h)))
  );
  
  return hasStatusLine || hasHooks;
}

function printCurrentConfig(settings) {
  header('Current Claude Code Settings');
  
  if (!settings) {
    log(`${COLORS.dim}No existing settings found${COLORS.reset}`);
    return;
  }
  
  if (settings.statusLine) {
    log(`\nstatusLine: ${JSON.stringify(settings.statusLine, null, 2)}`);
  }
  
  if (settings.hooks) {
    const hookTypes = Object.keys(settings.hooks);
    log(`\nConfigured hooks: ${hookTypes.join(', ')}`);
  }
}

function printProposedChanges(current, proposed) {
  header('Proposed Changes');
  
  log('\nJacques will add/update:');
  log(`${COLORS.cyan}• statusLine${COLORS.reset} - Display context usage in Claude Code`);
  log(`${COLORS.cyan}• SessionStart hook${COLORS.reset} - Register new sessions`);
  log(`${COLORS.cyan}• PreToolUse hook${COLORS.reset} - Detect awaiting user approval`);
  log(`${COLORS.cyan}• PostToolUse hook${COLORS.reset} - Track activity`);
  log(`${COLORS.cyan}• Stop hook${COLORS.reset} - Mark sessions idle`);
  log(`${COLORS.cyan}• SessionEnd hook${COLORS.reset} - Unregister sessions`);
  
  if (current && Object.keys(current).length > 0) {
    log(`\n${COLORS.dim}Your existing settings will be preserved.${COLORS.reset}`);
  }
}

async function main() {
  console.log(`
${COLORS.bold}${COLORS.cyan}╔═══════════════════════════════════════════════════════╗
║         JACQUES - Claude Code Configuration             ║
╚═══════════════════════════════════════════════════════╝${COLORS.reset}
`);

  // Check if ~/.claude directory exists
  if (!existsSync(CLAUDE_DIR)) {
    warn(`Claude Code config directory not found: ${CLAUDE_DIR}`);
    log('Creating directory...');
    mkdirSync(CLAUDE_DIR, { recursive: true });
    success(`Created ${CLAUDE_DIR}`);
  }

  // Load existing settings
  const existing = loadExistingSettings();
  
  // Check if Jacques is already configured
  if (hasJacquesConfigured(existing)) {
    warn('Jacques hooks appear to be already configured.');
    const answer = await prompt('Do you want to reconfigure? (y/N): ');
    if (answer !== 'y' && answer !== 'yes') {
      log('Configuration cancelled.');
      process.exit(0);
    }
  }
  
  // Show current config
  printCurrentConfig(existing);
  
  // Create merged settings
  const merged = mergeSettings(existing || {}, JACQUES_HOOKS);
  
  // Show proposed changes
  printProposedChanges(existing, merged);
  
  // Confirm
  log('');
  const answer = await prompt('Apply these changes? (Y/n): ');
  if (answer === 'n' || answer === 'no') {
    log('Configuration cancelled.');
    process.exit(0);
  }
  
  // Create backup
  if (existing) {
    const backupPath = createBackup();
    if (backupPath) {
      success(`Backup created: ${backupPath}`);
    }
  }
  
  // Write new settings
  try {
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(merged, null, 2) + '\n');
    success(`Updated ${CLAUDE_SETTINGS_PATH}`);
  } catch (err) {
    error(`Failed to write settings: ${err.message}`);
    process.exit(1);
  }
  
  // Print success message
  header('Configuration Complete!');
  
  console.log(`
${COLORS.green}Jacques hooks are now configured in Claude Code.${COLORS.reset}

${COLORS.bold}To start using Jacques:${COLORS.reset}

${COLORS.cyan}1.${COLORS.reset} Start the server:
   ${COLORS.dim}npm run start:server${COLORS.reset}

${COLORS.cyan}2.${COLORS.reset} Start the CLI (in another terminal):
   ${COLORS.dim}npm run start:cli${COLORS.reset}

${COLORS.cyan}3.${COLORS.reset} Restart any running Claude Code sessions to pick up the new hooks.

${COLORS.dim}Note: The statusLine will show context usage directly in Claude Code.${COLORS.reset}
`);
}

main().catch(err => {
  error(`Configuration failed: ${err.message}`);
  process.exit(1);
});
