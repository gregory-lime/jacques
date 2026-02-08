/**
 * Command Palette — Cmd+K searchable action/shortcut overlay.
 *
 * Terminal-aesthetic modal with fuzzy search over all shortcuts,
 * navigable pages, and registered actions.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors, typography } from '../styles/theme';
import { SHORTCUTS, CATEGORY_LABELS, resolveKeyDisplay, type ShortcutDef } from '@core/shortcuts/shortcut-registry';
import { detectPlatform } from '@core/shortcuts/key-utils';
import { useFocusZone } from '../hooks/useFocusZone';
import { useShortcutActions } from '../hooks/useShortcutActions';

const platform = detectPlatform();

interface CommandPaletteProps {
  onClose: () => void;
}

export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { pushModal } = useFocusZone();
  const { dispatch } = useShortcutActions();
  const navigate = useNavigate();

  // Push modal on mount, pop on unmount
  useEffect(() => {
    const popModal = pushModal('command-palette');
    return popModal;
  }, [pushModal]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Filter shortcuts by query
  const filtered = useMemo(() => {
    if (!query.trim()) return [...SHORTCUTS];
    const q = query.toLowerCase();
    return SHORTCUTS.filter(s =>
      s.label.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }, [query]);

  // Clamp selected index
  useEffect(() => {
    setSelectedIndex(prev => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeShortcut = useCallback((shortcut: ShortcutDef) => {
    onClose();
    // Try dispatching through action registry first
    const handled = dispatch(shortcut.id);
    if (!handled) {
      // Fallback: navigate for nav shortcuts
      if (shortcut.id.startsWith('nav.')) {
        const tabMap: Record<string, string> = {
          'nav.archive': '/archive',
          'nav.settings': '/settings',
        };
        const path = tabMap[shortcut.id];
        if (path) navigate(path);
      }
    }
  }, [dispatch, navigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      executeShortcut(filtered[selectedIndex]);
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.container} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div style={styles.inputRow}>
          <span style={styles.prompt}>{'>'}</span>
          <input
            ref={inputRef}
            style={styles.input}
            placeholder="Type a command..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            autoFocus
          />
          <kbd style={styles.escHint}>Esc</kbd>
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Results */}
        <div ref={listRef} style={styles.results}>
          {filtered.length === 0 ? (
            <div style={styles.emptyState}>No matching commands</div>
          ) : (
            filtered.map((shortcut, i) => (
              <button
                key={shortcut.id}
                style={{
                  ...styles.item,
                  backgroundColor: i === selectedIndex ? colors.bgElevated : 'transparent',
                }}
                onClick={() => executeShortcut(shortcut)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span style={styles.itemCategory}>
                  {CATEGORY_LABELS[shortcut.category]}
                </span>
                <span style={styles.itemLabel}>{shortcut.label}</span>
                <span style={styles.itemKeys}>
                  {resolveKeyDisplay(shortcut.keys, platform)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '15vh',
    zIndex: 9999,
  },
  container: {
    width: '560px',
    maxHeight: '420px',
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    gap: '8px',
  },
  prompt: {
    color: colors.accent,
    fontFamily: typography.fontFamily.mono,
    fontSize: '16px',
    fontWeight: 600,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
    fontSize: '15px',
    padding: 0,
  },
  escHint: {
    color: colors.textMuted,
    fontSize: '11px',
    fontFamily: typography.fontFamily.mono,
    padding: '2px 6px',
    borderRadius: '4px',
    border: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  divider: {
    height: '1px',
    background: colors.borderSubtle,
  },
  results: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    transition: 'background-color 100ms ease',
  },
  itemCategory: {
    color: colors.textMuted,
    fontSize: '11px',
    fontFamily: typography.fontFamily.mono,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    width: '72px',
    flexShrink: 0,
  },
  itemLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: '13px',
    fontFamily: typography.fontFamily.mono,
  },
  itemKeys: {
    color: colors.textMuted,
    fontSize: '12px',
    fontFamily: typography.fontFamily.mono,
    padding: '2px 6px',
    borderRadius: '4px',
    border: `1px solid ${colors.borderSubtle}`,
    flexShrink: 0,
  },
  emptyState: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
    fontSize: '13px',
    padding: '24px 16px',
    textAlign: 'center',
  },
};
