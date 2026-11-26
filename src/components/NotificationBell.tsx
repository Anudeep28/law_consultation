import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Check, Mail, MessageSquare, Phone } from 'lucide-react';
import { getSocket } from '../services/socket';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  updateNotificationPreferences,
} from '../services/notificationService';
import { Notification } from '../types';
import { useAuthStore } from '../stores/authStore';

const iconForType = (type: Notification['type']) => {
  switch (type) {
    case 'CONSULTATION_REMINDER':
      return <Phone className="h-4 w-4 text-brand" />;
    case 'CHAT_MESSAGE':
      return <MessageSquare className="h-4 w-4 text-accent-dark" />;
    case 'CONSULTATION_BOOKED':
      return <BellRing className="h-4 w-4 text-green-600" />;
    case 'DELIVERABLE_READY':
      return <Mail className="h-4 w-4 text-brand" />;
    default:
      return <Bell className="h-4 w-4 text-ink-faint" />;
  }
};

export const NotificationBell: React.FC = () => {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(user?.emailNotifications ?? true);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const result = await fetchNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setEmailEnabled(user?.emailNotifications ?? true);
  }, [user?.emailNotifications]);

  useEffect(() => {
    const checkPush = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setPushEnabled(!!subscription && (user?.pushNotifications ?? true));
    };
    checkPush();
  }, [user?.pushNotifications]);

  useEffect(() => {
    const socket = getSocket();
    const handler = (notification: Notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((count) => count + 1);
    };
    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      // ignore
    }
  };

  const handleReadAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const togglePush = async () => {
    if (pushEnabled) {
      await unsubscribeFromPushNotifications();
      await updateNotificationPreferences({ pushNotifications: false });
      setPushEnabled(false);
    } else {
      const subscribed = await subscribeToPushNotifications();
      if (subscribed) {
        await updateNotificationPreferences({ pushNotifications: true });
        setPushEnabled(true);
      }
    }
  };

  const toggleEmail = async () => {
    const next = !emailEnabled;
    setEmailEnabled(next);
    try {
      await updateNotificationPreferences({ emailNotifications: next });
    } catch {
      setEmailEnabled(!next);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-ink-muted hover:bg-cream"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-line bg-white shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-line p-3">
            <h3 className="text-sm font-semibold text-ink">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleReadAll}
                className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="border-b border-line bg-cream p-3">
            <p className="mb-2 text-xs font-medium text-ink-muted">Channels</p>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={toggleEmail}
                  className="h-4 w-4 accent-brand"
                />
                Email
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={togglePush}
                  className="h-4 w-4 accent-brand"
                />
                Browser push
              </label>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-faint">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-cream-deep">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={`flex items-start gap-3 p-3 transition hover:bg-cream ${
                      notification.read ? 'opacity-70' : 'bg-warning-bg/30'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{iconForType(notification.type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{notification.title}</p>
                      <p className="truncate text-xs text-ink-muted">{notification.body}</p>
                      <p className="mt-1 text-[10px] text-ink-faint">
                        {new Date(notification.createdAt).toLocaleString('en-IN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={() => handleRead(notification.id)}
                        className="rounded p-1 text-brand hover:bg-brand-soft"
                        aria-label="Mark as read"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
