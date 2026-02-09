/**
 * useSettings Hook
 *
 * Manages settings view state: navigation, auto-archive toggle,
 * archive stats loading, and Claude token input delegation.
 * Extracted from App.tsx.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  getArchiveSettings,
  toggleAutoArchive,
  getArchiveStats,
  getArchivePath,
  isClaudeConnected,
  getClaudeToken,
  maskToken,
} from "@jacques/core";
import { SETTINGS_TOTAL_ITEMS } from "../components/SettingsView.js";
import type { ArchiveStatsData } from "../components/SettingsView.js";

export interface ClaudeTokenActions {
  isInputMode: boolean;
  handleInput: (input: string, key: Key) => void;
  connected: boolean;
  disconnect: () => void;
  enterInputMode: () => void;
}

export interface UseSettingsParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  returnToMain: () => void;
  onInitArchive: (options: { force: boolean }) => Promise<void>;
  onBrowseArchive: () => void;
}

export interface UseSettingsState {
  index: number;
  scrollOffset: number;
  autoArchiveEnabled: boolean;
  archiveStats: ArchiveStatsData | null;
  archiveStatsLoading: boolean;
}

export interface UseSettingsReturn {
  state: UseSettingsState;
  open: () => void;
  reloadStats: () => void;
  handleInput: (input: string, key: Key, claudeToken: ClaudeTokenActions) => void;
  reset: () => void;
}

export function useSettings({
  setCurrentView,
  showNotification,
  returnToMain,
  onInitArchive,
  onBrowseArchive,
}: UseSettingsParams): UseSettingsReturn {
  // Settings state
  const [settingsIndex, setSettingsIndex] = useState<number>(0);
  const [settingsScrollOffset, setSettingsScrollOffset] = useState<number>(0);
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState<boolean>(false);
  const [archiveStats, setArchiveStats] = useState<ArchiveStatsData | null>(null);
  const [archiveStatsLoading, setArchiveStatsLoading] = useState<boolean>(false);

  // Open settings view - load current settings, claude status, archive stats
  const open = useCallback(() => {
    // Load current settings
    const settings = getArchiveSettings();
    setAutoArchiveEnabled(settings.autoArchive);
    setSettingsIndex(0);
    setSettingsScrollOffset(0);
    setCurrentView("settings");

    // Load archive stats asynchronously
    setArchiveStatsLoading(true);
    getArchiveStats().then((stats) => {
      setArchiveStats({
        totalConversations: stats.totalConversations,
        totalProjects: stats.totalProjects,
        totalSize: stats.sizeFormatted,
        archivePath: getArchivePath(),
      });
      setArchiveStatsLoading(false);
    }).catch(() => {
      setArchiveStats(null);
      setArchiveStatsLoading(false);
    });
  }, [setCurrentView]);

  // Reload archive stats
  const reloadStats = useCallback(() => {
    getArchiveStats().then((stats) => {
      setArchiveStats({
        totalConversations: stats.totalConversations,
        totalProjects: stats.totalProjects,
        totalSize: stats.sizeFormatted,
        archivePath: getArchivePath(),
      });
    });
  }, []);

  // Handle keyboard input for settings view
  const handleInput = useCallback((input: string, key: Key, claudeToken: ClaudeTokenActions) => {
    // Handle token input mode
    if (claudeToken.isInputMode) {
      claudeToken.handleInput(input, key);
      return;
    }

    // Normal settings navigation
    if (key.escape) {
      returnToMain();
      return;
    }

    // Settings has ~20 content lines, visible height is 10
    // Map settings index to approximate content row for scrolling
    // Row positions: Claude ~4, Auto-archive ~8, Extract ~11, Re-extract ~12, Browse ~13
    const SETTINGS_ROW_MAP = [4, 8, 11, 12, 13];
    const VISIBLE_HEIGHT = 10;
    const TOTAL_CONTENT_LINES = 20; // Approximate total content lines

    if (key.upArrow) {
      const newIndex = Math.max(0, settingsIndex - 1);
      setSettingsIndex(newIndex);
      // Adjust scroll to keep selection visible
      const targetRow = SETTINGS_ROW_MAP[newIndex];
      // When moving to first item, scroll to top to show title
      if (newIndex === 0) {
        setSettingsScrollOffset(0);
      } else if (targetRow < settingsScrollOffset + 2) {
        // Keep some context above
        setSettingsScrollOffset(Math.max(0, targetRow - 2));
      }
      return;
    }

    if (key.downArrow) {
      const newIndex = Math.min(SETTINGS_TOTAL_ITEMS - 1, settingsIndex + 1);
      setSettingsIndex(newIndex);
      // Adjust scroll to keep selection visible
      const targetRow = SETTINGS_ROW_MAP[newIndex];
      if (targetRow >= settingsScrollOffset + VISIBLE_HEIGHT - 2) {
        // Keep some context below, but don't scroll past content
        const maxScroll = Math.max(0, TOTAL_CONTENT_LINES - VISIBLE_HEIGHT);
        setSettingsScrollOffset(Math.min(maxScroll, targetRow - VISIBLE_HEIGHT + 4));
      }
      return;
    }

    if (key.return || input === " ") {
      if (settingsIndex === 0) {
        // Claude Connection - enter token input mode or disconnect
        if (claudeToken.connected) {
          // Already connected - disconnect
          claudeToken.disconnect();
          showNotification("Claude disconnected");
        } else {
          // Not connected - enter token input mode
          claudeToken.enterInputMode();
        }
      } else if (settingsIndex === 1) {
        // Auto-archive toggle
        const newValue = toggleAutoArchive();
        setAutoArchiveEnabled(newValue);
      } else if (settingsIndex === 2) {
        // Extract Catalog (skip already extracted)
        onInitArchive({ force: false });
      } else if (settingsIndex === 3) {
        // Re-extract All (force re-extract everything)
        onInitArchive({ force: true });
      } else if (settingsIndex === 4) {
        // Browse Archive
        onBrowseArchive();
      }
      return;
    }
  }, [settingsIndex, settingsScrollOffset, returnToMain, showNotification, onInitArchive, onBrowseArchive]);

  // Reset all state
  const reset = useCallback(() => {
    setSettingsIndex(0);
    setSettingsScrollOffset(0);
  }, []);

  return {
    state: {
      index: settingsIndex,
      scrollOffset: settingsScrollOffset,
      autoArchiveEnabled,
      archiveStats,
      archiveStatsLoading,
    },
    open,
    reloadStats,
    handleInput,
    reset,
  };
}
