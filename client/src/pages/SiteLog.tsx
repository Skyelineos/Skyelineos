import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc,
  getDocs, where, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { NewLogDialog } from '@/components/site-log/NewLogDialog';
import {
  Plus, Camera, Video, FileText, ChevronDown, ChevronUp,
  CheckCircle2, Clock, Search, Filter, User, HardHat,
  AlertCircle,
} from 'lucide-react';

interface SiteLogDoc {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  createdBy: string;
  createdByName: string;
  createdByRole?: string;
  createdAt: Timestamp | null;
  status: 'open' | 'resolved';
  entryCount: number;
}

interface LogEntry {
  id: string;
  type: 'photo' | 'video' | 'note';
  mediaUrl?: string;
  comment: string;
  tradeId?: string;
  tradeName?: string;
}

function formatDate(ts: Timestamp | null) {
  if (!ts) return '—';
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  return status === 'resolved'
    ? <Badge className="bg-green-100 text-green-800 border-green-200 text-xs gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved</Badge>
    : <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs gap-1"><Clock className="w-3 h-3" /> Open</Badge>;
}

// ── Detail panel for one log ─────────────────────────────────────────────────
function LogDetail({ log }: { log: SiteLogDoc }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(collection(db, 'siteLogs', log.id, 'entries'))
      .then(snap => {
        setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as LogEntry)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [log.id]);

  if (loading) return <div className="py-6 text-center text-sm text-gray-400">Loading items…</div>;
  if (entries.length === 0) return <div className="py-6 text-center text-sm text-gray-400">No items in this log</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
      {entries.map(entry => (
        <div key={entry.id} className="rounded-lg border border-gray-200 overflow-hidden bg-white">
          {entry.type === 'photo' && entry.mediaUrl && (
            <a href={entry.mediaUrl} target="_blank" rel="noopener noreferrer">
              <img src={entry.mediaUrl} alt="Site photo" className="w-full object-cover" style={{ height: 160 }} />
            </a>
          )}
          {entry.type === 'video' && entry.mediaUrl && (
            <video src={entry.mediaUrl} controls className="w-full" style={{ height: 160 }} />
          )}
          {entry.type === 'note' && (
            <div className="flex items-center justify-center bg-gray-50" style={{ height: 60 }}>
              <FileText className="w-8 h-8 text-gray-300" />
            </div>
          )}
          <div className="p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              {entry.type === 'photo' && <Camera className="w-3 h-3 text-amber-500 flex-shrink-0" />}
              {entry.type === 'video' && <Video className="w-3 h-3 text-blue-500 flex-shrink-0" />}
              {entry.type === 'note'  && <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />}
              <span className="text-xs font-medium text-gray-500 capitalize">{entry.type}</span>
            </div>
            {entry.comment && (
              <p className="text-sm text-gray-800 leading-snug">{entry.comment}</p>
            )}
            {entry.tradeName && (
              <Badge variant="secondary" className="text-xs gap-1">
                <HardHat className="w-3 h-3" /> {entry.tradeName}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Log card ─────────────────────────────────────────────────────────────────
function LogCard({ log, onStatusChange }: { log: SiteLogDoc; onStatusChange: (id: string, s: 'open' | 'resolved') => void }) {
  const [expanded, setExpanded] = useState(false);
  const isClientSubmitted = log.createdByRole === 'client';

  return (
    <div className={`rounded-xl border overflow-hidden bg-white shadow-sm transition-shadow hover:shadow-md ${isClientSubmitted ? 'border-blue-200' : 'border-gray-200'}`}>
      <div
        className="flex items-start gap-3 p-4 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Left col: date + status */}
        <div className="flex-shrink-0 text-center min-w-[48px]">
          {log.createdAt && (
            <>
              <div className="text-lg font-bold text-gray-900 leading-none">
                {log.createdAt.toDate().getDate()}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">
                {log.createdAt.toDate().toLocaleDateString('en-US', { month: 'short' })}
              </div>
            </>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900 leading-tight">{log.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{log.projectName}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={log.status} />
              {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <User className="w-3 h-3" />
              {isClientSubmitted
                ? <span className="text-blue-600 font-medium">{log.createdByName} (Client)</span>
                : log.createdByName}
            </span>
            <span className="text-xs text-gray-400">
              {log.entryCount} item{log.entryCount !== 1 ? 's' : ''}
            </span>
            {log.createdAt && (
              <span className="text-xs text-gray-400">{formatDate(log.createdAt)}</span>
            )}
            {isClientSubmitted && (
              <Badge className="text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1">
                <AlertCircle className="w-3 h-3" /> Client Submitted
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          <LogDetail log={log} />

          <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
            {log.status === 'open' ? (
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50 text-xs"
                onClick={e => { e.stopPropagation(); onStatusChange(log.id, 'resolved'); }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark Resolved
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50 text-xs"
                onClick={e => { e.stopPropagation(); onStatusChange(log.id, 'open'); }}
              >
                Reopen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SiteLog() {
  return (
    <AppLayout>
      <SiteLogContent />
    </AppLayout>
  );
}

export function SiteLogContent({ projectId: scopedProjectId }: { projectId?: string } = {}) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<SiteLogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLogOpen, setNewLogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('__all__');
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'resolved'>('all');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'siteLogs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SiteLogDoc)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  // Derive unique projects from loaded logs for the filter
  useEffect(() => {
    const seen = new Map<string, string>();
    logs.forEach(l => { if (!seen.has(l.projectId)) seen.set(l.projectId, l.projectName); });
    setProjects(Array.from(seen.entries()).map(([id, name]) => ({ id, name })));
  }, [logs]);

  const handleStatusChange = async (id: string, status: 'open' | 'resolved') => {
    await updateDoc(doc(db, 'siteLogs', id), { status });
  };

  const filtered = logs.filter(l => {
    if (scopedProjectId && l.projectId !== scopedProjectId) return false;
    if (filterProject !== '__all__' && l.projectId !== filterProject) return false;
    if (filterStatus !== 'all' && l.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const title = (l.title || '').toLowerCase();
      const proj  = (l.projectName || '').toLowerCase();
      const by    = (l.createdByName || '').toLowerCase();
      if (!title.includes(s) && !proj.includes(s) && !by.includes(s)) return false;
    }
    return true;
  });

  const openCount = logs.filter(l => l.status === 'open').length;
  const clientCount = logs.filter(l => l.createdByRole === 'client').length;

  return (
    <>
      <div className="space-y-5 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Site Observation Log</h1>
            <p className="text-sm text-gray-500 mt-1">
              {openCount > 0 && <span className="text-amber-600 font-medium">{openCount} open</span>}
              {openCount > 0 && clientCount > 0 && <span className="text-gray-400"> · </span>}
              {clientCount > 0 && <span className="text-blue-600 font-medium">{clientCount} from clients</span>}
              {openCount === 0 && clientCount === 0 && 'All resolved'}
            </p>
          </div>
          <Button
            onClick={() => setNewLogOpen(true)}
            style={{ backgroundColor: '#C9A96E', color: '#141414', fontWeight: 600 }}
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Log
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search logs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          {!scopedProjectId && (
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="h-9 text-sm w-48">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All projects</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as any)}>
            <SelectTrigger className="h-9 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Log list */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Camera className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="font-medium">No site logs yet</p>
            <p className="text-sm mt-1">Tap "New Log" to start documenting observations on site</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(log => (
              <LogCard key={log.id} log={log} onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}
      </div>

      <NewLogDialog
        open={newLogOpen}
        onOpenChange={setNewLogOpen}
        onCreated={() => {}}
        defaultProjectId={scopedProjectId}
      />
    </>
  );
}
