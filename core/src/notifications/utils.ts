/**
 * Notification utility functions for Jacques.
 *
 * Shared between server, GUI, and CLI.
 */

import type { NotificationPriority } from './types.js';

/**
 * Returns priority based on a context threshold level.
 * >=70 → high, <70 → medium
 */
export function getContextThresholdPriority(threshold: number): NotificationPriority {
  if (threshold >= 70) return 'high';
  return 'medium';
}

/**
 * Generate a unique notification ID.
 */
export function generateNotificationId(category: string, key: string): string {
  return `notif-${category}-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Format a timestamp as a human-readable age string.
 */
export function formatNotificationAge(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
