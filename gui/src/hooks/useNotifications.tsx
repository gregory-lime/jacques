/**
 * Notification settings provider + hook for Jacques GUI.
 *
 * Settings are synced to/from the server via HTTP API.
 * Event detection is handled server-side — GUI is a pure consumer
 * of notification_fired WebSocket messages (see useJacquesClient.ts).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { NotificationCategory, NotificationSettings } from '@jacques-ai/core/notifications';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@jacques-ai/core/notifications';
import { getNotificationSettings, updateNotificationSettings } from '../api';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface NotificationContextValue {
  settings: NotificationSettings;
  updateSettings: (patch: Partial<NotificationSettings>) => void;
  toggleCategory: (cat: NotificationCategory) => void;
  browserPermission: NotificationPermission | 'unsupported';
  requestBrowserPermission: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBrowserPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(getBrowserPermission);

  // Load settings from server on mount
  useEffect(() => {
    getNotificationSettings()
      .then(setSettings)
      .catch(() => {
        // Use defaults if server is not available
      });
  }, []);

  // ---- settings mutations ----

  const updateSettingsHandler = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...patch };
      if (patch.categories) {
        updated.categories = { ...prev.categories, ...patch.categories };
      }
      return updated;
    });
    // Persist to server
    updateNotificationSettings(patch).catch(() => {});
  }, []);

  const toggleCategory = useCallback((cat: NotificationCategory) => {
    setSettings(prev => {
      const newCategories = { ...prev.categories, [cat]: !prev.categories[cat] };
      // Persist to server
      updateNotificationSettings({ categories: newCategories }).catch(() => {});
      return { ...prev, categories: newCategories };
    });
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        settings,
        updateSettings: updateSettingsHandler,
        toggleCategory,
        browserPermission,
        requestBrowserPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
