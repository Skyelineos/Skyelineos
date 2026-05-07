import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, addDoc, updateDoc, doc, orderBy, query as fsQuery, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronDown, ChevronRight, CheckCircle2, Clock, AlertTriangle,
  ExternalLink, Image as ImageIcon, FileText, Package, Lock
} from 'lucide-react';
import type { Selection, FloorLevel, ClientApprovalStatus } from '@/types/selections';
import { FLOOR_LEVELS } from '@/types/selections';

const APPROVAL_COLORS: Record<ClientApprovalStatus, string> = {
  'Pending Options':       'bg-gray-100 text-gray-500',
  'Checking w/ Client':    'bg-blue-100 text-blue-700',
  'Checking w/ Builder':   'bg-purple-100 text-purple-700',
  'Approved':              'bg-green-100 text-green-700',
};

const ORDER_COLORS: Record<string, string> = {
  'Not Ordered': 'bg-gray-100 text-gray-400',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Ordered':     'bg-blue-100 text-blue-700',
  'Delivered':   'bg-teal-100 text-teal-700',
  'Installed':   'bg-green-100 text-green-700',
};

interface SelectionsBoardProps {
  projectId: string;
  clientId: string;
}

export default function SelectionsBoard({ projectId, clientId }: SelectionsBoardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set(['Main Floor']));
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [confirmApprove, setConfirmApprove] = useState<{ sel: Selection; overage: number } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [activeFloorFilter, setActiveFloorFilter] = useState<string>('All');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('All');

  const { data: selections = [], isLoading } = useQuery({
    queryKey: ['selections', projectId],
    queryFn: async () => {
      const snap = await getDocs(fsQuery(
        collection(db, 'projects', projectId, 'selections'),
        orderBy('createdAt', 'asc')
      ));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Selection[];
    },
    enabled: !!projectId,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ sel, overage }: { sel: Selection; overage: number }) => {
      const updatedItems = sel.items.map(item =>
        item.status === 'proposed' ? { ...item, status: 'approved' as const } : item
      );
      await updateDoc(doc(db, 'projects', projectId, 'selections', sel.id), {
        clientApprovalStatus: 'Approved',
        items: updatedItems,
        updatedAt: serverTimestamp(),
      });
      if (overage > 0) {
        await addDoc(collection(db, 'changeOrders'), {
          projectId,
          title: `Selection Overage — ${sel.room} ${sel.area}`,
          description: `Client approved ${sel.room} ${sel.area} (${sel.category}). Total exceeds allowance by $${overage.toLocaleString()}.`,
          amount: overage,
          status: 'pending',
          sourceSelectionId: sel.id,
          initiatedBy: clientId,
          clientId,
          createdAt: serverTimestamp(),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['selections', projectId] });
      queryClient.invalidateQueries({ queryKey: ['changeOrders', projectId] });
      toast({ title: 'Selection approved' });
      setConfirmApprove(null);
    },
    onError: (e: any) => toast({ title: 'Error approving', description: e.message, variant: 'destructive' }),
  });

  // Group by floor → room
  const grouped = FLOOR_LEVELS.reduce((acc, floor) => {
    const floorSels = selections.filter(s => s.floor === floor &&
      (activeFloorFilter === 'All' || s.floor === activeFloorFilter) &&
      (activeCategoryFilter === 'All' || s.category === activeCategoryFilter)
    );
    if (floorSels.length === 0) return acc;
    const rooms: Record<string, Selection[]> = {};
    floorSels.forEach(s => {
      if (!rooms[s.room]) rooms[s.room] = [];
      rooms[s.room].push(s);
    });
    acc[floor] = rooms;
    return acc;
  }, {} as Record<string, Record<string, Selection[]>>);

  const approvedCount = selections.filter(s => s.clientApprovalStatus === 'Approved').length;
  const pendingCount = selections.filter(s => ['Pending Options', 'Checking w/ Client', 'Checking w/ Builder'].includes(s.clientApprovalStatus)).length;
  const categories = ['All', ...Array.from(new Set(selections.map(s => s.category)))];
  const floors = ['All', ...FLOOR_LEVELS.filter(f => selections.some(s => s.floor === f))];

  const toggleFloor = (f: string) => setExpandedFloors(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
  const toggleRoom = (r: string) => setExpandedRooms(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n; });
  const toggleItem = (i: string) => setExpandedItems(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  if (isLoading) return <div className="p-6 text-center text-gray-400">Loading selections...</div>;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Finish Selections</h2>
          <p className="text-sm text-gray-500 mt-0.5">Review your designer's selections and approve to keep your project on schedule.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{approvedCount}<span className="text-sm font-normal text-gray-400">/{selections.length}</span></p>
          <p className="text-xs text-gray-400">approved</p>
        </div>
      </div>

      {/* Pending banner */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">{pendingCount} selection{pendingCount > 1 ? 's' : ''} awaiting your review</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {floors.map(f => (
          <button key={f} onClick={() => setActiveFloorFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${activeFloorFilter === f ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {f}
          </button>
        ))}
        <span className="text-gray-300 self-center">|</span>
        {categories.map(c => (
          <button key={c} onClick={() => setActiveCategoryFilter(c)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${activeCategoryFilter === c ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {Object.keys(grouped).length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No selections posted yet</p>
          <p className="text-sm mt-1">Your designer will post finish options here for your review.</p>
        </div>
      )}

      {/* Floor → Room → Selection hierarchy */}
      {Object.entries(grouped).map(([floor, rooms]) => (
        <div key={floor} className="rounded-xl border border-gray-200 overflow-hidden">
          {/* Floor header */}
          <button onClick={() => toggleFloor(floor)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex items-center gap-2">
              {expandedFloors.has(floor) ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
              <span className="font-semibold text-gray-800">{floor}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-gray-400">{Object.values(rooms).flat().filter(s => s.clientApprovalStatus === 'Approved').length} / {Object.values(rooms).flat().length} approved</span>
            </div>
          </button>

          {expandedFloors.has(floor) && (
            <div className="divide-y divide-gray-100">
              {Object.entries(rooms).map(([room, roomSels]) => {
                const roomKey = `${floor}-${room}`;
                const roomApproved = roomSels.filter(s => s.clientApprovalStatus === 'Approved').length;
                return (
                  <div key={room}>
                    {/* Room header */}
                    <button onClick={() => toggleRoom(roomKey)}
                      className="w-full flex items-center justify-between px-5 py-2.5 bg-white hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2">
                        {expandedRooms.has(roomKey) ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                        <span className="text-sm font-semibold text-gray-700">{room}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={(roomApproved / roomSels.length) * 100} className="w-20 h-1.5" />
                        <span className="text-xs text-gray-400">{roomApproved}/{roomSels.length}</span>
                      </div>
                    </button>

                    {expandedRooms.has(roomKey) && (
                      <div className="bg-white pl-6 pr-4 pb-3 space-y-2">
                        {roomSels.map(sel => {
                          const proposedItems = sel.items.filter(i => i.status === 'proposed');
                          const isExpanded = expandedItems.has(sel.id);
                          const canApprove = sel.clientApprovalStatus === 'Checking w/ Client' && !sel.locked;
                          const itemsForCost = proposedItems.length > 0 ? proposedItems : sel.items.filter(i => i.status !== 'removed');
                          const approvedItemsCost = itemsForCost.reduce((s, i) => s + (i.totalCost || 0), 0);
                          const overage = approvedItemsCost - (sel.allowanceAmount || 0);

                          return (
                            <div key={sel.id} className={`rounded-xl border ${canApprove ? 'border-amber-200' : 'border-gray-200'}`}>
                              {/* Selection row */}
                              <button onClick={() => toggleItem(sel.id)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors text-left">
                                <div className="flex items-center gap-3 min-w-0">
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-gray-800">{sel.area}</span>
                                    <span className="text-xs text-gray-400 ml-2">{sel.category}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {sel.allowanceAmount > 0 && (
                                    <span className="text-xs text-gray-400">${sel.allowanceAmount.toLocaleString()} allowance</span>
                                  )}
                                  {sel.locked && (
                                    <Badge className="text-xs bg-slate-100 text-slate-600 flex items-center gap-1">
                                      <Lock className="h-2.5 w-2.5" /> Finalized
                                    </Badge>
                                  )}
                                  {!sel.locked && (
                                    <Badge className={`text-xs ${APPROVAL_COLORS[sel.clientApprovalStatus]}`}>
                                      {sel.clientApprovalStatus}
                                    </Badge>
                                  )}
                                  <Badge className={`text-xs ${ORDER_COLORS[sel.orderStatus]}`}>
                                    {sel.orderStatus}
                                  </Badge>
                                </div>
                              </button>

                              {/* Expanded items */}
                              {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                                  {sel.notes && (
                                    <p className="text-xs text-gray-500 italic border-l-2 border-amber-300 pl-2 mt-2">{sel.notes}</p>
                                  )}

                                  {/* Designer files (PDFs/renderings) */}
                                  {sel.designerFiles?.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {sel.designerFiles.map(f => (
                                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer"
                                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline bg-blue-50 rounded-lg px-2 py-1.5">
                                          <FileText className="h-3 w-3" />
                                          {f.name}
                                        </a>
                                      ))}
                                    </div>
                                  )}

                                  {sel.items.filter(i => i.status !== 'removed').map((item, idx) => (
                                    <div key={item.id} className={`rounded-lg border p-3 ${item.status === 'approved' ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                                      <div className="flex gap-3">
                                        {/* Product image */}
                                        {item.imageUrls?.[0] ? (
                                          <img src={item.imageUrls[0]} alt={item.productName}
                                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0 cursor-pointer"
                                            onClick={() => setLightboxUrl(item.imageUrls[0])} />
                                        ) : (
                                          <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                            <Package className="h-5 w-5 text-gray-300" />
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start justify-between gap-2">
                                            <div>
                                              <p className="text-sm font-semibold text-gray-900 leading-snug">{item.productName}</p>
                                              {item.size && <p className="text-xs text-gray-400">{item.size}</p>}
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                              {item.costPerUnit > 0 && (
                                                <p className="text-sm font-bold text-gray-800">${item.costPerUnit}/{item.unit}</p>
                                              )}
                                              {item.totalCost > 0 && (
                                                <p className="text-xs text-gray-500">${item.totalCost.toLocaleString()} total</p>
                                              )}
                                            </div>
                                          </div>

                                          {/* Install details */}
                                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                                            {item.tileLayout && <span>Layout: <span className="text-gray-700">{item.tileLayout}</span></span>}
                                            {item.grout && <span>Grout: <span className="text-gray-700">{item.grout}</span></span>}
                                            {item.trim && <span>Trim: <span className="text-gray-700">{item.trim}</span></span>}
                                            {item.heightNote && <span>Height: <span className="text-gray-700">{item.heightNote}</span></span>}
                                            {item.sqftOrQty && <span>Qty: <span className="text-gray-700">{item.sqftOrQty} {item.unit}</span></span>}
                                          </div>

                                          {item.specialNotes && (
                                            <p className="text-xs text-orange-600 mt-1 font-medium">{item.specialNotes}</p>
                                          )}

                                          <div className="flex items-center gap-2 mt-2">
                                            {item.productUrl && (
                                              <a href={item.productUrl} target="_blank" rel="noreferrer"
                                                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                                <ExternalLink className="h-3 w-3" /> View Product
                                              </a>
                                            )}
                                            {item.status === 'approved' && (
                                              <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                                                <CheckCircle2 className="h-3 w-3" /> Approved
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}

                                  {sel.items.length === 0 && (
                                    <p className="text-xs text-gray-400 text-center py-3">Your designer hasn't posted options yet.</p>
                                  )}

                                  {/* Approve button */}
                                  {canApprove && sel.items.filter(i => i.status !== 'removed').length > 0 && (
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                      {overage > 0 && (
                                        <p className="text-xs text-orange-600">+${overage.toLocaleString()} over allowance — change order will be created</p>
                                      )}
                                      <Button size="sm" className="ml-auto" onClick={() => setConfirmApprove({ sel, overage: Math.max(0, overage) })}
                                        style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                        Approve {sel.area}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Approve Confirm Dialog */}
      <Dialog open={!!confirmApprove} onOpenChange={() => setConfirmApprove(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmApprove?.overage > 0 ? 'Approve with Overage' : 'Confirm Approval'}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 py-2 space-y-2">
            {confirmApprove?.overage > 0 ? (
              <p>These selections exceed your allowance by <strong className="text-orange-600">${confirmApprove.overage.toLocaleString()}</strong>. A change order will be created for your review.</p>
            ) : (
              <p>You're approving the selections for <strong>{confirmApprove?.sel.room} — {confirmApprove?.sel.area}</strong>. This will notify your designer to proceed.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApprove(null)}>Cancel</Button>
            <Button onClick={() => confirmApprove && approveMutation.mutate(confirmApprove)}
              disabled={approveMutation.isPending}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
              {approveMutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxUrl && <img src={lightboxUrl} alt="Product" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
