import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Palette, Calculator, FileSignature, HardHat,
  ClipboardCheck, ShieldCheck, CheckCircle2, ChevronRight,
} from 'lucide-react';

// End-to-end project lifecycle. CRM stages collapse into Lead/Design/Estimating,
// then construction phases, then post-construction (move-in binder + warranty).
export type ProjectStage =
  | 'lead'
  | 'design'
  | 'estimating'
  | 'contract'
  | 'construction'
  | 'move_in_binder'
  | 'warranty'
  | 'completed';

export const STAGE_ORDER: ProjectStage[] = [
  'lead', 'design', 'estimating', 'contract',
  'construction', 'move_in_binder', 'warranty', 'completed',
];

interface StageMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;             // accent color
  defaultNextAction: string;
  defaultLink: (projectId: string) => string;
}

export const STAGE_META: Record<ProjectStage, StageMeta> = {
  lead: {
    label: 'Lead',
    icon: Sparkles,
    color: '#64748b',
    defaultNextAction: 'Book a discovery meeting with the client',
    defaultLink: () => '/sales',
  },
  design: {
    label: 'Design',
    icon: Palette,
    color: '#8b5cf6',
    defaultNextAction: 'Open the design board and start selections',
    defaultLink: (id) => `/projects/${id}/design`,
  },
  estimating: {
    label: 'Estimating',
    icon: Calculator,
    color: '#f59e0b',
    defaultNextAction: 'Build the rough estimate and request sub bids',
    defaultLink: (id) => `/projects/${id}/estimates`,
  },
  contract: {
    label: 'Contract',
    icon: FileSignature,
    color: '#C9A96E',
    defaultNextAction: 'Draft the Client Build Agreement (soft budget OK)',
    defaultLink: () => '/contracts',
  },
  construction: {
    label: 'Construction',
    icon: HardHat,
    color: '#0ea5e9',
    defaultNextAction: 'Run the Gantt schedule and track draws',
    defaultLink: (id) => `/projects/${id}/schedule`,
  },
  move_in_binder: {
    label: 'Move-in',
    icon: ClipboardCheck,
    color: '#10b981',
    defaultNextAction: 'Compile appliance + finish info for the move-in binder',
    defaultLink: (id) => `/projects/${id}/move-in-binder`,
  },
  warranty: {
    label: 'Warranty',
    icon: ShieldCheck,
    color: '#22c55e',
    defaultNextAction: 'Check in with client at 3, 6, and 11 months — use the Move-in Binder',
    defaultLink: (id) => `/projects/${id}/move-in-binder`,
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    color: '#94a3b8',
    defaultNextAction: 'Archive — keep accessible for reference',
    defaultLink: (id) => `/projects/${id}/overview`,
  },
};

// Best-effort derivation from existing project status fields. Tyler can
// override per project (we store `lifecycleStage` directly on the project doc).
export function deriveStageFromProject(project: any): ProjectStage {
  const explicit = String(project?.lifecycleStage || '').toLowerCase();
  if (explicit && (STAGE_ORDER as string[]).includes(explicit)) {
    return explicit as ProjectStage;
  }
  const status = String(project?.status || '').toLowerCase();
  if (status === 'planning') return 'design';
  if (status === 'active') return 'construction';
  if (status === 'punch_list' || status === 'closeout') return 'construction';
  if (status === 'completed') return project?.moveInDate ? 'warranty' : 'completed';
  return 'lead';
}

interface Props {
  projectId: string;
  stage: ProjectStage;
  nextActionOverride?: string;
  nextActionLink?: string;
  compact?: boolean;
}

// Horizontal step indicator at the top of every project page. Each step
// shows ✓ / ▶ / ◯. The active step has the next-action text + a deep link.
export function ProjectStageTracker({
  projectId, stage, nextActionOverride, nextActionLink, compact,
}: Props) {
  const activeIdx = STAGE_ORDER.indexOf(stage);
  const activeMeta = STAGE_META[stage];
  const link = nextActionLink || activeMeta.defaultLink(projectId);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className={`flex items-center overflow-x-auto ${compact ? 'p-1.5' : 'p-2'}`}>
        {STAGE_ORDER.map((s, i) => {
          const m = STAGE_META[s];
          const Icon = m.icon;
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          const isUpcoming = i > activeIdx;
          return (
            <div key={s} className="flex items-center shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ${
                isActive ? 'bg-gray-900 text-white' :
                isDone ? 'text-gray-700' :
                'text-gray-400'
              }`}>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                  style={isActive ? { backgroundColor: m.color, color: '#fff' } : { backgroundColor: isDone ? '#d1d5db' : '#f3f4f6' }}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                </div>
                <span className={`text-xs font-medium ${isActive ? 'text-white' : isUpcoming ? 'text-gray-400' : 'text-gray-700'} whitespace-nowrap`}>
                  {m.label}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <ChevronRight className="w-3 h-3 text-gray-300 mx-0.5 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div
          className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between gap-3"
          style={{ backgroundColor: `${activeMeta.color}10` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wider"
              style={{ borderColor: activeMeta.color, color: activeMeta.color }}
            >
              You are here
            </Badge>
            <p className="text-sm text-gray-700 truncate">
              {nextActionOverride || activeMeta.defaultNextAction}
            </p>
          </div>
          <Link href={link}>
            <a className="text-xs font-medium whitespace-nowrap hover:underline" style={{ color: activeMeta.color }}>
              Open →
            </a>
          </Link>
        </div>
      )}
    </div>
  );
}
