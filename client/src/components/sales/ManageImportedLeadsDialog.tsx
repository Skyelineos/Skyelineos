import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, doc, writeBatch, deleteField, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Check, AlertTriangle, Search, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface ImportedLead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  contactId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type Demotion = 'contact' | 'sub' | 'remove-completely';

export function ManageImportedLeadsDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<ImportedLead[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, 'clients'), where('tags', 'array-contains', 'imported-vcf'));
    const unsub = onSnapshot(q,
      snap => setLeads(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name || '(no name)',
          email: data.email,
          phone: data.phone,
          contactId: data.contactId,
        };
      }).sort((a, b) => a.name.localeCompare(b.name))),
      err => toast({ title: 'Could not load imports', description: err.message, variant: 'destructive' }),
    );
    return () => unsub();
  }, [open, toast]);

  const filtered = leads.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return l.name.toLowerCase().includes(q)
      || (l.email || '').toLowerCase().includes(q)
      || (l.phone || '').toLowerCase().includes(q);
  });

  const toggleOne = (id: string) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allFilteredSelected = filtered.length > 0 && filtered.every(l => selected.has(l.id));
    setSelected(s => {
      const next = new Set(s);
      if (allFilteredSelected) filtered.forEach(l => next.delete(l.id));
      else filtered.forEach(l => next.add(l.id));
      return next;
    });
  };

  const apply = async (mode: Demotion) => {
    if (selected.size === 0) return;
    const items = leads.filter(l => selected.has(l.id));
    const verb = mode === 'remove-completely' ? 'remove completely' : (mode === 'sub' ? 'demote to Subcontractor' : 'remove from pipeline');
    if (!confirm(`${verb}: ${items.length} lead${items.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      // Firestore caps a batch at 500 writes. Worst case: 2 writes per item
      // (delete client + update contact). Chunk at 240 to stay safe.
      const chunkSize = 240;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const it of chunk) {
          // Always remove the client row — it's leaving the sales pipeline.
          batch.delete(doc(db, 'clients', it.id));
          if (it.contactId && mode !== 'remove-completely') {
            // Repurpose the contacts row instead of leaving it as 'client'.
            const patch: Record<string, any> = {
              salesClientId: deleteField(),
              updatedAt: serverTimestamp(),
            };
            if (mode === 'sub') {
              patch.type = 'sub';
              patch.role = 'sub';
            } else {
              patch.type = 'other';
              patch.role = 'other';
            }
            batch.update(doc(db, 'contacts', it.contactId), patch);
          } else if (it.contactId && mode === 'remove-completely') {
            batch.delete(doc(db, 'contacts', it.contactId));
          }
        }
        await batch.commit();
      }
      const desc =
        mode === 'sub' ? 'Moved to Contacts as Subcontractors.'
          : mode === 'contact' ? 'Removed from pipeline, kept in Contacts.'
            : 'Removed from both Sales and Contacts.';
      toast({ title: `Done — ${items.length} lead${items.length === 1 ? '' : 's'} processed`, description: desc });
      setSelected(new Set());
    } catch (e: any) {
      toast({ title: 'Cleanup failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every(l => selected.has(l.id));

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) { setSelected(new Set()); setSearch(''); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" style={{ color: '#C9A96E' }} />
            Manage imported leads
          </DialogTitle>
        </DialogHeader>

        <div className="border-b py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or phone…"
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between py-2 gap-3 text-xs text-gray-600 border-b">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 text-sm hover:text-amber-900"
            disabled={filtered.length === 0}
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center ${allFilteredSelected ? 'bg-[#C9A96E] border-[#C9A96E]' : selected.size > 0 ? 'border-[#C9A96E] bg-amber-50' : 'border-gray-400 bg-white'}`}>
              {allFilteredSelected && <Check className="w-3 h-3 text-white" />}
              {selected.size > 0 && !allFilteredSelected && <div className="w-2 h-[2px] bg-[#C9A96E] rounded" />}
            </div>
            <span className="font-medium text-gray-800">
              {allFilteredSelected ? 'Deselect all (filtered)' : 'Select all (filtered)'}
            </span>
          </button>
          <span className="whitespace-nowrap">
            {selected.size} of {leads.length} selected
            {search && filtered.length !== leads.length && ` · ${filtered.length} shown`}
          </span>
        </div>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {leads.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No leads tagged <code className="text-xs px-1 bg-gray-100 rounded">imported-vcf</code> found.</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No leads match "{search}".</p>
          ) : (
            <div className="divide-y">
              {filtered.map(l => {
                const checked = selected.has(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleOne(l.id)}
                    className={`w-full text-left flex items-start gap-3 py-2 px-1 hover:bg-gray-50 ${checked ? '' : 'opacity-60'}`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#C9A96E] border-[#C9A96E]' : 'border-gray-300'}`}>
                      {checked && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-gray-900">{l.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[l.email, l.phone].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t pt-3 -mx-6 px-6 space-y-2">
          <div className="flex items-start gap-2 text-[11px] text-gray-600 bg-amber-50 border border-amber-100 rounded p-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
            <span>
              Pick what to do with the selected leads. All three remove them from the Sales pipeline; the difference is what stays in your Contacts directory.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setSelected(new Set()); setSearch(''); onClose(); }} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => apply('contact')}
            disabled={busy || selected.size === 0}
            className="gap-1.5"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Keep as Contact
          </Button>
          <Button
            onClick={() => apply('sub')}
            disabled={busy || selected.size === 0}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            className="gap-1.5 font-semibold"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Mark as Subcontractor
          </Button>
          <Button
            variant="outline"
            onClick={() => apply('remove-completely')}
            disabled={busy || selected.size === 0}
            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete completely
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
