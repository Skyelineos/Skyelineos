import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { CalendarCheck, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';

interface Row {
  id: string;
  name: string;
  projectCode?: string;
  status?: string;
}

// Surfaces projects whose schedule hasn't been signed off yet. Every new
// project starts in draft, so this lights up until Tyler signs each one off.
export function UnsignedSchedulesCard() {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'projects')), snap => {
      setRows(snap.docs
        .map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || '(unnamed project)',
            projectCode: data.projectCode,
            status: data.status,
            signed: !!data.scheduleSignedOff,
          } as any;
        })
        .filter(p => {
          // Only nudge for active-ish projects without sign-off.
          const s = String(p.status || '').toLowerCase();
          const active = s === '' || s === 'planning' || s === 'active' || s === 'punch_list';
          return active && !p.signed;
        }));
    }, () => {});
    return () => unsub();
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 mb-4">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left"
      >
        <CalendarCheck className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            {rows.length} schedule{rows.length === 1 ? '' : 's'} awaiting sign-off
          </p>
          <p className="text-xs text-amber-700/80">
            Review the Gantt for each project and sign off to go live.
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-700" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-700" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
          {rows.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2 bg-white border border-amber-200 rounded p-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {p.projectCode || ''}{p.projectCode && p.status ? ' · ' : ''}{p.status}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setLocation(`/projects/${p.id}/schedule`)}
              >
                Review
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
