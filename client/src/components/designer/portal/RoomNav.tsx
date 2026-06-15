// Designer Portal — room navigation sidebar.
import { useState } from 'react';
import { Check, LayoutGrid, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import type {
  DesignSelection,
  DesignerRoom,
  MoodBoard,
} from '@/lib/designer/portalTypes';
import {
  GENERAL_ROOM_ID,
  GENERAL_ROOM_NAME,
  computeVariance,
  selectionHasRequiredLink,
} from '@/lib/designer/portalTypes';
import {
  createCustomRoom,
  seedStandardRooms,
} from '@/lib/designer/portalService';

interface Props {
  projectId: string;
  rooms: DesignerRoom[];
  selections: DesignSelection[];
  moodBoards: MoodBoard[];
  activeRoomId: string;
  onSelect: (roomId: string, roomName: string) => void;
  canEdit: boolean;
}

export function RoomNav({
  projectId,
  rooms,
  selections,
  moodBoards,
  activeRoomId,
  onSelect,
  canEdit,
}: Props) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  function statsFor(roomId: string) {
    const sels =
      roomId === GENERAL_ROOM_ID
        ? selections.filter((s) => !s.roomId)
        : selections.filter((s) => s.roomId === roomId);
    const total = sels.length;
    const approved = sels.filter(
      (s) =>
        s.designStatus === 'approved' ||
        s.designStatus === 'ordered' ||
        s.designStatus === 'installed'
    ).length;
    const pct = total ? Math.round((approved / total) * 100) : 0;
    const over = sels.filter((s) => computeVariance(s) > 0).length;
    const hasBoard = moodBoards.some((b) => b.roomId === roomId);
    const missingLinks = sels.filter(
      (s) => !selectionHasRequiredLink(s)
    ).length;
    return { total, pct, over, hasBoard, missingLinks };
  }

  async function addStandard() {
    setBusy(true);
    try {
      const n = await seedStandardRooms(projectId, rooms);
      toast({
        title: n
          ? `Added ${n} standard rooms`
          : 'All standard rooms already exist',
      });
    } catch (e: any) {
      toast({
        title: 'Could not add rooms',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  async function addCustom() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createCustomRoom(projectId, name.trim(), rooms.length);
      onSelect(id, name.trim());
      setName('');
      setAdding(false);
    } catch (e: any) {
      toast({
        title: 'Could not add room',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  const navRooms: DesignerRoom[] = [
    { id: GENERAL_ROOM_ID, name: GENERAL_ROOM_NAME, order: -1 },
    ...[...rooms].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  ];

  return (
    <aside className="w-full lg:w-64 shrink-0 space-y-2">
      <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-gray-400 uppercase tracking-widest">
        <LayoutGrid className="w-3.5 h-3.5" /> Rooms
      </div>

      <nav className="space-y-1">
        {navRooms.map((room) => {
          const isGeneral = room.id === GENERAL_ROOM_ID;
          const s = statsFor(room.id);
          const active = room.id === activeRoomId;
          return (
            <button
              key={room.id}
              onClick={() => onSelect(room.id, room.name)}
              className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${active ? 'bg-[#14141408] border border-[#C9A96E]' : 'hover:bg-gray-50 border border-transparent'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-sm truncate ${active ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                >
                  {room.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {!isGeneral && !s.hasBoard && (
                    <AlertCircle
                      className="w-3.5 h-3.5 text-amber-400"
                      aria-label="No mood board"
                    />
                  )}
                  {s.total > 0 && (
                    <span
                      className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${s.pct === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {s.pct === 100 ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        `${s.pct}%`
                      )}
                    </span>
                  )}
                </div>
              </div>
              {(s.over > 0 || s.missingLinks > 0) && (
                <div className="mt-1 flex gap-1.5">
                  {s.over > 0 && (
                    <span className="text-[10px] text-red-500">
                      {s.over} over
                    </span>
                  )}
                  {s.missingLinks > 0 && (
                    <span className="text-[10px] text-amber-500">
                      {s.missingLinks} no link
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {canEdit && (
        <div className="pt-2 space-y-2">
          {adding ? (
            <div className="space-y-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Room name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCustom();
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={addCustom}
                  disabled={busy || !name.trim()}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setAdding(true)}
            >
              <Plus className="w-4 h-4" /> Custom room
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-gray-400"
            onClick={addStandard}
            disabled={busy}
          >
            Add standard design rooms
          </Button>
        </div>
      )}
    </aside>
  );
}
