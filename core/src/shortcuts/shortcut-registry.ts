/**
 * Shortcut Registry — Canonical keyboard shortcut definitions.
 *
 * Pure data module: no React, no DOM, no Node.js imports.
 * Shared between GUI (browser) and CLI dashboard (Ink/Node).
 */

// ─── Types ──────────────────────────────────────────────────

export type ShortcutCategory =
  | 'global'
  | 'navigation'
  | 'selection'
  | 'tiling'
  | 'terminal'
  | 'viewer'
  | 'history';

export type FocusZone =
  | 'dashboard'
  | 'sidebar'
  | 'session-viewer'
  | 'modal'
  | 'command-palette'
  | 'input'
  | '*';

export interface ShortcutDef {
  /** Unique ID: 'category.action' */
  id: string;
  /** Human-readable key combo. 'Mod' = Cmd on mac, Ctrl elsewhere */
  keys: string;
  /** Shortcut category for grouping in help overlay */
  category: ShortcutCategory;
  /** Short label for command palette / help overlay */
  label: string;
  /** Longer description (optional, for command palette search) */
  description?: string;
  /** Zones where this shortcut is active */
  zones: FocusZone[];
}

// ─── Registry ───────────────────────────────────────────────

export const SHORTCUTS: readonly ShortcutDef[] = [
  // ── Global ──────────────────────────────────────────────
  {
    id: 'global.command-palette',
    keys: 'Mod+k',
    category: 'global',
    label: 'Command palette',
    description: 'Search all actions and shortcuts',
    zones: ['*'],
  },
  {
    id: 'global.help',
    keys: '?',
    category: 'global',
    label: 'Help overlay',
    description: 'Show keyboard shortcut cheat sheet',
    zones: ['*'],
  },
  {
    id: 'global.escape',
    keys: 'Escape',
    category: 'global',
    label: 'Close / Back / Deselect',
    description: 'Close modal, go back, or clear selection',
    zones: ['*'],
  },

  // ── Navigation ──────────────────────────────────────────
  {
    id: 'nav.sessions',
    keys: '1',
    category: 'navigation',
    label: 'Sessions',
    description: 'Go to Sessions page',
    zones: ['dashboard', 'sidebar'],
  },
  {
    id: 'nav.artifacts',
    keys: '2',
    category: 'navigation',
    label: 'Artifacts',
    description: 'Go to Artifacts page',
    zones: ['dashboard', 'sidebar'],
  },
  {
    id: 'nav.context',
    keys: '3',
    category: 'navigation',
    label: 'Context',
    description: 'Go to Context page',
    zones: ['dashboard', 'sidebar'],
  },
  {
    id: 'nav.archive',
    keys: '4',
    category: 'navigation',
    label: 'Archive',
    description: 'Go to Archive page',
    zones: ['dashboard', 'sidebar'],
  },
  {
    id: 'nav.settings',
    keys: '5',
    category: 'navigation',
    label: 'Settings',
    description: 'Go to Settings page',
    zones: ['dashboard', 'sidebar'],
  },
  {
    id: 'nav.sidebar-toggle',
    keys: '[',
    category: 'navigation',
    label: 'Toggle sidebar',
    description: 'Collapse or expand the sidebar',
    zones: ['dashboard', 'sidebar'],
  },

  // ── Session Selection ───────────────────────────────────
  {
    id: 'session.next',
    keys: 'j',
    category: 'selection',
    label: 'Next item',
    description: 'Move keyboard focus to next session (active or history)',
    zones: ['dashboard'],
  },
  {
    id: 'session.next-arrow',
    keys: 'ArrowDown',
    category: 'selection',
    label: 'Next item',
    description: 'Move keyboard focus to next session',
    zones: ['dashboard'],
  },
  {
    id: 'session.prev',
    keys: 'k',
    category: 'selection',
    label: 'Previous item',
    description: 'Move keyboard focus to previous session (active or history)',
    zones: ['dashboard'],
  },
  {
    id: 'session.prev-arrow',
    keys: 'ArrowUp',
    category: 'selection',
    label: 'Previous item',
    description: 'Move keyboard focus to previous session',
    zones: ['dashboard'],
  },
  {
    id: 'session.next-worktree',
    keys: 'Shift+j',
    category: 'selection',
    label: 'Next worktree',
    description: 'Jump to first session in next worktree group',
    zones: ['dashboard'],
  },
  {
    id: 'session.prev-worktree',
    keys: 'Shift+k',
    category: 'selection',
    label: 'Previous worktree',
    description: 'Jump to first session in previous worktree group',
    zones: ['dashboard'],
  },
  {
    id: 'session.toggle-select',
    keys: 'Space',
    category: 'selection',
    label: 'Toggle select',
    description: 'Toggle selection on focused session card (multi-select for tiling)',
    zones: ['dashboard'],
  },
  {
    id: 'session.select-all',
    keys: 'Mod+a',
    category: 'selection',
    label: 'Select all',
    description: 'Select all active sessions',
    zones: ['dashboard'],
  },
  {
    id: 'session.select-all-a',
    keys: 'a',
    category: 'selection',
    label: 'Select all',
    description: 'Select all active sessions',
    zones: ['dashboard'],
  },
  {
    id: 'session.deselect-all',
    keys: 'x',
    category: 'selection',
    label: 'Clear selection',
    description: 'Deselect all sessions',
    zones: ['dashboard'],
  },
  {
    id: 'session.deselect-all-u',
    keys: 'u',
    category: 'selection',
    label: 'Clear selection',
    description: 'Deselect all sessions',
    zones: ['dashboard'],
  },
  {
    id: 'session.focus-terminal',
    keys: 'Enter',
    category: 'selection',
    label: 'Focus terminal',
    description: 'Bring the OS terminal window for this session to front',
    zones: ['dashboard'],
  },
  {
    id: 'session.open',
    keys: 'o',
    category: 'selection',
    label: 'Open transcript',
    description: 'Open session transcript viewer',
    zones: ['dashboard'],
  },

  // ── Tiling ──────────────────────────────────────────────
  {
    id: 'tile.fullscreen',
    keys: 'f',
    category: 'tiling',
    label: 'Fullscreen',
    description: 'Maximize the selected session terminal',
    zones: ['dashboard'],
  },
  {
    id: 'tile.tile-selected',
    keys: 't',
    category: 'tiling',
    label: 'Tile selected',
    description: 'Arrange selected sessions in a tile layout',
    zones: ['dashboard'],
  },
  {
    id: 'tile.browser-layout',
    keys: 'b',
    category: 'tiling',
    label: 'Browser + terminal(s)',
    description: 'Browser with terminal(s) — auto-detects 1 or 2 based on selection',
    zones: ['dashboard'],
  },

  // ── Terminal Management ─────────────────────────────────
  {
    id: 'terminal.launch',
    keys: 'n',
    category: 'terminal',
    label: 'New session',
    description: 'Launch a new session in the focused worktree',
    zones: ['dashboard'],
  },
  {
    id: 'terminal.create-worktree',
    keys: 'Shift+w',
    category: 'terminal',
    label: 'Create worktree',
    description: 'Create a new git worktree',
    zones: ['dashboard'],
  },
  {
    id: 'terminal.manage-worktrees',
    keys: 'w',
    category: 'terminal',
    label: 'Manage worktrees',
    description: 'Open worktree removal dialog',
    zones: ['dashboard'],
  },

  // ── Session Viewer ──────────────────────────────────────
  {
    id: 'viewer.prev-question',
    keys: '[',
    category: 'viewer',
    label: 'Previous question',
    description: 'Jump to previous user question',
    zones: ['session-viewer'],
  },
  {
    id: 'viewer.next-question',
    keys: ']',
    category: 'viewer',
    label: 'Next question',
    description: 'Jump to next user question',
    zones: ['session-viewer'],
  },
  {
    id: 'viewer.expand-all',
    keys: 'e',
    category: 'viewer',
    label: 'Expand all',
    description: 'Expand all collapsible blocks',
    zones: ['session-viewer'],
  },
  {
    id: 'viewer.collapse-all',
    keys: 'c',
    category: 'viewer',
    label: 'Collapse all',
    description: 'Collapse all collapsible blocks',
    zones: ['session-viewer'],
  },
  {
    id: 'viewer.scroll-end',
    keys: 'Shift+g',
    category: 'viewer',
    label: 'Scroll to end',
    description: 'Scroll to the bottom of the conversation',
    zones: ['session-viewer'],
  },
  {
    id: 'viewer.back',
    keys: 'Backspace',
    category: 'viewer',
    label: 'Back',
    description: 'Return to dashboard',
    zones: ['session-viewer'],
  },

  // ── History ─────────────────────────────────────────────
  {
    id: 'history.toggle',
    keys: 'h',
    category: 'history',
    label: 'Toggle history',
    description: 'Expand or collapse session history section',
    zones: ['dashboard'],
  },
] as const;

