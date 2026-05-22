import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Bell, Check, X } from 'lucide-react';

interface NotificationDoc {
  id: string;
  type: string;
  title?: string;
  body?: string;
  link?: string;
  projectId?: string;
  projectName?: string;
  itemCount?: number;
  overdueCount?: number;
  read: boolean;
  createdAt: any;
}

/**
 * Bell icon + dropdown — drop it in the SkyelineClientPortal header.
 * Shows unread count, lets the user click through to open the linked view,
 * and mark items read.
 */
export default function InAppNotificationCenter() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.firebaseUid) { setLoading(false); return; }
    const q = query(
      collection(db, `users/${user.firebaseUid}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NotificationDoc)));
      setLoading(false);
    });
    return () => unsub();
  }, [user?.firebaseUid]);

  const unreadCount = items.filter((i) => !i.read).length;

  const markRead = async (id: string) => {
    if (!user?.firebaseUid) return;
    await updateDoc(doc(db, `users/${user.firebaseUid}/notifications/${id}`), { read: true });
  };

  const markAllRead = async () => {
    if (!user?.firebaseUid) return;
    const batch = writeBatch(db);
    items.filter((i) => !i.read).forEach((i) =>
      batch.update(doc(db, `users/${user.firebaseUid}/notifications/${i.id}`), { read: true })
    );
    await batch.commit();
  };

  const handleClick = (item: NotificationDoc) => {
    markRead(item.id);
    if (item.link) navigate(item.link);
    else if (item.type === 'selections_reminder') navigate('/client-portal/selections');
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unreadCount} unread)`}
        className="relative p-2 rounded-md hover:bg-gray-100 text-gray-600"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] z-40 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs text-[#8a6a3a] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-3.5 h-3.5 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-sm text-gray-400">Loading…</div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center">
                  <Check className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">You&rsquo;re all caught up</p>
                </div>
              ) : (
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleClick(item)}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                          !item.read ? 'bg-[#FBF7EE]' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!item.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-[#C9A96E] flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!item.read ? 'font-semibold text-gray-900' : 'text-gray-700'} truncate`}>
                              {item.title || titleFromType(item)}
                            </p>
                            {item.body && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.body}</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">{formatAgo(item.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function titleFromType(n: NotificationDoc): string {
  if (n.type === 'selections_reminder') {
    if (n.overdueCount && n.overdueCount > 0) return `${n.overdueCount} selection${n.overdueCount === 1 ? '' : 's'} overdue`;
    return `${n.itemCount} selection${n.itemCount === 1 ? '' : 's'} need your attention`;
  }
  if (n.type === 'designer_recommendation') return 'Your designer added a recommendation';
  if (n.type === 'client_approved') return 'Client approved a selection';
  if (n.type === 'selection_ordered') return 'Selection ordered';
  return 'Notification';
}

function formatAgo(ts: any): string {
  if (!ts?.toDate) return '';
  const date = ts.toDate();
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}
