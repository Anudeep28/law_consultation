import { apiRequest } from './api';
import { Notification } from '../types';

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

export const fetchNotifications = () => apiRequest<NotificationsResponse>('/api/notifications');

export const markNotificationRead = (id: string) =>
  apiRequest<{ ok: true }>(`/api/notifications/${id}/read`, { method: 'PATCH' });

export const markAllNotificationsRead = () =>
  apiRequest<{ ok: true }>('/api/notifications/read-all', { method: 'PATCH' });

export const fetchVapidPublicKey = () =>
  apiRequest<{ publicKey: string }>('/api/notifications/vapid-public-key');

export const savePushSubscription = (subscription: PushSubscriptionJSON) =>
  apiRequest<{ ok: true }>('/api/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  });

export const removePushSubscription = (endpoint: string) =>
  apiRequest<undefined>('/api/notifications/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });

export const updateNotificationPreferences = (preferences: { emailNotifications?: boolean; pushNotifications?: boolean }) =>
  apiRequest<{ emailNotifications: boolean; pushNotifications: boolean }>('/api/users/notification-preferences', {
    method: 'PATCH',
    body: JSON.stringify(preferences),
  });

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const { publicKey } = await fetchVapidPublicKey();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await savePushSubscription(subscription.toJSON());
    return true;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return false;
  }
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await removePushSubscription(subscription.endpoint);
    }
    return true;
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
    return false;
  }
}
