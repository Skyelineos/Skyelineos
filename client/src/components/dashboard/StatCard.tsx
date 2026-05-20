import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/** Canonical accent palette for stat cards. `gold` is the default — use
 *  semantic accents only when the tile communicates status (e.g. red for
 *  overdue, green for "paid this month"). Anything purely informational
 *  should stay gold so the dashboards keep one visual rhythm. */
type Accent = 'gold' | 'green' | 'amber' | 'red' | 'blue' | 'gray';

const ACCENT_CLASSES: Record<Accent, { pill: string; icon: string; value: string }> = {
  gold:  { pill: 'bg-amber-50 border-amber-200', icon: 'text-[#C9A96E]', value: 'text-gray-900' },
  green: { pill: 'bg-green-50 border-green-200', icon: 'text-green-600', value: 'text-gray-900' },
  amber: { pill: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', value: 'text-gray-900' },
  red:   { pill: 'bg-red-50 border-red-200',     icon: 'text-red-600',   value: 'text-gray-900' },
  blue:  { pill: 'bg-blue-50 border-blue-200',   icon: 'text-blue-600',  value: 'text-gray-900' },
  gray:  { pill: 'bg-gray-50 border-gray-200',   icon: 'text-gray-600',  value: 'text-gray-900' },
};

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: Accent;
  /** Click handler — when supplied the card becomes interactive (hover + cursor). */
  onClick?: () => void;
  /** Optional sublabel under the value, e.g. "vs last month". */
  sublabel?: string;
}

/**
 * Unified dashboard stat tile used across the GC dashboard and every portal
 * dashboard. Matches the main `/dashboard` design language: shadcn Card with
 * rounded-xl + soft hover shadow, fluid typography, gold-by-default accents.
 */
export function StatCard({ label, value, icon: Icon, accent = 'gold', onClick, sublabel }: Props) {
  const cls = ACCENT_CLASSES[accent];
  const interactive = !!onClick;
  return (
    <Card
      className={cn(
        'rounded-xl transition-shadow',
        interactive && 'cursor-pointer hover:shadow-md',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-lg border flex-shrink-0', cls.pill)}>
            <Icon className={cn('w-5 h-5', cls.icon)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn('text-xl md:text-2xl font-bold tabular-nums truncate', cls.value)}>
              {value}
            </p>
            <p className="text-xs text-gray-500 truncate">{label}</p>
            {sublabel && (
              <p className="text-[11px] text-gray-400 truncate mt-0.5">{sublabel}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
