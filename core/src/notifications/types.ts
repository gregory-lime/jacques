/**
 * Shared notification types for Jacques.
 *
 * Used by server, GUI, and CLI — the single source of truth.
 */

export type NotificationCategory = 'context' | 'operation' | 'plan' | 'auto-compact' | 'handoff';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  priority: NotificationPriority;
  timestamp: number;
  sessionId?: string;
}

export interface NotificationSettings {
  enabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  largeOperationThreshold: number;
  contextThresholds: number[];
}
