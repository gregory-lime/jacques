/**
 * Shortcut Action Registry — Components register/unregister action handlers.
 *
 * This decouples the keyboard engine (which matches keys) from the
 * components (which define what happens when a shortcut fires).
 */

import React, { createContext, useContext, useCallback, useRef } from 'react';

type ActionHandler = () => void;

interface ShortcutActionsContextValue {
  /** Register an action handler for a shortcut ID. Returns cleanup function. */
  registerAction: (shortcutId: string, handler: ActionHandler) => () => void;
  /** Execute the handler for a shortcut ID. Returns true if handled. */
  dispatch: (shortcutId: string) => boolean;
}

const ShortcutActionsContext = createContext<ShortcutActionsContextValue | null>(null);

export function ShortcutActionsProvider({ children }: { children: React.ReactNode }) {
  const actionsRef = useRef<Map<string, ActionHandler>>(new Map());

  const registerAction = useCallback((shortcutId: string, handler: ActionHandler) => {
    actionsRef.current.set(shortcutId, handler);
    return () => {
      // Only remove if it's still the same handler (prevents stale cleanup)
      if (actionsRef.current.get(shortcutId) === handler) {
        actionsRef.current.delete(shortcutId);
      }
    };
  }, []);

  const dispatch = useCallback((shortcutId: string) => {
    const handler = actionsRef.current.get(shortcutId);
    if (handler) {
      handler();
      return true;
    }
    return false;
  }, []);

  return (
    <ShortcutActionsContext.Provider value={{ registerAction, dispatch }}>
      {children}
    </ShortcutActionsContext.Provider>
  );
}

export function useShortcutActions(): ShortcutActionsContextValue {
  const ctx = useContext(ShortcutActionsContext);
  if (!ctx) throw new Error('useShortcutActions must be used within ShortcutActionsProvider');
  return ctx;
}
