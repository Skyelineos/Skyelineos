/**
 * Recent activity feed for a single project.
 *
 * Pulls events from the notifications collection (the canonical event-log
 * channel) filtered to this project, last N days. Shown in reverse-
 * chronological order. Each row deep-links into the relevant sub-page when
 * the notification's refType is known.
 *
 * Sources covered (every notification kind that names a projectId):
 *   - estimate_sent / estimate_responded
 *   - task_assigned / task_signoff_requested / task_signoff_approved
 *   - selection_approved / selection_uploaded
 *   - bid_submitted / bid_awarded
 *   - walkthrough_issue / walkthrough_fixed
 *   - change_order_submitted / change_order_approved
 *   - photo_uploaded, message
 *
 * The feed is read-only — clicking a row navigates, it does NOT mark as read.
 * The unread / "bell" badging continues to live in NotificationCenter where
 * the user can manage their own inbox.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Activity, FileText, ClipboardCheck, Palette, MessageSquare, Image as ImageIcon,
  GitPullRequest, DollarSign, ChevronRight,
} from 'lucide-react';

interface Props {
  projectId: string;
  /** Defaults to 14 days — long enough that mid-week the feed isn't empty. */
  daysBack?: number;
}

interface NotifRow {
  id: string;
  title?: string;
  message?: string;
  body?: string;
  type?: string;
  triggerKey?: string;
  projectId?: string;
  refType?: string;
  refId?: string;
  createdAt?: any;
  fromUserName?: string;
}

function iconFor(t?: string) {
  const k = String(t || '').toLowerCase();
  if (k.includes('estimate')) return DollarSign;
  if (k.includes('bid')) return FileText;
  if (k.includes('walkthrough')) return ClipboardCheck;
  if (k.includes('selection') || k.includes('design')) return Palette;
  if (k.includes('photo')) return ImageIcon;
  if (k.includes('change_order') || k.includes('changeorder') || k.includes('co_')) return GitPullRequest;
  if (k.includes('message')) return MessageSquare;
  return Activity;
}

function hrefFor(n: NotifRow, projectId: string): string | undefined {
  const t = String(n.refType || n.type || n.triggerKey || '').toLowerCase();
  if (!n.refId) {
    if (t.includes('estimate')) return `/projects/${projectId}/estimates`;
    if (t.includes('bid')) return `/projects/${projectId}/bids`;
    if (t.includes('walkthrough')) return `/projects/${projectId}/overview#walkthroughs`;
    if (t.includes('selection') || t.includes('design')) return `/design-board?projectId=${projectId}`;
    if (t.includes('photo')) return `/projects/${projectId}/photos`;
    if (t.includes('change_order') || t.includes('co')) return `/change-orders?projectId=${projectId}`;
    if (t.includes('message')) return `/messages?projectId=${projectId}`;
    return `/projects/${projectId}/overview`;
  }
  if (t.includes('task')) return `/projects/${projectId}/schedule?taskId=${n.refId}`;
  if (t.includes('estimate')) return `/projects/${projectId}/estimates?estimateId=${n.refId}`;
  if (t.includes('bid')) return `/projects/${projectId}/bids?bidId=${n.refId}`;
  if (t.includes('walkthrough')) return `/projects/${projectId}/overview#walkthroughs`;
  if (t.includes('selection') || t.includes('design')) return `/design-board?projectId=${projectId}&selectionId=${n.refId}`;
  if (t.includes('change_order')) return `/change-orders?projectId=${projectId}&coId=${n.refId}`;
  return `/projects/${projectId}/overview`;
}

function fmtTime(ts: any): string {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const ms = Date.now() - d.getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export function ProjectActivityFeed({ projectId, daysBack = 14 }: Props) {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<NotifRow[]>([]);

  useEffect(() => {
    if (!projectId) return;
    // No composite-index requirement: filter projectId server-side, sort + cap
    // client-side. The notifications collection per project usually has < 200
    // rows in a 14-day window so this is cheap.
    const unsub = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('projectId', '==', projectId),
        limit(200),
      ),
      snap => {
        const rows: NotifRow[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
        const filtered = rows
          .filter(r => {
            try {
              const ms = r.createdAt?.toMillis?.() ?? new Date(r.createdAt as any).getTime();
              return Number.isFinite(ms) && ms >= cutoff;
            } catch { return false; }
          })
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
          .slice(0, 20);
        setItems(filtered);
      },
      err => { console.warn('[ActivityFeed] subscribe failed', err); },
    );
    return () => unsub();
  }, [projectId, daysBack]);

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#C9A96E]" />
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 text-center py-4">
            No activity in the last {daysBack} days. As tasks get signed off, bids come in,
            and selections are made, the activity feed will populate here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#C9A96E]" />
            Recent activity
            <Badge variant="secondary" className="ml-1 text-xs">{items.length}</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setLocation(`/notifications?projectId=${projectId}`)}
          >
            All notifications <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3">
          {items.map(n => {
            const Icon = iconFor(n.refType || n.type || n.triggerKey);
            const href = hrefFor(n, projectId);
            const headline = n.title || n.message || n.body || 'Update';
            return (
              <li key={n.id}>
                <button
                  onClick={() => href && setLocation(href)}
                  className="w-full text-left flex items-start gap-3 rounded-md hover:bg-gray-50 active:scale-[0.99] transition px-2 py-1.5"
                  style={{ touchAction: 'manipulation' as any }}
                >
                  <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-600 shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-800 truncate">{headline}</span>
                    <span className="block text-xs text-gray-500">
                      {fmtTime(n.createdAt)}{n.fromUserName ? ` · ${n.fromUserName}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default ProjectActivityFeed;
