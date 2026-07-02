import React, { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Master Cost Code catalog — company-wide spine for bid packages,
 * budgets, and the client-portal cost rollup. Root collection `costCodes`
 * (distinct from per-estimate costGroups/costCodes subcollections).
 * QuickBooks sync: intentionally NOT wired yet — see functions/src/qbo/
 * when we turn that on.
 */
export interface MasterCostCode {
  code: string; // NN-NNN, doc id
  item: string;
  division: string; // e.g. "13 Interior Finishes"
  divisionNum: string; // "13"
  bidPackage: string; // sub trade for bid leveling
  clientCategory: string;
  allowance: boolean;
  tierVariable: boolean; // varies Signature/Estate/Summit
  notes: string;
  active: boolean;
}

const CLIENT_CATEGORIES = [
  'Plans Permits & Management',
  'Site & Foundation',
  'Structure & Roof',
  'Exterior Finishes',
  'Windows & Doors',
  'Mechanical & Systems',
  'Interior Finishes',
  'Amenities & Equipment',
  'Outdoor Living & Landscape',
  'Completion',
  'Fees & Contingency',
];

const EMPTY: MasterCostCode = {
  code: '',
  item: '',
  division: '',
  divisionNum: '',
  bidPackage: '',
  clientCategory: '',
  allowance: false,
  tierVariable: false,
  notes: '',
  active: true,
};

export default function CostCodes() {
  const [codes, setCodes] = useState<MasterCostCode[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<MasterCostCode | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'costCodes'), orderBy('code'));
    return onSnapshot(q, (snap) =>
      setCodes(snap.docs.map((d) => d.data() as MasterCostCode))
    );
  }, []);

  const grouped = useMemo(() => {
    const s = search.toLowerCase();
    const visible = codes.filter(
      (c) =>
        (showInactive || c.active !== false) &&
        (!s ||
          `${c.code} ${c.item} ${c.bidPackage} ${c.clientCategory}`
            .toLowerCase()
            .includes(s))
    );
    const out: Record<string, MasterCostCode[]> = {};
    for (const c of visible) (out[c.division] ||= []).push(c);
    return out;
  }, [codes, search, showInactive]);

  const save = async () => {
    if (!editing) return;
    if (!/^\d{2}-\d{3}$/.test(editing.code)) {
      alert('Code must be NN-NNN format (e.g. 13-055)');
      return;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'costCodes', editing.code),
        {
          ...editing,
          divisionNum: editing.code.split('-')[0],
          updatedAt: serverTimestamp(),
          ...(isNew ? { createdAt: serverTimestamp() } : {}),
        },
        { merge: true }
      );
      setEditing(null);
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (c: MasterCostCode) =>
    updateDoc(doc(db, 'costCodes', c.code), {
      active: c.active === false,
      updatedAt: serverTimestamp(),
    });

  return (
    <AppLayout>
      <div className="p-4 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h1 className="text-xl font-bold flex-1">Cost Codes</h1>
          <Input
            className="w-48"
            placeholder="Search codes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="text-sm flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Archived
          </label>
          <Button
            onClick={() => {
              setEditing({ ...EMPTY });
              setIsNew(true);
            }}
          >
            + Add Code
          </Button>
        </div>

        {Object.entries(grouped).map(([division, items]) => (
          <div key={division} className="mb-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {division}
            </h2>
            <Card>
              <CardContent className="p-0 divide-y">
                {items.map((c) => (
                  <div
                    key={c.code}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${c.active === false ? 'opacity-50' : ''}`}
                  >
                    <span className="font-mono font-medium w-16 shrink-0">
                      {c.code}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{c.item}</span>
                    <span className="hidden sm:block text-muted-foreground w-32 truncate">
                      {c.bidPackage}
                    </span>
                    {c.allowance && <Badge variant="secondary">ALW</Badge>}
                    {c.tierVariable && <Badge variant="outline">TIER</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing({ ...c });
                        setIsNew(false);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => toggleActive(c)}
                    >
                      {c.active === false ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}

        <Dialog
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) {
              setEditing(null);
              setIsNew(false);
            }
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {isNew ? 'New Cost Code' : `Edit ${editing?.code}`}
              </DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div>
                  <Label>Code (NN-NNN)</Label>
                  <Input
                    className="font-mono"
                    disabled={!isNew}
                    value={editing.code}
                    onChange={(e) =>
                      setEditing({ ...editing, code: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Item Name</Label>
                  <Input
                    value={editing.item}
                    onChange={(e) =>
                      setEditing({ ...editing, item: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Division</Label>
                  <Input
                    placeholder="e.g. 13 Interior Finishes"
                    value={editing.division}
                    onChange={(e) =>
                      setEditing({ ...editing, division: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Bid Package (sub trade)</Label>
                  <Input
                    value={editing.bidPackage}
                    onChange={(e) =>
                      setEditing({ ...editing, bidPackage: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Client Category</Label>
                  <Select
                    value={editing.clientCategory}
                    onValueChange={(v) =>
                      setEditing({ ...editing, clientCategory: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-6 text-sm pt-1">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editing.allowance}
                      onChange={(e) =>
                        setEditing({ ...editing, allowance: e.target.checked })
                      }
                    />
                    Allowance
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={editing.tierVariable}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          tierVariable: e.target.checked,
                        })
                      }
                    />
                    Tier Variable
                  </label>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={editing.notes}
                    onChange={(e) =>
                      setEditing({ ...editing, notes: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setIsNew(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
