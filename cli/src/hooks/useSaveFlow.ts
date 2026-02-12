/**
 * useSaveFlow Hook
 *
 * Manages the save context flow: session detection, JSONL parsing,
 * preview generation, label input, and archive saving.
 * Extracted from App.tsx.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import {
  detectCurrentSession,
  findSessionById,
  parseJSONL,
  getSessionPreview,
  transformToSavedContext,
  FilterType,
  applyFilter,
  FILTER_CONFIGS,
  saveToArchive,
} from "@jacques-ai/core";
import type { SessionFile, ParsedEntry, Session } from "@jacques-ai/core";
import type {
  SavePreviewData,
  SaveSuccessData,
} from "../components/SaveContextView.js";

export interface UseSaveFlowParams {
  focusedSession: Session | undefined;
  showNotification: (msg: string, duration?: number) => void;
  returnToMain: () => void;
}

export interface UseSaveFlowState {
  preview: SavePreviewData | null;
  label: string;
  error: string | null;
  success: SaveSuccessData | null;
  scrollOffset: number;
}

export interface UseSaveFlowReturn {
  state: UseSaveFlowState;
  start: () => Promise<void>;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useSaveFlow({
  focusedSession,
  showNotification,
  returnToMain,
}: UseSaveFlowParams): UseSaveFlowReturn {
  // Save flow state
  const [savePreview, setSavePreview] = useState<SavePreviewData | null>(null);
  const [saveLabel, setSaveLabel] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<SaveSuccessData | null>(null);
  const [saveScrollOffset, setSaveScrollOffset] = useState<number>(0);

  // Selected filter type for save flow (loaded from settings)
  const [selectedFilterType, setSelectedFilterType] = useState<FilterType>(
    FilterType.WITHOUT_TOOLS
  );

  // Session data for save flow
  const [sessionFile, setSessionFile] = useState<SessionFile | null>(null);
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);

  // Start save flow - detect session, parse JSONL, generate preview
  const start = useCallback(async () => {
    if (!focusedSession) {
      showNotification("No active session to save");
      return;
    }

    // Start save flow - go directly to save view (filter is in settings)
    setSaveError(null);
    setSaveSuccess(null);
    setSaveLabel("");
    setSavePreview(null);
    setSaveScrollOffset(0);
    setSessionFile(null);
    setParsedEntries([]);

    // Use WITHOUT_TOOLS as the default filter for saving
    const saveFilterType = FilterType.WITHOUT_TOOLS;
    setSelectedFilterType(saveFilterType);

    // Get working directory from focused session
    const cwd =
      focusedSession.workspace?.project_dir || focusedSession.cwd;

    try {
      let detected: SessionFile | null = null;

      // First, try to use transcript_path from the session if available
      if (focusedSession.transcript_path) {
        try {
          const { promises: fs } = await import("fs");
          const stats = await fs.stat(focusedSession.transcript_path);
          detected = {
            filePath: focusedSession.transcript_path,
            sessionId: focusedSession.session_id,
            modifiedAt: stats.mtime,
            sizeBytes: stats.size,
          };
        } catch {
          // transcript_path doesn't exist or isn't accessible
          detected = null;
        }
      }

      // Fall back to detecting from Claude projects directory by cwd
      if (!detected) {
        detected = await detectCurrentSession({ cwd });
      }

      // Last resort: search by session ID across all projects
      if (!detected) {
        detected = await findSessionById(focusedSession.session_id);
      }

      if (!detected) {
        setSaveError(
          "No session file found. Cursor native AI sessions may not have JSONL files - this feature requires Claude Code CLI.",
        );
        return;
      }

      setSessionFile(detected);

      // Parse the JSONL file
      const entries = await parseJSONL(detected.filePath);
      setParsedEntries(entries);

      // Apply filter and get preview
      const filteredEntries = applyFilter(entries, saveFilterType);
      const sessionSlug =
        focusedSession.session_title || detected.sessionId.substring(0, 8);
      const preview = getSessionPreview(filteredEntries, sessionSlug);
      // Add filter label from config
      const filterConfig = FILTER_CONFIGS[saveFilterType];
      setSavePreview({
        ...preview,
        filterLabel: filterConfig.label,
      });
    } catch (err) {
      setSaveError(
        `Failed to load session: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [focusedSession, showNotification]);

  // Handle save confirmation
  const handleSaveConfirm = useCallback(async () => {
    if (!focusedSession || !sessionFile || parsedEntries.length === 0) {
      setSaveError("No session data to save");
      return;
    }

    try {
      // Get working directory
      const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;
      const sessionSlug =
        focusedSession.session_title || sessionFile.sessionId.substring(0, 8);

      // Apply selected filter to entries
      const filteredEntries = applyFilter(parsedEntries, selectedFilterType);

      // Transform to SavedContext format with filter type
      const savedContext = transformToSavedContext(filteredEntries, {
        sessionFile,
        sessionSlug,
        workingDirectory: cwd,
        filterType: selectedFilterType,
      });

      // Save to both local and global archive
      const result = await saveToArchive(savedContext, {
        cwd,
        label: saveLabel || undefined,
        filterType: selectedFilterType,
        jsonlPath: sessionFile.filePath,
        entries: parsedEntries,
      });

      // Show success - reset scroll to top
      setSavePreview(null);
      setSaveScrollOffset(0);
      setSaveSuccess({
        filename: result.filename,
        filePath: result.localPath,
        fileSize: result.sizeFormatted,
      });
    } catch (err) {
      setSaveScrollOffset(0); // Reset scroll to top on error
      setSaveError(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [focusedSession, sessionFile, parsedEntries, saveLabel, selectedFilterType]);

  // Handle keyboard input for save view
  const handleInput = useCallback((input: string, key: Key) => {
    // Arrow keys for scrolling (works in all save states)
    if (key.upArrow) {
      setSaveScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSaveScrollOffset((prev) => prev + 1);
      return;
    }

    if (saveSuccess || saveError) {
      // Only Enter or Escape closes success/error view
      if (key.return || key.escape) {
        returnToMain();
      }
      return;
    }

    if (key.escape) {
      returnToMain();
      return;
    }

    if (key.return && savePreview) {
      handleSaveConfirm();
      return;
    }

    // Handle label input (only printable characters)
    if (savePreview && !saveError) {
      if (key.backspace || key.delete) {
        setSaveLabel((prev) => prev.slice(0, -1));
        return;
      }

      // Add character to label (alphanumeric, dash, underscore only)
      if (/^[a-zA-Z0-9_-]$/.test(input)) {
        setSaveLabel((prev) => prev + input);
        return;
      }
    }
  }, [saveSuccess, saveError, savePreview, handleSaveConfirm, returnToMain]);

  // Reset all state
  const reset = useCallback(() => {
    setSavePreview(null);
    setSaveLabel("");
    setSaveError(null);
    setSaveSuccess(null);
    setSaveScrollOffset(0);
    setSelectedFilterType(FilterType.WITHOUT_TOOLS);
    setSessionFile(null);
    setParsedEntries([]);
  }, []);

  return {
    state: {
      preview: savePreview,
      label: saveLabel,
      error: saveError,
      success: saveSuccess,
      scrollOffset: saveScrollOffset,
    },
    start,
    handleInput,
    reset,
  };
}
