/**
 * Focus Zone Provider — Tracks which part of the UI has keyboard focus.
 *
 * The shortcut engine uses this to determine which shortcuts are active,
 * preventing conflicts between zones (e.g., 'j' in dashboard vs typing in input).
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { FocusZone } from '@core/shortcuts/shortcut-registry';

interface FocusZoneContextValue {
  /** Currently active focus zone */
  activeZone: FocusZone;
  /** Set the active zone (called by page components) */
  setActiveZone: (zone: FocusZone) => void;
  /** Whether a text input/textarea/contenteditable is currently focused */
  isInputFocused: boolean;
  /** Push a modal onto the stack (returns pop function) */
  pushModal: (id: string) => () => void;
  /** Whether any modal is open */
  hasModal: boolean;
}

const FocusZoneContext = createContext<FocusZoneContextValue | null>(null);

export function FocusZoneProvider({ children }: { children: React.ReactNode }) {
  const [activeZone, setActiveZone] = useState<FocusZone>('dashboard');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [modalStack, setModalStack] = useState<string[]>([]);
  const modalStackRef = useRef(modalStack);
  modalStackRef.current = modalStack;

  // Auto-detect input focus via focusin/focusout
  useEffect(() => {
    function isInputElement(el: EventTarget | null): boolean {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function onFocusIn(e: FocusEvent) {
      if (isInputElement(e.target)) setIsInputFocused(true);
    }

    function onFocusOut(e: FocusEvent) {
      if (isInputElement(e.target)) setIsInputFocused(false);
    }

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const pushModal = useCallback((id: string) => {
    setModalStack(prev => [...prev, id]);
    return () => {
      setModalStack(prev => prev.filter(m => m !== id));
    };
  }, []);

  const value: FocusZoneContextValue = {
    activeZone: modalStack.length > 0 ? 'modal' : (isInputFocused ? 'input' : activeZone),
    setActiveZone,
    isInputFocused,
    pushModal,
    hasModal: modalStack.length > 0,
  };

  return (
    <FocusZoneContext.Provider value={value}>
      {children}
    </FocusZoneContext.Provider>
  );
}

export function useFocusZone(): FocusZoneContextValue {
  const ctx = useContext(FocusZoneContext);
  if (!ctx) throw new Error('useFocusZone must be used within FocusZoneProvider');
  return ctx;
}
