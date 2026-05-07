import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, getDocs, Timestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import {
  Plus, ChevronLeft, ChevronRight, Clock, Users,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────

interface TimesheetEntry {
  id: string;
  userId: string;
  userName: string;
  projectId: string;
  projectName: string;
  date: string; // YYYY-MM-DD
  hours: number;
  description: string;
  status: 'draft' | 'submitted' | 'approved';
  createdAt: Timestamp | null;
}

interface Project {
  id: string;
  name: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

function statusColor(status: TimesheetEntry['status']): string {
  return status === 'approved'
    ? 'bg-green-100 text-green-800 border-green-200'
    : status === 'submitted'
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-gray-100 text-gray-600 border-gray-200';
}

function statusLabel(status: TimesheetEntry['status']): string {
  return status === 'approved' ? 'Approved' : status === 'submitted' ? 'Submitted' : 'Draft';
}

// ── Log Hours Dialog ─────────────────────────────────────────────────────────

interface LogDialogProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  userId: string;
  userName: string;
  prefillDate?: string;
  prefillProjectId?: string;
  editEntry?: TimesheetEntry | null;
}

function LogHoursDialog({
  open, onClose, projects, userId, userName, prefillDate, prefillProjectId, editEntry,
}: LogDialogProps) {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(toYMD(new Date()));
  const [hours, setHours] = useState('8');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editEntry) {
        setProjectId(editEntry.projectId);
        setDate(editEntry.date);
        setHours(String(editEntry.hours));
        setDescription(editEntry.description);
      } else {
        setProjectId(prefillProjectId || '');
        setDate(prefillDate || toYMD(new Date()));
        setHours('8');
        setDescription('');
      }
    }
  }, [open, editEntry, prefillDate, prefillProjectId]);

  const selectedProject = projects.find(p => p.id === projectId);

  async function save(status: 'draft' | 'submitted') {
    if (!projectId || !date || !hours) {
      toast({ title: 'Missing fields', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        userId,
        userName,
        projectId,
        projectName: selectedProject?.name ?? '',
        date,
        hours: parseFloat(hours),
        description,
        status,
        createdAt: Timestamp.now(),
      };
      if (editEntry) {
        await updateDoc(doc(db, 'timesheets', editEntry.id), { ...payload });
      } else {
        await addDoc(collection(db, 'timesheets'), payload);
      }
      toast({ title: editEntry ? 'Entry updated' : 'Hours logged', description: `Saved as ${status}.` });
      onClose();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Could not save timesheet entry.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const hourOptions = Array.from({ length: 33 }, (_, i) => ((i + 1) * 0.5).toFixed(1));

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editEntry ? 'Edit Entry' : 'Log Hours'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hours *</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-48">
                {hourOptions.map(h => (
                  <SelectItem key={h} value={h}>{h} hrs</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => save('draft')} disabled={saving}>Save Draft</Button>
          <Button
            onClick={() => save('submitted')}
            disabled={saving}
            className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
          >
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Weekly Grid ──────────────────────────────────────────────────────────────

interface WeeklyGridProps {
  weekStart: Date;
  entries: TimesheetEntry[];
  onCellClick: (date: string, projectId: string) => void;
}

function WeeklyGrid({ weekStart, entries, onCellClick }: WeeklyGridProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const projectIds = Array.from(new Set(entries.map(e => e.projectId)));
  const projects = projectIds.map(pid => ({
    id: pid,
    name: entries.find(e => e.projectId === pid)?.projectName ?? pid,
  }));

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-8 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">
          <div className="px-3 py-2">Project</div>
          {days.map((d, i) => (
            <div key={i} className="px-2 py-2 text-center">
              <div>{dayLabels[i]}</div>
              <div className="text-gray-400 font-normal">{d.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-6 text-sm text-gray-400 text-center col-span-8">
          No entries this week
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200"
        style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
        <div className="px-3 py-2">Project</div>
        {days.map((d, i) => (
          <div key={i} className="px-2 py-2 text-center">
            <div>{dayLabels[i]}</div>
            <div className="text-gray-400 font-normal">{d.getDate()}</div>
          </div>
        ))}
      </div>
      {projects.map(proj => (
        <div
          key={proj.id}
          className="grid border-b border-gray-100 last:border-b-0"
          style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}
        >
          <div className="px-3 py-3 text-sm font-medium text-gray-700 flex items-center truncate">{proj.name}</div>
          {days.map((d, i) => {
            const ymd = toYMD(d);
            const entry = entries.find(e => e.projectId === proj.id && e.date === ymd);
            return (
              <div
                key={i}
                onClick={() => onCellClick(ymd, proj.id)}
                className={`px-2 py-3 text-center text-sm cursor-pointer transition-colors hover:bg-[#C9A96E]/10 ${entry ? 'font-semibold text-gray-800' : 'text-gray-300'}`}
              >
                {entry ? `${entry.hours}h` : '—'}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Timesheet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [teamEntries, setTeamEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimesheetEntry | null>(null);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [prefillProjectId, setPrefillProjectId] = useState<string | undefined>();
  const [teamView, setTeamView] = useState(false);
  const isAdminOrGc = user?.role === 'admin' || user?.role === 'gc';

  const weekDates = Array.from({ length: 7 }, (_, i) => toYMD(addDays(weekStart, i)));
  const weekEnd = addDays(weekStart, 6);

  // Load projects
  useEffect(() => {
    getDocs(collection(db, 'projects')).then(snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name?: string }).name ?? d.id })));
    }).catch(console.error);
  }, []);

  // Load my entries
  useEffect(() => {
    if (!user?.id) return;
    const uid = String(user.id);
    const q = query(
      collection(db, 'timesheets'),
      where('userId', '==', uid),
      orderBy('date', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimesheetEntry)));
    }, err => {
      console.error(err);
      toast({ title: 'Error loading timesheets', variant: 'destructive' });
    });
    return () => unsub();
  }, [user?.id]);

  // Load team entries for admin/gc
  useEffect(() => {
    if (!isAdminOrGc || !teamView) return;
    const q = query(collection(db, 'timesheets'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setTeamEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimesheetEntry)));
    }, console.error);
    return () => unsub();
  }, [isAdminOrGc, teamView]);

  const displayEntries = teamView && isAdminOrGc ? teamEntries : entries;
  const weekEntries = displayEntries.filter(e => weekDates.includes(e.date));
  const weeklyHours = weekEntries.reduce((sum, e) => sum + e.hours, 0);

  function openLog(date?: string, projectId?: string) {
    setEditEntry(null);
    setPrefillDate(date);
    setPrefillProjectId(projectId);
    setLogOpen(true);
  }

  function openEdit(entry: TimesheetEntry) {
    setEditEntry(entry);
    setPrefillDate(undefined);
    setPrefillProjectId(undefined);
    setLogOpen(true);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
            <Badge className="bg-[#C9A96E]/20 text-[#b8934d] border-[#C9A96E]/40 font-semibold">
              <Clock className="w-3 h-3 mr-1" />
              {weeklyHours.toFixed(1)} hrs this week
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isAdminOrGc && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTeamView(v => !v)}
                className={teamView ? 'border-[#C9A96E] text-[#b8934d]' : ''}
              >
                <Users className="w-4 h-4 mr-1.5" />
                {teamView ? 'My View' : 'Team View'}
              </Button>
            )}
            <Button
              onClick={() => openLog()}
              className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Log Hours
            </Button>
          </div>
        </div>

        {/* Week Navigator */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(d => addDays(d, -7))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
            {formatWeekRange(weekStart)}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(d => addDays(d, 7))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="text-xs text-gray-500"
          >
            Today
          </Button>
        </div>

        {/* Weekly Grid */}
        <WeeklyGrid
          weekStart={weekStart}
          entries={weekEntries}
          onCellClick={(date, projectId) => openLog(date, projectId)}
        />

        {/* Entry Cards */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-gray-700">
            {weekEntries.length} {weekEntries.length === 1 ? 'Entry' : 'Entries'} &mdash; {formatWeekRange(weekStart)}
          </h2>
          {weekEntries.length === 0 ? (
            <Card className="bg-gray-50 border-dashed">
              <CardContent className="py-10 text-center">
                <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No entries for this week. Log some hours!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {weekEntries
                .slice()
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(entry => (
                  <Card
                    key={entry.id}
                    className="cursor-pointer hover:shadow-md transition-shadow border-gray-200"
                    onClick={() => !teamView && openEdit(entry)}
                  >
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-semibold text-gray-800 leading-tight">
                          {entry.projectName}
                        </CardTitle>
                        <Badge className={`${statusColor(entry.status)} text-xs shrink-0`}>
                          {statusLabel(entry.status)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <span className="font-bold text-gray-800 text-sm">{entry.hours} hrs</span>
                      </div>
                      {entry.description && (
                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{entry.description}</p>
                      )}
                      {teamView && (
                        <p className="text-xs text-gray-400 font-medium">{entry.userName}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Log Hours Dialog */}
      <LogHoursDialog
        open={logOpen}
        onClose={() => { setLogOpen(false); setEditEntry(null); }}
        projects={projects}
        userId={user ? String(user.id) : ''}
        userName={user?.name ?? ''}
        prefillDate={prefillDate}
        prefillProjectId={prefillProjectId}
        editEntry={editEntry}
      />
    </AppLayout>
  );
}
