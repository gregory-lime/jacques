/**
 * useHandoffBrowser Hook
 *
 * Manages handoff browser state: listing handoff entries, navigation,
 * and copying handoff content to clipboard.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import {
  listHandoffs,
  getHandoffContent,
} from "@jacques/core";
import type { HandoffEntry } from "@jacques/core";
import { VISIBLE_ITEMS as HANDOFF_VISIBLE_ITEMS } from "../components/HandoffBrowserView.js";
import { copyToClipboard } from "../utils/clipboard.js";

export interface UseHandoffBrowserParams {
  returnToMain: () => void;
  showNotification: (msg: string, duration?: number) => void;
}

export interface UseHandoffBrowserState {
  entries: HandoffEntry[];
  selectedIndex: number;
  scrollOffset: number;
  loading: boolean;
  error: string | null;
}

export interface UseHandoffBrowserReturn {
  state: UseHandoffBrowserState;
  open: (cwd: string) => void;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useHandoffBrowser({
  returnToMain,
  showNotification,
}: UseHandoffBrowserParams): UseHandoffBrowserReturn {
  // Handoff browser state
  const [handoffEntries, setHandoffEntries] = useState<HandoffEntry[]>([]);
  const [handoffSelectedIndex, setHandoffSelectedIndex] = useState<number>(0);
  const [handoffScrollOffset, setHandoffScrollOffset] = useState<number>(0);
  const [handoffBrowserLoading, setHandoffBrowserLoading] = useState<boolean>(false);
  const [handoffBrowserError, setHandoffBrowserError] = useState<string | null>(null);

  const open = useCallback((cwd: string) => {
    setHandoffBrowserLoading(true);
    setHandoffBrowserError(null);
    setHandoffEntries([]);
    setHandoffSelectedIndex(0);
    setHandoffScrollOffset(0);

    listHandoffs(cwd).then((catalog) => {
      setHandoffEntries(catalog.entries);
      setHandoffBrowserLoading(false);
    }).catch((err) => {
      setHandoffBrowserError(
        `Failed to list handoffs: ${err instanceof Error ? err.message : String(err)}`
      );
      setHandoffBrowserLoading(false);
    });
  }, []);

  const handleInput = useCallback((input: string, key: Key) => {
    // Handoff browser view
    if (key.escape) {
      returnToMain();
      return;
    }

    if (key.upArrow) {
      const newIndex = Math.max(0, handoffSelectedIndex - 1);
      setHandoffSelectedIndex(newIndex);
      // Adjust scroll if needed
      if (newIndex < handoffScrollOffset) {
        setHandoffScrollOffset(newIndex);
      }
      return;
    }

    if (key.downArrow) {
      const newIndex = Math.min(handoffEntries.length - 1, handoffSelectedIndex + 1);
      setHandoffSelectedIndex(newIndex);
      // Adjust scroll if needed
      if (newIndex >= handoffScrollOffset + HANDOFF_VISIBLE_ITEMS) {
        setHandoffScrollOffset(newIndex - HANDOFF_VISIBLE_ITEMS + 1);
      }
      return;
    }

    if (key.return && handoffEntries.length > 0) {
      // Copy selected handoff content to clipboard
      const selectedEntry = handoffEntries[handoffSelectedIndex];
      if (selectedEntry) {
        getHandoffContent(selectedEntry.path).then((content) => {
          return copyToClipboard(content).then(() => {
            showNotification("Handoff copied to clipboard!");
            returnToMain();
          });
        }).catch(() => {
          showNotification("Failed to read or copy handoff");
        });
      }
      return;
    }
  }, [handoffSelectedIndex, handoffScrollOffset, handoffEntries, returnToMain, showNotification]);

  const reset = useCallback(() => {
    setHandoffEntries([]);
    setHandoffSelectedIndex(0);
    setHandoffScrollOffset(0);
    setHandoffBrowserLoading(false);
    setHandoffBrowserError(null);
  }, []);

  return {
    state: {
      entries: handoffEntries,
      selectedIndex: handoffSelectedIndex,
      scrollOffset: handoffScrollOffset,
      loading: handoffBrowserLoading,
      error: handoffBrowserError,
    },
    open,
    handleInput,
    reset,
  };
}
