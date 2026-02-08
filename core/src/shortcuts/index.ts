/**
 * Shortcuts module — Shared keyboard shortcut definitions and matching utilities.
 */

export {
  SHORTCUTS,
  CATEGORY_LABELS,
  getShortcutsForZone,
  getShortcutById,
  getShortcutsByCategory,
  resolveKeyDisplay,
} from './shortcut-registry.js';

export type {
  ShortcutDef,
  ShortcutCategory,
  FocusZone,
} from './shortcut-registry.js';

export {
  matchesShortcut,
  findMatchingShortcut,
  fromKeyboardEvent,
  detectPlatform,
} from './key-utils.js';

export type { KeyEvent } from './key-utils.js';
