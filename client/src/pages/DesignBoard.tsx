import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Sofa, Lightbulb, Paintbrush, DoorClosed,
  Layers, Package, Layout, Grid2x2,
} from 'lucide-react';

type SelectionStatus = 'pending' | 'designer_selected' | 'client_approved' | 'ordered';
type TabFilter = 'all' | 'pending' | 'approved' | 'ordered';

interface Selection {
  id: string;
  name?: string;
  category?: string;
  status?: SelectionStatus;
  imageUrl?: string;
  vendor?: string;
  productName?: string;
  unitCost?: number;
  clientApprovalStatus?: string;
  locked?: boolean;
}

interface ProjectDoc {
  id: string;
  name: string;
}

const STATUS_BADGE: Record<SelectionStatus, { label: string; className: string }> = {
  pending: { label: 'Awaiting Client', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  designer_selected: { label: 'Selected', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  client_approved: { label: 'Approved', className: 'bg-green-100 text-green-700 border-green-200' },
  ordered: { label: 'Ordered', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
};

const CATEGORY_COLORS: Record<string, string> = {
  furniture: '#C9A96E',
  lighting: '#f59e0b',
  flooring: '#8b5cf6',
  paint: '#ec4899',
  doors: '#6366f1',
  windows: '#14b8a6',
  plumbing: '#3b82f6',
  tile: '#22c55e',
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  furniture: Sofa,
  lighting: Lightbulb,
  paint: Paintbrush,
  doors: DoorClosed,
  flooring: Grid2x2,
  tile: Layers,
  plumbing: Package,
};

function CategoryIcon({ category }: { category?: string }) {
  const key = (category || '').toLowerCase();
  const Icon = CATEGORY_ICONS[key] || Layout;
  const color = CATEGORY_COLORS[key] || '#9ca3af';
  return (
    <div className="w-full h-full flex flex-col items-center justify-center" style={{ backgroundColor: color + '22' }}>
      <Icon className="w-8 h-8" style={{ color }} />
      {category && <span className="text-xs mt-1 capitalize font-medium" style={{ color }}>{category}</span>}
    </div>
  );
}

function SelectionCard({ sel }: { sel: Selection }) {
  const status = sel.status || 'pending';
  const badge = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow" style={{ breakInside: 'avoid' }}>
      {/* Image / Placeholder */}
      <div className="relative" style={{ height: 160 }}>
        {sel.imageUrl ? (
          <img src={sel.imageUrl} alt={sel.productName || sel.name} className="w-full h-full object-cover" />
        ) : (
          <CategoryIcon category={sel.category} />
        )}
        {/* Category pill */}
        {sel.category && (
          <span
            className="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full font-medium capitalize"
            style={{ backgroundColor: CATEGORY_COLORS[(sel.category || '').toLowerCase()] || '#9ca3af', color: '#fff' }}
          >
            {sel.category}
          </span>
        )}
      </div>
      {/* Details */}
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{sel.productName || sel.name || '—'}</p>
        {sel.vendor && <p className="text-xs text-gray-500">{sel.vendor}</p>}
        {sel.unitCost != null && (
          <p className="text-xs text-gray-500">${sel.unitCost.toLocaleString()}</p>
        )}
        <Badge className={`text-xs border mt-1 ${badge.className}`}>{badge.label}</Badge>
      </div>
    </div>
  );
}

export default function DesignBoard() {
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selections, setSelections] = useState<Selection[]>([]);
  const [tab, setTab] = useState<TabFilter>('all');

  useEffect(() => {
    getDocs(collection(db, 'projects')).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, name: (d.data() as { name?: string }).name || 'Unnamed' }));
      setProjects(list);
      if (list.length > 0) setSelectedProject(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) { setSelections([]); return; }
    const unsub = onSnapshot(
      collection(db, 'projects', selectedProject, 'selections'),
      snap => setSelections(snap.docs.map(d => ({ id: d.id, ...d.data() } as Selection)))
    );
    return () => unsub();
  }, [selectedProject]);

  const filtered = selections.filter(s => {
    if (tab === 'all') return true;
    if (tab === 'pending') return s.status === 'pending' || s.status === 'designer_selected';
    if (tab === 'approved') return s.status === 'client_approved';
    if (tab === 'ordered') return s.status === 'ordered';
    return true;
  });

  const stats = {
    total: selections.length,
    awaiting: selections.filter(s => s.status === 'pending').length,
    approved: selections.filter(s => s.status === 'client_approved').length,
    ordered: selections.filter(s => s.status === 'ordered').length,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Design Board</h1>
            <p className="text-sm text-gray-500 mt-0.5">Material and finish selections by project</p>
          </div>
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, color: '#6b7280' },
            { label: 'Awaiting Client', value: stats.awaiting, color: '#f59e0b' },
            { label: 'Approved', value: stats.approved, color: '#22c55e' },
            { label: 'Ordered', value: stats.ordered, color: '#6366f1' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={v => setTab(v as TabFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="ordered">Ordered</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Masonry Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {selectedProject ? 'No selections found for this project' : 'Select a project to view selections'}
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-0">
            {filtered.map(sel => (
              <div key={sel.id} className="mb-4">
                <SelectionCard sel={sel} />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
