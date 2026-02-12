/**
 * Terminal Key Utilities
 *
 * Unified parsing, building, and matching of terminal key identifiers.
 * Terminal keys uniquely identify terminal sessions across different terminal emulators.
 *
 * @module connection/terminal-key
 */

import { TerminalKeyPrefix } from './constants.js';

/**
 * Parsed terminal key structure
 */
export interface ParsedTerminalKey {
  /** The terminal key prefix (ITERM, TTY, PID, etc.) */
  prefix: TerminalKeyPrefix;
  /** The value portion after the prefix */
  value: string;
  /** Extracted PID if present in the key */
  pid?: number;
  /** Extracted UUID for iTerm keys */
  uuid?: string;
  /** Extracted TTY path */
  tty?: string;
  /** True if key has DISCOVERED: wrapper */
  isDiscovered: boolean;
  /** For DISCOVERED keys, the parsed inner key */
  innerKey?: ParsedTerminalKey;
}

/**
 * Information needed to build a terminal key
 */
export interface TerminalIdentity {
  /** iTerm2 session ID (e.g., "w0t0p0:UUID") */
  itermSessionId?: string;
  /** TTY device path (e.g., "/dev/ttys001") */
  tty?: string;
  /** Process ID */
  pid?: number;
  /** Kitty window ID */
  kittyWindowId?: string;
  /** WezTerm pane ID */
  weztermPaneId?: string;
  /** Windows Terminal session ID */
  wtSession?: string;
  /** Terminal.app session ID */
  termSessionId?: string;
}

/**
 * Parse a terminal key string into its components.
 *
 * Handles all key formats:
 * - ITERM:w0t0p0:UUID or ITERM:UUID
 * - TTY:/dev/ttys001
 * - PID:12345
 * - KITTY:42
 * - WEZTERM:pane:0
 * - DISCOVERED:TTY:ttys001:12345
 * - AUTO:session-uuid
 *
 * @param key The terminal key string to parse
 * @returns Parsed terminal key structure
 */
export function parseTerminalKey(key: string): ParsedTerminalKey {
  if (!key) {
    return {
      prefix: TerminalKeyPrefix.UNKNOWN,
      value: '',
      isDiscovered: false,
    };
  }

  // Check for DISCOVERED: wrapper
  if (key.startsWith('DISCOVERED:')) {
    const inner = key.substring(11); // Remove "DISCOVERED:"
    const innerParsed = parseInnerKey(inner);
    return {
      prefix: TerminalKeyPrefix.DISCOVERED,
      value: inner,
      isDiscovered: true,
      innerKey: innerParsed,
      pid: innerParsed.pid,
      uuid: innerParsed.uuid,
      tty: innerParsed.tty,
    };
  }

  return parseInnerKey(key);
}

/**
 * Parse the inner portion of a terminal key (without DISCOVERED: wrapper)
 */
