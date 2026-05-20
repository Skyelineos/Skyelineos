import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Check, Users, UserPlus, Loader2, AlertTriangle, Eye, EyeOff, BookOpen, Wrench } from 'lucide-react';
import { ManageImportedLeadsDialog } from './ManageImportedLeadsDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseVcards, type ParsedVCard } from '@/lib/contacts/vcard';

export interface SinglePrefill {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobAddress?: string;
  notes?: string;
}

interface Props {
  defaultStage: string;
  onSinglePrefill: (prefill: SinglePrefill) => void;
}

function FieldChip({
  value, label, type, onChange, className,
}: {
  value: string | undefined;
  label: string;
  type?: 'text' | 'email' | 'tel';
  onChange: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  const commit = () => { onChange(draft.trim()); setEditing(false); };
  if (editing) {
    return (
      <input
        type={type || 'text'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
        }}
        autoFocus
        placeholder={label}
        onClick={e => e.stopPropagation()}
        className="text-xs px-1.5 py-0.5 rounded border border-[#C9A96E] outline-none focus:ring-1 focus:ring-[#C9A96E]"
        style={{ minWidth: 120 }}
      />
    );
  }
  if (value && value.trim()) {
    return (
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setEditing(true); }}
        className={className || 'text-xs text-gray-600 hover:text-amber-900 hover:underline truncate'}
        title={`Edit ${label}`}
      >
        {value}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      className="text-[11px] px-1.5 py-0.5 rounded border border-dashed border-[#C9A96E]/60 text-amber-700 hover:bg-amber-50"
    >
      + {label}
    </button>
  );
}

