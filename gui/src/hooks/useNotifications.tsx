/**
 * Notification provider + hook for Jacques GUI.
 *
 * Detects session events (context thresholds, large operations, plans,
 * auto-compact, handoffs) and fires both in-app toasts and browser
 * Notification API alerts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toastStore } from '../components/ui/ToastContainer';
import { notificationStore } from '../components/ui/NotificationStore';
import type { ToastPriority } from '../components/ui/Toast';
import type { Session, ClaudeOperation, SessionBadges } from '../types';
import {
  DEFAULT_SETTINGS,
  COOLDOWNS,
  STORAGE_KEY,
  type NotificationCategory,
  type NotificationSettings,
} from '../notifications/types';

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

function loadSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed, categories: { ...DEFAULT_SETTINGS.categories, ...parsed.categories } };
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: NotificationSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function getBrowserPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Send a browser notification (only when tab is unfocused). */
function fireBrowserNotification(
  title: string,
  body: string,
  tag: string,
) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus()) return;

  new Notification(title, {
    body,
    tag, // replaces previous notification with same tag
    icon: '/jacsub.png',
  });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface NotificationProviderProps {
  children: ReactNode;
  sessions: Session[];
  claudeOperations: ClaudeOperation[];
  badges: Map<string, SessionBadges>;
}

export function NotificationProvider({
  children,
  sessions,
  claudeOperations,
  badges,
}: NotificationProviderProps) {
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(getBrowserPermission);

  // Persist settings
  useEffect(() => { saveSettings(settings); }, [settings]);

  // Refs for previous-state diffing
  const prevSessionsRef = useRef<Map<string, Session>>(new Map());
  const prevOpsCountRef = useRef(0);
  const prevBadgesRef = useRef<Map<string, SessionBadges>>(new Map());
  const cooldownsRef = useRef<Map<string, number>>(new Map()); // key -> last fire timestamp
  const firedThresholdsRef = useRef<Map<string, Set<number>>>(new Map()); // sessionId -> set of fired thresholds

  // ---- settings mutations ----

  const updateSettings = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  const toggleCategory = useCallback((cat: NotificationCategory) => {
    setSettings(prev => ({
      ...prev,
      categories: { ...prev.categories, [cat]: !prev.categories[cat] },
    }));
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setBrowserPermission(result);
  }, []);

  // ---- cooldown gate ----

  const canFire = useCallback((category: NotificationCategory, key: string): boolean => {
    const cooldownKey = `${category}:${key}`;
    const last = cooldownsRef.current.get(cooldownKey) ?? 0;
    const now = Date.now();
    if (now - last < COOLDOWNS[category]) return false;
    cooldownsRef.current.set(cooldownKey, now);
    return true;
  }, []);

  // ---- unified notify helper ----

  const notify = useCallback((
    category: NotificationCategory,
    key: string,
    title: string,
    body: string,
    priority: ToastPriority,
  ) => {
    if (!settings.enabled) return;
    if (!settings.categories[category]) return;
    if (!canFire(category, key)) return;

    // Push in-app toast (ephemeral, auto-dismissing)
    toastStore.push({ title, body, priority, category });

    // Push to persistent notification store (for NotificationCenter history)
    notificationStore.push({
      id: `${category}-${key}-${Date.now()}`,
      title,
      body,
      priority,
      category,
      timestamp: Date.now(),
    });

    // Browser notification when unfocused
    fireBrowserNotification(title, body, `jacques-${category}-${key}`);
  }, [settings, canFire]);

  // ---- event detection: context thresholds ----

  useEffect(() => {
    const prevMap = prevSessionsRef.current;

    for (const session of sessions) {
      const pct = session.context_metrics?.used_percentage;
      if (pct == null) continue;

      // Track which thresholds we've already fired for this session
      if (!firedThresholdsRef.current.has(session.session_id)) {
        firedThresholdsRef.current.set(session.session_id, new Set());
      }
      const fired = firedThresholdsRef.current.get(session.session_id)!;

      const prevSession = prevMap.get(session.session_id);
      const prevPct = prevSession?.context_metrics?.used_percentage ?? 0;

      for (const threshold of settings.contextThresholds) {
        // Fire if we crossed upward past the threshold and haven't fired it yet
        if (pct >= threshold && prevPct < threshold && !fired.has(threshold)) {
          fired.add(threshold);

          const priority: ToastPriority =
            threshold >= 90 ? 'critical' :
            threshold >= 70 ? 'high' : 'medium';

          const label = session.session_title || session.project || session.session_id.slice(0, 8);
          notify(
            'context',
            `${session.session_id}-${threshold}`,
            `Context ${threshold}%`,
            `"${label}" reached ${Math.round(pct)}% context usage`,
            priority,
          );
        }
      }
    }

    // Update prev map
    const newMap = new Map<string, Session>();
    for (const s of sessions) newMap.set(s.session_id, s);
    prevSessionsRef.current = newMap;

    // Clean up fired thresholds for removed sessions
    const activeIds = new Set(sessions.map(s => s.session_id));
    for (const id of firedThresholdsRef.current.keys()) {
      if (!activeIds.has(id)) firedThresholdsRef.current.delete(id);
    }
  }, [sessions, notify, settings.contextThresholds]);

  // ---- event detection: large operations ----

  useEffect(() => {
    const newOps = claudeOperations.slice(prevOpsCountRef.current);
    prevOpsCountRef.current = claudeOperations.length;

    for (const op of newOps) {
      if (op.phase !== 'complete') continue;
      if (op.totalTokens < settings.largeOperationThreshold) continue;

      const tokens = op.totalTokens >= 1000
        ? `${Math.round(op.totalTokens / 1000)}k`
        : String(op.totalTokens);

      notify(
        'operation',
        op.id,
        `Large Operation (${tokens} tokens)`,
        op.userPromptPreview
          ? `"${op.userPromptPreview.slice(0, 80)}"`
          : `${op.operation} completed`,
        op.totalTokens >= 100_000 ? 'high' : 'medium',
      );
    }
  }, [claudeOperations, notify, settings.largeOperationThreshold]);

  // ---- event detection: plan & auto-compact via badges ----

  useEffect(() => {
    const prevBadges = prevBadgesRef.current;

    for (const [sessionId, badge] of badges) {
      const prev = prevBadges.get(sessionId);

      // Plan created
      if (prev && badge.planCount > prev.planCount) {
        const session = sessions.find(s => s.session_id === sessionId);
        const label = session?.session_title || session?.project || sessionId.slice(0, 8);
        notify(
          'plan',
          `${sessionId}-plan-${badge.planCount}`,
          'Plan Created',
          `New plan detected in "${label}"`,
          'medium',
        );
      }

      // Auto-compact
      if (prev && !prev.hadAutoCompact && badge.hadAutoCompact) {
        const session = sessions.find(s => s.session_id === sessionId);
        const label = session?.session_title || session?.project || sessionId.slice(0, 8);
        notify(
          'auto-compact',
          `${sessionId}-compact`,
          'Auto-Compact Triggered',
          `"${label}" was automatically compacted`,
          'high',
        );
      }
    }

    prevBadgesRef.current = new Map(badges);
  }, [badges, sessions, notify]);

  return (
    <NotificationContext.Provider
      value={{
        settings,
        updateSettings,
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
