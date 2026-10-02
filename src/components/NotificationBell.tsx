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
      return <Phone className="h-4 w-4 text-[#701f2f]" />;
    case 'CHAT_MESSAGE':
      return <MessageSquare className="h-4 w-4 text-[#b8862d]" />;
    case 'CONSULTATION_BOOKED':
      return <BellRing className="h-4 w-4 text-green-600" />;
    case 'DELIVERABLE_READY':
      return <Mail className="h-4 w-4 text-[#701f2f]" />;
    default:
      return <Bell className="h-4 w-4 text-[#8c6b54]" />;
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
        className="relative rounded-lg p-2 text-[#6f5a49] hover:bg-[#fffaf0]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#701f2f] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-[#eadbc1] bg-white shadow-lg sm:w-96">
          <div className="flex items-center justify-between border-b border-[#eadbc1] p-3">
            <h3 className="text-sm font-semibold text-[#32151b]">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleReadAll}
                className="flex items-center gap-1 text-xs font-medium text-[#701f2f] hover:underline"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="border-b border-[#eadbc1] bg-[#fffaf0] p-3">
            <p className="mb-2 text-xs font-medium text-[#6f5a49]">Channels</p>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#32151b]">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={toggleEmail}
                  className="h-4 w-4 accent-[#701f2f]"
                />
                Email
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#32151b]">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={togglePush}
                  className="h-4 w-4 accent-[#701f2f]"
                />
                Browser push
              </label>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-sm text-[#8c6b54]">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-[#f0e4d2]">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={`flex items-start gap-3 p-3 transition hover:bg-[#fffaf0] ${
                      notification.read ? 'opacity-70' : 'bg-[#fff4d6]/30'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{iconForType(notification.type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#32151b]">{notification.title}</p>
                      <p className="truncate text-xs text-[#6f5a49]">{notification.body}</p>
                      <p className="mt-1 text-[10px] text-[#8c6b54]">
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
                        className="rounded p-1 text-[#701f2f] hover:bg-[#fff1f3]"
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