function parseInnerKey(key: string): ParsedTerminalKey {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) {
    return {
      prefix: TerminalKeyPrefix.UNKNOWN,
      value: key,
      isDiscovered: false,
    };
  }

  let prefix = key.substring(0, colonIndex).toUpperCase();
  const value = key.substring(colonIndex + 1);

  // Normalize known terminal type names to enum values.
  // session-factory creates DISCOVERED:iTerm2:UUID where "iTerm2" uppercases to "ITERM2",
  // but the enum has "ITERM". Similarly "Windows Terminal" → "WINDOWSTERMINAL" vs enum "WT".
  if (prefix === 'ITERM2') prefix = TerminalKeyPrefix.ITERM;
  if (prefix === 'WINDOWSTERMINAL') prefix = TerminalKeyPrefix.WT;

  const result: ParsedTerminalKey = {
    prefix: (prefix in TerminalKeyPrefix ? prefix : TerminalKeyPrefix.UNKNOWN) as TerminalKeyPrefix,
    value,
    isDiscovered: false,
  };

  // Extract type-specific fields
  switch (result.prefix) {
    case TerminalKeyPrefix.ITERM:
      result.uuid = extractItermUuid(value);
      break;

    case TerminalKeyPrefix.TTY:
      result.tty = value;
      // Check for TTY:path:pid format (used in DISCOVERED:TTY:...)
      const ttyParts = value.split(':');
      if (ttyParts.length >= 2) {
        const lastPart = ttyParts[ttyParts.length - 1];
        const maybePid = parseInt(lastPart, 10);
        if (!isNaN(maybePid) && maybePid > 0) {
          result.pid = maybePid;
          result.tty = ttyParts.slice(0, -1).join(':');
        }
      }
      break;

    case TerminalKeyPrefix.PID:
      const pid = parseInt(value, 10);
      if (!isNaN(pid) && pid > 0) {
        result.pid = pid;
      }
      break;

    case TerminalKeyPrefix.KITTY:
    case TerminalKeyPrefix.WEZTERM:
    case TerminalKeyPrefix.TERM:
    case TerminalKeyPrefix.WT:
    case TerminalKeyPrefix.AUTO:
      // No special extraction needed
      break;
  }

  return result;
}

/**
 * Build a terminal key string from identity information.
 *
 * Priority order:
 * 1. iTerm session ID
 * 2. Kitty window ID
 * 3. WezTerm pane ID
 * 4. Windows Terminal session
 * 5. TTY path
 * 6. PID (fallback)
 *
 * @param info Terminal identity information
 * @returns Terminal key string or null if no valid identity
 */
export function buildTerminalKey(info: TerminalIdentity): string | null {
  if (info.itermSessionId) {
    return `ITERM:${info.itermSessionId}`;
  }
  if (info.kittyWindowId) {
    return `KITTY:${info.kittyWindowId}`;
  }
  if (info.weztermPaneId) {
    return `WEZTERM:${info.weztermPaneId}`;
  }
  if (info.wtSession) {
    return `WT:${info.wtSession}`;
  }
  if (info.termSessionId) {
    return `TERM:${info.termSessionId}`;
  }
  if (info.tty) {
    return `TTY:${info.tty}`;
  }
  if (info.pid && info.pid > 0) {
    return `PID:${info.pid}`;
  }
  return null;
}

/**
 * Extract PID from a terminal key if present.
 *
 * Handles formats:
 * - PID:12345
 * - DISCOVERED:PID:12345
 * - DISCOVERED:TTY:ttys001:12345 (PID at end)
 *
 * @param key Terminal key string
 * @returns PID number or null if not extractable
 */
export function extractPid(key: string): number | null {
  if (!key) return null;

  // Check for DISCOVERED:PID:xxx or PID:xxx
  const pidMatch = key.match(/(?:DISCOVERED:)?PID:(\d+)/);
  if (pidMatch) {
    return parseInt(pidMatch[1], 10);
  }

  // Check for DISCOVERED:TTY:xxx:pid at the end
  const ttyMatch = key.match(/DISCOVERED:TTY:[^:]+:(\d+)$/);
  if (ttyMatch) {
    return parseInt(ttyMatch[1], 10);
  }

  return null;
}

/**
 * Extract the UUID from an iTerm session ID or terminal key.
 *
 * iTerm's ITERM_SESSION_ID format is "w0t0p0:UUID" where:
 * - w0 = window index
 * - t0 = tab index
 * - p0 = pane index
 * - UUID = unique session identifier
 *
 * AppleScript's `unique ID of session` returns just the UUID portion.
 *
 * @param value The iTerm session ID value (after ITERM: prefix) or full key
 * @returns The UUID portion, or the input if no colon present
 */
