/**
 * Shortcut Help Overlay — '?' key cheat sheet.
 *
 * Semi-transparent overlay showing all keyboard shortcuts
 * grouped by category, filtered to the current zone.
 * Terminal cheat sheet aesthetic.
 */

import { useEffect } from 'react';
import { colors, typography } from '../styles/theme';
import {
  SHORTCUTS,
  CATEGORY_LABELS,
  resolveKeyDisplay,
  type ShortcutCategory,
  type ShortcutDef,
} from '@core/shortcuts/shortcut-registry';
import { detectPlatform } from '@core/shortcuts/key-utils';
import { useFocusZone } from '../hooks/useFocusZone';

const platform = detectPlatform();

interface ShortcutHelpOverlayProps {
  onClose: () => void;
}

// Group shortcuts by category, deduplicating aliases (e.g., j and ArrowDown)
function groupByCategory(shortcuts: ShortcutDef[]): Map<ShortcutCategory, ShortcutDef[]> {
  const seen = new Set<string>();
  const groups = new Map<ShortcutCategory, ShortcutDef[]>();

  for (const s of shortcuts) {
    // Skip arrow-key aliases (they duplicate j/k)
    if (s.id.endsWith('-arrow')) continue;
    if (seen.has(s.id)) continue;
    seen.add(s.id);

    const list = groups.get(s.category) || [];
    list.push(s);
    groups.set(s.category, list);
  }
  return groups;
}

export function ShortcutHelpOverlay({ onClose }: ShortcutHelpOverlayProps) {
  const { pushModal } = useFocusZone();

  // Push modal on mount
  useEffect(() => {
    const popModal = pushModal('help-overlay');
    return popModal;
  }, [pushModal]);

  // Close on any key press
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Close on any key except modifier-only presses
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const groups = groupByCategory([...SHORTCUTS]);

  // Display order for categories
  const categoryOrder: ShortcutCategory[] = [
    'global', 'navigation', 'selection', 'tiling', 'terminal', 'viewer', 'history',
  ];

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.container} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Keyboard Shortcuts</span>
          <span style={styles.hint}>Press any key to close</span>
        </div>

        <div style={styles.grid}>
          {categoryOrder.map(cat => {
            const shortcuts = groups.get(cat);
            if (!shortcuts?.length) return null;
            return (
              <div key={cat} style={styles.group}>
                <div style={styles.groupTitle}>
                  {CATEGORY_LABELS[cat]}
                </div>
                {shortcuts.map(s => (
                  <div key={s.id} style={styles.row}>
                    <kbd style={styles.key}>
                      {resolveKeyDisplay(s.keys, platform)}
                    </kbd>
                    <span style={styles.label}>{s.label}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.borderSubtle}`,
    borderRadius: '12px',
    padding: '24px 32px',
    maxWidth: '720px',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  title: {
    color: colors.accent,
    fontFamily: typography.fontFamily.mono,
    fontSize: '16px',
    fontWeight: 600,
    letterSpacing: '0.5px',
  },
  hint: {
    color: colors.textMuted,
    fontFamily: typography.fontFamily.mono,
    fontSize: '11px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '24px',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  groupTitle: {
    color: colors.accent,
    fontFamily: typography.fontFamily.mono,
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '6px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '3px 0',
  },
  key: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.mono,
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '4px',
    border: `1px solid ${colors.borderSubtle}`,
    backgroundColor: colors.bgElevated,
    minWidth: '32px',
    textAlign: 'center',
    flexShrink: 0,
  },
  label: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.mono,
    fontSize: '12px',
  },
};
