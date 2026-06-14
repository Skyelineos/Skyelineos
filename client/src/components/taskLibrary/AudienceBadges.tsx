// Consistent "who can see this task" labeling used across the master library,
// the project board, and the task drawer. The Skyeline Team always sees every
// task; Client / Subs / Designers only see tasks flagged for them (their portals
// show clean, scoped views). Centralizing this keeps every surface in sync.
import { Eye, Users, HardHat, Palette } from 'lucide-react';
import {
  taskAudiences,
  AUDIENCE_BADGE_CLASS,
  type AudienceFlags,
  type TaskAudience,
} from '@shared/taskLibrary-types';

const ICON: Record<TaskAudience, any> = {
  Team: Users,
  Client: Eye,
  Subs: HardHat,
  Designers: Palette,
};

export function AudienceBadges({
  task,
  size = 'sm',
}: {
  task: AudienceFlags;
  size?: 'sm' | 'xs';
}) {
  const audiences = taskAudiences(task);
  const text = size === 'xs' ? 'text-[10px] px-1.5 py-0' : 'text-[11px] px-2 py-0.5';
  const icon = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {audiences.map((a) => {
        const Icon = ICON[a];
        return (
          <span
            key={a}
            className={`inline-flex items-center gap-0.5 rounded-full border ${AUDIENCE_BADGE_CLASS[a]} ${text}`}
            title={`Visible to: ${a}`}
          >
            <Icon className={icon} />
            {a}
          </span>
        );
      })}
    </span>
  );
}

// A compact legend explaining the audience pills — place above a board so the
// team, and anyone reviewing, understands who sees what at a glance.
export function AudienceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
      <span className="font-medium text-gray-600">Who sees each task:</span>
      {(['Team', 'Client', 'Subs', 'Designers'] as TaskAudience[]).map((a) => {
        const Icon = ICON[a];
        return (
          <span key={a} className="inline-flex items-center gap-1">
            <span className={`inline-flex items-center gap-0.5 rounded-full border ${AUDIENCE_BADGE_CLASS[a]} text-[10px] px-1.5 py-0`}>
              <Icon className="h-2.5 w-2.5" />
              {a}
            </span>
          </span>
        );
      })}
      <span className="text-gray-400">· Team always sees everything</span>
    </div>
  );
}
