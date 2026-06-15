// Designer Portal — project header with design status + progress.
import { Check, ChevronDown, Palette, User } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { DESIGN_STATUSES, type DesignStatus } from '@/lib/designer/portalTypes';
import { StatusBadge } from './shared';

interface Props {
  projectName: string;
  clientName?: string;
  designerName?: string;
  designStatus: DesignStatus;
  progressPct: number;
  canEdit: boolean;
  onChangeStatus: (s: DesignStatus) => void;
}

export function DesignerHeader({
  projectName,
  clientName,
  designerName,
  designStatus,
  progressPct,
  canEdit,
  onChangeStatus,
}: Props) {
  const { toast } = useToast();
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase tracking-widest">
            <Palette className="w-4 h-4" style={{ color: '#C9A96E' }} />{' '}
            Designer Portal
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 truncate">
            {projectName}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
            {clientName && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> {clientName}
              </span>
            )}
            {designerName && (
              <span>
                Designer:{' '}
                <span className="text-gray-700 font-medium">
                  {designerName}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-gray-400 mb-1">Design status</p>
          {canEdit ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1.5 outline-none">
                <StatusBadge status={designStatus} />
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {DESIGN_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => {
                      onChangeStatus(s);
                      toast({ title: `Design status: ${s}` });
                    }}
                  >
                    {designStatus === s && (
                      <Check className="w-4 h-4 mr-1.5 text-emerald-600" />
                    )}
                    {s}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <StatusBadge status={designStatus} />
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Design progress</span>
          <span className="font-semibold tabular-nums">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>
    </div>
  );
}
