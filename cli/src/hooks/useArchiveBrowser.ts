/**
 * useArchiveBrowser Hook
 *
 * Manages archive browser state: listing manifests by project,
 * expand/collapse navigation, archive initialization with progress.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  listManifestsByProject,
  initializeArchive,
  FilterType,
  getArchiveStats,
  getArchivePath,
} from "@jacques/core";
import type {
  ConversationManifest,
  ArchiveProgress,
  ArchiveInitResult,
} from "@jacques/core";
import {
  ARCHIVE_VISIBLE_ITEMS,
  buildArchiveList,
} from "../components/ArchiveBrowserView.js";
import type { ArchiveListItem } from "../components/ArchiveBrowserView.js";

export interface UseArchiveBrowserParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  onStatsReload: () => void;
}

export interface UseArchiveBrowserState {
  items: ArchiveListItem[];
  selectedIndex: number;
  scrollOffset: number;
  loading: boolean;
  error: string | null;
  initProgress: ArchiveProgress | null;
  initResult: ArchiveInitResult | null;
  manifestsByProject: Map<string, ConversationManifest[]>;
}

export interface UseArchiveBrowserReturn {
  state: UseArchiveBrowserState;
  loadBrowser: () => Promise<void>;
  toggleProject: (projectId: string) => void;
  initializeArchive: (options?: { force?: boolean }) => Promise<void>;
  handleInput: (input: string, key: Key, view: "archive-browser" | "archive-initializing") => void;
  reset: () => void;
}

export function useArchiveBrowser({
  setCurrentView,
  showNotification,
  onStatsReload,
}: UseArchiveBrowserParams): UseArchiveBrowserReturn {
  // Archive browser state
  const [archiveManifestsByProject, setArchiveManifestsByProject] = useState<Map<string, ConversationManifest[]>>(new Map());
  const [archiveExpandedProjects, setArchiveExpandedProjects] = useState<Set<string>>(new Set());
  const [archiveItems, setArchiveItems] = useState<ArchiveListItem[]>([]);
  const [archiveSelectedIndex, setArchiveSelectedIndex] = useState<number>(0);
  const [archiveScrollOffset, setArchiveScrollOffset] = useState<number>(0);
  const [archiveBrowserLoading, setArchiveBrowserLoading] = useState<boolean>(false);
  const [archiveBrowserError, setArchiveBrowserError] = useState<string | null>(null);

  // Archive initialization state
  const [archiveInitProgress, setArchiveInitProgress] = useState<ArchiveProgress | null>(null);
  const [archiveInitResult, setArchiveInitResult] = useState<ArchiveInitResult | null>(null);

  const loadBrowser = useCallback(async () => {
    setArchiveBrowserLoading(true);
    setArchiveBrowserError(null);
    setArchiveManifestsByProject(new Map());
    setArchiveExpandedProjects(new Set());
    setArchiveItems([]);
    setArchiveSelectedIndex(0);
    setArchiveScrollOffset(0);

    try {
      const byProject = await listManifestsByProject();
      setArchiveManifestsByProject(byProject);
      const items = buildArchiveList(byProject, new Set());
      setArchiveItems(items);
    } catch (err) {
      setArchiveBrowserError(
        `Failed to load archive: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setArchiveBrowserLoading(false);
    }
  }, []);

  // Handle archive initialization
  // force=true re-archives all sessions (for picking up new content types)
  // filterType defaults to EVERYTHING to preserve all content types
  const handleInitializeArchive = useCallback(async (options: { force?: boolean } = {}) => {
    setCurrentView("archive-initializing");
    setArchiveInitProgress(null);
    setArchiveInitResult(null);

    try {
      const result = await initializeArchive({
        saveToLocal: false,
        force: options.force ?? false,
        filterType: FilterType.EVERYTHING, // Preserve all content types
        onProgress: (progress) => {
          setArchiveInitProgress(progress);
        },
      });
      setArchiveInitResult(result);

      // Reload archive stats
      onStatsReload();
    } catch (err) {
      setArchiveInitResult({
        totalSessions: 0,
        archived: 0,
        skipped: 0,
        errors: 1,
      });
    }
  }, [setCurrentView, onStatsReload]);

  // Toggle archive project expand/collapse (uses projectId for uniqueness)
  const toggleProject = useCallback((projectId: string) => {
    setArchiveExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      // Rebuild flat list with new expanded state
      const items = buildArchiveList(archiveManifestsByProject, next);
      setArchiveItems(items);
      return next;
    });
  }, [archiveManifestsByProject]);

  const handleInput = useCallback((input: string, key: Key, view: "archive-browser" | "archive-initializing") => {
    if (view === "archive-browser") {
      // Archive browser view
      if (key.escape) {
        // Note: In App.tsx this calls returnToMain(), but the hook doesn't own that.
        // The caller should handle escape from archive-browser as returnToMain.
        // We signal this by not handling it here - let App.tsx check and call returnToMain.
        // Actually, we need to handle it for consistency. But we don't have returnToMain.
        // The spec says to use setCurrentView. We'll match the App.tsx behavior:
        // archive-browser escape -> returnToMain (which sets view to main and resets state)
        // Since we can't call returnToMain directly, we'll leave this unhandled
        // and the parent should check. But per the spec, let's handle what we can.
        return;
      }

      if (key.upArrow) {
        const newIndex = Math.max(0, archiveSelectedIndex - 1);
        setArchiveSelectedIndex(newIndex);
        // Adjust scroll if needed
        if (newIndex < archiveScrollOffset) {
          setArchiveScrollOffset(newIndex);
        }
        return;
      }

      if (key.downArrow) {
        const newIndex = Math.min(archiveItems.length - 1, archiveSelectedIndex + 1);
        setArchiveSelectedIndex(newIndex);
        // Adjust scroll if needed
        if (newIndex >= archiveScrollOffset + ARCHIVE_VISIBLE_ITEMS) {
          setArchiveScrollOffset(newIndex - ARCHIVE_VISIBLE_ITEMS + 1);
        }
        return;
      }

      if (key.return && archiveItems.length > 0) {
        const selectedItem = archiveItems[archiveSelectedIndex];
        if (selectedItem?.type === "project" && selectedItem.projectId) {
          // Toggle project expansion using projectId for uniqueness
          toggleProject(selectedItem.projectId);
        } else if (selectedItem?.type === "conversation" && selectedItem.manifest) {
          // For now, just show notification - could open viewer in future
          showNotification(`Selected: ${selectedItem.manifest.title.substring(0, 30)}...`);
        }
        return;
      }
    } else if (view === "archive-initializing") {
      // Archive initializing view - only Escape when complete
      if (key.escape) {
        if (archiveInitResult) {
          // Initialization complete - return to settings
          setCurrentView("settings");
          // Reload stats
          onStatsReload();
        }
        return;
      }
    }
  }, [archiveSelectedIndex, archiveScrollOffset, archiveItems, archiveInitResult, toggleProject, showNotification, setCurrentView, onStatsReload]);

  const reset = useCallback(() => {
    setArchiveManifestsByProject(new Map());
    setArchiveExpandedProjects(new Set());
    setArchiveItems([]);
    setArchiveSelectedIndex(0);
    setArchiveScrollOffset(0);
    setArchiveBrowserLoading(false);
    setArchiveBrowserError(null);
    setArchiveInitProgress(null);
    setArchiveInitResult(null);
  }, []);

  return {
    state: {
      items: archiveItems,
      selectedIndex: archiveSelectedIndex,
      scrollOffset: archiveScrollOffset,
      loading: archiveBrowserLoading,
      error: archiveBrowserError,
      initProgress: archiveInitProgress,
      initResult: archiveInitResult,
      manifestsByProject: archiveManifestsByProject,
    },
    loadBrowser,
    toggleProject,
    initializeArchive: handleInitializeArchive,
    handleInput,
    reset,
  };
}
