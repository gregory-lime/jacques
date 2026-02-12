/**
 * Static file serving for the GUI
 *
 * Serves built GUI files from gui/dist with SPA fallback to index.html
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { RouteContext } from './types.js';
import { serveStaticFile } from './http-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GUI dist folder locations:
// - npm-installed: server/gui-dist/ (copied by prepare-publish.js)
// - monorepo dev: gui/dist/ (relative to server dist/routes)
const NPM_GUI_PATH = join(__dirname, '..', '..', 'gui-dist');
const MONOREPO_GUI_PATH = join(__dirname, '..', '..', '..', 'gui', 'dist');

const GUI_DIST_PATH = existsSync(join(NPM_GUI_PATH, 'index.html'))
  ? NPM_GUI_PATH
  : MONOREPO_GUI_PATH;

/** Check if GUI is built */
export function isGuiAvailable(): boolean {
  return existsSync(join(GUI_DIST_PATH, 'index.html'));
}

/** Get the GUI dist path */
export function getGuiDistPath(): string {
  return GUI_DIST_PATH;
}

export async function staticRoutes(ctx: RouteContext): Promise<boolean> {
  const { method, url, res } = ctx;

  if (method !== 'GET') return false;
  if (!isGuiAvailable()) return false;

  // Don't serve API routes as static files
  if (url.startsWith('/api/')) return false;

  // Try to serve the exact file
  const urlPath = url.split('?')[0];
  const filePath = join(GUI_DIST_PATH, urlPath);
  if (serveStaticFile(res, filePath)) {
    return true;
  }

  // For SPA routing, serve index.html for non-asset routes
  if (!url.includes('.')) {
    const indexPath = join(GUI_DIST_PATH, 'index.html');
    if (serveStaticFile(res, indexPath)) {
      return true;
    }
  }

  return false;
}
