import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  collection, onSnapshot, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { ClipboardList, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';

interface ProjectRow {
  id: string;
  name: string;
  projectCode?: string;
  status?: string;
}

// Surfaces projects in their early stages (status planning/active) that don't
// yet have any tasks scheduled. Tyler asked for a dashboard nudge so set-up
// projects don't slip through the cracks.
export function MissingTasksAlertCard() {
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [missing, setMissing] = useState<ProjectRow[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Live subscription to active-ish projects only (don't bug Tyler about archived ones).
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'projects'), snap => {
      const rows: ProjectRow[] = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name || '(unnamed project)',
          projectCode: data.projectCode,
          status: data.status,
        };
      }).filter(p => {
        const s = String(p.status || '').toLowerCase();
        return s === '' || s === 'planning' || s === 'active' || s === 'punch_list';
      });
      setProjects(rows);
    }, () => {});
    return () => unsub();
  }, []);

  // For each project, check task count. Sequential per-project (small fan-out)
  // so we don't blow up Firestore quotas. Could optimize later with a single
  // collectionGroup query if this grows.
  useEffect(() => {
    if (projects.length === 0) {
      setMissing([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const out: ProjectRow[] = [];
      for (const p of projects) {
        try {
          const snap = await getDocs(query(
            collection(db, 'tasks'),
            where('projectId', '==', p.id),
          ));
          if (cancelled) return;
          if (snap.empty) out.push(p);
        } catch {
          // permission errors → assume not empty so we don't false-positive
        }
      }
      if (!cancelled) setMissing(out);
    })();
    return () => { cancelled = true; };
  }, [projects]);

  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 mb-4">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left"
      >
        <ClipboardList className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            {missing.length} project{missing.length === 1 ? '' : 's'} {missing.length === 1 ? "doesn't" : "don't"} have tasks yet
          </p>
          <p className="text-xs text-amber-700/80">
            Apply a template (Templates → Job) or add tasks individually so the schedule starts moving.
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
          {missing.map(p => (
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
                onClick={() => setLocation(`/projects/${p.id}/tasks`)}
              >
                Add tasks
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
