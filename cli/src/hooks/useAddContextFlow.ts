/**
 * useAddContextFlow Hook
 *
 * Manages the add-context confirmation dialog: description input, submit, success/error states.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import { addContext } from "@jacques-ai/core";
import type { ObsidianFile, Session } from "@jacques-ai/core";

export interface UseAddContextFlowParams {
  setCurrentView: (view: DashboardView) => void;
  focusedSession: Session | undefined;
}

export interface UseAddContextFlowState {
  selectedFile: ObsidianFile | null;
  contextDescription: string;
  contextSuccess: { name: string; path: string } | null;
  contextError: string | null;
}

export interface UseAddContextFlowReturn {
  state: UseAddContextFlowState;
  startConfirm: (file: ObsidianFile) => void;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useAddContextFlow({
  setCurrentView,
  focusedSession,
}: UseAddContextFlowParams): UseAddContextFlowReturn {
  const [selectedFile, setSelectedFile] = useState<ObsidianFile | null>(null);
  const [description, setDescription] = useState<string>("");
  const [success, setSuccess] = useState<{ name: string; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!selectedFile || !focusedSession) return;

    const cwd = focusedSession.workspace?.project_dir || focusedSession.cwd;

    try {
      const result = await addContext({
        cwd,
        sourceFile: selectedFile.path,
        name: selectedFile.name,
        source: "obsidian",
        description: description || undefined,
      });
      setSuccess({ name: result.name, path: result.path });
    } catch (err) {
      setError(
        `Failed to add context: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [selectedFile, focusedSession, description]);

  const startConfirm = useCallback((file: ObsidianFile) => {
    setSelectedFile(file);
    setDescription("");
    setSuccess(null);
    setError(null);
    setCurrentView("add-context-confirm");
  }, [setCurrentView]);

  const handleInput = useCallback((input: string, key: Key) => {
    if (success) {
      setCurrentView("main");
      return;
    }
    if (key.escape) {
      setCurrentView("obsidian-browser");
      setSelectedFile(null);
      setDescription("");
      setError(null);
      return;
    }
    if (key.return && selectedFile && !error) {
      handleConfirm();
      return;
    }
    if (!error) {
      if (key.backspace || key.delete) {
        setDescription((prev) => prev.slice(0, -1));
        return;
      }
      if (input && input.length === 1) {
        setDescription((prev) => prev + input);
        return;
      }
    }
  }, [success, selectedFile, error, handleConfirm, setCurrentView]);

  const reset = useCallback(() => {
    setSelectedFile(null);
    setDescription("");
    setSuccess(null);
    setError(null);
  }, []);

  return {
    state: {
      selectedFile,
      contextDescription: description,
      contextSuccess: success,
      contextError: error,
    },
    startConfirm,
    handleInput,
    reset,
  };
}