export function extractItermUuid(value: string): string {
  if (!value) return '';

  // If this is a full ITERM: key, extract the value portion
  let itermValue = value;
  if (value.startsWith('ITERM:')) {
    itermValue = value.substring(6);
  }

  // Find the colon separator between w0t0p0 and UUID
  const colonIndex = itermValue.indexOf(':');
  if (colonIndex === -1) {
    // No colon means it's already just the UUID
    return itermValue;
  }

  // Return everything after the colon (the UUID)
  return itermValue.substring(colonIndex + 1);
}

/**
 * Check if two terminal keys refer to the same terminal.
 *
 * Handles special cases:
 * - iTerm keys match by UUID (ignoring w0t0p0 prefix differences)
 * - DISCOVERED: wrapper is unwrapped for comparison
 * - Exact string match as fallback
 *
 * @param keyA First terminal key
 * @param keyB Second terminal key
 * @returns True if keys match the same terminal
 */
export function matchTerminalKeys(keyA: string, keyB: string): boolean {
  if (!keyA || !keyB) return false;

  // Exact match
  if (keyA === keyB) return true;

  const parsedA = parseTerminalKey(keyA);
  const parsedB = parseTerminalKey(keyB);

  // Get effective prefix (unwrap DISCOVERED)
  const effectiveA = parsedA.isDiscovered && parsedA.innerKey ? parsedA.innerKey : parsedA;
  const effectiveB = parsedB.isDiscovered && parsedB.innerKey ? parsedB.innerKey : parsedB;

  // Different types don't match
  if (effectiveA.prefix !== effectiveB.prefix) return false;

  // iTerm: match by UUID (handles w0t0p0:UUID vs UUID mismatch)
  if (effectiveA.prefix === TerminalKeyPrefix.ITERM) {
    const uuidA = effectiveA.uuid || extractItermUuid(effectiveA.value);
    const uuidB = effectiveB.uuid || extractItermUuid(effectiveB.value);
    return uuidA === uuidB && uuidA !== '';
  }

  // TTY: match by path (ignore PID suffix if present)
  // Normalize /dev/ prefix: process scanner gives "ttys001", hooks give "/dev/ttys001"
  if (effectiveA.prefix === TerminalKeyPrefix.TTY) {
    const ttyA = (effectiveA.tty || effectiveA.value.split(':')[0]).replace(/^\/dev\//, '');
    const ttyB = (effectiveB.tty || effectiveB.value.split(':')[0]).replace(/^\/dev\//, '');
    return ttyA === ttyB;
  }

  // PID: match by number
  if (effectiveA.prefix === TerminalKeyPrefix.PID) {
    return effectiveA.pid === effectiveB.pid && effectiveA.pid !== undefined;
  }

  // Default: exact value match
  return effectiveA.value === effectiveB.value;
}

/**
 * Get a human-readable description of a terminal key.
 *
 * @param key Terminal key string
 * @returns Human-readable description
 */
export function describeTerminalKey(key: string): string {
  const parsed = parseTerminalKey(key);

  if (parsed.prefix === TerminalKeyPrefix.UNKNOWN) {
    return `Unknown terminal: ${key}`;
  }

  const prefix = parsed.isDiscovered ? `Discovered ${parsed.innerKey?.prefix || 'unknown'}` : parsed.prefix;

  switch (parsed.innerKey?.prefix || parsed.prefix) {
    case TerminalKeyPrefix.ITERM:
      return `${prefix} (UUID: ${parsed.uuid?.substring(0, 8)}...)`;
    case TerminalKeyPrefix.TTY:
      return `${prefix} (${parsed.tty})`;
    case TerminalKeyPrefix.PID:
      return `${prefix} (PID: ${parsed.pid})`;
    case TerminalKeyPrefix.KITTY:
      return `${prefix} (Window: ${parsed.value})`;
    case TerminalKeyPrefix.WEZTERM:
      return `${prefix} (Pane: ${parsed.value})`;
    case TerminalKeyPrefix.AUTO:
      return `Auto-registered session`;
    default:
      return `${prefix}: ${parsed.value}`;
  }
}
