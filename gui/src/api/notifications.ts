/**
 * Notification API client
 *
 * HTTP endpoints for notification settings and history.
 */

import { API_URL } from './client';
import type { NotificationSettings } from '@jacques-ai/core/notifications';

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const response = await fetch(`${API_URL}/notifications/settings`);
  if (!response.ok) throw new Error(`Failed to get notification settings: ${response.statusText}`);
  return response.json();
}

export async function updateNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const response = await fetch(`${API_URL}/notifications/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Failed to update notification settings: ${response.statusText}`);
  return response.json();
}
