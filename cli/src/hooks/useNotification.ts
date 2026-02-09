/**
 * useNotification Hook
 *
 * Manages temporary notification messages displayed in the dashboard.
 * Detects error messages by common keyword prefixes and adds a "!" prefix.
 * Extracted from App.tsx.
 */

import { useState, useCallback } from "react";

export interface UseNotificationReturn {
  notification: string | null;
  showNotification: (message: string, duration?: number) => void;
}

export function useNotification(): UseNotificationReturn {
  const [notification, setNotification] = useState<string | null>(null);

  // Show notification temporarily
  // Prefix with ! for errors (detected by keywords), otherwise treated as success
  const showNotification = useCallback((message: string, duration = 3000) => {
    // Detect error messages by common keywords
    const isError = /^(failed|error|no |not |invalid|cannot|couldn't)/i.test(message);
    const prefix = isError ? "!" : "";
    setNotification(prefix + message);
    setTimeout(() => setNotification(null), duration);
  }, []);

  return {
    notification,
    showNotification,
  };
}
