#!/usr/bin/env node
/**
 * Jacques Setup Script
 * 
 * Handles:
 * - Installing dependencies for server and CLI
 * - Building both packages
 * - Setting up hooks symlink
 * - Checking prerequisites
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, symlinkSync, unlinkSync, readlinkSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

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

function run(cmd, options = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...options });
    return true;
  } catch (err) {
    return false;
  }
}

function checkPrerequisites() {
  header('Checking prerequisites...');
  
  let allGood = true;
  
  // Check Node.js version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (major >= 18) {
    success(`Node.js ${nodeVersion}`);
  } else {
    error(`Node.js ${nodeVersion} - requires 18+`);
    allGood = false;
  }
  
  // Check Python 3 (try 'python3' first, then 'python' for Windows)
  let pythonFound = false;
  for (const cmd of ['python3', 'python']) {
    try {
      const pythonVersion = execSync(`${cmd} --version`, { encoding: 'utf8' }).trim();
      if (pythonVersion.includes('3.')) {
        success(`${pythonVersion} (${cmd})`);
        pythonFound = true;
        break;
      }
    } catch {
      // Try next
    }
  }
  if (!pythonFound) {
    error('Python 3 not found');
    allGood = false;
  }

  // Check jq (optional — only needed for legacy statusline.sh on Unix)
  const isWindows = process.platform === 'win32';
  const whichCmd = isWindows ? 'where' : 'which';
  if (!isWindows) {
    try {
      execSync(`${whichCmd} jq`, { encoding: 'utf8' });
      success('jq installed');
    } catch {
      warn('jq not found - install with: brew install jq (optional with Python statusline)');
    }
  }
  
  return allGood;
}

function installDependencies() {
  header('Installing dependencies...');

  const projectRoot = resolve(import.meta.dirname, '..');

  // Single root install — npm workspaces links all packages and creates bin symlinks
  log('Installing all workspace dependencies...');
  if (!run('npm install', { cwd: projectRoot })) {
    error('Failed to install dependencies');
    return false;
  }
  success('All dependencies installed (workspaces linked)');

  return true;
}

function buildPackages() {
  header('Building packages...');

  const projectRoot = resolve(import.meta.dirname, '..');

  log('Building core...');
  if (!run('npm run build', { cwd: join(projectRoot, 'core') })) {
    error('Failed to build core');
    return false;
  }
  success('Core built');

  log('Building server...');
  if (!run('npm run build', { cwd: join(projectRoot, 'server') })) {
    error('Failed to build server');
    return false;
  }
  success('Server built');

  log('Building CLI...');
  if (!run('npm run build', { cwd: join(projectRoot, 'cli') })) {
    error('Failed to build CLI');
    return false;
  }
  success('CLI built');

  log('Building GUI...');
  if (!run('npm run build', { cwd: join(projectRoot, 'gui') })) {
    warn('GUI build failed — the web interface may not be available, but the CLI will work fine');
  } else {
    success('GUI built');
  }

  return true;
}

function setupHooksSymlink() {
  header('Setting up hooks...');
  
  const projectRoot = resolve(import.meta.dirname, '..');
  const hooksSource = join(projectRoot, 'hooks');
  const jacquesDir = join(homedir(), '.jacques');
  const hooksTarget = join(jacquesDir, 'hooks');
  
  // Create ~/.jacques if it doesn't exist
  if (!existsSync(jacquesDir)) {
    mkdirSync(jacquesDir, { recursive: true });
    success(`Created ${jacquesDir}`);
  }
  
  // Check if hooks symlink already exists
  if (existsSync(hooksTarget)) {
    try {
      const currentTarget = readlinkSync(hooksTarget);
      if (currentTarget === hooksSource) {
        success(`Hooks symlink already configured: ${hooksTarget} -> ${hooksSource}`);
        return true;
      }
    } catch {
      // Not a symlink, remove it
    }
    
    // Remove existing
    try {
      unlinkSync(hooksTarget);
      log(`Removed existing ${hooksTarget}`);
    } catch (err) {
      error(`Failed to remove existing hooks: ${err.message}`);
      return false;
    }
  }
  
  // Create symlink (use 'junction' on Windows — no admin required)
  try {
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    symlinkSync(hooksSource, hooksTarget, symlinkType);
    success(`Created symlink: ${hooksTarget} -> ${hooksSource}`);
  } catch (err) {
    error(`Failed to create symlink: ${err.message}`);
    return false;
  }
  
  return true;
}

function printNextSteps() {
  header('Setup complete!');

  console.log(`
${COLORS.bold}Next steps:${COLORS.reset}

${COLORS.cyan}1.${COLORS.reset} Configure Claude Code hooks:
   ${COLORS.dim}npm run configure${COLORS.reset}

${COLORS.cyan}2.${COLORS.reset} Start Jacques:
   ${COLORS.dim}npx jacques${COLORS.reset}
   Starts the server + CLI dashboard. Web GUI at http://localhost:4243

${COLORS.cyan}3.${COLORS.reset} Begin a Claude Code session and watch the context tracking!

${COLORS.bold}Useful commands:${COLORS.reset}
  npx jacques          - Start Jacques (server + CLI dashboard)
  npm run start:server - Start server only (for web GUI)
  npm run status       - Quick status check
  npm run configure    - Configure Claude Code hooks
  npm test             - Run tests
`);
}

async function main() {
  console.log(`
${COLORS.bold}${COLORS.cyan}╔═══════════════════════════════════════════════════════╗
║              JACQUES SETUP                              ║
╚═══════════════════════════════════════════════════════╝${COLORS.reset}
`);

  if (!checkPrerequisites()) {
    error('\nPrerequisites not met. Please install missing dependencies.');
    process.exit(1);
  }
  
  if (!installDependencies()) {
    error('\nFailed to install dependencies.');
    process.exit(1);
  }
  
  if (!buildPackages()) {
    error('\nFailed to build packages.');
    process.exit(1);
  }
  
  if (!setupHooksSymlink()) {
    error('\nFailed to set up hooks.');
    process.exit(1);
  }
  
  printNextSteps();
}

main().catch(err => {
  error(`Setup failed: ${err.message}`);
  process.exit(1);
});
