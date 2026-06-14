// Editor for a Selections template (templates doc, category 'selections').
// Edits the `items` list — the client "selections needed" decisions that seed
// into a new project. Simple row table: floor / room / category / area / phase.

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FLOOR_LEVELS, SELECTION_CATEGORIES, type FloorLevel } from '@/types/selections';
import type { SelectionTemplateRow } from '@/lib/seedStandardSelectionsTemplate';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';

const PHASES = ['Pre-Construction', 'Foundation', 'Framing', 'Rough-In', 'Pre-Drywall', 'Finish', 'Closeout'];

export function SelectionsTemplateEditor({ templateId, onBack }: { templateId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<SelectionTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'templates', templateId));
      const d = snap.data() as any;
      setName(d?.name || 'Selections');
      setRows(Array.isArray(d?.items) ? d.items : []);
      setLoading(false);
    })();
  }, [templateId]);

  const update = (i: number, patch: Partial<SelectionTemplateRow>) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () =>
    setRows(rs => [...rs, { floor: 'Main Floor', room: '', category: SELECTION_CATEGORIES[0] || '', area: '', phase: 'Finish' }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'templates', templateId), { name, items: rows, updatedAt: serverTimestamp() });
      toast({ title: 'Selections template saved' });
      onBack();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="w-4 h-4" /> Templates
        </button>
        <Button onClick={save} disabled={saving} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <Input value={name} onChange={e => setName(e.target.value)} className="max-w-sm font-semibold" placeholder="Template name" />

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[140px_1fr_1fr_1fr_140px_36px] gap-2 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500">
          <span>Floor</span><span>Room</span><span>Category</span><span>Area / Item</span><span>Phase</span><span></span>
        </div>
        <div className="max-h-[60vh] overflow-auto divide-y divide-gray-100">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[140px_1fr_1fr_1fr_140px_36px] gap-2 px-3 py-1.5 items-center">
              <Select value={r.floor} onValueChange={(v) => update(i, { floor: v as FloorLevel })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{FLOOR_LEVELS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="h-8 text-xs" value={r.room} onChange={e => update(i, { room: e.target.value })} placeholder="Room" />
              <Input className="h-8 text-xs" value={r.category} onChange={e => update(i, { category: e.target.value })} placeholder="Category" />
              <Input className="h-8 text-xs" value={r.area} onChange={e => update(i, { area: e.target.value })} placeholder="Area / item" />
              <Select value={r.phase} onValueChange={(v) => update(i, { phase: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PHASES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => removeRow(i)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No selections yet — add rows below.</p>}
        </div>
      </div>

      <Button variant="outline" onClick={addRow} className="gap-2">
        <Plus className="w-4 h-4" /> Add selection
      </Button>
    </div>
  );
}
