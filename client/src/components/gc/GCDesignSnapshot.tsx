import { useState } from 'react';
import { collection, getDocs, orderBy, query as fsQuery, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  ChevronDown, ChevronRight, Image as ImageIcon, FileText,
  ExternalLink, Palette, RefreshCw, User, Clock, Camera,
} from 'lucide-react';
import type { Selection, FloorLevel, ClientApprovalStatus, OrderStatus } from '@/types/selections';
import { FLOOR_LEVELS, SELECTION_CATEGORIES } from '@/types/selections';

const APPROVAL_COLORS: Record<ClientApprovalStatus, string> = {
  'Pending Options':    'bg-gray-100 text-gray-500',
  'Checking w/ Client': 'bg-blue-100 text-blue-700',
  'Checking w/ Builder':'bg-purple-100 text-purple-700',
  'Approved':           'bg-green-100 text-green-700',
};

const ORDER_COLORS: Record<OrderStatus, string> = {
  'Not Ordered': 'bg-gray-100 text-gray-400',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Ordered':     'bg-blue-100 text-blue-700',
  'Delivered':   'bg-teal-100 text-teal-700',
  'Installed':   'bg-green-100 text-green-700',
};

interface GCDesignSnapshotProps {
  projectId: string;
  projectName?: string;
}

