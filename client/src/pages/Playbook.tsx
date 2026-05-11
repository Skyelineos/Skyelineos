import { useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, getDocs, onSnapshot, orderBy, query, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { PlaybookEntryModal, type PlaybookEntry } from '@/components/playbook/PlaybookEntryModal';
import { BookOpen, Plus, Search, Hammer, AlertTriangle, Palette, Home, Tag, BellPlus } from 'lucide-react';

const CATEGORY_META: Record<string, { label: string; icon: any; tone: string }> = {
  best_practice:         { label: 'Best Practice',         icon: BookOpen,       tone: 'bg-green-50 border-green-200 text-green-800' },
  delay_cause:           { label: 'Delay Cause',           icon: AlertTriangle,  tone: 'bg-red-50 border-red-200 text-red-800' },
  design_tip:            { label: 'Design Tip',            icon: Palette,        tone: 'bg-purple-50 border-purple-200 text-purple-800' },
  personal_home:         { label: 'Personal Home',         icon: Home,           tone: 'bg-blue-50 border-blue-200 text-blue-800' },
  vendor_recommendation: { label: 'Vendor Rec',            icon: Tag,            tone: 'bg-amber-50 border-amber-200 text-amber-800' },
};

export default function Playbook() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<(PlaybookEntry & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [editing, setEditing] = useState<PlaybookEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Build-out reminders tracker — each kind has its own state so multiple
  // reminders can be scheduled side-by-side.
  const [reminderState, setReminderState] = useState<Record<string, string | null>>({});
  const [schedulingKind, setSchedulingKind] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const ownerUid = user.id?.toString() || user.email || '';
    if (!ownerUid) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'reminders'),
          where('ownerUid', '==', ownerUid),
          where('status', '==', 'pending'),
        ));
        if (cancelled) return;
        const next: Record<string, string | null> = {};
        snap.docs.forEach(d => {
          const data = d.data() as any;
          if (data.kind) next[data.kind] = String(data.dueAt || '');
        });
        setReminderState(next);
      } catch {/* fine */}
    })();
    return () => { cancelled = true; };
  }, [user]);

  const scheduleReminder = async (kind: string, days: number) => {
    if (!user) return;
    setSchedulingKind(kind);
    try {
      const due = new Date();
      due.setDate(due.getDate() + days);
      await addDoc(collection(db, 'reminders'), {
        kind,
        ownerUid: user.id?.toString() || user.email || 'unknown',
        ownerName: user.name || '',
        dueAt: due.toISOString(),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setReminderState(prev => ({ ...prev, [kind]: due.toISOString() }));
      toast({
        title: 'Reminder scheduled',
        description: `You'll see it on your dashboard on ${due.toLocaleDateString()}.`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not schedule reminder',
        description: e?.message || '',
        variant: 'destructive',
      });
    } finally {
      setSchedulingKind(null);
    }
  };

  // Convenience accessors for the existing Playbook button (back-compat with the JSX below).
  const buildoutDueAt = reminderState['playbook_surfacing_buildout'] || null;
  const scheduling = schedulingKind === 'playbook_surfacing_buildout';
  const scheduleBuildoutReminder = () => scheduleReminder('playbook_surfacing_buildout', 60);
  const schedulePhase4DueAt = reminderState['schedule_phase_4_draws'] || null;
  const schedulePhase5DueAt = reminderState['schedule_phase_5_sub_alerts'] || null;

  useEffect(() => {
    const q = query(collection(db, 'playbookEntries'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // All trades that appear on at least one entry — populates the trade filter.
  const trades = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => { if (e.trade) s.add(e.trade); });
    return Array.from(s).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter(e => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (tradeFilter !== 'all' && e.trade !== tradeFilter) return false;
      if (term) {
        const hay = `${e.title} ${e.body} ${(e.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [entries, categoryFilter, tradeFilter, search]);

  // Group by trade for display so the page reads like a journal organized by scope.
  const grouped = useMemo(() => {
    const map = new Map<string, (PlaybookEntry & { id: string })[]>();
    filtered.forEach(e => {
      const key = e.trade || 'General';
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <AppLayout>
      <div className="px-4 py-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-[#C9A96E]" />
              Playbook
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Internal notes — best practices, delay causes, design tips, vendor recs.
              Only admins see this. Surfacing to designers/clients comes later.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {buildoutDueAt ? (
              <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                <BellPlus className="w-3.5 h-3.5" />
                Build-out reminder set for {new Date(buildoutDueAt).toLocaleDateString()}
              </span>
            ) : (
              <Button
                variant="outline"
                onClick={scheduleBuildoutReminder}
                disabled={scheduling}
                className="gap-1.5"
              >
                <BellPlus className="w-3.5 h-3.5" />
                {scheduling ? 'Scheduling…' : 'Remind me in 60 days'}
              </Button>
            )}
            <Button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="gap-2 text-white"
              style={{ backgroundColor: '#C9A96E' }}
            >
              <Plus className="w-4 h-4" />
              New Entry
            </Button>
          </div>
        </div>

        {/* Roadmap reminders — small build-out tracker for upcoming phases. */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Build-Out Roadmap Reminders</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <RoadmapButton
              label="Schedule Phase 4 — draws + income forecast"
              kind="schedule_phase_4_draws"
              days={3}
              dueAt={schedulePhase4DueAt}
              scheduling={schedulingKind === 'schedule_phase_4_draws'}
              onSchedule={() => scheduleReminder('schedule_phase_4_draws', 3)}
            />
            <RoadmapButton
              label="Schedule Phase 5 — sub start-date alerts"
              kind="schedule_phase_5_sub_alerts"
              days={3}
              dueAt={schedulePhase5DueAt}
              scheduling={schedulingKind === 'schedule_phase_5_sub_alerts'}
              onSchedule={() => scheduleReminder('schedule_phase_5_sub_alerts', 3)}
            />
            <RoadmapButton
              label="Playbook surfacing build-out"
              kind="playbook_surfacing_buildout"
              days={60}
              dueAt={buildoutDueAt}
              scheduling={scheduling}
              onSchedule={scheduleBuildoutReminder}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title, body, tags…"
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tradeFilter} onValueChange={setTradeFilter}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="All trades" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trades</SelectItem>
              {trades.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : entries.length === 0 ? (
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="p-8 text-center">
              <BookOpen className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              <p className="font-medium text-gray-700">No entries yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Start capturing what you learn on projects. iPhone Shortcuts integration coming next.
              </p>
              <Button
                onClick={() => { setEditing(null); setModalOpen(true); }}
                className="mt-4 gap-2 text-white"
                style={{ backgroundColor: '#C9A96E' }}
              >
                <Plus className="w-4 h-4" />
                Capture your first note
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No entries match your filters.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([tradeName, rows]) => (
              <div key={tradeName}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-2">
                  <Hammer className="w-3.5 h-3.5" />
                  {tradeName}
                  <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
                </h2>
                <div className="space-y-2">
                  {rows.map(entry => {
                    const meta = CATEGORY_META[entry.category] || CATEGORY_META.best_practice;
                    const Icon = meta.icon;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => { setEditing(entry); setModalOpen(true); }}
                        className="w-full text-left bg-white border rounded-lg p-3 hover:border-gray-400 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`rounded p-1.5 border ${meta.tone}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm truncate">{entry.title}</p>
                              <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.label}</Badge>
                              {(entry.surfaceTo || []).map(a => (
                                <Badge key={a} variant="outline" className="text-[10px] text-gray-500">{a}</Badge>
                              ))}
                            </div>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-wrap">
                              {entry.body}
                            </p>
                            {(entry.tags || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {(entry.tags || []).map(t => (
                                  <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PlaybookEntryModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
      />
    </AppLayout>
  );
}

// Single-purpose roadmap reminder button. Shows the next due date when one
// exists; otherwise a click schedules the reminder N days out.
function RoadmapButton({
  label, kind, days, dueAt, scheduling, onSchedule,
}: {
  label: string;
  kind: string;
  days: number;
  dueAt: string | null;
  scheduling: boolean;
  onSchedule: () => void;
}) {
  void kind;
  if (dueAt) {
    const d = new Date(dueAt);
    const dateStr = Number.isFinite(d.getTime()) ? d.toLocaleDateString() : '';
    return (
      <div className="border rounded p-2 bg-white">
        <p className="text-[11px] text-gray-500">{label}</p>
        <p className="text-xs text-gray-700 mt-0.5 inline-flex items-center gap-1">
          <BellPlus className="w-3 h-3" /> Set for {dateStr}
        </p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onSchedule}
      disabled={scheduling}
      className="border rounded p-2 bg-white hover:border-gray-400 text-left disabled:opacity-50"
    >
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-xs text-[#C9A96E] mt-0.5 inline-flex items-center gap-1">
        <BellPlus className="w-3 h-3" />
        {scheduling ? 'Scheduling…' : `Remind me in ${days} day${days === 1 ? '' : 's'}`}
      </p>
    </button>
  );
}
