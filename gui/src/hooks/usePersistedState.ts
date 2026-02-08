import { useState, useCallback, useEffect } from 'react';

/**
 * All persisted state keys and their types.
 * Add new keys here to ensure type safety across the app.
 */
export interface PersistedStateSchema {
  'selectedProject': string | null;
  'sidebarCollapsed': boolean;
  'showLogs': boolean;
  'logPanelHeight': number;
  'catalogCollapsed': boolean;
  'notificationSettings': {
    enabled: boolean;
    soundEnabled: boolean;
    contextThreshold: number;
  };
  'openSessions': string[];
  'dangerouslySkipPermissions': boolean;
}

const STORAGE_PREFIX = 'jacques:';

function getStorageKey(key: keyof PersistedStateSchema): string {
  return `${STORAGE_PREFIX}${key}`;
}

/**
 * Get a persisted value directly (non-reactive).
 * Useful for initial values or one-off reads.
 */
export function getPersistedValue<K extends keyof PersistedStateSchema>(
  key: K,
  defaultValue: PersistedStateSchema[K]
): PersistedStateSchema[K] {
  try {
    const stored = localStorage.getItem(getStorageKey(key));
    if (stored === null) return defaultValue;
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
}

/**
 * Set a persisted value directly (non-reactive).
 */
export function setPersistedValue<K extends keyof PersistedStateSchema>(
  key: K,
  value: PersistedStateSchema[K]
): void {
  localStorage.setItem(getStorageKey(key), JSON.stringify(value));
}

/**
 * Hook for persisted state that syncs with localStorage.
 * Automatically saves to localStorage on changes.
 * Syncs across tabs via storage event.
 */
export function usePersistedState<K extends keyof PersistedStateSchema>(
  key: K,
  defaultValue: PersistedStateSchema[K]
): [PersistedStateSchema[K], (value: PersistedStateSchema[K]) => void] {
  const storageKey = getStorageKey(key);

  const [value, setValue] = useState<PersistedStateSchema[K]>(() => {
    return getPersistedValue(key, defaultValue);
  });

  const setPersistedAndState = useCallback(
    (newValue: PersistedStateSchema[K]) => {
      setValue(newValue);
      localStorage.setItem(storageKey, JSON.stringify(newValue));
    },
    [storageKey]
  );

  // Sync across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue !== null) {
        try {
          setValue(JSON.parse(e.newValue));
        } catch {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey]);

  return [value, setPersistedAndState];
}
