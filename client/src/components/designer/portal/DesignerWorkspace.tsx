// Designer Portal — shared workspace body (no page shell).
//
// Holds the collaboration listeners + header + dashboard + room nav + per-room
// workspace. Rendered by BOTH the GC/designer route (ProjectDesigner, wrapped in
// ProjectLayout) and the client portal "Design Review" tab (rendered bare inside
// the client portal shell). Keeping it here means one source of truth for the
// room-by-room experience across both surfaces.
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import {
  DESIGN_STATUSES,
  GENERAL_ROOM_ID,
  GENERAL_ROOM_NAME,
  canEditDesign,
  canReviewAsClient,
  type DesignDecision,
  type DesignFile,
  type DesignSelection,
  type DesignStatus,
  type DesignerRoom,
  type MoodBoard,
  type PortalRole,
} from '@/lib/designer/portalTypes';
import {
  listenDecisions,
  listenFiles,
  listenMoodBoards,
  listenRooms,
  listenSelections,
} from '@/lib/designer/portalService';
import { DesignerHeader } from './DesignerHeader';
import { DesignerDashboard } from './DesignerDashboard';
import { RoomNav } from './RoomNav';
import { RoomWorkspace } from './RoomWorkspace';

interface Props {
  projectId: string;
  projectName: string;
  viewerRole: PortalRole;
  clientName?: string;
  designerName?: string;
  /** Stored project design status; the container derives a sensible default. */
  storedDesignStatus?: DesignStatus;
  /** Called when an editor changes the design status (omitted for clients). */
  onChangeStatus?: (s: DesignStatus) => void;
}

export function DesignerWorkspace({
  projectId,
  projectName,
  viewerRole,
  clientName,
  designerName,
  storedDesignStatus,
  onChangeStatus,
}: Props) {
  const canEdit = canEditDesign(viewerRole);
  const canReview = canReviewAsClient(viewerRole);

  const [rooms, setRooms] = useState<DesignerRoom[]>([]);
  const [moodBoards, setMoodBoards] = useState<MoodBoard[]>([]);
  const [selections, setSelections] = useState<DesignSelection[]>([]);
  const [decisions, setDecisions] = useState<DesignDecision[]>([]);
  const [files, setFiles] = useState<DesignFile[]>([]);

  const [view, setView] = useState<
    { mode: 'overview' } | { mode: 'room'; roomId: string; roomName: string }
  >({ mode: 'overview' });

  useEffect(() => {
    if (!projectId) return;
    const noop = () => {};
    const unsubs = [
      listenRooms(projectId, setRooms, noop),
      listenMoodBoards(projectId, setMoodBoards, noop),
      listenSelections(projectId, setSelections, noop),
      listenDecisions(projectId, setDecisions, noop),
      listenFiles(projectId, setFiles, noop),
    ];
    return () => unsubs.forEach((u) => u());
  }, [projectId]);

  const progressPct = useMemo(() => {
    if (!selections.length) return 0;
    const done = selections.filter((s) =>
      ['approved', 'ordered', 'installed'].includes(s.designStatus || '')
    ).length;
    return Math.round((done / selections.length) * 100);
  }, [selections]);

  const designStatus: DesignStatus = useMemo(() => {
    if (storedDesignStatus && DESIGN_STATUSES.includes(storedDesignStatus))
      return storedDesignStatus;
    if (!selections.length && !moodBoards.length) return 'Not Started';
    if (progressPct >= 100) return 'Approved';
    return 'In Progress';
  }, [storedDesignStatus, selections.length, moodBoards.length, progressPct]);

  function jumpToRoom(roomId: string, roomName: string) {
    setView({ mode: 'room', roomId, roomName });
  }

  return (
    <div className="space-y-5">
      <DesignerHeader
        projectName={projectName}
        clientName={clientName}
        designerName={designerName}
        designStatus={designStatus}
        progressPct={progressPct}
        canEdit={canEdit && !!onChangeStatus}
        onChangeStatus={onChangeStatus || (() => {})}
      />

      <div className="flex items-center gap-2">
        <Button
          variant={view.mode === 'overview' ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5"
          onClick={() => setView({ mode: 'overview' })}
        >
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </Button>
        {view.mode === 'room' && (
          <span className="text-sm text-gray-400">
            / <span className="text-gray-700 font-medium">{view.roomName}</span>
          </span>
        )}
      </div>

      {view.mode === 'overview' ? (
        <DesignerDashboard
          rooms={rooms}
          selections={selections}
          decisions={decisions}
          files={files}
          moodBoards={moodBoards}
          onJump={jumpToRoom}
        />
      ) : null}

      <div className="flex flex-col lg:flex-row gap-6">
        <RoomNav
          projectId={projectId}
          rooms={rooms}
          selections={selections}
          moodBoards={moodBoards}
          activeRoomId={view.mode === 'room' ? view.roomId : GENERAL_ROOM_ID}
          onSelect={jumpToRoom}
          canEdit={canEdit}
        />
        <div className="flex-1 min-w-0">
          {view.mode === 'room' ? (
            <RoomWorkspace
              projectId={projectId}
              projectName={projectName}
              roomId={view.roomId}
              roomName={view.roomName}
              rooms={rooms}
              moodBoards={moodBoards}
              selections={selections}
              decisions={decisions}
              files={files}
              userRole={viewerRole}
              canEdit={canEdit}
              canReview={canReview}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <ArrowLeft className="w-5 h-5 text-gray-300 mx-auto mb-2 lg:hidden" />
              <p className="text-gray-500 font-medium">
                Select a room to {canReview ? 'review' : 'start designing'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Mood boards, selections, discussion, decisions, and files live
                inside each room.
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => jumpToRoom(GENERAL_ROOM_ID, GENERAL_ROOM_NAME)}
                >
                  Open General Design
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
