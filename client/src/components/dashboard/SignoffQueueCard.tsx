import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { SignoffActions } from '@/components/tasks/SignoffActions';
import { useAuth } from '@/hooks/use-auth';
import { useRoleAccess } from '@/hooks/useRoleAccess';

interface QueueRow {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  assignedToName?: string;
  submittedAt?: any; // Firestore Timestamp | string
}

function tsToMs(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : 0;
}

function fmtAge(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const h = Math.floor(diff / (1000 * 60 * 60));
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Dashboard card — "Awaiting your sign-off."
 *
 * Lists every task currently in `awaiting_signoff` state across the GC/PM's
 * projects, oldest first. Inline Approve / Reject via SignoffActions.
 *
 * Gated by useRoleAccess.canAccessDashboard() at the call site.
 * PMs only see tasks on projects they're assigned to (Firestore rules block
 * cross-project reads anyway).
 */
export function SignoffQueueCard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { hasRole } = useRoleAccess();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !hasRole(['admin', 'gc', 'projectManager'])) {
      setLoading(false);
      return;
    }
    // Subscribe to all awaiting_signoff tasks. Firestore rules already gate
    // visibility (GC/PM see everything they own; this is the same rule set as
    // the existing Tasks board).
    const q = query(collection(db, 'tasks'), where('status', '==', 'awaiting_signoff'));
    const unsub = onSnapshot(
      q,
      snap => {
        const next: QueueRow[] = snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title || data.name || '(untitled task)',
            projectId: data.projectId,
            projectName: data.projectName,
            assignedToName: data.assignedToName || data.assignedSubName,
            // Prefer the explicit submission timestamp written by the sub when
            // they marked ready for review; fall back to updatedAt.
            submittedAt: data.submittedForSignoffAt || data.updatedAt,
          };
        });
        // Oldest first — the longer something has sat awaiting, the higher it ranks.
        next.sort((a, b) => tsToMs(a.submittedAt) - tsToMs(b.submittedAt));
        setRows(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, hasRole]);

  if (!hasRole(['admin', 'gc', 'projectManager'])) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          Awaiting your sign-off
          {rows.length > 0 && (
            <span className="ml-1 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
              {rows.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            All caught up — no tasks awaiting sign-off.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.slice(0, 8).map(row => {
              const age = fmtAge(tsToMs(row.submittedAt));
              return (
                <li
                  key={row.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3"
                >
                  <button
                    type="button"
                    className="text-left flex-1 min-w-0"
                    onClick={() => row.projectId && setLocation(`/projects/${row.projectId}/tasks`)}
                  >
                    <p className="font-semibold text-sm text-gray-900 truncate">{row.title}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {row.projectName || row.projectId || 'No project'}
                      {row.assignedToName ? ` · ${row.assignedToName}` : ''}
                      {age ? ` · submitted ${age}` : ''}
                    </p>
                  </button>
                  <SignoffActions
                    taskId={row.id}
                    taskName={row.title}
                    projectId={row.projectId}
                  />
                </li>
              );
            })}
            {rows.length > 8 && (
              <li className="text-xs text-gray-500 pt-1">
                + {rows.length - 8} more — open the Tasks board to see all.
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
