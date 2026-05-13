import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Bell, Check, ChevronRight, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Reminder {
  id: string;
  kind: string;
  projectId?: string;
  projectName?: string;
  dueAt?: string; // ISO string
  status?: string;
  ownerUid?: string;
}

const KIND_COPY: Record<string, { title: (r: Reminder) => string; cta: string; pathFor: (r: Reminder) => string }> = {
  select_designer: {
    title: r => `Pick a designer for ${r.projectName || 'this project'}`,
    cta: 'Open project',
    pathFor: r => `/projects/${r.projectId}/overview`,
  },
  playbook_surfacing_buildout: {
    title: () => 'Build out Playbook surfacing — designer + client views + iPhone Shortcuts',
    cta: 'Open Playbook',
    pathFor: () => '/playbook',
  },
  schedule_phase_4_draws: {
    title: () => 'Build Schedule Phase 4 — draws + income forecast tied to Gantt tasks',
    cta: 'Open Schedule',
    pathFor: () => '/schedule',
  },
  schedule_phase_5_sub_alerts: {
    title: () => 'Build Schedule Phase 5 — sub start-date notifications (daily Cloud Function)',
    cta: 'Open Schedule',
    pathFor: () => '/schedule',
  },
  warranty_3mo: {
    title: r => `3-month warranty check-in for ${r.projectName || 'project'}`,
    cta: 'Open warranty',
    pathFor: r => `/projects/${r.projectId}/move-in-binder`,
  },
  warranty_6mo: {
    title: r => `6-month warranty walkthrough for ${r.projectName || 'project'} (drywall touch-up)`,
    cta: 'Open warranty',
    pathFor: r => `/projects/${r.projectId}/move-in-binder`,
  },
  warranty_11mo: {
    title: r => `11-month walkthrough for ${r.projectName || 'project'} — before warranty expires`,
    cta: 'Open warranty',
    pathFor: r => `/projects/${r.projectId}/move-in-binder`,
  },
  warranty_12mo: {
    title: r => `Warranty expires for ${r.projectName || 'project'} — ask for Google review`,
    cta: 'Open warranty',
    pathFor: r => `/projects/${r.projectId}/move-in-binder`,
  },
};

// Surfaces due reminders (e.g., "select a designer in 7 days") on the
// dashboard. Each can be acted on directly or dismissed.
export function RemindersCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!user) return;
    const ownerUid = user.id?.toString() || user.email || '';
    if (!ownerUid) return;
    const q = query(
      collection(db, 'reminders'),
      where('ownerUid', '==', ownerUid),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, snap => {
      setReminders(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }, () => {});
    return () => unsub();
  }, [user]);

  // Only show reminders that are due (dueAt <= now). Future ones stay quiet.
  const now = Date.now();
  const due = reminders.filter(r => {
    if (!r.dueAt) return true;
    const t = new Date(r.dueAt).getTime();
    return Number.isFinite(t) && t <= now;
  });

  if (due.length === 0) return null;

  const dismiss = async (r: Reminder) => {
    try {
      await updateDoc(doc(db, 'reminders', r.id), {
        status: 'dismissed',
        dismissedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      toast({ title: 'Could not dismiss', description: e?.message || '', variant: 'destructive' });
    }
  };

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-4 h-4 text-amber-700" />
        <p className="text-sm font-medium text-amber-900">
          {due.length} reminder{due.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="space-y-2">
        {due.map(r => {
          const kind = KIND_COPY[r.kind];
          const title = kind ? kind.title(r) : (r.projectName || r.kind);
          const path = kind ? kind.pathFor(r) : '/';
          const cta = kind?.cta || 'Open';
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 bg-white border border-amber-200 rounded p-2"
            >
              <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-gray-800 flex-1 truncate">{title}</p>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => setLocation(path)}
              >
                {cta}
                <ChevronRight className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-gray-500 hover:text-gray-800"
                onClick={() => dismiss(r)}
              >
                <Check className="w-3 h-3" />
                Done
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
