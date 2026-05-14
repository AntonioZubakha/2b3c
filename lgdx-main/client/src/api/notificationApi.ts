import api from './index';
import {
  NotificationsResponse,
  UnreadNotificationsResponse,
  UnreadCountResponse,
  MarkAsReadResponse,
  MarkAllAsReadResponse,
} from '../types/notification';

/**
 * API client for notifications
 */

/**
 * Get user's notifications with pagination
 */
export const getNotifications = async (limit = 20, skip = 0): Promise<NotificationsResponse> => {
  const response = await api.get<NotificationsResponse>(`/notifications?limit=${limit}&skip=${skip}`);
  return response.data;
};

/**
 * Get unread notifications
 */
export const getUnreadNotifications = async (): Promise<UnreadNotificationsResponse> => {
  const response = await api.get<UnreadNotificationsResponse>('/notifications/unread');
  return response.data;
};

/**
 * Get unread count
 */
export const getUnreadCount = async (): Promise<UnreadCountResponse> => {
  const response = await api.get<UnreadCountResponse>('/notifications/unread-count');
  return response.data;
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (notificationId: string): Promise<MarkAsReadResponse> => {
  const response = await api.put<MarkAsReadResponse>(`/notifications/${notificationId}/read`);
  return response.data;
};

/**
 * Mark all notifications as read
 */
export const markAllNotificationsAsRead = async (): Promise<MarkAllAsReadResponse> => {
  const response = await api.put<MarkAllAsReadResponse>('/notifications/read-all');
  return response.data;
};
