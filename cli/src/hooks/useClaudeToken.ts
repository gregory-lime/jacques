/**
 * useClaudeToken Hook
 *
 * Manages Claude API token state: connection status, token input/verification,
 * and disconnect flow.
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import {
  isClaudeConnected,
  getClaudeToken,
  saveClaudeToken,
  validateToken,
  verifyToken,
  maskToken,
  disconnectClaude,
} from "@jacques-ai/core";

export interface UseClaudeTokenParams {
  showNotification: (msg: string, duration?: number) => void;
}

export interface UseClaudeTokenState {
  connected: boolean;
  tokenMasked: string | null;
  tokenInput: string;
  tokenError: string | null;
  isInputMode: boolean;
  isVerifying: boolean;
  showSuccess: boolean;
}

export interface UseClaudeTokenReturn {
  state: UseClaudeTokenState;
  handleInput: (input: string, key: Key) => void;
  loadStatus: () => void;
  disconnect: () => void;
  enterInputMode: () => void;
  reset: () => void;
}

export function useClaudeToken({
  showNotification,
}: UseClaudeTokenParams): UseClaudeTokenReturn {
  // Claude token state
  const [claudeConnected, setClaudeConnected] = useState<boolean>(false);
  const [claudeTokenMasked, setClaudeTokenMasked] = useState<string | null>(null);
  const [claudeTokenInput, setClaudeTokenInput] = useState<string>("");
  const [claudeTokenError, setClaudeTokenError] = useState<string | null>(null);
  const [isTokenInputMode, setIsTokenInputMode] = useState<boolean>(false);
  const [isTokenVerifying, setIsTokenVerifying] = useState<boolean>(false);
  const [showConnectionSuccess, setShowConnectionSuccess] = useState<boolean>(false);

  const loadStatus = useCallback(() => {
    // Load Claude connection status
    const connectedStatus = isClaudeConnected();
    setClaudeConnected(connectedStatus);
    if (connectedStatus) {
      const token = getClaudeToken();
      setClaudeTokenMasked(token ? maskToken(token) : null);
    } else {
      setClaudeTokenMasked(null);
    }
    setClaudeTokenInput("");
    setClaudeTokenError(null);
    setIsTokenInputMode(false);
  }, []);

  const disconnect = useCallback(() => {
    disconnectClaude();
    setClaudeConnected(false);
    setClaudeTokenMasked(null);
    showNotification("Claude disconnected");
  }, [showNotification]);

  const enterInputMode = useCallback(() => {
    setIsTokenInputMode(true);
    setClaudeTokenInput("");
    setClaudeTokenError(null);
  }, []);

  const handleInput = useCallback((input: string, key: Key) => {
    // Handle token input mode
    if (key.escape) {
      // Cancel token input
      setIsTokenInputMode(false);
      setClaudeTokenInput("");
      setClaudeTokenError(null);
      return;
    }

    if (key.backspace || key.delete) {
      setClaudeTokenInput((prev) => prev.slice(0, -1));
      setClaudeTokenError(null);
      return;
    }

    // Handle input BEFORE return key - paste includes newlines which trigger key.return
    // If there's multi-char input (paste), process it first
    if (input && input.length >= 1) {
      const cleanInput = input.replace(/[\r\n\t]/g, '').trim();
      if (cleanInput.length > 0) {
        // If pasting what looks like a complete token, set it and auto-verify
        if (cleanInput.startsWith('sk-') && cleanInput.length > 20) {
          // Complete token paste - set and verify
          setClaudeTokenInput(cleanInput);
          setClaudeTokenError(null);

          // Auto-verify after paste
          setIsTokenVerifying(true);
          verifyToken(cleanInput).then((result) => {
            setIsTokenVerifying(false);

            if (!result.valid) {
              setClaudeTokenError(result.error || "Invalid or expired token");
              return;
            }

            try {
              saveClaudeToken(cleanInput);
              setClaudeConnected(true);
              setClaudeTokenMasked(maskToken(cleanInput));
              setIsTokenInputMode(false);
              setClaudeTokenInput("");
              setClaudeTokenError(null);
              // Show temporary success message
              setShowConnectionSuccess(true);
              setTimeout(() => setShowConnectionSuccess(false), 3000);
            } catch (err) {
              setClaudeTokenError(err instanceof Error ? err.message : "Failed to save token");
            }
          }).catch((err) => {
            setIsTokenVerifying(false);
            setClaudeTokenError(err instanceof Error ? err.message : "Failed to verify token");
          });
          return;
        }

        // Regular typing - append to input
        setClaudeTokenInput((prev) => prev + cleanInput);
        setClaudeTokenError(null);
        return;
      }
    }

    // Handle return key (only if no input text, meaning user pressed Enter)
    if (key.return && (!input || input.length === 0 || input === '\r' || input === '\n')) {
      // Try to save the token
      const validation = validateToken(claudeTokenInput);
      if (!validation.valid) {
        setClaudeTokenError(validation.error || "Invalid token");
        return;
      }

      // Verify token with API call
      setIsTokenVerifying(true);
      setClaudeTokenError(null);

      verifyToken(claudeTokenInput).then((result) => {
        setIsTokenVerifying(false);

        if (!result.valid) {
          setClaudeTokenError(result.error || "Invalid or expired token");
          return;
        }

        try {
          saveClaudeToken(claudeTokenInput);
          setClaudeConnected(true);
          setClaudeTokenMasked(maskToken(claudeTokenInput));
          setIsTokenInputMode(false);
          setClaudeTokenInput("");
          setClaudeTokenError(null);
          // Show temporary success message
          setShowConnectionSuccess(true);
          setTimeout(() => setShowConnectionSuccess(false), 3000);
        } catch (err) {
          setClaudeTokenError(err instanceof Error ? err.message : "Failed to save token");
        }
      }).catch((err) => {
        setIsTokenVerifying(false);
        setClaudeTokenError(err instanceof Error ? err.message : "Failed to verify token");
      });
      return;
    }
  }, [claudeTokenInput]);

  const reset = useCallback(() => {
    setClaudeConnected(false);
    setClaudeTokenMasked(null);
    setClaudeTokenInput("");
    setClaudeTokenError(null);
    setIsTokenInputMode(false);
    setIsTokenVerifying(false);
    setShowConnectionSuccess(false);
  }, []);

  return {
    state: {
      connected: claudeConnected,
      tokenMasked: claudeTokenMasked,
      tokenInput: claudeTokenInput,
      tokenError: claudeTokenError,
      isInputMode: isTokenInputMode,
      isVerifying: isTokenVerifying,
      showSuccess: showConnectionSuccess,
    },
    handleInput,
    loadStatus,
    disconnect,
    enterInputMode,
    reset,
  };
}
