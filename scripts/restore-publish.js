#!/usr/bin/env node

/**
 * Restore workspace references after npm publish.
 *
 * 1. Restores package.json files from .bak backups
 * 2. Removes copied dirs (server/gui-dist, cli/hooks, cli/skills)
 */

import { readFileSync, writeFileSync, existsSync, rmSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

console.log('Restoring workspace references...\n');

// --- 1. Restore package.json backups ---

const pkgFiles = [
  'server/package.json',
  'cli/package.json',
  'wrapper/package.json',
];

for (const pkgPath of pkgFiles) {
  const fullPath = join(ROOT, pkgPath);
  const bakPath = fullPath + '.bak';

  if (existsSync(bakPath)) {
    const original = readFileSync(bakPath, 'utf8');
    writeFileSync(fullPath, original);
    unlinkSync(bakPath);
    console.log(`  Restored ${pkgPath}`);
  }
}

// --- 2. Remove copied directories ---

const dirsToRemove = [
  'server/gui-dist',
  'cli/hooks',
  'cli/skills',
];

for (const dir of dirsToRemove) {
  const fullPath = join(ROOT, dir);
  if (existsSync(fullPath)) {
    rmSync(fullPath, { recursive: true });
    console.log(`  Removed ${dir}/`);
  }
}

console.log('\nDone. Workspace references restored.');
