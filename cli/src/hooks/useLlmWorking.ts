/**
 * useLlmWorking Hook
 *
 * Manages LLM working state for Create Handoff and other LLM operations.
 * Handles streaming progress, elapsed time tracking, and abort/cancel.
 */

import { useState, useEffect, useCallback } from "react";
import type { Key } from "ink";
import type { DashboardView } from "../components/Dashboard.js";
import {
  generateHandoffWithLLM,
  ClaudeCodeError,
} from "@jacques/core";

export interface UseLlmWorkingParams {
  setCurrentView: (view: DashboardView) => void;
  showNotification: (msg: string, duration?: number) => void;
}

export interface UseLlmWorkingState {
  title: string;
  description: string | undefined;
  elapsedSeconds: number;
  streamingText: string;
  inputTokens: number;
  outputTokens: number;
  currentStage: string;
}

export interface UseLlmWorkingReturn {
  state: UseLlmWorkingState;
  isActive: boolean;
  startHandoff: (transcriptPath: string, cwd: string) => Promise<void>;
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useLlmWorking({
  setCurrentView,
  showNotification,
}: UseLlmWorkingParams): UseLlmWorkingReturn {
  // LLM working state (for Create Handoff and other LLM operations)
  const [llmWorkingActive, setLlmWorkingActive] = useState<boolean>(false);
  const [llmWorkingTitle, setLlmWorkingTitle] = useState<string>("Working...");
  const [llmWorkingDescription, setLlmWorkingDescription] = useState<string | undefined>(undefined);
  const [llmWorkingElapsedSeconds, setLlmWorkingElapsedSeconds] = useState<number>(0);
  const [llmWorkingStartTime, setLlmWorkingStartTime] = useState<number | null>(null);
  const [llmAbortController, setLlmAbortController] = useState<AbortController | null>(null);

  // LLM streaming state
  const [llmStreamingText, setLlmStreamingText] = useState<string>("");
  const [llmInputTokens, setLlmInputTokens] = useState<number>(0);
  const [llmOutputTokens, setLlmOutputTokens] = useState<number>(0);
  const [llmCurrentStage, setLlmCurrentStage] = useState<string>("");

  // Timer for LLM working elapsed time
  useEffect(() => {
    if (!llmWorkingActive || !llmWorkingStartTime) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - llmWorkingStartTime) / 1000);
      setLlmWorkingElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [llmWorkingActive, llmWorkingStartTime]);

  const startHandoff = useCallback(async (transcriptPath: string, cwd: string) => {
    // Create abort controller for cancellation
    const abortController = new AbortController();
    setLlmAbortController(abortController);

    // Show LLM working view
    setCurrentView("llm-working");
    setLlmWorkingActive(true);
    setLlmWorkingTitle("Creating Handoff");
    setLlmWorkingDescription("Analyzing conversation and generating summary...");
    setLlmWorkingElapsedSeconds(0);
    setLlmWorkingStartTime(Date.now());

    // Reset streaming state
    setLlmStreamingText("");
    setLlmInputTokens(0);
    setLlmOutputTokens(0);
    setLlmCurrentStage("");

    try {
      const result = await generateHandoffWithLLM(
        transcriptPath,
        cwd,
        {
          signal: abortController.signal,
          stream: {
            onTextDelta: (text) => {
              setLlmStreamingText((prev) => prev + text);
            },
            onTokenUpdate: (input, output) => {
              setLlmInputTokens(input);
              setLlmOutputTokens(output);
            },
            onStage: (stage) => {
              setLlmCurrentStage(stage);
            },
          },
        }
      );

      // Clear working state
      setLlmWorkingActive(false);
      setLlmAbortController(null);
      setCurrentView("main");

      // Show success notification with token count
      const tokenDisplay = result.totalTokens.toLocaleString();
      showNotification(
        `Handoff saved: ${result.filename} (${tokenDisplay} tokens)`,
        5000
      );
    } catch (error) {
      // Clear working state
      setLlmWorkingActive(false);
      setLlmAbortController(null);
      setCurrentView("main");

      // Show error notification
      if (error instanceof ClaudeCodeError && error.message === "Cancelled by user") {
        showNotification("Handoff creation cancelled");
      } else {
        showNotification(
          `Failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }, [setCurrentView, showNotification]);

  const handleInput = useCallback((input: string, key: Key) => {
    // LLM working view - only Escape to cancel
    if (key.escape) {
      if (llmAbortController) {
        llmAbortController.abort();
      }
      setLlmWorkingActive(false);
      setLlmAbortController(null);
      setCurrentView("main");
      showNotification("Cancelled");
      return;
    }
  }, [llmAbortController, setCurrentView, showNotification]);

  const reset = useCallback(() => {
    setLlmWorkingActive(false);
    setLlmWorkingTitle("Working...");
    setLlmWorkingDescription(undefined);
    setLlmWorkingElapsedSeconds(0);
    setLlmWorkingStartTime(null);
    setLlmAbortController(null);
    setLlmStreamingText("");
    setLlmInputTokens(0);
    setLlmOutputTokens(0);
    setLlmCurrentStage("");
  }, []);

  return {
    state: {
      title: llmWorkingTitle,
      description: llmWorkingDescription,
      elapsedSeconds: llmWorkingElapsedSeconds,
      streamingText: llmStreamingText,
      inputTokens: llmInputTokens,
      outputTokens: llmOutputTokens,
      currentStage: llmCurrentStage,
    },
    isActive: llmWorkingActive,
    startHandoff,
    handleInput,
    reset,
  };
}
