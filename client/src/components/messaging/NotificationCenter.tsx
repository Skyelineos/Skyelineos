import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { useLocation } from 'wouter';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Bell, CheckCheck, Camera, ClipboardList, Calendar, CheckCircle, FileText, AlertCircle, MessageSquare,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { markNotificationRead } from '@/lib/notifications';

type Kind =
  | 'task_assigned' | 'task_due' | 'task_completed'
  | 'walkthrough_assigned'
  | 'change_order_submitted' | 'change_order_approved'
  | 'estimate_accepted' | 'invoice_overdue'
  | 'message' | 'system';

interface Notification {
  id: string;
  userId: string;
  kind: Kind;
  title: string;
  body?: string;
  link?: string;
  projectId?: string;
  refType?: string;
  refId?: string;
  fromUserName?: string;
  read: boolean;
  createdAt?: any;
}

const ICON_FOR_KIND: Record<Kind, any> = {
  task_assigned:          ClipboardList,
  task_due:               Calendar,
  task_completed:         CheckCircle,
  walkthrough_assigned:   Camera,
  change_order_submitted: FileText,
  change_order_approved:  CheckCircle,
  estimate_accepted:      CheckCircle,
  invoice_overdue:        AlertCircle,
  message:                MessageSquare,
  system:                 Bell,
};

const COLOR_FOR_KIND: Record<Kind, string> = {
  task_assigned:          'text-blue-500',
  task_due:               'text-orange-500',
  task_completed:         'text-green-500',
  walkthrough_assigned:   'text-amber-600',
  change_order_submitted: 'text-purple-500',
  change_order_approved:  'text-green-500',
  estimate_accepted:      'text-green-500',
  invoice_overdue:        'text-red-500',
  message:                'text-blue-500',
  system:                 'text-gray-500',
};

export function NotificationCenter() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const userId = user.id?.toString() || user.email || '';
    if (!userId) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    }, () => {});
    return () => unsub();
  }, [user]);

  const unreadCount = items.filter(n => !n.read).length;

  const handleClick = async (n: Notification) => {
    if (!n.read) await markNotificationRead(n.id);
    if (n.link) {
      setOpen(false);
      setLocation(n.link);
    }
  };

  const markAllRead = async () => {
    const unread = items.filter(n => !n.read);
    if (unread.length === 0) return;
    const batch = writeBatch(db);
    for (const n of unread) batch.update(doc(db, 'notifications', n.id), { read: true });
    try { await batch.commit(); } catch {}
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-4.5 w-4.5 min-w-[1.25rem] p-0 flex items-center justify-center text-[10px] bg-red-500 text-white border-0"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{unreadCount} unread</Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={markAllRead}>
              <CheckCheck className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[500px]">
          {items.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">
              <Bell className="w-8 h-8 mx-auto opacity-30 mb-2" />
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {items.map(n => {
                const Icon = ICON_FOR_KIND[n.kind] || Bell;
                const color = COLOR_FOR_KIND[n.kind] || 'text-gray-500';
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                      !n.read ? 'bg-blue-50/50' : ''
                    }`}
                  >
                    <div className={`mt-0.5 ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-sm ${!n.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                      </div>
                      {n.body && (
                        <p className="text-xs text-gray-500 line-clamp-2">{n.body}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                        {n.fromUserName && <span>from {n.fromUserName}</span>}
                        {n.createdAt && (
                          <span>
                            {formatDistanceToNow(
                              n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt),
                              { addSuffix: true },
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
