/**
 * Notification constants for Jacques.
 *
 * Shared between server, GUI, and CLI.
 */

import type { NotificationCategory, NotificationSettings } from './types.js';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false, // OFF by default — user must opt in
  categories: {
    context: true,
    operation: true,
    plan: true,
    'auto-compact': true,
    handoff: true,
  },
  largeOperationThreshold: 50_000,
  contextThresholds: [50, 70], // Only 50% and 70%
};

/** Cooldown periods per category in milliseconds */
export const NOTIFICATION_COOLDOWNS: Record<NotificationCategory, number> = {
  context: 60_000,
  operation: 10_000,
  plan: 30_000,
  'auto-compact': 60_000,
  handoff: 10_000,
};

/** Unicode symbols per notification category */
export const CATEGORY_SYMBOLS: Record<NotificationCategory, string> = {
  context: '◆',
  operation: '⚡',
  plan: '◇',
  'auto-compact': '▲',
  handoff: '✓',
};

/** Human-readable labels per notification category */
export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  context: 'Context',
  operation: 'Operation',
  plan: 'Plan',
  'auto-compact': 'Compact',
  handoff: 'Handoff',
};

/** Maximum number of notifications to keep in history */
export const MAX_NOTIFICATION_HISTORY = 50;
