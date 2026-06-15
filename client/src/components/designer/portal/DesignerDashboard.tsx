// Designer Portal — dashboard summary cards (the "what needs attention" view).
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  DollarSign,
  FileUp,
  Link2Off,
  Palette,
  TimerReset,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  GENERAL_ROOM_ID,
  computeVariance,
  selectionHasRequiredLink,
  type DesignDecision,
  type DesignFile,
  type DesignSelection,
  type DesignerRoom,
  type MoodBoard,
} from '@/lib/designer/portalTypes';

interface Props {
  rooms: DesignerRoom[];
  selections: DesignSelection[];
  decisions: DesignDecision[];
  files: DesignFile[];
  moodBoards: MoodBoard[];
  onJump: (roomId: string, roomName: string) => void;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  try {
    return v?.toDate ? v.toDate() : new Date(v);
  } catch {
    return null;
  }
}

export function DesignerDashboard({
  rooms,
  selections,
  decisions,
  files,
  moodBoards,
  onJump,
}: Props) {
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

  const openDecisions = decisions.filter(
    (d) => d.status === 'pending' || d.status === 'needsRevision'
  );
  const pendingApprovals =
    selections.filter((s) => s.designStatus === 'inReview').length +
    moodBoards.filter(
      (b) => b.status === 'Client Review' || b.status === 'Ready For Review'
    ).length;
  const upcomingDeadlines = selections.filter((s) => {
    const d = toDate(s.dueDate);
    return (
      d &&
      d >= now &&
      d <= soon &&
      s.designStatus !== 'approved' &&
      s.designStatus !== 'installed'
    );
  });
  const recentUploads = [...files]
    .sort(
      (a, b) =>
        (toDate(b.uploadedAt)?.getTime() || 0) -
        (toDate(a.uploadedAt)?.getTime() || 0)
    )
    .slice(0, 5);
  const timelineRisks =
    selections.filter((s) => {
      const d = toDate(s.dueDate);
      return (
        (d &&
          d < now &&
          s.designStatus !== 'approved' &&
          s.designStatus !== 'installed') ||
        (s.timelineImpact && s.designStatus !== 'approved')
      );
    }).length +
    decisions.filter((d) => d.timelineImpact && d.status !== 'approved').length;
  const roomsMissingBoards = rooms.filter(
    (r) => !moodBoards.some((b) => b.roomId === r.id)
  );
  const missingLinks = selections.filter((s) => !selectionHasRequiredLink(s));
  const overAllowance = selections.filter((s) => computeVariance(s) > 0);
  const boardsAwaiting = moodBoards.filter(
    (b) => b.status === 'Client Review' || b.status === 'Ready For Review'
  );

  const overTotal = overAllowance.reduce(
    (sum, s) => sum + computeVariance(s),
    0
  );

  const cards = [
    {
      icon: Clock,
      tone: 'amber',
      label: 'Open design decisions',
      value: openDecisions.length,
    },
    {
      icon: CheckCircle2,
      tone: 'blue',
      label: 'Pending client approvals',
      value: pendingApprovals,
    },
    {
      icon: CalendarClock,
      tone: 'indigo',
      label: 'Upcoming deadlines (14d)',
      value: upcomingDeadlines.length,
    },
    {
      icon: FileUp,
      tone: 'slate',
      label: 'Recent uploads',
      value: recentUploads.length,
    },
    {
      icon: TimerReset,
      tone: 'red',
      label: 'Timeline risk items',
      value: timelineRisks,
    },
    {
      icon: Palette,
      tone: 'amber',
      label: 'Rooms missing mood boards',
      value: roomsMissingBoards.length,
    },
    {
      icon: Link2Off,
      tone: 'amber',
      label: 'Selections missing links',
      value: missingLinks.length,
    },
    {
      icon: DollarSign,
      tone: 'red',
      label: 'Selections over allowance',
      value: overAllowance.length,
      sub: overTotal > 0 ? `+${formatCurrency(overTotal)}` : undefined,
    },
    {
      icon: AlertTriangle,
      tone: 'blue',
      label: 'Mood boards awaiting approval',
      value: boardsAwaiting.length,
    },
  ];

  const toneClass: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    slate: 'bg-slate-50 text-slate-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${toneClass[c.tone]}`}
            >
              <c.icon className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {c.value}
            </p>
            <p className="text-xs text-gray-500 leading-tight mt-0.5">
              {c.label}
            </p>
            {c.sub && (
              <p className="text-xs text-red-500 font-medium mt-0.5">{c.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Quick lists for the highest-signal items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {roomsMissingBoards.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-amber-500" /> Rooms missing a
              mood board
            </p>
            <div className="flex flex-wrap gap-2">
              {roomsMissingBoards.slice(0, 12).map((r) => (
                <button
                  key={r.id}
                  onClick={() => onJump(r.id, r.name)}
                  className="text-xs rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 hover:bg-amber-100"
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {overAllowance.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-red-500" /> Over allowance
            </p>
            <div className="space-y-1.5">
              {overAllowance.slice(0, 6).map((s) => (
                <button
                  key={s.id}
                  onClick={() =>
                    onJump(
                      s.roomId || GENERAL_ROOM_ID,
                      s.room || 'General Design'
                    )
                  }
                  className="w-full flex items-center justify-between text-sm hover:bg-gray-50 rounded px-1"
                >
                  <span className="text-gray-700 truncate">
                    {s.itemName || s.category}
                  </span>
                  <span className="text-red-600 font-medium tabular-nums">
                    +{formatCurrency(computeVariance(s))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
