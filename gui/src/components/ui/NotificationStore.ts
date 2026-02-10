/**
 * Notification Store
 *
 * Framework-agnostic persistent store for notification history.
 * Unlike toastStore (ephemeral, auto-dismissing), this store persists
 * notifications in localStorage and supports read/unread tracking.
 *
 * Compatible with React's useSyncExternalStore.
 */

// ============================================================
// Types (extended from @jacques/core with GUI-specific `read` field)
// ============================================================

import type {
  NotificationPriority,
  NotificationCategory,
  NotificationItem as CoreNotificationItem,
} from '@jacques/core/notifications';

export type { NotificationPriority, NotificationCategory };

export interface NotificationItem extends CoreNotificationItem {
  read: boolean;
}

// ============================================================
// Constants
// ============================================================

const STORAGE_KEY = 'jacques-notification-history';
const MAX_NOTIFICATIONS = 50;

type Listener = () => void;

// ============================================================
// Store state
// ============================================================

let notifications: NotificationItem[] = loadFromStorage();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // localStorage may be full or unavailable
  }
}

function loadFromStorage(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_NOTIFICATIONS);
      }
    }
  } catch {
    // corrupted data, start fresh
  }
  return [];
}

// ============================================================
// Public API
// ============================================================

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return notifications;
}

function push(item: Omit<NotificationItem, 'read'> & { read?: boolean }): string {
  const notification: NotificationItem = {
    ...item,
    read: item.read ?? false,
  };

  // Check for duplicate by id
  if (notifications.some(n => n.id === notification.id)) {
    return notification.id;
  }

  // Prepend (newest first), cap at max
  notifications = [notification, ...notifications].slice(0, MAX_NOTIFICATIONS);
  saveToStorage();
  emit();
  return notification.id;
}

function markRead(id: string) {
  notifications = notifications.map(n =>
    n.id === id ? { ...n, read: true } : n
  );
  saveToStorage();
  emit();
}

function markAllRead() {
  notifications = notifications.map(n => ({ ...n, read: true }));
  saveToStorage();
  emit();
}

function clear() {
  notifications = [];
  saveToStorage();
  emit();
}

function getUnreadCount(): number {
  return notifications.filter(n => !n.read).length;
}

function remove(id: string) {
  notifications = notifications.filter(n => n.id !== id);
  saveToStorage();
  emit();
}

export const notificationStore = {
  push,
  markRead,
  markAllRead,
  clear,
  remove,
  getUnreadCount,
  subscribe,
  getSnapshot,
} as const;
