// Designer Portal — project-scoped, room-by-room design collaboration.
// Route: /projects/:id/designer  (RoleGuard: admin · gc · projectManager · designer · client)
import { useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import {
  DESIGN_STATUSES,
  GENERAL_ROOM_ID,
  GENERAL_ROOM_NAME,
  canEditDesign,
  canReviewAsClient,
  hasPortalAccess,
  normalizeRole,
  type DesignDecision,
  type DesignFile,
  type DesignSelection,
  type DesignStatus,
  type DesignerRoom,
  type MoodBoard,
} from '@/lib/designer/portalTypes';
import {
  listenDecisions,
  listenFiles,
  listenMoodBoards,
  listenRooms,
  listenSelections,
} from '@/lib/designer/portalService';
import { DesignerHeader } from '@/components/designer/portal/DesignerHeader';
import { DesignerDashboard } from '@/components/designer/portal/DesignerDashboard';
import { RoomNav } from '@/components/designer/portal/RoomNav';
import { RoomWorkspace } from '@/components/designer/portal/RoomWorkspace';
import { ErrorState, LoadingState } from '@/components/designer/portal/shared';

interface ProjectDoc {
  id: string;
  name?: string;
  clientName?: string;
  designerName?: string;
  designStatus?: DesignStatus;
}

export default function ProjectDesigner() {
  const [, params] = useRoute('/projects/:id/designer');
  const projectId = params?.id || '';
  const { user } = useAuth();
  const { toast } = useToast();

  const role = normalizeRole(user?.role);
  const canEdit = canEditDesign(role);
  const canReview = canReviewAsClient(role);

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [rooms, setRooms] = useState<DesignerRoom[]>([]);
  const [moodBoards, setMoodBoards] = useState<MoodBoard[]>([]);
  const [selections, setSelections] = useState<DesignSelection[]>([]);
  const [decisions, setDecisions] = useState<DesignDecision[]>([]);
  const [files, setFiles] = useState<DesignFile[]>([]);

  const [view, setView] = useState<
    { mode: 'overview' } | { mode: 'room'; roomId: string; roomName: string }
  >({ mode: 'overview' });

  // Project doc
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      doc(db, 'projects', projectId),
      (snap) => {
        if (!snap.exists()) {
          setProjectError('Project not found');
          setProjectLoading(false);
          return;
        }
        setProject({ id: snap.id, ...(snap.data() as any) });
        setProjectLoading(false);
      },
      (err) => {
        setProjectError(err?.message || 'Could not load project');
        setProjectLoading(false);
      }
    );
    return unsub;
  }, [projectId]);

  // Collaboration data listeners
  useEffect(() => {
    if (!projectId || !hasPortalAccess(role)) return;
    const noop = () => {};
    const unsubs = [
      listenRooms(projectId, setRooms, noop),
      listenMoodBoards(projectId, setMoodBoards, noop),
      listenSelections(projectId, setSelections, noop),
      listenDecisions(projectId, setDecisions, noop),
      listenFiles(projectId, setFiles, noop),
    ];
    return () => unsubs.forEach((u) => u());
  }, [projectId, role]);

  const progressPct = useMemo(() => {
    if (!selections.length) return 0;
    const done = selections.filter((s) =>
      ['approved', 'ordered', 'installed'].includes(s.designStatus || '')
    ).length;
    return Math.round((done / selections.length) * 100);
  }, [selections]);

  const designStatus: DesignStatus = useMemo(() => {
    if (project?.designStatus && DESIGN_STATUSES.includes(project.designStatus))
      return project.designStatus;
    if (!selections.length && !moodBoards.length) return 'Not Started';
    if (progressPct >= 100) return 'Approved';
    return 'In Progress';
  }, [
    project?.designStatus,
    selections.length,
    moodBoards.length,
    progressPct,
  ]);

  async function changeStatus(s: DesignStatus) {
    try {
      await updateDoc(doc(db, 'projects', projectId), { designStatus: s });
    } catch (e: any) {
      toast({
        title: 'Could not update status',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }

  function jumpToRoom(roomId: string, roomName: string) {
    setView({ mode: 'room', roomId, roomName });
  }

  // ── Access / loading / error ───────────────────────────────────────────────
  if (!hasPortalAccess(role)) {
    return (
      <ProjectLayout projectId={projectId} projectName="Designer Portal">
        <div className="p-6">
          <ErrorState message="You don't have access to the Designer Portal for this project." />
        </div>
      </ProjectLayout>
    );
  }
  if (projectLoading) {
    return (
      <ProjectLayout projectId={projectId} projectName="Loading…">
        <div className="p-6">
          <LoadingState label="Loading project…" />
        </div>
      </ProjectLayout>
    );
  }
  if (projectError || !project) {
    return (
      <ProjectLayout projectId={projectId} projectName="Designer Portal">
        <div className="p-6">
          <ErrorState message={projectError || 'Project unavailable'} />
        </div>
      </ProjectLayout>
    );
  }

  const projectName = project.name || 'Project';

  return (
    <ProjectLayout projectId={projectId} projectName={projectName}>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
        <DesignerHeader
          projectName={projectName}
          clientName={project.clientName}
          designerName={project.designerName}
          designStatus={designStatus}
          progressPct={progressPct}
          canEdit={canEdit}
          onChangeStatus={changeStatus}
        />

        {/* View toggle */}
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
              /{' '}
              <span className="text-gray-700 font-medium">{view.roomName}</span>
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

        {/* Rooms + workspace */}
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
                roomId={view.roomId}
                roomName={view.roomName}
                rooms={rooms}
                moodBoards={moodBoards}
                selections={selections}
                decisions={decisions}
                files={files}
                userRole={role}
                canEdit={canEdit}
                canReview={canReview}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
                <ArrowLeft className="w-5 h-5 text-gray-300 mx-auto mb-2 lg:hidden" />
                <p className="text-gray-500 font-medium">
                  Select a room to start designing
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Mood boards, selections, discussion, decisions, and files live
                  inside each room.
                </p>
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      jumpToRoom(GENERAL_ROOM_ID, GENERAL_ROOM_NAME)
                    }
                  >
                    Open General Design
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}
