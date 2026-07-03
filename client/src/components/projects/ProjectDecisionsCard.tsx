/**
 * Project Decisions — compact read view.
 *
 * Chronological list of the last N decisions logged on this project.
 * Same component powers both the GC's Project Overview and the client
 * portal — visibility filtering is done via `audience`:
 *   - 'gc'     : reads ALL decisions on the project (internal + client-visible)
 *   - 'client' : reads only visibility='client-visible' — matches the
 *                firestore.rules gate so an unauthorized read never
 *                surfaces internal chatter
 *
 * v1 scope: last 20, kind chip, subjectRef displayed, click-through to the
 * source doc where possible. No search UI — the list is short enough at v1
 * volumes that a browser CTRL+F is fine. Filters/search return in v2.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, CheckCircle2, XCircle, GitPullRequest, Palette, MessageSquare, ArrowRight } from 'lucide-react';
import type { DecisionKind } from '@/lib/communications/decisions';

interface Props {
  projectId: string;
  audience: 'gc' | 'client';
  limitN?: number;
}

interface DecisionRow {
  id: string;
  title?: string;
  summary?: string;
  kind?: DecisionKind;
  visibility?: 'internal' | 'client-visible';
  subjectRef?: { collection: string; id: string; label?: string };
  createdBy?: string;
  createdByName?: string;
  createdAt?: any;
  decidedOn?: string;
}

function iconFor(kind?: string) {
  switch (kind) {
    case 'selection': return Palette;
    case 'change_order': return GitPullRequest;
    case 'approval': return CheckCircle2;
    case 'rejection': return XCircle;
    case 'discussion': return MessageSquare;
    default: return BookOpen;
  }
}

function labelFor(kind?: string): string {
  switch (kind) {
    case 'selection': return 'Selection';
    case 'change_order': return 'Change order';
    case 'approval': return 'Approval';
    case 'rejection': return 'Rejection';
    case 'discussion': return 'Discussion';
    case 'scope_change': return 'Scope change';
    case 'price_change': return 'Price change';
    default: return 'Decision';
  }
}

function fmtWhen(ts: any, decidedOn?: string): string {
  if (decidedOn) return decidedOn;
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

export function ProjectDecisionsCard({ projectId, audience, limitN = 20 }: Props) {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    // Client audience: pre-filter by visibility so the query respects the
    // firestore rule (no wasted read attempts on internal rows).
    const constraints: any[] = [where('projectId', '==', projectId), orderBy('createdAt', 'desc'), limit(limitN)];
    if (audience === 'client') {
      constraints.splice(1, 0, where('visibility', '==', 'client-visible'));
    }
    const q = query(collection(db, 'decisions'), ...constraints);
    const unsub = onSnapshot(q, snap => {
      setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    }, err => {
      console.warn('[ProjectDecisionsCard] subscribe failed', err);
      setLoading(false);
    });
    return () => unsub();
  }, [projectId, audience, limitN]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#C9A96E]" />
            Decisions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-gray-100 rounded animate-pulse mt-2" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#C9A96E]" />
            Decisions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 text-center py-3">
            {audience === 'client'
              ? "You haven't approved or declined anything yet — decisions you make on selections, estimates, and change orders will land here."
              : 'No decisions logged yet. As selections, estimates, and COs get acted on, the audit trail fills here.'}
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
            <BookOpen className="w-4 h-4 text-[#C9A96E]" />
            Decisions
            <Badge variant="secondary" className="ml-1 text-xs">{rows.length}</Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {rows.map(d => {
            const Icon = iconFor(d.kind);
            const label = labelFor(d.kind);
            const when = fmtWhen(d.createdAt, d.decidedOn);
            // Best-effort click-through to the source doc.
            const href = (() => {
              if (!d.subjectRef) return '';
              const c = d.subjectRef.collection;
              const id = d.subjectRef.id;
              if (c === 'estimates') return `/estimates?openEstimate=${id}`;
              if (c === 'changeOrders') return `/change-orders?coId=${id}`;
              if (c.includes('selections')) return audience === 'client'
                ? `/client-portal/selections?selectionId=${id}`
                : `/design-board?projectId=${projectId}&selectionId=${id}`;
              return '';
            })();
            const clickable = !!href;
            const RowInner = (
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 shrink-0">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800 truncate">{d.title || 'Decision'}</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{label}</Badge>
                    {audience === 'gc' && d.visibility === 'client-visible' && (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Client-visible</Badge>
                    )}
                  </div>
                  {d.summary && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{d.summary}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {when}{d.createdByName ? ` · ${d.createdByName}` : ''}
                  </p>
                </div>
                {clickable && <ArrowRight className="w-3.5 h-3.5 text-gray-400 mt-1 shrink-0" />}
              </div>
            );
            return (
              <li key={d.id}>
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => setLocation(href)}
                    className="w-full text-left rounded-md border border-gray-100 bg-white hover:bg-gray-50 active:scale-[0.99] transition px-3 py-2"
                  >
                    {RowInner}
                  </button>
                ) : (
                  <div className="rounded-md border border-gray-100 bg-white px-3 py-2">{RowInner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default ProjectDecisionsCard;
