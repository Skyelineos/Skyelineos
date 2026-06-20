/**
 * Project-scoped "what needs my attention today" inbox.
 *
 * Aggregates the four action-item sources for THIS project:
 *   1. Tasks awaiting GC sign-off
 *   2. Bids the sub submitted that haven't been awarded
 *   3. Walkthrough issues the sub said they fixed (awaiting GC verify)
 *   4. Selections the homeowner is waiting on the GC for (option upload, etc.)
 *
 * Designed to mirror the global GC dashboard "today" pattern but filtered to
 * one project. Each row deep-links into the matching sub-page.
 *
 * Caps every list at 5 items — there's a "View all" link per category that
 * routes to the dedicated tab when the bucket overflows. The collapsed empty
 * state ("You're caught up on this project") replaces the page when all four
 * buckets are 0.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BellRing, FileCheck2, ClipboardCheck, Palette, Inbox, ArrowRight, CheckCircle2,
} from 'lucide-react';

interface Props {
  projectId: string;
}

interface Row {
  id: string;
  label: string;
  sub?: string;
  href: string;
}

function fmtAgo(ts: any): string {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const ms = Date.now() - d.getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days < 1) return 'today';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  } catch { return ''; }
}

export function ProjectTodayInbox({ projectId }: Props) {
  const [, setLocation] = useLocation();
  const [signoffs, setSignoffs] = useState<any[]>([]);
  const [bidsSubmitted, setBidsSubmitted] = useState<any[]>([]);
  const [walkthroughItems, setWalkthroughItems] = useState<any[]>([]);
  const [pendingSelections, setPendingSelections] = useState<any[]>([]);

  // (1) tasks awaiting GC signoff for this project
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'tasks'),
        where('projectId', '==', projectId),
        where('status', '==', 'awaiting_signoff'),
      ),
      snap => setSignoffs(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      () => {},
    );
    return () => unsub();
  }, [projectId]);

  // (2) bids submitted but not yet awarded on this project
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'bids'), where('projectId', '==', projectId)),
      snap => {
        const open = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((b: any) => {
            const s = String(b.status || '').toLowerCase();
            return s === 'submitted' || s === 'received' || s === 'pending';
          });
        setBidsSubmitted(open);
      },
      () => {},
    );
    return () => unsub();
  }, [projectId]);

  // (3) walkthrough items where the sub claims it's resolved → awaits GC verify
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'walkthroughIssues'), where('projectId', '==', projectId)),
      snap => {
        const pending = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((w: any) => String(w.status || '').toLowerCase() === 'awaiting_verification'
            || String(w.status || '').toLowerCase() === 'fixed');
        setWalkthroughItems(pending);
      },
      () => {},
    );
    return () => unsub();
  }, [projectId]);

  // (4) selections where the homeowner is waiting on the GC to upload options
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      collection(db, 'projects', projectId, 'selections'),
      snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((s: any) => String(s.status || '').toLowerCase() === 'pending_selection'
            || String(s.status || '').toLowerCase() === 'awaiting_options');
        setPendingSelections(rows);
      },
      () => {},
    );
    return () => unsub();
  }, [projectId]);

  const sections = useMemo(() => ([
    {
      key: 'signoffs',
      title: 'Tasks awaiting your sign-off',
      icon: CheckCircle2,
      count: signoffs.length,
      viewAllHref: `/projects/${projectId}/schedule?status=awaiting_signoff`,
      rows: signoffs.slice(0, 5).map((t: any) => ({
        id: t.id,
        label: String(t.title || 'Untitled task'),
        sub: t.trade ? `${t.trade}${t.assignedToName ? ' · ' + t.assignedToName : ''}` : t.assignedToName,
        href: `/projects/${projectId}/schedule?taskId=${t.id}`,
      })),
    },
    {
      key: 'bids',
      title: 'Bids submitted — review + award',
      icon: FileCheck2,
      count: bidsSubmitted.length,
      viewAllHref: `/projects/${projectId}/bids`,
      rows: bidsSubmitted.slice(0, 5).map((b: any) => ({
        id: b.id,
        label: b.subName || b.companyName || b.trade || 'Bid submitted',
        sub: b.totalAmount
          ? `$${Number(b.totalAmount).toLocaleString()}${b.trade ? ' · ' + b.trade : ''}`
          : b.trade,
        href: `/projects/${projectId}/bids?bidId=${b.id}`,
      })),
    },
    {
      key: 'walkthroughs',
      title: 'Walkthrough fixes — verify',
      icon: ClipboardCheck,
      count: walkthroughItems.length,
      viewAllHref: `/projects/${projectId}/overview`,
      rows: walkthroughItems.slice(0, 5).map((w: any) => ({
        id: w.id,
        label: String(w.title || w.description?.slice(0, 60) || 'Walkthrough item'),
        sub: w.assignedToName || w.assignedToTrade,
        href: `/projects/${projectId}/overview#walkthroughs`,
      })),
    },
    {
      key: 'selections',
      title: 'Selections waiting for options',
      icon: Palette,
      count: pendingSelections.length,
      viewAllHref: `/design-board?projectId=${projectId}`,
      rows: pendingSelections.slice(0, 5).map((s: any) => ({
        id: s.id,
        label: s.name || s.title || s.category || 'Selection',
        sub: s.room || s.category,
        href: `/design-board?projectId=${projectId}&selectionId=${s.id}`,
      })),
    },
  ]), [signoffs, bidsSubmitted, walkthroughItems, pendingSelections, projectId]);

  const totalCount = sections.reduce((s, x) => s + x.count, 0);

  if (totalCount === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">You're caught up on this project</p>
          <p className="text-xs text-gray-500 mt-1">
            No signoffs, bids, walkthrough fixes, or selection uploads waiting on you.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BellRing className="w-4 h-4 text-[#C9A96E]" />
          Today on this project
          <Badge variant="secondary" className="ml-1 text-xs">{totalCount}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.filter(s => s.count > 0).map(section => {
          const Icon = section.icon;
          return (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                  <Icon className="w-3.5 h-3.5 text-gray-500" />
                  <span>{section.title}</span>
                  <Badge variant="outline" className="text-[10px]">{section.count}</Badge>
                </div>
                {section.count > section.rows.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setLocation(section.viewAllHref)}
                  >
                    View all <ArrowRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {section.rows.map((row: Row) => (
                  <button
                    key={row.id}
                    onClick={() => setLocation(row.href)}
                    className="w-full text-left rounded-md border border-gray-100 bg-gray-50 hover:bg-gray-100 active:scale-[0.99] transition px-3 py-2"
                    style={{ touchAction: 'manipulation' as any }}
                  >
                    <div className="text-sm font-medium text-gray-800 truncate">{row.label}</div>
                    {row.sub && <div className="text-xs text-gray-500 truncate">{row.sub}</div>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default ProjectTodayInbox;
