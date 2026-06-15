// Designer Portal — per-room workspace: the 6 required features as tabs.
import { useState } from 'react';
import {
  BookOpen,
  FolderOpen,
  ListChecks,
  MessageSquare,
  Palette,
} from 'lucide-react';
import type {
  DesignDecision,
  DesignFile,
  DesignSelection,
  DesignerRoom,
  MoodBoard,
} from '@/lib/designer/portalTypes';
import { MoodBoardPanel } from './MoodBoardPanel';
import { SelectionTrackerPanel } from './SelectionTrackerPanel';
import { DiscussionPanel } from './DiscussionPanel';
import { DecisionTrackerPanel } from './DecisionTrackerPanel';
import { FileLibraryPanel } from './FileLibraryPanel';
import { AiActionsMenu } from './AiActionsMenu';

type WorkspaceTab =
  | 'moodboard'
  | 'selections'
  | 'discussion'
  | 'decisions'
  | 'files';

interface Props {
  projectId: string;
  roomId: string;
  roomName: string;
  rooms: DesignerRoom[];
  moodBoards: MoodBoard[];
  selections: DesignSelection[];
  decisions: DesignDecision[];
  files: DesignFile[];
  userRole: string;
  canEdit: boolean;
  canReview: boolean;
}

const TABS: { value: WorkspaceTab; label: string; icon: React.ElementType }[] =
  [
    { value: 'moodboard', label: 'Mood Board', icon: Palette },
    { value: 'selections', label: 'Selections', icon: ListChecks },
    { value: 'discussion', label: 'Discussion', icon: MessageSquare },
    { value: 'decisions', label: 'Decisions', icon: BookOpen },
    { value: 'files', label: 'Files', icon: FolderOpen },
  ];

export function RoomWorkspace(props: Props) {
  const {
    projectId,
    roomId,
    roomName,
    rooms,
    moodBoards,
    selections,
    decisions,
    files,
    userRole,
    canEdit,
    canReview,
  } = props;
  const [tab, setTab] = useState<WorkspaceTab>('moodboard');

  const isGeneral = roomId === 'general';
  const roomBoards = moodBoards.filter((b) => b.roomId === roomId);
  // General Design shows selections not tied to a physical room; otherwise match roomId.
  const roomSelections = selections.filter((s) =>
    isGeneral ? !s.roomId : s.roomId === roomId
  );
  const roomDecisions = decisions.filter((d) => d.roomId === roomId);
  const roomFiles = files.filter((f) => f.roomId === roomId);

  return (
    <div className="space-y-4">
      {/* Workspace header with counts + AI actions (the 6th required feature) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{roomName}</h2>
          <p className="text-xs text-gray-400">
            {roomBoards.length
              ? `${roomBoards[0].items?.length || 0} board items · `
              : ''}
            {roomSelections.length} selections ·{' '}
            {roomDecisions.filter((d) => d.status === 'pending').length} open
            decisions · {roomFiles.length} files
          </p>
        </div>
        <AiActionsMenu context={{ projectId, roomId, roomName }} />
      </div>

      {/* Tab strip */}
      <div className="border-b border-gray-200 flex items-center gap-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.value
                ? 'border-[#C9A96E] text-[#8a6a3a]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {tab === 'moodboard' && (
          <MoodBoardPanel
            projectId={projectId}
            roomId={roomId}
            roomName={roomName}
            boards={roomBoards}
            canEdit={canEdit}
            canReview={canReview}
          />
        )}
        {tab === 'selections' && (
          <SelectionTrackerPanel
            projectId={projectId}
            roomId={roomId}
            roomName={roomName}
            selections={roomSelections}
            canEdit={canEdit}
            canReview={canReview}
          />
        )}
        {tab === 'discussion' && (
          <DiscussionPanel
            projectId={projectId}
            roomId={roomId}
            roomName={roomName}
            userRole={userRole}
            rooms={rooms}
          />
        )}
        {tab === 'decisions' && (
          <DecisionTrackerPanel
            projectId={projectId}
            roomId={roomId}
            roomName={roomName}
            decisions={roomDecisions}
            canEdit={canEdit}
            canReview={canReview}
          />
        )}
        {tab === 'files' && (
          <FileLibraryPanel
            projectId={projectId}
            roomId={roomId}
            files={roomFiles}
            canUpload={canEdit || canReview}
            canDelete={canEdit}
          />
        )}
      </div>
    </div>
  );
}
