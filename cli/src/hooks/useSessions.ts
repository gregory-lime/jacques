/**
 * useSessions Hook
 *
 * Manages session list view state: navigation, multi-select for tiling,
 * and keyboard shortcut actions (focus, maximize, tile, launch).
 */

import { useState, useCallback } from "react";
import type { Key } from "ink";
import type { Session } from "@jacques/core";
import { getProjectGroupKey } from "../utils/project.js";

export interface UseSessionsParams {
  sessions: Session[];
  focusedSessionId: string | null;
  selectedProject: string | null;
  focusTerminal: (sessionId: string) => void;
  maximizeWindow: (sessionId: string) => void;
  tileWindows: (sessionIds: string[], layout?: 'side-by-side' | 'thirds' | '2x2' | 'smart') => void;
  launchSession: (cwd: string, dangerouslySkipPermissions?: boolean) => void;
  showNotification: (msg: string) => void;
  returnToMain: () => void;
}

export interface UseSessionsReturn {
  selectedIndex: number;
  scrollOffset: number;
  selectedIds: Set<string>;
  filteredSessions: Session[];
  handleInput: (input: string, key: Key) => void;
  reset: () => void;
}

export function useSessions({
  sessions,
  focusedSessionId,
  selectedProject,
  focusTerminal,
  maximizeWindow,
  tileWindows,
  launchSession,
  showNotification,
  returnToMain,
}: UseSessionsParams): UseSessionsReturn {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter sessions by selected project (use git repo root for worktree grouping)
  const filteredSessions = selectedProject
    ? sessions.filter((s) => getProjectGroupKey(s) === selectedProject)
    : [...sessions];

  // Sort: focused first, then by registration time
  filteredSessions.sort((a, b) => {
    if (a.session_id === focusedSessionId) return -1;
    if (b.session_id === focusedSessionId) return 1;
    return a.registered_at - b.registered_at;
  });

  const handleInput = useCallback((input: string, key: Key) => {
    if (key.escape) {
      returnToMain();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const next = Math.max(0, prev - 1);
        const itemLine = next * 3;
        if (itemLine < scrollOffset) setScrollOffset(itemLine);
        return next;
      });
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => {
        const maxIndex = Math.max(0, filteredSessions.length - 1);
        const next = Math.min(maxIndex, prev + 1);
        const itemLine = next * 3;
        const maxVisible = 7;
        if (itemLine >= scrollOffset + maxVisible) {
          setScrollOffset(itemLine - maxVisible + 3);
        }
        return next;
      });
      return;
    }

    // Enter — focus terminal
    if (key.return && filteredSessions.length > 0) {
      const session = filteredSessions[selectedIndex];
      if (session) {
        showNotification("Focusing terminal...");
        focusTerminal(session.session_id);
      }
      return;
    }

    // Space — toggle multi-select
    if (input === " " && filteredSessions.length > 0) {
      const session = filteredSessions[selectedIndex];
      if (session) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(session.session_id)) {
            next.delete(session.session_id);
          } else {
            next.add(session.session_id);
          }
          return next;
        });
      }
      return;
    }

    // f — maximize (fullscreen) selected session
    if (input === "f" && filteredSessions.length > 0) {
      const session = filteredSessions[selectedIndex];
      if (session) {
        showNotification("Maximizing window...");
        maximizeWindow(session.session_id);
      }
      return;
    }

    // t — tile selected sessions
    if (input === "t") {
      if (selectedIds.size >= 2) {
        showNotification(`Tiling ${selectedIds.size} windows...`);
        tileWindows(Array.from(selectedIds));
      } else {
        showNotification("Select 2+ sessions with [Space] first");
      }
      return;
    }

    // n — launch new session
    if (input === "n") {
      const session = filteredSessions[selectedIndex];
      const cwd = session?.cwd || session?.workspace?.project_dir;
      if (cwd) {
        showNotification("Launching new session...");
        launchSession(cwd);
      } else {
        showNotification("No project directory available");
      }
      return;
    }
  }, [filteredSessions, selectedIndex, scrollOffset, selectedIds, returnToMain, focusTerminal, maximizeWindow, tileWindows, launchSession, showNotification]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIndex,
    scrollOffset,
    selectedIds,
    filteredSessions,
    handleInput,
    reset,
  };
}