export function VcardImportZone({ defaultStage, onSinglePrefill }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reviewing, setReviewing] = useState<ParsedVCard[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const openContactsApp = () => {
    setHelperOpen(false);
    // macOS-only URL scheme. Registered to Contacts.app on Mac; on other
    // platforms the browser will silently ignore it.
    try { window.location.href = 'addressbook://'; } catch { /* ignore */ }
    toast({
      title: 'Opening Contacts app…',
      description: 'Drag a card from Contacts directly onto the "Import .vcf" button to bring it in.',
    });
  };

  const pickFile = () => {
    setHelperOpen(false);
    fileRef.current?.click();
  };

  const patchCard = (i: number, patch: Partial<ParsedVCard>) => {
    setReviewing(prev => prev ? prev.map((c, idx) => idx === i ? { ...c, ...patch } : c) : null);
  };

  const isIncomplete = (c: ParsedVCard) =>
    !c.fullName?.trim() || (!c.email?.trim() && !c.phone?.trim());

  const ingestText = async (combined: string) => {
    const cards = parseVcards(combined);
    if (cards.length === 0) {
      toast({ title: 'No contacts parsed', description: 'Couldn\'t read any vCard records from that drop.', variant: 'destructive' });
      return;
    }
    if (cards.length === 1) {
      const c = cards[0];
      onSinglePrefill({
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        jobAddress: c.jobAddress,
        notes: c.notes,
      });
      toast({ title: `Imported ${c.fullName || 'contact'}`, description: 'Review and save the lead.' });
      return;
    }
    setReviewing(cards);
    // Default to NONE selected — Tyler walks through and picks the ones he wants.
    setSelected(new Set());
  };

  const ingestFiles = async (files: File[]) => {
    let combined = '';
    for (const f of files) {
      // Don't gate on extension/type — Mac drag-out gives a file with no
      // extension sometimes. Just read it; the parser will reject non-vCards.
      try { combined += '\n' + await f.text(); } catch { /* skip unreadable */ }
    }
    if (!combined.trim()) {
      toast({ title: 'No contact data detected', variant: 'destructive' });
      return;
    }
    await ingestText(combined);
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl) return;
    await ingestFiles(Array.from(fl));
    e.target.value = '';
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    // Path 1 — real File objects (e.g. dragged from Finder, or a file-promise
    // that the browser already resolved into dataTransfer.files).
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await ingestFiles(files);
      return;
    }

    // Path 2 — DataTransferItem entries marked kind='file'. Some browsers put
    // the file-promise here but not in .files until you call getAsFile().
    const items = Array.from(e.dataTransfer.items || []);
    const promised: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) promised.push(f);
      }
    }
    if (promised.length > 0) {
      await ingestFiles(promised);
      return;
    }

    // Path 3 — raw vCard text. macOS Contacts puts the card on the pasteboard
    // as 'text/vcard' / 'text/x-vcard' / 'public.vcard' when you drag a card
    // out of the app, with no File object attached. Try every variant the
    // browser will expose.
    const textTypes = ['text/vcard', 'text/x-vcard', 'public.vcard', 'text/directory'];
    let vcardText = '';
    for (const t of textTypes) {
      const v = e.dataTransfer.getData(t);
      if (v && v.trim()) { vcardText = v; break; }
    }
    // Path 4 — text/plain fallback (some macOS versions copy the vCard body
    // as plain text when nothing else is set).
    if (!vcardText) {
      const plain = e.dataTransfer.getData('text/plain') || '';
      if (/BEGIN:VCARD/i.test(plain)) vcardText = plain;
    }
    if (vcardText) {
      await ingestText(vcardText);
      return;
    }

    // Nothing useful — surface the workaround. Log the actual types so we
    // can add support for an unknown format if Tyler hits this.
    const seen = Array.from(e.dataTransfer.types || []);
    console.warn('[vcard import] no recognised payload in drop. types:', seen);
    toast({
      title: 'That drop didn\'t carry contact data',
      description: 'Drag the contact to your Desktop first (it becomes a .vcf file), then drop the file here.',
      variant: 'destructive',
    });
  };

  const toggleOne = (i: number) => {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    if (!reviewing) return;
    setSelected(s => s.size === reviewing.length ? new Set() : new Set(reviewing.map((_, i) => i)));
  };

  const doBulkImport = async (mode: 'contact' | 'lead') => {
    if (!reviewing || selected.size === 0) return;
    const items = reviewing.filter((_, i) => selected.has(i));
    setBusy(true);
    try {
      // Firestore caps batches at 500 writes. Leads do 2 writes each (client + contact).
      const chunkSize = mode === 'lead' ? 240 : 480;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const c of chunk) {
          const fullName = c.fullName || `${c.firstName} ${c.lastName}`.trim();
          if (mode === 'lead') {
            const clientRef = doc(collection(db, 'clients'));
            const contactRef = doc(collection(db, 'contacts'));
            batch.set(clientRef, {
              name: fullName,
              email: c.email || '',
              phone: c.phone || '',
              company: c.company || '',
              jobAddress: c.jobAddress || '',
              city: c.city || '',
              stage: defaultStage,
              source: 'referral',
              projectType: 'custom_home',
              priority: 'medium',
              notes: c.notes || '',
              tags: ['imported-vcf'],
              contactId: contactRef.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(contactRef, {
              name: fullName,
              email: c.email || '',
              phone: c.phone || '',
              company: c.company || '',
              address: c.jobAddress || '',
              city: c.city || '',
              type: 'client',
              role: 'client',
              notes: c.notes || '',
              tags: ['imported-vcf'],
              isActive: true,
              salesClientId: clientRef.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const contactRef = doc(collection(db, 'contacts'));
            batch.set(contactRef, {
              name: fullName,
              email: c.email || '',
              phone: c.phone || '',
              company: c.company || '',
              address: c.jobAddress || '',
              city: c.city || '',
              type: 'other',
              role: 'other',
              notes: c.notes || '',
              tags: ['imported-vcf'],
              isActive: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
        await batch.commit();
      }
      toast({
        title: `Imported ${items.length} ${mode === 'lead' ? 'lead' : 'contact'}${items.length === 1 ? '' : 's'}`,
        description: mode === 'lead' ? 'Added to the first pipeline stage.' : 'Added to your Contacts directory.',
      });
      setReviewing(null);
      setSelected(new Set());
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        multiple
        onChange={onPick}
        className="hidden"
      />
      <Popover open={helperOpen} onOpenChange={setHelperOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`gap-1.5 inline-flex items-center px-3 py-1.5 rounded border-2 border-dashed text-sm font-medium transition-colors ${
              dragging
                ? 'border-[#C9A96E] bg-amber-50 text-amber-900'
                : 'border-gray-300 text-gray-600 hover:border-[#C9A96E] hover:text-amber-900'
            }`}
            title="Drop a card here, or click for import options"
          >
            <Upload className="w-4 h-4" />
            Import contacts
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 space-y-2">
            <p className="text-xs text-gray-600 mb-1">Bring contacts into Skyeline:</p>
            <button
              type="button"
              onClick={openContactsApp}
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border hover:border-[#C9A96E] hover:bg-amber-50"
              style={{ borderColor: '#E5E7EB' }}
            >
              <BookOpen className="w-4 h-4" style={{ color: '#C9A96E' }} />
              <span className="flex-1 text-left">Open Contacts app</span>
              <span className="text-[10px] text-gray-400">Mac only</span>
            </button>
            <button
              type="button"
              onClick={pickFile}
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border hover:border-[#C9A96E] hover:bg-amber-50"
              style={{ borderColor: '#E5E7EB' }}
            >
              <FileText className="w-4 h-4" style={{ color: '#C9A96E' }} />
              <span className="flex-1 text-left">Pick a .vcf file…</span>
            </button>
            <button
              type="button"
              onClick={() => { setHelperOpen(false); setManageOpen(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border hover:border-[#C9A96E] hover:bg-amber-50"
              style={{ borderColor: '#E5E7EB' }}
            >
              <Wrench className="w-4 h-4" style={{ color: '#C9A96E' }} />
              <span className="flex-1 text-left">Manage imported leads…</span>
            </button>
            <div className="text-[11px] text-gray-500 border-t pt-2 mt-2 leading-relaxed" style={{ borderColor: '#F3F4F6' }}>
              <p className="font-semibold text-gray-700 mb-1">Quick: one contact</p>
              <p className="mb-2">Drag a card from Contacts directly onto this button.</p>
              <p className="font-semibold text-gray-700 mb-1">Bulk: all your contacts</p>
              <p>In Contacts: <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">⌘A</kbd> → File → Export → <em>Export vCard…</em> → save to Desktop, then drop the file here.</p>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <ManageImportedLeadsDialog open={manageOpen} onClose={() => setManageOpen(false)} />

      {reviewing && (
        <Dialog open onOpenChange={open => { if (!open && !busy) { setReviewing(null); setSelected(new Set()); } }}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" style={{ color: '#C9A96E' }} />
                Import {reviewing.length} contact{reviewing.length === 1 ? '' : 's'}
              </DialogTitle>
            </DialogHeader>

            {(() => {
              const incompleteCount = reviewing.filter(isIncomplete).length;
              return (
                <>
                  <div className="flex items-center justify-between border-b py-2 gap-3">
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="flex items-center gap-2 text-sm hover:text-amber-900"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          selected.size === reviewing.length
                            ? 'bg-[#C9A96E] border-[#C9A96E]'
                            : selected.size > 0
                            ? 'border-[#C9A96E] bg-amber-50'
                            : 'border-gray-400 bg-white'
                        }`}
                      >
                        {selected.size === reviewing.length && <Check className="w-3 h-3 text-white" />}
                        {selected.size > 0 && selected.size < reviewing.length && (
                          <div className="w-2 h-[2px] bg-[#C9A96E] rounded" />
                        )}
                      </div>
                      <span className="font-medium text-gray-800">
                        {selected.size === reviewing.length ? 'Deselect all' : 'Select all'}
                      </span>
                    </button>
                    <span className="text-xs text-gray-600 whitespace-nowrap">
                      {selected.size} of {reviewing.length} selected
                    </span>
                  </div>
                  {incompleteCount > 0 && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-900">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {incompleteCount} missing name, phone, or email — fill in below or leave blank
                      </span>
                      <button
                        onClick={() => setOnlyIncomplete(v => !v)}
                        className="flex items-center gap-1 underline hover:text-amber-700 whitespace-nowrap"
                      >
                        {onlyIncomplete ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {onlyIncomplete ? 'Show all' : 'Show only incomplete'}
                      </button>
                    </div>
                  )}
                </>
              );
            })()}

            <div className="overflow-y-auto flex-1 -mx-6 px-6">
              <div className="divide-y">
                {reviewing.map((c, i) => {
                  if (onlyIncomplete && !isIncomplete(c)) return null;
                  const checked = selected.has(i);
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 py-2 px-1 ${checked ? '' : 'opacity-50'}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleOne(i)}
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-[#C9A96E] border-[#C9A96E]' : 'border-gray-300'}`}
                        title={checked ? 'Click to skip' : 'Click to include'}
                      >
                        {checked && <Check className="w-3 h-3 text-white" />}
                      </button>
                      <div className="flex-1 min-w-0 space-y-1">
                        {c.fullName?.trim() ? (
                          <FieldChip
                            value={c.fullName}
                            label="name"
                            className="text-sm font-medium text-gray-900"
                            onChange={v => patchCard(i, { fullName: v })}
                          />
                        ) : (
                          <FieldChip
                            value=""
                            label="name"
                            className="text-sm font-medium"
                            onChange={v => patchCard(i, { fullName: v })}
                          />
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <FieldChip value={c.email} label="email" type="email" onChange={v => patchCard(i, { email: v })} />
                          <FieldChip value={c.phone} label="phone" type="tel" onChange={v => patchCard(i, { phone: v })} />
                          <FieldChip value={c.company} label="company" onChange={v => patchCard(i, { company: v })} />
                        </div>
                        <FieldChip value={c.jobAddress} label="address" onChange={v => patchCard(i, { jobAddress: v })} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="border-t pt-3 gap-2">
              <Button variant="outline" onClick={() => { setReviewing(null); setSelected(new Set()); }} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => doBulkImport('contact')}
                disabled={busy || selected.size === 0}
                className="gap-1.5"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Add {selected.size} as Contacts
              </Button>
              <Button
                onClick={() => doBulkImport('lead')}
                disabled={busy || selected.size === 0}
                style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                className="gap-1.5 font-semibold"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add {selected.size} as Leads
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
