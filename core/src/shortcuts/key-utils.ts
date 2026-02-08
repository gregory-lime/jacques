/**
 * Key Utilities — Platform-aware key matching for keyboard shortcuts.
 *
 * Works with both browser KeyboardEvent and a generic key shape
 * that can be adapted from Ink's useInput hook.
 */

import type { ShortcutDef, FocusZone } from './shortcut-registry.js';
import { SHORTCUTS } from './shortcut-registry.js';

// ─── Generic Key Event Shape ────────────────────────────────

/**
 * Platform-agnostic key event shape.
 * Browser: map directly from KeyboardEvent.
 * Ink: map from useInput(input, key) arguments.
 */
export interface KeyEvent {
  key: string;        // e.g. 'k', 'K', 'Enter', 'Escape', 'ArrowDown', ' '
  metaKey: boolean;   // Cmd on mac
  ctrlKey: boolean;   // Ctrl
  shiftKey: boolean;  // Shift
  altKey: boolean;    // Alt/Option
}

// ─── Parsing ────────────────────────────────────────────────

interface ParsedCombo {
  mod: boolean;     // Mod (Cmd on mac, Ctrl elsewhere)
  shift: boolean;
  alt: boolean;
  key: string;      // The base key (lowercase for letters)
}

function parseKeyCombo(keys: string): ParsedCombo {
  const parts = keys.split('+');
  const result: ParsedCombo = { mod: false, shift: false, alt: false, key: '' };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'mod') result.mod = true;
    else if (lower === 'shift') result.shift = true;
    else if (lower === 'alt') result.alt = true;
    else result.key = part; // preserve original case for special keys
  }

  return result;
}

// ─── Matching ───────────────────────────────────────────────

/**
 * Check if a key event matches a shortcut definition.
 *
 * @param event - The key event (browser or adapted from Ink)
 * @param shortcut - The shortcut definition to match against
 * @param platform - Current platform for Mod resolution
 * @returns true if the event matches the shortcut
 */
export function matchesShortcut(
  event: KeyEvent,
  shortcut: ShortcutDef,
  platform: 'mac' | 'linux' | 'win',
): boolean {
  const combo = parseKeyCombo(shortcut.keys);

  // Check modifier: Mod = metaKey on mac, ctrlKey elsewhere
  if (combo.mod) {
    const modPressed = platform === 'mac' ? event.metaKey : event.ctrlKey;
    if (!modPressed) return false;
  } else {
    // If shortcut doesn't use Mod, ensure neither meta nor ctrl is pressed
    // (except for platform-specific Mod key which may be held for other reasons)
    if (platform === 'mac' && event.metaKey) return false;
    if (platform !== 'mac' && event.ctrlKey) return false;
  }

  // Check Shift
  if (combo.shift !== event.shiftKey) return false;

  // Check Alt
  if (combo.alt !== event.altKey) return false;

  // Check base key
  const comboKey = combo.key.toLowerCase();
  const eventKey = normalizeEventKey(event.key);

  return comboKey === eventKey;
}

/**
 * Normalize a KeyboardEvent.key value for matching.
 * Maps Space (' ') to 'space', keeps special keys as-is, lowercases letters.
 */
function normalizeEventKey(key: string): string {
  if (key === ' ') return 'space';
  // Special keys stay as-is (but lowercased)
  if (key.length > 1) return key.toLowerCase();
  // Single character: lowercase
  return key.toLowerCase();
}

/**
 * Find the first shortcut matching a key event in a given zone.
 *
 * @param event - The key event
 * @param zone - The currently active focus zone
 * @param platform - Current platform
 * @returns The matching ShortcutDef, or undefined if no match
 */
export function findMatchingShortcut(
  event: KeyEvent,
  zone: FocusZone,
  platform: 'mac' | 'linux' | 'win',
): ShortcutDef | undefined {
  for (const shortcut of SHORTCUTS) {
    // Check zone match
    if (!shortcut.zones.includes(zone) && !shortcut.zones.includes('*')) continue;
    // Check key match
    if (matchesShortcut(event, shortcut, platform)) return shortcut;
  }
  return undefined;
}

/**
 * Convert a browser KeyboardEvent-like object to our generic KeyEvent shape.
 * Accepts anything with the standard key/modifier properties (e.g. DOM KeyboardEvent).
 */
export function fromKeyboardEvent(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): KeyEvent {
  return {
    key: e.key,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
  };
}

/**
 * Detect the current platform.
 * Works in browser (navigator) and Node.js (process.platform).
 */
export function detectPlatform(): 'mac' | 'linux' | 'win' {
  // Browser
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'mac';
    if (ua.includes('win')) return 'win';
    return 'linux';
  }
  // Node.js
  if (typeof process !== 'undefined' && process.platform) {
    if (process.platform === 'darwin') return 'mac';
    if (process.platform === 'win32') return 'win';
    return 'linux';
  }
  return 'linux';
}
