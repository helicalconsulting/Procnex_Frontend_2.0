import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';
import { pickList } from '../api/normalize';
import { mapNotificationToRow, MOCK_NOTIFICATIONS } from '../api/mappers';
import { NOTIFICATIONS_PAGE_MOCK } from '../mocks/notificationsPage.mock';
import type { NotificationRow } from '../types/viewModels';
import type { Notification } from '../types';

async function mockList(): Promise<NotificationRow[]> {
  await new Promise((r) => setTimeout(r, 200));
  return NOTIFICATIONS_PAGE_MOCK;
}

async function apiList(): Promise<NotificationRow[]> {
  const data = await apiRequest<{ notifications: Notification[] }>('/notifications?limit=100', { cacheTtlMs: 0 });
  const list = pickList<Notification>(data, ['notifications']);
  return list.map((n) => mapNotificationToRow(n as Notification & Record<string, unknown>));
}

async function mockListTyped(): Promise<Notification[]> {
  return MOCK_NOTIFICATIONS;
}

async function apiListTyped(): Promise<Notification[]> {
  const data = await apiRequest<{ notifications: Notification[] }>('/notifications?limit=100', { cacheTtlMs: 0 });
  return pickList<Notification>(data, ['notifications']);
}

async function markRead(id: string): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
}

async function markAllRead(): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest('/notifications/read-all', { method: 'PUT' });
}

async function deleteAll(): Promise<void> {
  if (USE_MOCK) return;
  await apiRequest('/notifications', { method: 'DELETE' });
}

async function mockUnreadCount(): Promise<number> {
  return MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length;
}

async function apiUnreadCount(): Promise<number> {
  const data = await apiRequest<{ unreadCount: number }>('/notifications/unread-count', { cacheTtlMs: 0 });
  return data.unreadCount ?? 0;
}

export const notificationService = {
  list: USE_MOCK ? mockList : apiList,
  listTyped: USE_MOCK ? mockListTyped : apiListTyped,
  unreadCount: USE_MOCK ? mockUnreadCount : apiUnreadCount,
  markRead,
  markAllRead,
  deleteAll,
};
