/**
 * useObsidianBrowser Hook (Composer)
 *
 * Composes useObsidianConfig, useObsidianFileBrowser, and useAddContextFlow
 * into a single hook with the same external interface.
 */

import { useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import { getVaultName } from "@jacques-ai/core";
import type { Session } from "@jacques-ai/core";
import { useObsidianConfig } from "./useObsidianConfig.js";
import { useObsidianFileBrowser } from "./useObsidianFileBrowser.js";
import { useAddContextFlow } from "./useAddContextFlow.js";

export interface UseObsidianBrowserParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  focusedSession: Session | undefined;
  updateSourceItems: (obsidianConnected: boolean) => void;
}

export function useObsidianBrowser({
  setCurrentView,
  showNotification,
  focusedSession,
  updateSourceItems,
}: UseObsidianBrowserParams) {
  const addContextFlow = useAddContextFlow({
    setCurrentView,
    focusedSession,
  });

  const fileBrowser = useObsidianFileBrowser({
    setCurrentView,
    onFileSelected: (file) => addContextFlow.startConfirm(file),
  });

  const config = useObsidianConfig({
    setCurrentView,
    updateSourceItems,
    onVaultSelected: async (vaultName, vaultPath) => {
      fileBrowser.setVaultName(vaultName);
      setCurrentView("obsidian-browser");
      await fileBrowser.loadVaultTree(vaultPath);
    },
  });

  const openBrowser = useCallback(async (vaultPath: string) => {
    fileBrowser.setVaultName(getVaultName(vaultPath));
    setCurrentView("obsidian-browser");
    await fileBrowser.loadVaultTree(vaultPath);
  }, [fileBrowser.loadVaultTree, fileBrowser.setVaultName, setCurrentView]);

  const handleInput = useCallback((input: string, key: Key, view: DashboardView) => {
    if (view === "obsidian-config") {
      config.handleInput(input, key);
    } else if (view === "obsidian-browser") {
      fileBrowser.handleInput(input, key);
    } else if (view === "add-context-confirm") {
      addContextFlow.handleInput(input, key);
    }
  }, [config.handleInput, fileBrowser.handleInput, addContextFlow.handleInput]);

  const reset = useCallback(() => {
    config.reset();
    fileBrowser.reset();
    addContextFlow.reset();
  }, [config.reset, fileBrowser.reset, addContextFlow.reset]);

  return {
    state: {
      ...config.state,
      ...fileBrowser.state,
      ...addContextFlow.state,
    },
    openConfig: config.openConfig,
    openBrowser,
    handleInput,
    reset,
  };
}
