/**
 * @jacques/core/notifications — barrel export
 *
 * Single source of truth for notification types, constants, and utilities.
 */

export type {
  NotificationCategory,
  NotificationPriority,
  NotificationItem,
  NotificationSettings,
} from './types.js';

export {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_COOLDOWNS,
  CATEGORY_SYMBOLS,
  CATEGORY_LABELS,
  MAX_NOTIFICATION_HISTORY,
} from './constants.js';

export {
  getContextThresholdPriority,
  generateNotificationId,
  formatNotificationAge,
} from './utils.js';
