/**
 * useNotionBrowser Hook
 *
 * Manages Notion page tree browsing state and keyboard navigation.
 * Extracted from App.tsx.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  getNotionConfig,
  getNotionPageTree,
  flattenNotionTree,
  getNotionPageContent,
  addContext,
} from "@jacques/core";
import type { FileTreeNode, FlatTreeItem, Session } from "@jacques/core";
import { NOTION_VISIBLE_ITEMS } from "../components/NotionBrowserView.js";

export interface UseNotionBrowserParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  focusedSession: Session | undefined;
  returnToMain: () => void;
}

export interface UseNotionBrowserReturn {
  state: {
    workspaceName: string;
    treeItems: FlatTreeItem[];
    fileIndex: number;
    scrollOffset: number;
    loading: boolean;
    error: string | null;
  };
  loadTree: () => Promise<void>;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useNotionBrowser({
  setCurrentView,
  showNotification,
  focusedSession,
  returnToMain,
}: UseNotionBrowserParams): UseNotionBrowserReturn {
  // Notion browser state
  const [notionWorkspaceName, setNotionWorkspaceName] = useState<string>("");
  const [notionFileTree, setNotionFileTree] = useState<FileTreeNode[]>([]);
  const [notionExpandedFolders, setNotionExpandedFolders] = useState<Set<string>>(new Set());
  const [notionTreeItems, setNotionTreeItems] = useState<FlatTreeItem[]>([]);
  const [notionFileIndex, setNotionFileIndex] = useState<number>(0);
  const [notionScrollOffset, setNotionScrollOffset] = useState<number>(0);
  const [notionBrowserLoading, setNotionBrowserLoading] = useState<boolean>(false);
  const [notionBrowserError, setNotionBrowserError] = useState<string | null>(null);

  // Toggle Notion folder expand/collapse
  const toggleNotionFolder = useCallback((folderId: string) => {
    setNotionExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      const items = flattenNotionTree(notionFileTree, next);
      setNotionTreeItems(items);
      return next;
    });
  }, [notionFileTree]);

  // Helper to load Notion pages as tree
  const loadTree = useCallback(async () => {
    setNotionBrowserLoading(true);
    setNotionBrowserError(null);
    setNotionFileTree([]);
    setNotionExpandedFolders(new Set());
    setNotionTreeItems([]);
    setNotionFileIndex(0);
    setNotionScrollOffset(0);

    try {
      // Get workspace name from config
      const config = getNotionConfig();
      if (config?.workspace_name) {
        setNotionWorkspaceName(config.workspace_name);
      }

      const tree = await getNotionPageTree();
      setNotionFileTree(tree);
      const items = flattenNotionTree(tree, new Set());
      setNotionTreeItems(items);
    } catch (err) {
      setNotionBrowserError(
        `Failed to list pages: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setNotionBrowserLoading(false);
    }
  }, []);

  // Handle keyboard input for notion-browser view
  const handleInput = useCallback((input: string, key: Key) => {
    // Notion page browser view
    if (key.escape) {
      setCurrentView("load-sources");
      return;
    }

    if (key.upArrow) {
      const newIndex = Math.max(0, notionFileIndex - 1);
      setNotionFileIndex(newIndex);
      if (newIndex < notionScrollOffset) {
        setNotionScrollOffset(newIndex);
      }
      return;
    }

    if (key.downArrow) {
      const newIndex = Math.min(notionTreeItems.length - 1, notionFileIndex + 1);
      setNotionFileIndex(newIndex);
      if (newIndex >= notionScrollOffset + NOTION_VISIBLE_ITEMS) {
        setNotionScrollOffset(newIndex - NOTION_VISIBLE_ITEMS + 1);
      }
      return;
    }

    if (key.return && notionTreeItems.length > 0) {
      const item = notionTreeItems[notionFileIndex];
      if (item) {
        if (item.type === "folder") {
          toggleNotionFolder(item.id);
        } else {
          // Get page content and add to context
          showNotification("Fetching page content...");
          getNotionPageContent(item.id).then(async (content) => {
            if (!content) {
              showNotification("Failed to fetch page content");
              return;
            }
            if (!focusedSession) {
              showNotification("No active session");
              return;
            }
            const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
            try {
              // Write content to temp file and add to context
              const { promises: fs } = await import("fs");
              const { join } = await import("path");
              const { tmpdir } = await import("os");
              const tempFile = join(tmpdir(), `${item.id}.md`);
              await fs.writeFile(tempFile, content, "utf-8");

              const result = await addContext({
                cwd,
                sourceFile: tempFile,
                name: item.name.replace(/^[\p{Emoji}]\s*/u, ""), // Remove emoji prefix
                source: "notion",
              });
              showNotification(`Added: ${result.name}`, 3000);
              returnToMain();
            } catch (err) {
              showNotification(`Failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          });
        }
      }
      return;
    }
  }, [notionFileIndex, notionScrollOffset, notionTreeItems, toggleNotionFolder, showNotification, focusedSession, returnToMain, setCurrentView]);

  // Reset all state
  const reset = useCallback(() => {
    setNotionWorkspaceName("");
    setNotionFileTree([]);
    setNotionExpandedFolders(new Set());
    setNotionTreeItems([]);
    setNotionFileIndex(0);
    setNotionScrollOffset(0);
    setNotionBrowserLoading(false);
    setNotionBrowserError(null);
  }, []);

  return {
    state: {
      workspaceName: notionWorkspaceName,
      treeItems: notionTreeItems,
      fileIndex: notionFileIndex,
      scrollOffset: notionScrollOffset,
      loading: notionBrowserLoading,
      error: notionBrowserError,
    },
    loadTree,
    handleInput,
    reset,
  };
}