// ─── Helpers ────────────────────────────────────────────────

/** Get all shortcuts valid for a given zone */
export function getShortcutsForZone(zone: FocusZone): ShortcutDef[] {
  return SHORTCUTS.filter(s => s.zones.includes(zone) || s.zones.includes('*'));
}

/** Get a shortcut definition by its ID */
export function getShortcutById(id: string): ShortcutDef | undefined {
  return SHORTCUTS.find(s => s.id === id);
}

/** Get all shortcuts in a given category */
export function getShortcutsByCategory(category: ShortcutCategory): ShortcutDef[] {
  return SHORTCUTS.filter(s => s.category === category);
}

/** Category display labels for help overlay */
export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  global: 'Global',
  navigation: 'Navigation',
  selection: 'Sessions',
  tiling: 'Tiling',
  terminal: 'Terminal',
  viewer: 'Viewer',
  history: 'History',
};

/**
 * Resolve the 'Mod' prefix to platform-specific display.
 * 'Mod+k' → '⌘K' on mac, 'Ctrl+K' on linux/win
 */
export function resolveKeyDisplay(keys: string, platform: 'mac' | 'linux' | 'win'): string {
  const isMac = platform === 'mac';
  return keys
    .replace(/Mod\+/g, isMac ? '⌘' : 'Ctrl+')
    .replace(/Shift\+/g, isMac ? '⇧' : 'Shift+')
    .replace(/ArrowDown/g, '↓')
    .replace(/ArrowUp/g, '↑')
    .replace(/ArrowLeft/g, '←')
    .replace(/ArrowRight/g, '→')
    .replace(/Escape/g, 'Esc')
    .replace(/Backspace/g, '⌫')
    .replace(/Enter/g, '↵')
    .replace(/Space/g, '␣');
}
