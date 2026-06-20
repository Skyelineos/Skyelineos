import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { computeScheduleSlip, type ScheduleSlip } from '@/lib/projectUtils';
import { calculateLiveProgress } from '@/lib/progressUtils';

// Schedule-Slip Alarm
//
// Iterates active projects, computes slip via existing computeScheduleSlip,
// surfaces only those with red or amber tone (sorted worst-first).
//
// computeScheduleSlip(targetCompletion, status, progress) → { label, tone, days }
//   - red: days < 0 (overdue)
//   - amber: days <= 7 OR (progress < 25% and days <= 30) — "at risk"
//   - green/gray: not surfaced here
//
// Progress source: we lazily call calculateLiveProgress(projectId) for
// each active project. It's an async one-shot that reads estimates +
// tasks for one project. For the typical GC dashboard this is a handful
// of projects, but we cap at 25 active projects to keep the read budget
// sane. The card renders projects as the data arrives — no waterfall.

interface SlipRow {
  projectId: string;
  projectName: string;
  slip: ScheduleSlip;
}

export function ScheduleSlipAlarmCard() {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<SlipRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to active projects. "Active" = not completed, not cancelled,
    // not archived. Firestore can't do `!=` on multiple values so we filter
    // client-side.
    const q = query(collection(db, 'projects'));
    const unsub = onSnapshot(q, async snap => {
      const projects = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter(p => {
          const s = String(p.status || '').toLowerCase();
          return s !== 'completed' && s !== 'cancelled' && s !== 'archived';
        })
        .slice(0, 25);

      if (projects.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // Fetch live progress in parallel — each call is one-shot.
      // If it throws we fall back to 0 (still surfaces overdue/due-soon).
      const results = await Promise.all(
        projects.map(async p => {
          let pct = 0;
          try {
            const live = await calculateLiveProgress(p.id);
            pct = live.completionPercentage || 0;
          } catch {
            // ignore — default 0
          }
          const target = p.targetCompletion || p.targetCompletionDate || null;
          const slip = computeScheduleSlip(target, p.status || 'active', pct);
          if (!slip) return null;
          if (slip.tone !== 'red' && slip.tone !== 'amber') return null;
          return {
            projectId: p.id,
            projectName: p.name || 'Untitled project',
            slip,
          } as SlipRow;
        }),
      );

      const out = results.filter((r): r is SlipRow => r !== null);
      // Worst-first: most-overdue (most-negative days) first, then
      // soonest-due ascending.
      out.sort((a, b) => a.slip.days - b.slip.days);
      setRows(out);
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, []);

  if (loading) {
    return (
      <Card className="animate-pulse rounded-xl">
        <CardHeader>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50 rounded-xl">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="flex items-center gap-2 text-fluid-lg">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-green-700" />
            <span className="min-w-0 text-wrap">Schedule Slip</span>
          </CardTitle>
          <CardDescription className="text-fluid-sm">All projects on track</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-4 w-4" />
            <span className="text-fluid-sm">All projects on schedule.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasRed = rows.some(r => r.slip.tone === 'red');

  return (
    <Card
      className={`rounded-xl ${
        hasRed ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-fluid-lg">
          <AlertTriangle
            className={`h-5 w-5 flex-shrink-0 ${
              hasRed ? 'text-red-700' : 'text-amber-700'
            }`}
          />
          <span className="min-w-0 text-wrap">Schedule Slip</span>
        </CardTitle>
        <CardDescription className="text-fluid-sm">
          {rows.length} project{rows.length === 1 ? '' : 's'} need attention
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="space-y-2">
          {rows.slice(0, 6).map(r => (
            <div
              key={r.projectId}
              className="flex items-center justify-between gap-2 min-w-0 cursor-pointer hover:bg-white/40 p-2 rounded-md transition-colors touch-target"
              onClick={() => setLocation(`/projects/${r.projectId}/overview`)}
            >
              <span className="text-fluid-sm font-medium min-w-0 text-wrap flex-1">
                {r.projectName}
              </span>
              <Badge
                variant={r.slip.tone === 'red' ? 'destructive' : 'secondary'}
                className="text-xs flex-shrink-0"
              >
                {r.slip.label}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
