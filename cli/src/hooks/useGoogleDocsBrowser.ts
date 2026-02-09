/**
 * useGoogleDocsBrowser Hook
 *
 * Manages Google Docs file tree browsing state and keyboard navigation.
 * Extracted from App.tsx.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  getGoogleDocsFileTree,
  flattenGoogleDocsTree,
  exportGoogleDoc,
  addContext,
} from "@jacques/core";
import type { FileTreeNode, FlatTreeItem, Session } from "@jacques/core";
import { GOOGLE_DOCS_VISIBLE_ITEMS } from "../components/GoogleDocsBrowserView.js";

export interface UseGoogleDocsBrowserParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
  focusedSession: Session | undefined;
  returnToMain: () => void;
}

export interface UseGoogleDocsBrowserReturn {
  state: {
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

export function useGoogleDocsBrowser({
  setCurrentView,
  showNotification,
  focusedSession,
  returnToMain,
}: UseGoogleDocsBrowserParams): UseGoogleDocsBrowserReturn {
  // Google Docs browser state
  const [googleDocsFileTree, setGoogleDocsFileTree] = useState<FileTreeNode[]>([]);
  const [googleDocsExpandedFolders, setGoogleDocsExpandedFolders] = useState<Set<string>>(new Set());
  const [googleDocsTreeItems, setGoogleDocsTreeItems] = useState<FlatTreeItem[]>([]);
  const [googleDocsFileIndex, setGoogleDocsFileIndex] = useState<number>(0);
  const [googleDocsScrollOffset, setGoogleDocsScrollOffset] = useState<number>(0);
  const [googleDocsBrowserLoading, setGoogleDocsBrowserLoading] = useState<boolean>(false);
  const [googleDocsBrowserError, setGoogleDocsBrowserError] = useState<string | null>(null);

  // Toggle Google Docs folder expand/collapse
  const toggleGoogleDocsFolder = useCallback((folderId: string) => {
    setGoogleDocsExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      const items = flattenGoogleDocsTree(googleDocsFileTree, next);
      setGoogleDocsTreeItems(items);
      return next;
    });
  }, [googleDocsFileTree]);

  // Helper to load Google Docs files as tree
  const loadTree = useCallback(async () => {
    setGoogleDocsBrowserLoading(true);
    setGoogleDocsBrowserError(null);
    setGoogleDocsFileTree([]);
    setGoogleDocsExpandedFolders(new Set());
    setGoogleDocsTreeItems([]);
    setGoogleDocsFileIndex(0);
    setGoogleDocsScrollOffset(0);

    try {
      const tree = await getGoogleDocsFileTree();
      setGoogleDocsFileTree(tree);
      const items = flattenGoogleDocsTree(tree, new Set());
      setGoogleDocsTreeItems(items);
    } catch (err) {
      setGoogleDocsBrowserError(
        `Failed to list files: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setGoogleDocsBrowserLoading(false);
    }
  }, []);

  // Handle keyboard input for google-docs-browser view
  const handleInput = useCallback((input: string, key: Key) => {
    // Google Docs file browser view
    if (key.escape) {
      setCurrentView("load-sources");
      return;
    }

    if (key.upArrow) {
      const newIndex = Math.max(0, googleDocsFileIndex - 1);
      setGoogleDocsFileIndex(newIndex);
      if (newIndex < googleDocsScrollOffset) {
        setGoogleDocsScrollOffset(newIndex);
      }
      return;
    }

    if (key.downArrow) {
      const newIndex = Math.min(googleDocsTreeItems.length - 1, googleDocsFileIndex + 1);
      setGoogleDocsFileIndex(newIndex);
      if (newIndex >= googleDocsScrollOffset + GOOGLE_DOCS_VISIBLE_ITEMS) {
        setGoogleDocsScrollOffset(newIndex - GOOGLE_DOCS_VISIBLE_ITEMS + 1);
      }
      return;
    }

    if (key.return && googleDocsTreeItems.length > 0) {
      const item = googleDocsTreeItems[googleDocsFileIndex];
      if (item) {
        if (item.type === "folder") {
          toggleGoogleDocsFolder(item.id);
        } else {
          // Export and add to context
          showNotification("Exporting document...");
          exportGoogleDoc(item.id).then(async (content) => {
            if (!content) {
              showNotification("Failed to export document");
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
                name: item.name,
                source: "google_docs",
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
  }, [googleDocsFileIndex, googleDocsScrollOffset, googleDocsTreeItems, toggleGoogleDocsFolder, showNotification, focusedSession, returnToMain, setCurrentView]);

  // Reset all state
  const reset = useCallback(() => {
    setGoogleDocsFileTree([]);
    setGoogleDocsExpandedFolders(new Set());
    setGoogleDocsTreeItems([]);
    setGoogleDocsFileIndex(0);
    setGoogleDocsScrollOffset(0);
    setGoogleDocsBrowserLoading(false);
    setGoogleDocsBrowserError(null);
  }, []);

  return {
    state: {
      treeItems: googleDocsTreeItems,
      fileIndex: googleDocsFileIndex,
      scrollOffset: googleDocsScrollOffset,
      loading: googleDocsBrowserLoading,
      error: googleDocsBrowserError,
    },
    loadTree,
    handleInput,
    reset,
  };
}
