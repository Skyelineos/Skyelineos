import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  collection, query, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, Timestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Plus, Search, MoreVertical, Edit3, Trash2, Package,
  TrendingUp, Tags,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────

type CatalogCategory =
  | 'flooring' | 'tile' | 'cabinets' | 'countertops' | 'fixtures'
  | 'hardware' | 'paint' | 'lumber' | 'roofing' | 'windows' | 'other';

interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  description: string;
  unit: string;
  unitCost: number;
  supplier: string;
  sku: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: Timestamp | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  flooring: 'Flooring',
  tile: 'Tile',
  cabinets: 'Cabinets',
  countertops: 'Countertops',
  fixtures: 'Fixtures',
  hardware: 'Hardware',
  paint: 'Paint',
  lumber: 'Lumber',
  roofing: 'Roofing',
  windows: 'Windows',
  other: 'Other',
};

const CATEGORY_COLORS: Record<CatalogCategory, { pill: string; accent: string }> = {
  flooring: { pill: 'bg-amber-100 text-amber-700 border-amber-200', accent: 'bg-amber-400' },
  tile: { pill: 'bg-blue-100 text-blue-700 border-blue-200', accent: 'bg-blue-400' },
  cabinets: { pill: 'bg-orange-100 text-orange-800 border-orange-200', accent: 'bg-orange-500' },
  countertops: { pill: 'bg-stone-100 text-stone-700 border-stone-200', accent: 'bg-stone-400' },
  fixtures: { pill: 'bg-cyan-100 text-cyan-700 border-cyan-200', accent: 'bg-cyan-400' },
  hardware: { pill: 'bg-zinc-100 text-zinc-700 border-zinc-200', accent: 'bg-zinc-400' },
  paint: { pill: 'bg-pink-100 text-pink-700 border-pink-200', accent: 'bg-pink-400' },
  lumber: { pill: 'bg-yellow-100 text-yellow-800 border-yellow-200', accent: 'bg-yellow-500' },
  roofing: { pill: 'bg-slate-100 text-slate-700 border-slate-200', accent: 'bg-slate-400' },
  windows: { pill: 'bg-sky-100 text-sky-700 border-sky-200', accent: 'bg-sky-400' },
  other: { pill: 'bg-gray-100 text-gray-600 border-gray-200', accent: 'bg-gray-300' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as CatalogCategory[];

const EMPTY_FORM = {
  name: '',
  category: 'flooring' as CatalogCategory,
  description: '',
  unit: 'sqft',
  unitCost: '',
  supplier: '',
  sku: '',
  imageUrl: '',
  isActive: true,
};

// ── Item Dialog ──────────────────────────────────────────────────────────────

interface ItemDialogProps {
  open: boolean;
  onClose: () => void;
  editItem?: CatalogItem | null;
}

function ItemDialog({ open, onClose, editItem }: ItemDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editItem) {
        setForm({
          name: editItem.name,
          category: editItem.category,
          description: editItem.description,
          unit: editItem.unit,
          unitCost: String(editItem.unitCost),
          supplier: editItem.supplier,
          sku: editItem.sku,
          imageUrl: editItem.imageUrl,
          isActive: editItem.isActive,
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, editItem]);

  function setField(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.name || !form.unit || !form.unitCost) {
      toast({ title: 'Fill required fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        description: form.description,
        unit: form.unit,
        unitCost: parseFloat(form.unitCost) || 0,
        supplier: form.supplier,
        sku: form.sku,
        imageUrl: form.imageUrl,
        isActive: form.isActive,
        createdAt: editItem?.createdAt ?? Timestamp.now(),
      };
      if (editItem) {
        await updateDoc(doc(db, 'catalogs', editItem.id), payload);
        toast({ title: 'Item updated' });
      } else {
        await addDoc(collection(db, 'catalogs'), payload);
        toast({ title: 'Item added' });
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error saving item', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? 'Edit Item' : 'Add Catalog Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Product name" />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={v => setField('category', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={e => setField('supplier', e.target.value)} placeholder="Supplier name" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit *</Label>
              <Input value={form.unit} onChange={e => setField('unit', e.target.value)} placeholder="sqft, each, lf…" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Cost *</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unitCost}
                  onChange={e => setField('unitCost', e.target.value)}
                  className="pl-6"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>SKU</Label>
              <Input value={form.sku} onChange={e => setField('sku', e.target.value)} placeholder="SKU / Part #" />
            </div>
            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input value={form.imageUrl} onChange={e => setField('imageUrl', e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Product description, specs, notes…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
          >
            {editItem ? 'Update' : 'Add Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Catalog Card ─────────────────────────────────────────────────────────────

interface CatalogCardProps {
  item: CatalogItem;
  onEdit: (item: CatalogItem) => void;
  onDelete: (item: CatalogItem) => void;
}

function CatalogCard({ item, onEdit, onDelete }: CatalogCardProps) {
  const colors = CATEGORY_COLORS[item.category];

  return (
    <Card className="border-gray-200 hover:shadow-md transition-shadow overflow-hidden group">
      <div className={`h-1 ${colors.accent}`} />
      {item.imageUrl && (
        <div className="overflow-hidden bg-gray-50" style={{ height: 120 }}>
          <img
            src={item.imageUrl}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{item.name}</p>
            {item.supplier && (
              <p className="text-xs text-gray-400 truncate">{item.supplier}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem onClick={() => onEdit(item)} className="gap-2 cursor-pointer">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(item)}
                className="gap-2 cursor-pointer text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {item.description && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{item.description}</p>
        )}

        <div className="flex items-center justify-between">
          <Badge className={`${colors.pill} text-xs`}>
            {CATEGORY_LABELS[item.category]}
          </Badge>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-800">
              ${item.unitCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-gray-400">per {item.unit}</p>
          </div>
        </div>

        {item.sku && (
          <p className="text-xs text-gray-400">SKU: {item.sku}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'cost_asc' | 'cost_desc';

export default function Catalogs() {
  const { toast } = useToast();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CatalogCategory | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  useEffect(() => {
    const q = query(collection(db, 'catalogs'), orderBy('name'));
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as CatalogItem)));
    }, console.error);
    return () => unsub();
  }, []);

  function openAdd() { setEditItem(null); setDialogOpen(true); }
  function openEdit(item: CatalogItem) { setEditItem(item); setDialogOpen(true); }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'catalogs', deleteTarget.id));
      toast({ title: 'Item deleted' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error deleting item', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  }

  const activeItems = items.filter(i => i.isActive);
  const categories = Array.from(new Set(items.map(i => i.category)));

  const filtered = items
    .filter(item => {
      if (!item.isActive) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase()) &&
          !item.supplier.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === 'cost_asc') return a.unitCost - b.unitCost;
      if (sortKey === 'cost_desc') return b.unitCost - a.unitCost;
      return a.name.localeCompare(b.name);
    });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Material Catalogs</h1>
            <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-semibold">
              <Package className="w-3 h-3 mr-1" />
              {activeItems.length} items
            </Badge>
          </div>
          <Button
            onClick={openAdd}
            className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Item
          </Button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="border-gray-200">
            <CardContent className="px-4 py-3 flex items-center gap-3">
              <Package className="w-5 h-5 text-[#C9A96E] shrink-0" />
              <div>
                <p className="text-xl font-bold text-gray-900">{activeItems.length}</p>
                <p className="text-xs text-gray-500">Total Items</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="px-4 py-3 flex items-center gap-3">
              <Tags className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="text-xl font-bold text-gray-900">{categories.length}</p>
                <p className="text-xs text-gray-500">Categories</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="px-4 py-3 flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <p className="text-xl font-bold text-gray-900">
                  {activeItems.length > 0
                    ? `$${(activeItems.reduce((s, i) => s + i.unitCost, 0) / activeItems.length).toFixed(0)}`
                    : '—'
                  }
                </p>
                <p className="text-xs text-gray-500">Avg Unit Cost</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              categoryFilter === 'all'
                ? 'bg-[#141414] text-white border-[#141414]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            All
          </button>
          {ALL_CATEGORIES.map(cat => {
            const count = activeItems.filter(i => i.category === cat).length;
            if (count === 0) return null;
            const colors = CATEGORY_COLORS[cat];
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(isActive ? 'all' : cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  isActive
                    ? `${colors.pill} opacity-100 ring-2 ring-offset-1 ring-current`
                    : `${colors.pill} opacity-70 hover:opacity-100`
                }`}
              >
                {CATEGORY_LABELS[cat]} <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search & Sort */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or supplier…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="cost_asc">Sort: Cost ↑</SelectItem>
              <SelectItem value="cost_desc">Sort: Cost ↓</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="py-14 text-center">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {items.length === 0 ? 'No catalog items yet. Add your first material.' : 'No items match your filters.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map(item => (
              <CatalogCard
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      <ItemDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditItem(null); }}
        editItem={editItem}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be permanently removed from the catalog.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
