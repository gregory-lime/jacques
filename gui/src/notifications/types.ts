/**
 * Notification system types and defaults for Jacques GUI.
 */

export type NotificationCategory =
  | 'context'
  | 'operation'
  | 'plan'
  | 'auto-compact'
  | 'handoff';

export interface NotificationSettings {
  /** Master switch for all notifications */
  enabled: boolean;
  /** Per-category toggles */
  categories: Record<NotificationCategory, boolean>;
  /** Minimum tokens for a "large operation" notification */
  largeOperationThreshold: number;
  /** Context percentage thresholds that trigger notifications */
  contextThresholds: number[];
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  categories: {
    context: true,
    operation: true,
    plan: true,
    'auto-compact': true,
    handoff: true,
  },
  largeOperationThreshold: 50_000,
  contextThresholds: [50, 70, 90],
};

/** Cooldown periods per category in milliseconds */
export const COOLDOWNS: Record<NotificationCategory, number> = {
  context: 60_000,
  operation: 10_000,
  plan: 30_000,
  'auto-compact': 60_000,
  handoff: 10_000,
};

/** localStorage key for persisted settings */
export const STORAGE_KEY = 'jacques-notification-settings';
