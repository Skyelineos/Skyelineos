import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Phone, Mail, Users, MessageSquare, FileText, Plus } from 'lucide-react';

type CommType = 'call' | 'email' | 'meeting' | 'text' | 'note';
type Direction = 'inbound' | 'outbound';
type DateRange = 'week' | 'month' | 'all';

interface CommsEntry {
  id: string;
  contactId?: string;
  contactName: string;
  projectId?: string;
  projectName?: string;
  type: CommType;
  direction: Direction;
  subject: string;
  notes?: string;
  duration?: number;
  loggedBy?: string;
  loggedByName?: string;
  loggedAt: { toDate: () => Date } | null;
  followUpDate?: string;
}

interface ContactDoc { id: string; name: string; }
interface ProjectDoc { id: string; name: string; }

const TYPE_COLORS: Record<CommType, string> = {
  call: '#3b82f6',
  email: '#f59e0b',
  meeting: '#8b5cf6',
  text: '#22c55e',
  note: '#9ca3af',
};

const TYPE_BG: Record<CommType, string> = {
  call: '#eff6ff',
  email: '#fffbeb',
  meeting: '#f5f3ff',
  text: '#f0fdf4',
  note: '#f9fafb',
};

const TYPE_ICONS: Record<CommType, React.ElementType> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  text: MessageSquare,
  note: FileText,
};

function typeLabel(t: CommType) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function fmtDate(entry: CommsEntry) {
  if (!entry.loggedAt) return '—';
  try {
    return entry.loggedAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

function isThisWeek(entry: CommsEntry) {
  if (!entry.loggedAt) return false;
  try {
    const d = entry.loggedAt.toDate();
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return d >= startOfWeek;
  } catch { return false; }
}

function isThisMonth(entry: CommsEntry) {
  if (!entry.loggedAt) return false;
  try {
    const d = entry.loggedAt.toDate();
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } catch { return false; }
}

export default function CommsLog() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [entries, setEntries] = useState<CommsEntry[]>([]);
  const [contacts, setContacts] = useState<ContactDoc[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);

  const [filterProject, setFilterProject] = useState('all');
  const [filterType, setFilterType] = useState<CommType | 'all'>('all');
  const [filterContact, setFilterContact] = useState('all');
  const [filterRange, setFilterRange] = useState<DateRange>('all');

  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: 'call' as CommType,
    direction: 'outbound' as Direction,
    contactId: '',
    contactName: '',
    projectId: '',
    projectName: '',
    subject: '',
    notes: '',
    duration: '',
    followUpDate: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'commsLog'), orderBy('loggedAt', 'desc')),
      snap => setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommsEntry)))
    );
    getDocs(collection(db, 'contacts')).then(snap =>
      setContacts(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name?: string }).name || 'Unnamed' })))
    );
    getDocs(collection(db, 'projects')).then(snap =>
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name?: string }).name || 'Unnamed' })))
    );
    return () => unsub();
  }, []);

  const filtered = entries.filter(e => {
    if (filterProject !== 'all' && e.projectId !== filterProject) return false;
    if (filterType !== 'all' && e.type !== filterType) return false;
    if (filterContact !== 'all' && e.contactId !== filterContact) return false;
    if (filterRange === 'week' && !isThisWeek(e)) return false;
    if (filterRange === 'month' && !isThisMonth(e)) return false;
    return true;
  });

  async function handleCreate() {
    if (!form.subject) {
      toast({ title: 'Subject is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const contact = contacts.find(c => c.id === form.contactId);
      const project = projects.find(p => p.id === form.projectId);
      await addDoc(collection(db, 'commsLog'), {
        type: form.type,
        direction: form.direction,
        contactId: form.contactId,
        contactName: form.contactId ? contact?.name || form.contactName : form.contactName,
        projectId: form.projectId,
        projectName: form.projectId ? project?.name || '' : '',
        subject: form.subject,
        notes: form.notes,
        duration: form.duration ? parseInt(form.duration) : null,
        followUpDate: form.followUpDate || null,
        loggedBy: user?.id,
        loggedByName: user?.name,
        loggedAt: serverTimestamp(),
      });
      toast({ title: 'Interaction logged' });
      setShowDialog(false);
      setForm({ type: 'call', direction: 'outbound', contactId: '', contactName: '', projectId: '', projectName: '', subject: '', notes: '', duration: '', followUpDate: '' });
    } catch {
      toast({ title: 'Error', description: 'Could not log interaction.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Comms Log</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track all client and team communications</p>
          </div>
          <Button onClick={() => setShowDialog(true)} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90 gap-2">
            <Plus className="w-4 h-4" /> Log Interaction
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterType} onValueChange={v => setFilterType(v as CommType | 'all')}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(['call', 'email', 'meeting', 'text', 'note'] as CommType[]).map(t => (
                <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterContact} onValueChange={setFilterContact}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Contact" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contacts</SelectItem>
              {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterRange} onValueChange={v => setFilterRange(v as DateRange)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Date range" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">No communications logged yet</div>
          ) : (
            filtered.map(entry => {
              const Icon = TYPE_ICONS[entry.type] || FileText;
              return (
                <div key={entry.id} className="flex gap-4 items-start">
                  {/* Dot */}
                  <div className="flex flex-col items-center mt-1 shrink-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shadow-sm"
                      style={{ backgroundColor: TYPE_BG[entry.type], border: `2px solid ${TYPE_COLORS[entry.type]}` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: TYPE_COLORS[entry.type] }} />
                    </div>
                  </div>
                  {/* Card */}
                  <div className="flex-1 rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{entry.contactName || '—'}</span>
                        {entry.projectName && (
                          <span className="text-xs text-gray-400">· {entry.projectName}</span>
                        )}
                        <Badge
                          className="text-xs capitalize border"
                          style={{ backgroundColor: TYPE_BG[entry.type], color: TYPE_COLORS[entry.type], borderColor: TYPE_COLORS[entry.type] + '55' }}
                        >
                          {typeLabel(entry.type)}
                        </Badge>
                        <Badge className={`text-xs border ${entry.direction === 'inbound' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {entry.direction}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{fmtDate(entry)}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-1.5">{entry.subject}</p>
                    {entry.notes && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{entry.notes}</p>
                    )}
                    {entry.duration != null && (
                      <p className="text-xs text-gray-400 mt-1.5">{entry.duration} min</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Log Interaction Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Interaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as CommType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['call', 'email', 'meeting', 'text', 'note'] as CommType[]).map(t => (
                      <SelectItem key={t} value={t}>{typeLabel(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v as Direction }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              {contacts.length > 0 ? (
                <Select onValueChange={v => setForm(f => ({ ...f, contactId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
                  <SelectContent>
                    {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Contact name" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select project (optional)" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input placeholder="Subject or summary" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea placeholder="Additional notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            {form.type === 'call' && (
              <div className="space-y-1.5">
                <Label>Duration (minutes)</Label>
                <Input type="number" placeholder="0" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Follow-up Date (optional)</Label>
              <Input type="date" value={form.followUpDate} onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90">
              {saving ? 'Logging…' : 'Log Interaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
