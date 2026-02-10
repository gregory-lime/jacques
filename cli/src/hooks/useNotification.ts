/**
 * useNotification Hook
 *
 * Manages notification messages displayed in the CLI dashboard.
 * Handles both local UI notifications (showNotification) and
 * server-pushed notification_fired WebSocket events.
 *
 * Local notifications: ephemeral messages triggered by user actions
 * (e.g. "Terminal focused", "No active session").
 *
 * Server notifications: pushed via WebSocket when the server detects
 * events (context thresholds, plan ready, etc.).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { NotificationItem } from "@jacques/core/notifications";
import { CATEGORY_SYMBOLS } from "@jacques/core/notifications";
import type { JacquesClient } from "@jacques/core";

const MAX_QUEUE = 10;
const AUTO_DISMISS_MS = 5000;

export interface ServerNotification {
  id: string;
  item: NotificationItem;
  dismissed: boolean;
}

export interface UseNotificationReturn {
  /** Current notification text (local or server) */
  notification: string | null;
  /** Show a local ephemeral notification */
  showNotification: (message: string, duration?: number) => void;
  /** Server-pushed notification queue (newest first) */
  serverNotifications: ServerNotification[];
  /** Latest undismissed server notification */
  latestServerNotification: ServerNotification | null;
  /** Dismiss a server notification by ID */
  dismissNotification: (id: string) => void;
  /** Clear all server notifications */
  clearAll: () => void;
}

export function useNotification(client?: JacquesClient | null): UseNotificationReturn {
  const [notification, setNotification] = useState<string | null>(null);
  const [serverNotifications, setServerNotifications] = useState<ServerNotification[]>([]);
  const dismissTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Show local notification temporarily
  const showNotification = useCallback((message: string, duration = 3000) => {
    const isError = /^(failed|error|no |not |invalid|cannot|couldn't)/i.test(message);
    const prefix = isError ? "!" : "";
    setNotification(prefix + message);
    setTimeout(() => setNotification(null), duration);
  }, []);

  // Subscribe to server notification_fired events
  useEffect(() => {
    if (!client) return;

    const handler = (notif: NotificationItem) => {
      const symbol = CATEGORY_SYMBOLS[notif.category] ?? "●";
      const serverNotif: ServerNotification = {
        id: notif.id,
        item: notif,
        dismissed: false,
      };

      setServerNotifications(prev => {
        const filtered = prev.filter(n => n.id !== notif.id);
        return [serverNotif, ...filtered].slice(0, MAX_QUEUE);
      });

      // Also show as inline notification text
      setNotification(`${symbol} ${notif.title}: ${notif.body}`);
      setTimeout(() => setNotification(null), AUTO_DISMISS_MS);

      // Auto-dismiss from queue after timeout
      const timer = setTimeout(() => {
        setServerNotifications(prev =>
          prev.map(n => n.id === notif.id ? { ...n, dismissed: true } : n)
        );
        dismissTimers.current.delete(notif.id);
      }, AUTO_DISMISS_MS);
      dismissTimers.current.set(notif.id, timer);
    };

    client.on("notification_fired", handler);
    return () => {
      client.removeListener("notification_fired", handler);
      // Clear all timers
      for (const timer of dismissTimers.current.values()) {
        clearTimeout(timer);
      }
      dismissTimers.current.clear();
    };
  }, [client]);

  const dismissNotification = useCallback((id: string) => {
    setServerNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, dismissed: true } : n)
    );
    const timer = dismissTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.current.delete(id);
    }
  }, []);

  const clearAll = useCallback(() => {
    setServerNotifications([]);
    for (const timer of dismissTimers.current.values()) {
      clearTimeout(timer);
    }
    dismissTimers.current.clear();
  }, []);

  const latestServerNotification = serverNotifications.find(n => !n.dismissed) ?? null;

  return {
    notification,
    showNotification,
    serverNotifications,
    latestServerNotification,
    dismissNotification,
    clearAll,
  };
}
