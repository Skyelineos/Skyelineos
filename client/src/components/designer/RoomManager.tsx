import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Room,
  Selection,
  ROOM_TYPES,
  ROOM_SELECTION_TEMPLATES,
  FloorLevel,
  FLOOR_LEVELS,
} from '@/types/selections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Home, ArrowRight } from 'lucide-react';

interface Props {
  projectId: string;
  userRole: string;
  onRoomSelect: (roomId: string, roomName: string) => void;
}

interface RoomForm {
  name: string;
  floor: FloorLevel;
  roomType: string;
  sqft: string;
  notes: string;
}

const FLOOR_ORDER: FloorLevel[] = ['Main Floor', 'Upstairs', 'Basement', 'Exterior'];

function CompletionRing({ pct }: { pct: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? '#22c55e' : pct > 50 ? '#C9A96E' : '#e5e7eb';
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#f3f4f6" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#374151">
        {pct}%
      </text>
    </svg>
  );
}

export function RoomManager({ projectId, userRole, onRoomSelect }: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RoomForm>({
    name: '',
    floor: 'Main Floor',
    roomType: '',
    sqft: '',
    notes: '',
  });
  const { toast } = useToast();

  const canManage = ['admin', 'gc', 'designer'].includes(userRole);

  useEffect(() => {
    const unsubRooms = onSnapshot(
      query(collection(db, 'projects', projectId, 'rooms'), orderBy('order', 'asc')),
      snap => {
        setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() } as Room)));
        setLoading(false);
      }
    );
    const unsubSels = onSnapshot(
      collection(db, 'projects', projectId, 'selections'),
      snap => {
        setSelections(snap.docs.map(d => ({ id: d.id, ...d.data() } as Selection)));
      }
    );
    return () => {
      unsubRooms();
      unsubSels();
    };
  }, [projectId]);

  const roomTypeLabel = (key: string) =>
    ROOM_TYPES.find(rt => rt.key === key)?.label || key;

  function roomCompletion(roomId: string): number {
    const roomSels = selections.filter(s => s.roomId === roomId);
    if (roomSels.length === 0) return 0;
    const approved = roomSels.filter(s => s.clientApprovalStatus === 'Approved').length;
    return Math.round((approved / roomSels.length) * 100);
  }

  function roomSelectionCount(roomId: string): { approved: number; total: number } {
    const roomSels = selections.filter(s => s.roomId === roomId);
    const approved = roomSels.filter(s => s.clientApprovalStatus === 'Approved').length;
    return { approved, total: roomSels.length };
  }

  function handleRoomTypeChange(key: string) {
    const rt = ROOM_TYPES.find(r => r.key === key);
    const floor = rt?.floor as FloorLevel | undefined;
    const autoName = rt?.label || '';
    setForm(f => ({
      ...f,
      roomType: key,
      floor: floor || f.floor,
      name: f.name || autoName,
    }));
  }

  async function handleSave() {
    if (!form.roomType) {
      toast({ title: 'Select a room type', variant: 'destructive' });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: 'Enter a room name', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);

      const roomRef = doc(collection(db, 'projects', projectId, 'rooms'));
      const newOrder = rooms.length;

      batch.set(roomRef, {
        projectId,
        name: form.name.trim(),
        floor: form.floor,
        roomType: form.roomType,
        sqft: form.sqft ? parseFloat(form.sqft) : null,
        notes: form.notes.trim() || null,
        order: newOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const templates = ROOM_SELECTION_TEMPLATES[form.roomType] || [];
      for (const tmpl of templates) {
        const selRef = doc(collection(db, 'projects', projectId, 'selections'));
        batch.set(selRef, {
          projectId,
          roomId: roomRef.id,
          roomName: form.name.trim(),
          category: tmpl.category,
          area: tmpl.area,
          floor: form.floor,
          room: form.name.trim(),
          required: tmpl.required,
          note: tmpl.note || null,
          allowMultiple: tmpl.allowMultiple || false,
          clientApprovalStatus: 'Pending Options',
          orderStatus: 'Not Ordered',
          allowanceAmount: 0,
          allowanceUnit: 'per sqft',
          items: [],
          designerFiles: [],
          locked: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      toast({
        title: 'Room created',
        description: `${form.name} added with ${templates.length} selection placeholder${templates.length !== 1 ? 's' : ''}.`,
      });
      setModalOpen(false);
      setForm({ name: '', floor: 'Main Floor', roomType: '', sqft: '', notes: '' });
    } catch (err: any) {
      toast({ title: 'Error creating room', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const roomsByFloor = FLOOR_ORDER.reduce<Record<string, Room[]>>((acc, floor) => {
    acc[floor] = rooms.filter(r => r.floor === floor);
    return acc;
  }, {} as Record<string, Room[]>);

  const roomTypesByFloor = FLOOR_LEVELS.reduce<Record<string, typeof ROOM_TYPES>>((acc, floor) => {
    acc[floor] = ROOM_TYPES.filter(rt => rt.floor === floor);
    return acc;
  }, {} as Record<string, typeof ROOM_TYPES>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Rooms</h2>
          <p className="text-sm text-gray-500 mt-0.5">{rooms.length} room{rooms.length !== 1 ? 's' : ''} configured</p>
        </div>
        {canManage && (
          <Button
            onClick={() => setModalOpen(true)}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Room
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#C9A96E' }} />
        </div>
      ) : rooms.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Home className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No rooms yet</p>
          {canManage && (
            <p className="text-sm text-gray-400 mt-1">Add rooms to auto-generate selection placeholders</p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {FLOOR_ORDER.map(floor => {
            const floorRooms = roomsByFloor[floor] || [];
            if (floorRooms.length === 0) return null;
            return (
              <div key={floor}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{floor}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {floorRooms.map(room => {
                    const pct = roomCompletion(room.id);
                    const { approved, total } = roomSelectionCount(room.id);
                    return (
                      <div
                        key={room.id}
                        className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4"
                      >
                        <CompletionRing pct={pct} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{room.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{roomTypeLabel(room.roomType)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{approved}/{total} approved</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 text-xs gap-1 px-2"
                          onClick={() => onRoomSelect(room.id, room.name)}
                        >
                          View
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Room Type</label>
              <Select value={form.roomType} onValueChange={handleRoomTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room type…" />
                </SelectTrigger>
                <SelectContent>
                  {FLOOR_LEVELS.filter(f => f !== 'All Floors').map(floor => (
                    <SelectGroup key={floor}>
                      <SelectLabel className="text-xs font-semibold text-gray-500">{floor}</SelectLabel>
                      {(roomTypesByFloor[floor] || []).map(rt => (
                        <SelectItem key={rt.key} value={rt.key}>{rt.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Room Name</label>
              <Input
                placeholder="e.g. Primary Bath"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Floor Level</label>
              <Select value={form.floor} onValueChange={v => setForm(f => ({ ...f, floor: v as FloorLevel }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLOOR_LEVELS.filter(f => f !== 'All Floors').map(fl => (
                    <SelectItem key={fl} value={fl}>{fl}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Sq Footage (optional)</label>
              <Input
                type="number"
                placeholder="e.g. 120"
                value={form.sqft}
                onChange={e => setForm(f => ({ ...f, sqft: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Notes (optional)</label>
              <Textarea
                placeholder="Any notes about this room…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>

            {form.roomType && (
              <p className="text-xs text-gray-400 bg-gray-50 rounded p-2">
                {ROOM_SELECTION_TEMPLATES[form.roomType]?.length || 0} selection placeholder(s) will be auto-created
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Create Room'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
