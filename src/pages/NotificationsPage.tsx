import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: number;
}

export const NotificationsPage: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const { apiFetch, refreshNotificationsCount } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = async () => {
    const res = await apiFetch('/api/safety/notifications');
    if (res.ok) {
      const d = await res.json();
      setItems(d.notifications || []);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAllRead = async () => {
    await apiFetch('/api/safety/notifications/read-all', { method: 'POST' });
    await load();
    await refreshNotificationsCount();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Notifications</h1>
          <p className="text-xs text-slate-500">
            Security alerts, match updates, and encrypted message notices (zero message plaintext included).
          </p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
        >
          <CheckCheck className="w-4 h-4" />
          Mark All Read
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161220] divide-y divide-slate-100 dark:divide-slate-800">
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Bell className="w-7 h-7 mx-auto mb-2 text-slate-400" />
            All caught up.
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => n.link && navigate(n.link)}
              className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-[#1E192C] flex items-start justify-between gap-4 ${
                !n.read ? 'bg-[#7C5CFC]/5' : ''
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
              </div>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
