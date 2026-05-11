import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, serverTimestamp, getDocs, query, where, orderBy,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { createNotificationsBatch } from '@/lib/notifications';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send, Upload, X, Search, Hammer, FileText, Paperclip, AlertCircle,
} from 'lucide-react';
import type { BidRequestPlan } from './types';

interface Props {
  open: boolean;
  projectId: string;
  projectName?: string;
  onClose: () => void;
}

interface Sub {
  id: string;
  name: string;
  company?: string;
  email?: string;
  trade?: string;
  phone?: string;
}

const TRADES = [
  'General Conditions', 'Site Work', 'Concrete / Foundation', 'Framing', 'Roofing',
  'Electrical', 'Plumbing', 'HVAC', 'Insulation', 'Drywall', 'Flooring', 'Paint',
  'Cabinets / Millwork', 'Tile', 'Exterior Finishes', 'Landscaping', 'Other',
];

export function RequestBidsModal({ open, projectId, projectName, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [trade, setTrade] = useState('Framing');
  const [scope, setScope] = useState('');
  const [callouts, setCallouts] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });

  const [allSubs, setAllSubs] = useState<Sub[]>([]);
  const [filterText, setFilterText] = useState('');
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());

  const [plans, setPlans] = useState<BidRequestPlan[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Load subs
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'contacts'), orderBy('name')));
        const subs: Sub[] = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter((c: any) => c.role === 'sub' || c.role === 'subcontractor')
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            company: c.company,
            email: c.email,
            trade: c.trade,
            phone: c.phone,
          }));
        setAllSubs(subs);
      } catch (e: any) {
        toast({ title: 'Could not load subs', description: e.message, variant: 'destructive' });
      }
    })();
  }, [open, toast]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedSubIds(new Set());
      setPlans([]);
      setFilterText('');
    }
  }, [open]);

  const filteredSubs = allSubs.filter(s => {
    const q = filterText.toLowerCase();
    const matchesText = !q || s.name.toLowerCase().includes(q) || (s.company || '').toLowerCase().includes(q) || (s.trade || '').toLowerCase().includes(q);
    const matchesTrade = !trade || trade === 'Other' || (s.trade || '').toLowerCase().includes(trade.toLowerCase().split(' ')[0]);
    return matchesText && matchesTrade;
  });

  const toggleSub = (id: string) => {
    const next = new Set(selectedSubIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedSubIds(next);
  };

  const handlePlanUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const filename = `${Date.now()}-${file.name}`;
      const path = `projects/${projectId}/bid-requests/${filename}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          reject, () => resolve(),
        );
      });
      const url = await getDownloadURL(sref);
      setPlans(p => [...p, { name: file.name, url, storagePath: path }]);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (selectedSubIds.size === 0) {
      toast({ title: 'Pick at least one sub', variant: 'destructive' });
      return;
    }
    if (!scope.trim()) {
      toast({ title: 'Scope of work is required', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const requestRef = await addDoc(
        collection(db, 'projects', projectId, 'bidRequests'),
        {
          projectId,
          projectName: projectName || '',
          trade,
          scope: scope.trim(),
          callouts: callouts.trim(),
          plans,
          dueDate,
          invitedSubIds: Array.from(selectedSubIds),
          invitedByUserId: user.id?.toString() || user.email || 'unknown',
          invitedByName: user.name || 'GC',
          status: 'open',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );

      // Fire notifications to each invited sub
      const invitedSubs = allSubs.filter(s => selectedSubIds.has(s.id));
      await createNotificationsBatch(
        invitedSubs.map(sub => ({
          userId: sub.id,
          kind: 'system',
          title: `New bid request: ${trade} for ${projectName || 'project'}`,
          body: `Due ${dueDate}. Open the Bid Requests tab in your portal to review and submit.`,
          link: '/subcontractor-portal/bids',
          projectId,
          refType: 'task',
          refId: requestRef.id,
          fromUserName: user.name || 'Skyeline Homes',
        })),
      );

      toast({
        title: 'Bid request sent',
        description: `Invited ${selectedSubIds.size} sub${selectedSubIds.size > 1 ? 's' : ''}. They'll see it in their portal.`,
      });
      onClose();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="w-5 h-5 text-[#C9A96E]" />
            Request Bids
          </DialogTitle>
          <DialogDescription>
            Send a bid request to selected subs. They submit through their portal — bids will appear here for comparison.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trade + due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Trade</Label>
              <Select value={trade} onValueChange={setTrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRADES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="due">Bids Due By</Label>
              <Input id="due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Scope */}
          <div>
            <Label htmlFor="scope">Scope of Work *</Label>
            <Textarea
              id="scope"
              rows={4}
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder="Describe what the sub is bidding on. Be specific about quantities, materials, timeline, etc."
            />
          </div>

          {/* Callouts */}
          <div>
            <Label htmlFor="callouts">Callouts / Special Notes</Label>
            <Textarea
              id="callouts"
              rows={2}
              value={callouts}
              onChange={e => setCallouts(e.target.value)}
              placeholder="Anything specific to flag — e.g. 'Use only stainless fasteners' or 'Coordinate with roofer day-of'"
            />
          </div>

          {/* Plans */}
          <div>
            <Label>Plans / Drawings (PDFs)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {plans.map((p, i) => (
                <Badge key={i} variant="secondary" className="gap-1.5">
                  <FileText className="w-3 h-3" />
                  <span className="text-xs">{p.name}</span>
                  <button onClick={() => setPlans(ps => ps.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePlanUpload(f); }}
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {uploading ? `Uploading… ${Math.round(uploadProgress)}%` : 'Attach plan'}
            </Button>
          </div>

          {/* Sub selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Subs to Invite ({selectedSubIds.size} selected)</Label>
              {selectedSubIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedSubIds(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="Filter by name, company, or trade…"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <ScrollArea className="h-48 border rounded-lg">
              {filteredSubs.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  No subs match. Add subs in <a href="/contacts" className="underline">Contacts</a> first.
                </div>
              ) : (
                <div className="divide-y">
                  {filteredSubs.map(sub => {
                    const checked = selectedSubIds.has(sub.id);
                    return (
                      <label
                        key={sub.id}
                        className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-amber-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSub(sub.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{sub.name}</span>
                            {sub.trade && <Badge variant="outline" className="text-[10px]">{sub.trade}</Badge>}
                          </div>
                          {sub.company && <div className="text-xs text-gray-500">{sub.company}</div>}
                          {!sub.email && <div className="text-[10px] text-orange-500 flex items-center gap-1 mt-0.5"><AlertCircle className="w-2.5 h-2.5" /> No email — won't get auto-notification</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="border-t pt-4 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || selectedSubIds.size === 0 || !scope.trim()}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Sending...' : `Send to ${selectedSubIds.size} sub${selectedSubIds.size === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