export default function GCDesignSnapshot({ projectId, projectName }: GCDesignSnapshotProps) {
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set(['Main Floor']));
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [expandedSels, setExpandedSels] = useState<Set<string>>(new Set());
  const [floorFilter, setFloorFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [snapshotTime] = useState(() => new Date());

  // Load selections from Firestore
  const { data: selections = [], isLoading, refetch, dataUpdatedAt } = useQuery<Selection[]>({
    queryKey: ['gc-design-snapshot', projectId],
    queryFn: async () => {
      const snap = await getDocs(fsQuery(
        collection(db, 'projects', projectId, 'selections'),
        orderBy('createdAt', 'asc'),
      ));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Selection));
    },
    enabled: !!projectId,
    staleTime: 0,
  });

  // Load project to get designer info
  const { data: project } = useQuery({
    queryKey: ['project-meta', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!projectId,
  });

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const n = new Set(set);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  };

  // Filtered & grouped selections
  const filtered = selections.filter(s =>
    (floorFilter === 'All' || s.floor === floorFilter) &&
    (categoryFilter === 'All' || s.category === categoryFilter)
  );

  const grouped = FLOOR_LEVELS.reduce((acc, floor) => {
    const floorSels = filtered.filter(s => s.floor === floor);
    if (!floorSels.length) return acc;
    const rooms: Record<string, Selection[]> = {};
    floorSels.forEach(s => { if (!rooms[s.room]) rooms[s.room] = []; rooms[s.room].push(s); });
    acc[floor] = rooms;
    return acc;
  }, {} as Record<string, Record<string, Selection[]>>);

  const approvedCount = selections.filter(s => s.clientApprovalStatus === 'Approved').length;
  const pendingCount = selections.filter(s => s.clientApprovalStatus !== 'Approved').length;
  const activeFloors = FLOOR_LEVELS.filter(f => selections.some(s => s.floor === f));
  const activeCategories = Array.from(new Set(selections.map(s => s.category)));

  if (isLoading) {
    return (
      <div className="p-8 text-center text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-3" />
        Loading design snapshot…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <Palette className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Design Snapshot</h2>
            <p className="text-sm text-gray-500">
              Read-only view of designer selections for {projectName || 'this project'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right text-xs text-gray-400">
            <div className="flex items-center gap-1 justify-end">
              <Clock className="h-3 w-3" />
              Snapshot as of {snapshotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {dataUpdatedAt > 0 && (
              <div>Last fetched {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 text-xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Designer + stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500 mb-1">Designer</p>
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-gray-400" />
              <p className="text-sm font-semibold text-gray-800 truncate">
                {project?.assignedDesignerName || project?.designerName || 'Unassigned'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500 mb-1">Total Selections</p>
            <p className="text-xl font-bold text-gray-900">{selections.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500 mb-1">Approved</p>
            <p className="text-xl font-bold text-green-600">{approvedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500 mb-1">Pending / In Review</p>
            <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      {selections.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Select value={floorFilter} onValueChange={setFloorFilter}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="All Floors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Floors</SelectItem>
              {activeFloors.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-52 h-8 text-xs">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Categories</SelectItem>
              {activeCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Empty state */}
      {selections.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Palette className="h-12 w-12 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-1">No selections yet</h3>
            <p className="text-sm text-gray-400">
              The designer hasn't added any finish selections to this project.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Floor → Room → Selections tree */}
      {Object.entries(grouped).map(([floor, rooms]) => (
        <div key={floor} className="border rounded-xl overflow-hidden">
          {/* Floor header */}
          <button
            onClick={() => setExpandedFloors(prev => toggle(prev, floor))}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              {expandedFloors.has(floor) ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              <span className="font-semibold text-gray-800">{floor}</span>
              <Badge variant="outline" className="text-xs ml-1">
                {Object.values(rooms).flat().length} selections
              </Badge>
            </div>
          </button>

          {expandedFloors.has(floor) && (
            <div className="divide-y">
              {Object.entries(rooms).map(([room, roomSels]) => (
                <div key={room}>
                  {/* Room row */}
                  <button
                    onClick={() => setExpandedRooms(prev => toggle(prev, `${floor}-${room}`))}
                    className="w-full flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-gray-50 text-left"
                  >
                    {expandedRooms.has(`${floor}-${room}`) ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                    <span className="text-sm font-medium text-gray-700">{room}</span>
                    <span className="text-xs text-gray-400">({roomSels.length})</span>
                  </button>

                  {expandedRooms.has(`${floor}-${room}`) && (
                    <div className="px-6 pb-3 space-y-2">
                      {roomSels.map(sel => (
                        <SelectionRow
                          key={sel.id}
                          sel={sel}
                          expanded={expandedSels.has(sel.id)}
                          onToggle={() => setExpandedSels(prev => toggle(prev, sel.id))}
                          onImageClick={setLightbox}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black border-0">
          {lightbox && <img src={lightbox} alt="Product" className="w-full rounded-lg max-h-[80vh] object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Selection Row ─────────────────────────────────────────────────────────────

interface SelectionRowProps {
  sel: Selection;
  expanded: boolean;
  onToggle: () => void;
  onImageClick: (url: string) => void;
}

function SelectionRow({ sel, expanded, onToggle, onImageClick }: SelectionRowProps) {
  const approvedItem = sel.items?.find(i => i.status === 'approved') ?? sel.items?.[0];

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      {/* Row header */}
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
        <div className="flex items-center gap-3 min-w-0">
          {/* Thumbnail */}
          {approvedItem?.imageUrls?.[0] ? (
            <img
              src={approvedItem.imageUrls[0]}
              alt=""
              className="w-10 h-10 rounded-lg object-cover border shrink-0"
              onClick={e => { e.stopPropagation(); onImageClick(approvedItem.imageUrls[0]); }}
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <ImageIcon className="h-4 w-4 text-gray-300" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800">{sel.category}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{sel.area}</span>
            </div>
            {approvedItem && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{approvedItem.productName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <Badge className={`text-xs px-2 py-0.5 ${APPROVAL_COLORS[sel.clientApprovalStatus]}`}>
            {sel.clientApprovalStatus}
          </Badge>
          <Badge className={`text-xs px-2 py-0.5 ${ORDER_COLORS[sel.orderStatus]}`}>
            {sel.orderStatus}
          </Badge>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 bg-gray-50 space-y-4">
          {/* Allowance */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Allowance: <strong className="text-gray-700">${sel.allowanceAmount?.toLocaleString()} {sel.allowanceUnit}</strong></span>
            {sel.sqftOrQuantity && <span>Qty/SqFt: <strong className="text-gray-700">{sel.sqftOrQuantity}</strong></span>}
          </div>

          {/* Items */}
          {sel.items?.length > 0 && (
            <div className="space-y-3">
              {sel.items.map(item => (
                <div key={item.id} className={`rounded-lg border p-3 ${item.status === 'approved' ? 'border-green-200 bg-green-50' : item.status === 'removed' ? 'opacity-40 bg-gray-100' : 'bg-white'}`}>
                  <div className="flex items-start gap-3">
                    {/* Images */}
                    {item.imageUrls?.length > 0 && (
                      <div className="flex gap-1.5 shrink-0">
                        {item.imageUrls.slice(0, 3).map((url, i) => (
                          <img
                            key={i}
                            src={url}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover cursor-pointer border hover:opacity-80"
                            onClick={() => onImageClick(url)}
                          />
                        ))}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{item.productName}</span>
                        <Badge className={`text-xs px-1.5 py-0 ${item.status === 'approved' ? 'bg-green-100 text-green-700' : item.status === 'proposed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500">{item.vendor}{item.size ? ` · ${item.size}` : ''}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                        {item.tileLayout && <span>Layout: <strong>{item.tileLayout}</strong></span>}
                        {item.grout && <span>Grout: <strong>{item.grout}</strong></span>}
                        {item.trim && <span>Trim: <strong>{item.trim}</strong></span>}
                        {item.heightNote && <span>Height: <strong>{item.heightNote}</strong></span>}
                        {item.sqftOrQty && <span>Qty: <strong>{item.sqftOrQty} {item.unit}</strong></span>}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs font-medium text-gray-700">
                          ${item.costPerUnit?.toLocaleString()} / {item.unit}
                          {item.totalCost ? ` · Total: $${item.totalCost.toLocaleString()}` : ''}
                        </span>
                        {item.productUrl && (
                          <a href={item.productUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
                            <ExternalLink className="h-3 w-3" /> Product link
                          </a>
                        )}
                      </div>
                      {item.specialNotes && <p className="text-xs text-gray-400 italic mt-1">{item.specialNotes}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Designer files */}
          {sel.designerFiles?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Designer Files</p>
              <div className="flex flex-wrap gap-2">
                {sel.designerFiles.map(f => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline border border-blue-100 rounded-lg px-2.5 py-1.5 bg-blue-50">
                    {f.type === 'pdf' ? <FileText className="h-3 w-3" /> : <Camera className="h-3 w-3" />}
                    {f.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          {sel.notes && (
            <p className="text-xs text-gray-500 italic border-t pt-2">Notes: {sel.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
