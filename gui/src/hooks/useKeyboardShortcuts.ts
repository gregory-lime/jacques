/**
 * Keyboard Shortcut Engine — Single global keydown listener with zone-aware dispatch.
 *
 * Attaches one event listener on window, matches key events against the
 * shortcut registry filtered by the current focus zone, and dispatches
 * to the registered action handler.
 */

import { useEffect } from 'react';
import { findMatchingShortcut, fromKeyboardEvent, detectPlatform } from '@core/shortcuts/key-utils';
import { useFocusZone } from './useFocusZone';
import { useShortcutActions } from './useShortcutActions';

const platform = detectPlatform();

/**
 * Hook that installs the global keyboard shortcut listener.
 * Should be called once, at the Layout level.
 */
export function useKeyboardShortcuts(): void {
  const { activeZone } = useFocusZone();
  const { dispatch } = useShortcutActions();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when in input zone (handled by FocusZone detecting input focus)
      // activeZone will already be 'input' in that case — no shortcuts match 'input' zone

      const keyEvent = fromKeyboardEvent(e);
      const matched = findMatchingShortcut(keyEvent, activeZone, platform);

      if (matched) {
        const handled = dispatch(matched.id);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeZone, dispatch]);
}
