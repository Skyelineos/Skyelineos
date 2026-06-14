// Editor for a structured Estimate template (templates doc, category
// 'estimate'). Edits a `lineItems` list that seeds a real estimate into new
// projects. Cost-plus: cost = qty × unitCost; sell handled downstream by markup.

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';

interface LineItem {
  description: string;
  trade?: string;
  qty?: number;
  unit?: string;
  unitCost?: number;   // sub cost basis per unit
}

export function EstimateTemplateEditor({ templateId, onBack }: { templateId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'templates', templateId));
      const d = snap.data() as any;
      setName(d?.name || 'Estimate');
      setRows(Array.isArray(d?.lineItems) ? d.lineItems : []);
      setLoading(false);
    })();
  }, [templateId]);

  const update = (i: number, patch: Partial<LineItem>) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, { description: '', trade: '', qty: 1, unit: 'ea', unitCost: 0 }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const total = rows.reduce((s, r) => s + (r.qty || 0) * (r.unitCost || 0), 0);

  const save = async () => {
    setSaving(true);
    try {
      // Persist a `total` per line so downstream readers (schedule generator,
      // estimate seeding) have the client-facing weight.
      const lineItems = rows.map(r => ({ ...r, total: (r.qty || 0) * (r.unitCost || 0) }));
      await updateDoc(doc(db, 'templates', templateId), { name, lineItems, updatedAt: serverTimestamp() });
      toast({ title: 'Estimate template saved' });
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
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Cost total: <strong className="text-gray-800">${total.toLocaleString()}</strong></span>
          <Button onClick={save} disabled={saving} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <Input value={name} onChange={e => setName(e.target.value)} className="max-w-sm font-semibold" placeholder="Template name" />

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_70px_70px_90px_90px_36px] gap-2 px-3 py-2 bg-gray-50 text-xs font-medium text-gray-500">
          <span>Description</span><span>Trade</span><span>Qty</span><span>Unit</span><span>Unit cost</span><span>Line cost</span><span></span>
        </div>
        <div className="max-h-[60vh] overflow-auto divide-y divide-gray-100">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_140px_70px_70px_90px_90px_36px] gap-2 px-3 py-1.5 items-center">
              <Input className="h-8 text-xs" value={r.description} onChange={e => update(i, { description: e.target.value })} placeholder="Line description" />
              <Input className="h-8 text-xs" value={r.trade || ''} onChange={e => update(i, { trade: e.target.value })} placeholder="Trade" />
              <Input className="h-8 text-xs" type="number" value={r.qty ?? ''} onChange={e => update(i, { qty: parseFloat(e.target.value) || 0 })} />
              <Input className="h-8 text-xs" value={r.unit || ''} onChange={e => update(i, { unit: e.target.value })} />
              <Input className="h-8 text-xs" type="number" value={r.unitCost ?? ''} onChange={e => update(i, { unitCost: parseFloat(e.target.value) || 0 })} />
              <span className="text-xs text-gray-600">${((r.qty || 0) * (r.unitCost || 0)).toLocaleString()}</span>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => removeRow(i)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No line items yet — add rows below.</p>}
        </div>
      </div>

      <Button variant="outline" onClick={addRow} className="gap-2">
        <Plus className="w-4 h-4" /> Add line item
      </Button>
    </div>
  );
}
