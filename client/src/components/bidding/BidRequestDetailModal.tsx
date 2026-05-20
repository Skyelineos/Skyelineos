import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, getDoc, doc, updateDoc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { createNotificationsBatch } from '@/lib/notifications';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Send, CheckCircle2, Clock, Mail, Phone, Loader2, AlertCircle, FileText, UserPlus, Search,
} from 'lucide-react';
import type { BidRequest, PortalBid } from './types';

interface SubInfo {
  id: string;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedUserId?: string;
  trades?: string[];
}

interface SubRow {
  sub: SubInfo;
  submittedBid: PortalBid | null;
}

interface Props {
  request: BidRequest;
  projectId: string;
  projectName?: string;
  onClose: () => void;
}

export function BidRequestDetailModal({ request, projectId, projectName, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [subs, setSubs] = useState<SubInfo[]>([]);
  const [bidsForRequest, setBidsForRequest] = useState<PortalBid[]>([]);
  const [reminding, setReminding] = useState<Set<string>>(new Set());
  const [bulkReminding, setBulkReminding] = useState(false);
  const [allSubs, setAllSubs] = useState<SubInfo[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  // Load each invited sub's contact doc once. Contacts are stable so no
  // need for a live listener here — one read per sub on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: SubInfo[] = [];
      for (const id of request.invitedSubIds || []) {
        try {
          const snap = await getDoc(doc(db, 'contacts', id));
          if (snap.exists()) {
            const data = snap.data() as any;
            out.push({
              id,
              name: data.name,
              company: data.company,
              email: data.email,
              phone: data.phone,
              linkedUserId: data.linkedUserId,
            });
          } else {
            // Fall back to a placeholder so the row still renders
            out.push({ id, name: '(unknown sub)' });
          }
        } catch {
          out.push({ id, name: '(unknown sub)' });
        }
      }
      if (!cancelled) setSubs(out);
    })();
    return () => { cancelled = true; };
  }, [request.invitedSubIds]);

  // Pull the full roster of sub-type contacts once. Drives the "Add sub"
  // picker so the GC can drop in additional bidders mid-flight when someone
  // ghosts or the deadline slips.
  useEffect(() => {
    const a = query(collection(db, 'contacts'), where('type', '==', 'sub'));
    const b = query(collection(db, 'contacts'), where('role', '==', 'sub'));
    const c = query(collection(db, 'contacts'), where('role', '==', 'subcontractor'));
    const cache = new Map<string, SubInfo>();
    const apply = () => setAllSubs(Array.from(cache.values()));
    const ingest = (snap: any) => {
      snap.docs.forEach((d: any) => {
        const data = d.data();
        const tradesArr: string[] = Array.isArray(data.trades) ? data.trades.filter((t: any) => typeof t === 'string' && t.trim()) : [];
        const legacy = typeof data.trade === 'string' && data.trade.trim() ? [data.trade.trim()] : [];
        cache.set(d.id, {
          id: d.id,
          name: data.name,
          company: data.company,
          email: data.email,
          phone: data.phone,
          linkedUserId: data.linkedUserId,
          trades: tradesArr.length > 0 ? tradesArr : legacy,
        });
      });
      apply();
    };
    const u1 = onSnapshot(a, ingest, () => {});
    const u2 = onSnapshot(b, ingest, () => {});
    const u3 = onSnapshot(c, ingest, () => {});
    return () => { u1(); u2(); u3(); };
  }, []);

  // Live-watch bids for THIS specific request so the submitted/pending column
  // updates the moment a sub hits "Submit Bid" in their portal.
  useEffect(() => {
    if (!projectId || !request.id) return;
    const q = query(
      collection(db, 'bids'),
      where('projectId', '==', projectId),
      where('bidRequestId', '==', request.id),
    );
    const unsub = onSnapshot(q, snap => {
      setBidsForRequest(snap.docs.map(d => ({ id: d.id, ...d.data() } as PortalBid)));
    }, () => setBidsForRequest([]));
    return () => unsub();
  }, [projectId, request.id]);

  const rows: SubRow[] = subs.map(sub => ({
    sub,
    submittedBid: bidsForRequest.find(b => (b.subContactId || b.subId) === sub.id) || null,
  }));

  const pending = rows.filter(r => !r.submittedBid);
  const submitted = rows.filter(r => r.submittedBid);

  const sendReminderFor = async (row: SubRow): Promise<boolean> => {
    if (!user) return false;
    const recipientId = row.sub.linkedUserId || row.sub.id;
    const qs = new URLSearchParams();
    qs.set('bidRequest', request.id);
    if (row.sub.email) qs.set('email', row.sub.email);
    try {
      await createNotificationsBatch([{
        userId: recipientId,
        kind: 'system',
        title: `Bid reminder — ${request.trade}`,
        body: `Reminder: please submit your bid for ${projectName || 'this project'} (${request.trade}).${request.dueDate ? ` Due ${request.dueDate}.` : ''}`,
        link: `/subcontractor-portal/bids?${qs.toString()}`,
        projectId,
        refType: 'task',
        refId: request.id,
        fromUserName: user.name || 'Skyeline Homes',
      }]);
      return true;
    } catch (e: any) {
      toast({ title: 'Reminder failed', description: e?.message || String(e), variant: 'destructive' });
      return false;
    }
  };

  const handleSingleReminder = async (row: SubRow) => {
    setReminding(prev => new Set(prev).add(row.sub.id));
    const ok = await sendReminderFor(row);
    setReminding(prev => { const n = new Set(prev); n.delete(row.sub.id); return n; });
    if (ok) {
      const channels = [row.sub.email && 'email', row.sub.phone && 'text'].filter(Boolean).join(' + ');
      toast({
        title: 'Reminder sent',
        description: channels ? `Sent via ${channels} to ${row.sub.name}.` : `Queued for ${row.sub.name}.`,
      });
    }
  };

  const handleBulkReminder = async () => {
    if (pending.length === 0) return;
    setBulkReminding(true);
    let ok = 0;
    for (const r of pending) {
      const result = await sendReminderFor(r);
      if (result) ok++;
    }
    setBulkReminding(false);
    toast({
      title: `Reminders sent to ${ok} sub${ok === 1 ? '' : 's'}`,
      description: ok < pending.length ? `${pending.length - ok} failed — check the console.` : 'Email + text dispatched per recipient settings.',
    });
  };

  const invitedSet = new Set(request.invitedSubIds || []);
  const tradeKey = (request.trade || '').toLowerCase().trim();
  const addableSubs = allSubs
    .filter(s => !invitedSet.has(s.id))
    .filter(s => {
      if (!addSearch.trim()) return true;
      const q = addSearch.toLowerCase();
      return (s.name || '').toLowerCase().includes(q)
        || (s.company || '').toLowerCase().includes(q)
        || (s.email || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aMatch = tradeKey && (a.trades || []).some(t => t.toLowerCase() === tradeKey) ? 0 : 1;
      const bMatch = tradeKey && (b.trades || []).some(t => t.toLowerCase() === tradeKey) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return (a.name || '').localeCompare(b.name || '');
    });

  const handleAddSub = async (sub: SubInfo) => {
    if (!user) { toast({ title: 'Sign in required', variant: 'destructive' }); return; }
    setAdding(sub.id);
    try {
      // Append to invitedSubIds atomically.
      await updateDoc(
        doc(db, 'projects', projectId, 'bidRequests', request.id),
        {
          invitedSubIds: arrayUnion(sub.id),
          updatedAt: serverTimestamp(),
        },
      );
      // Hydrate the local subs list so the row appears immediately while the
      // parent listener catches up.
      setSubs(prev => prev.some(s => s.id === sub.id) ? prev : [...prev, sub]);

      // Fire an invitation notification (email + SMS dispatched by the
      // notifications Cloud Function based on recipient preferences).
      const recipientId = sub.linkedUserId || sub.id;
      const qs = new URLSearchParams();
      qs.set('bidRequest', request.id);
      if (sub.email) qs.set('email', sub.email);
      await createNotificationsBatch([{
        userId: recipientId,
        kind: 'system',
        title: `Bid request — ${request.trade}`,
        body: `You've been invited to bid on ${projectName || 'this project'} (${request.trade}).${request.dueDate ? ` Due ${request.dueDate}.` : ''} Open Skyeline OS to submit your quote.`,
        link: `/subcontractor-portal/bids?${qs.toString()}`,
        projectId,
        refType: 'task',
        refId: request.id,
        fromUserName: user.name || 'Skyeline Homes',
      }]);

      const channels = [sub.email && 'email', sub.phone && 'text'].filter(Boolean).join(' + ');
      toast({
        title: `${sub.name} added to the package`,
        description: channels ? `Invite sent via ${channels}.` : 'Notification queued.',
      });
    } catch (e: any) {
      toast({ title: 'Could not add sub', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setAdding(null);
    }
  };

  const requestedAt = (request.createdAt as any)?.toDate?.()?.toLocaleDateString?.() || '—';
  const requestedDays = (() => {
    const d = (request.createdAt as any)?.toDate?.();
    if (!d) return null;
    const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  })();

  return (
    <Dialog open={true} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#C9A96E]" />
            {request.trade} bid package
          </DialogTitle>
          <DialogDescription>
            Requested {requestedAt}{requestedDays != null ? ` (${requestedDays} day${requestedDays === 1 ? '' : 's'} ago)` : ''} ·
            Due {request.dueDate || '—'} ·
            <Badge variant="outline" className="ml-1.5">{request.status}</Badge>
          </DialogDescription>
        </DialogHeader>

        {request.scope && (
          <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Scope</p>
            {request.scope}
          </div>
        )}

        <div className="space-y-3">
          {/* Header strip */}
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {rows.length} invited · {submitted.length} submitted · {pending.length} pending
            </p>
            <div className="flex items-center gap-2">
              <Popover open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) setAddSearch(''); }}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" title="Invite another sub to this package">
                    <UserPlus className="w-3.5 h-3.5" />
                    Add sub
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-2 border-b" style={{ borderColor: '#E5E7EB' }}>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        value={addSearch}
                        onChange={e => setAddSearch(e.target.value)}
                        placeholder={`Search subs${request.trade ? ` for ${request.trade}` : ''}…`}
                        className="pl-8 h-8 text-sm"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {addableSubs.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6 px-3">
                        {allSubs.length === 0
                          ? 'No subs in Contacts yet. Add some first.'
                          : invitedSet.size >= allSubs.length
                          ? 'Every sub in your network is already invited.'
                          : 'No subs match the search.'}
                      </p>
                    ) : (
                      <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
                        {addableSubs.map(s => {
                          const matchesTrade = tradeKey && (s.trades || []).some(t => t.toLowerCase() === tradeKey);
                          const isAdding = adding === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleAddSub(s)}
                              disabled={isAdding}
                              className="w-full text-left flex items-start gap-2 px-3 py-2 hover:bg-amber-50/50 disabled:opacity-60"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate text-gray-900">
                                  {s.name || '(no name)'}
                                  {matchesTrade && (
                                    <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: '#8B6F3F' }}>
                                      {request.trade}
                                    </span>
                                  )}
                                </p>
                                {s.company && <p className="text-xs text-gray-500 truncate">{s.company}</p>}
                                {(s.email || s.phone) && (
                                  <p className="text-[11px] text-gray-400 truncate">
                                    {[s.email, s.phone].filter(Boolean).join(' · ')}
                                  </p>
                                )}
                              </div>
                              {isAdding ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0 mt-0.5" />
                              ) : (
                                <UserPlus className="w-3.5 h-3.5 text-[#C9A96E] flex-shrink-0 mt-0.5" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {pending.length > 0 && (
                <Button
                  onClick={handleBulkReminder}
                  disabled={bulkReminding}
                  size="sm"
                  className="gap-1.5 text-white"
                  style={{ backgroundColor: '#C9A96E' }}
                >
                  {bulkReminding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Remind all {pending.length} pending
                </Button>
              )}
            </div>
          </div>

          {/* Subs list */}
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No subs invited on this request.</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {/* Pending first */}
              {pending.map(r => (
                <SubRowView key={r.sub.id} row={r} onRemind={() => handleSingleReminder(r)} reminding={reminding.has(r.sub.id)} />
              ))}
              {submitted.map(r => (
                <SubRowView key={r.sub.id} row={r} onRemind={() => handleSingleReminder(r)} reminding={reminding.has(r.sub.id)} />
              ))}
            </div>
          )}

          {!user && (
            <div className="flex items-start gap-2 p-2.5 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>You need to be signed in to send reminders.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubRowView({ row, onRemind, reminding }: { row: SubRow; onRemind: () => void; reminding: boolean }) {
  const submitted = !!row.submittedBid;
  const submittedAt = (row.submittedBid?.submittedAt as any)?.toDate?.()?.toLocaleDateString?.() || '—';
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900 truncate">{row.sub.name || '(no name)'}</span>
          {row.sub.company && <span className="text-xs text-gray-500 truncate">· {row.sub.company}</span>}
          {submitted ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200 gap-1 text-[10px]">
              <CheckCircle2 className="w-3 h-3" />
              Submitted {submittedAt}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-800">
              <Clock className="w-3 h-3" />
              Pending
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
          {row.sub.email && (
            <span className="flex items-center gap-1 truncate">
              <Mail className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{row.sub.email}</span>
            </span>
          )}
          {row.sub.phone && (
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {row.sub.phone}
            </span>
          )}
          {!row.sub.email && !row.sub.phone && (
            <span className="italic text-gray-400">No email or phone on file</span>
          )}
          {submitted && row.submittedBid?.totalAmount != null && (
            <span className="font-mono text-gray-700">${row.submittedBid.totalAmount.toLocaleString()}</span>
          )}
        </div>
      </div>
      {!submitted && (row.sub.email || row.sub.phone) && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRemind}
          disabled={reminding}
          className="gap-1.5 flex-shrink-0"
          title="Send a reminder email + text"
        >
          {reminding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Send reminder
        </Button>
      )}
    </div>
  );
}
