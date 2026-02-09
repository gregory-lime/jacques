/**
 * useObsidianFileBrowser Hook
 *
 * Manages file tree browsing, folder expand/collapse, and scroll state.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import { getVaultFileTree, flattenTree } from "@jacques/core";
import type { ObsidianFile, FileTreeNode, FlatTreeItem } from "@jacques/core";
import { VISIBLE_ITEMS } from "../components/ObsidianBrowserView.js";

export interface UseObsidianFileBrowserParams {
  setCurrentView: (view: DashboardView) => void;
  onFileSelected: (file: ObsidianFile) => void;
}

export interface UseObsidianFileBrowserState {
  vaultName: string;
  treeItems: FlatTreeItem[];
  fileIndex: number;
  scrollOffset: number;
  browserLoading: boolean;
  browserError: string | null;
}

export interface UseObsidianFileBrowserReturn {
  state: UseObsidianFileBrowserState;
  loadVaultTree: (vaultPath: string) => Promise<void>;
  setVaultName: (name: string) => void;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useObsidianFileBrowser({
  setCurrentView,
  onFileSelected,
}: UseObsidianFileBrowserParams): UseObsidianFileBrowserReturn {
  const [vaultName, setVaultName] = useState<string>("");
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [treeItems, setTreeItems] = useState<FlatTreeItem[]>([]);
  const [fileIndex, setFileIndex] = useState<number>(0);
  const [scrollOffset, setScrollOffset] = useState<number>(0);
  const [browserLoading, setBrowserLoading] = useState<boolean>(false);
  const [browserError, setBrowserError] = useState<string | null>(null);

  const loadVaultTree = useCallback(async (vaultPath: string) => {
    setBrowserLoading(true);
    setBrowserError(null);
    setFileTree([]);
    setExpandedFolders(new Set());
    setTreeItems([]);
    setFileIndex(0);
    setScrollOffset(0);

    try {
      const tree = await getVaultFileTree(vaultPath);
      setFileTree(tree);
      const items = flattenTree(tree, new Set());
      setTreeItems(items);
    } catch (err) {
      setBrowserError(
        `Failed to list files: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setBrowserLoading(false);
    }
  }, []);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      const items = flattenTree(fileTree, next);
      setTreeItems(items);
      return next;
    });
  }, [fileTree]);

  const handleItemSelect = useCallback((index: number) => {
    const item = treeItems[index];
    if (!item) return;

    if (item.type === "folder") {
      toggleFolder(item.id);
    } else {
      onFileSelected({
        path: item.path,
        relativePath: item.relativePath,
        name: item.name,
        sizeBytes: item.sizeBytes || 0,
        modifiedAt: item.modifiedAt || new Date(),
      });
    }
  }, [treeItems, toggleFolder, onFileSelected]);

  const handleInput = useCallback((input: string, key: Key) => {
    if (key.escape) {
      setCurrentView("load-sources");
      return;
    }
    if (key.upArrow) {
      const newIndex = Math.max(0, fileIndex - 1);
      setFileIndex(newIndex);
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex);
      }
      return;
    }
    if (key.downArrow) {
      const newIndex = Math.min(treeItems.length - 1, fileIndex + 1);
      setFileIndex(newIndex);
      if (newIndex >= scrollOffset + VISIBLE_ITEMS) {
        setScrollOffset(newIndex - VISIBLE_ITEMS + 1);
      }
      return;
    }
    if (key.return && treeItems.length > 0) {
      handleItemSelect(fileIndex);
      return;
    }
  }, [fileIndex, scrollOffset, treeItems, handleItemSelect, setCurrentView]);

  const reset = useCallback(() => {
    setVaultName("");
    setFileTree([]);
    setExpandedFolders(new Set());
    setTreeItems([]);
    setFileIndex(0);
    setScrollOffset(0);
    setBrowserLoading(false);
    setBrowserError(null);
  }, []);

  return {
    state: { vaultName, treeItems, fileIndex, scrollOffset, browserLoading, browserError },
    loadVaultTree,
    setVaultName,
    handleInput,
    reset,
  };
}
