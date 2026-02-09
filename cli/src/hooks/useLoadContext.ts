/**
 * useLoadContext Hook
 *
 * Manages load context view and source selection navigation.
 * Extracted from App.tsx.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  isObsidianConfigured,
  isGoogleDocsConfigured,
  isNotionConfigured,
} from "@jacques/core";
import { buildSourceItems } from "../components/SourceSelectionView.js";
import type { SourceItem } from "../components/SourceSelectionView.js";
import { LOAD_OPTIONS } from "../components/LoadContextView.js";

export interface UseLoadContextParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  returnToMain: () => void;
  onSourceSelect: (source: string, connected: boolean) => void;
}

export interface UseLoadContextReturn {
  state: {
    index: number;
    sourceItems: SourceItem[];
    selectedSourceIndex: number;
  };
  open: () => void;
  handleInput: (input: string, key: Key, view: "load" | "load-sources") => void;
  reset: () => void;
}

export function useLoadContext({
  setCurrentView,
  showNotification,
  returnToMain,
  onSourceSelect,
}: UseLoadContextParams): UseLoadContextReturn {
  // LoadContext flow state
  const [loadContextIndex, setLoadContextIndex] = useState<number>(0);
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0);

  // Handle load context option selection
  const handleLoadContextSelect = useCallback(async (index: number) => {
    const option = LOAD_OPTIONS[index];
    if (!option.enabled) return;

    if (option.key === "sources") {
      // Build source items and check status for all sources
      const obsidianConnected = isObsidianConfigured();
      const googleDocsConnected = isGoogleDocsConfigured();
      const notionConnected = isNotionConfigured();
      setSourceItems(buildSourceItems(obsidianConnected, googleDocsConnected, notionConnected));
      setSelectedSourceIndex(0);
      setCurrentView("load-sources");
    }
    // "saved" option not implemented yet
  }, [setCurrentView]);

  // Handle source selection
  const handleSourceSelect = useCallback(async (index: number) => {
    const source = sourceItems[index];
    if (!source?.enabled) return;

    onSourceSelect(source.key, source.connected);
  }, [sourceItems, onSourceSelect]);

  // Open load context view
  const open = useCallback(() => {
    setCurrentView("load");
    setLoadContextIndex(0);
  }, [setCurrentView]);

  // Handle keyboard input for load and load-sources views
  const handleInput = useCallback((input: string, key: Key, view: "load" | "load-sources") => {
    if (view === "load") {
      // Load Context view - navigate options
      if (key.escape) {
        returnToMain();
        return;
      }

      if (key.upArrow) {
        setLoadContextIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setLoadContextIndex((prev) => Math.min(LOAD_OPTIONS.length - 1, prev + 1));
        return;
      }

      if (key.return) {
        handleLoadContextSelect(loadContextIndex);
        return;
      }
    } else if (view === "load-sources") {
      // Source selection view
      if (key.escape) {
        setCurrentView("load");
        return;
      }

      if (key.upArrow) {
        setSelectedSourceIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedSourceIndex((prev) => Math.min(sourceItems.length - 1, prev + 1));
        return;
      }

      if (key.return) {
        handleSourceSelect(selectedSourceIndex);
        return;
      }
    }
  }, [loadContextIndex, sourceItems, selectedSourceIndex, handleLoadContextSelect, handleSourceSelect, returnToMain, setCurrentView]);

  // Reset all state
  const reset = useCallback(() => {
    setLoadContextIndex(0);
    setSourceItems([]);
    setSelectedSourceIndex(0);
  }, []);

  return {
    state: {
      index: loadContextIndex,
      sourceItems,
      selectedSourceIndex,
    },
    open,
    handleInput,
    reset,
  };
}
