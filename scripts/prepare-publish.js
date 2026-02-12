#!/usr/bin/env node

/**
 * Prepare packages for npm publish.
 *
 * 1. Reads version from root package.json
 * 2. Rewrites workspace dep references (file:, *) to exact versions
 * 3. Copies gui/dist → server/gui-dist
 * 4. Copies hooks/ → cli/hooks/, skills/ → cli/skills/
 *
 * Run `node scripts/restore-publish.js` after publishing (or on error).
 */

import { readFileSync, writeFileSync, cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = rootPkg.version;

console.log(`Preparing publish for version ${version}\n`);

// --- 1. Rewrite dependency versions ---

function rewriteDeps(pkgPath, depRewrites) {
  const fullPath = join(ROOT, pkgPath);
  const pkg = JSON.parse(readFileSync(fullPath, 'utf8'));

  // Save original for restore
  writeFileSync(fullPath + '.bak', JSON.stringify(pkg, null, 2) + '\n');

  for (const [dep, _original] of Object.entries(depRewrites)) {
    if (pkg.dependencies && pkg.dependencies[dep]) {
      pkg.dependencies[dep] = version;
    }
  }

  writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`  Rewrote ${pkgPath}`);
}

// server/package.json: "@jacques-ai/core": "file:../core" → version
rewriteDeps('server/package.json', {
  '@jacques-ai/core': 'file:../core',
});

// cli/package.json: "@jacques-ai/core": "*" → version, "@jacques-ai/server": "*" → version
rewriteDeps('cli/package.json', {
  '@jacques-ai/core': '*',
  '@jacques-ai/server': '*',
});

// wrapper/package.json: "@jacques-ai/cli": version (already set, but ensure consistency)
rewriteDeps('wrapper/package.json', {
  '@jacques-ai/cli': version,
});

// --- 2. Copy gui/dist → server/gui-dist ---

const guiSrc = join(ROOT, 'gui', 'dist');
const guiDest = join(ROOT, 'server', 'gui-dist');

if (existsSync(guiSrc)) {
  cpSync(guiSrc, guiDest, { recursive: true });
  console.log(`  Copied gui/dist → server/gui-dist`);
} else {
  console.warn('  WARNING: gui/dist not found — run npm run build:gui first');
}

// --- 3. Copy hooks/ → cli/hooks/ ---

const hooksSrc = join(ROOT, 'hooks');
const hooksDest = join(ROOT, 'cli', 'hooks');

cpSync(hooksSrc, hooksDest, { recursive: true });
console.log(`  Copied hooks/ → cli/hooks/`);

// --- 4. Copy skills/ → cli/skills/ ---

const skillsSrc = join(ROOT, 'skills');
const skillsDest = join(ROOT, 'cli', 'skills');

cpSync(skillsSrc, skillsDest, { recursive: true });
console.log(`  Copied skills/ → cli/skills/`);

console.log('\nDone. Ready to publish. Run `node scripts/restore-publish.js` after.');
