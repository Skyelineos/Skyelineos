// Read-only phase timeline for an estimate-derived schedule. Used GC-side as a
// preview and (next) client-side as their estimated build timeline. Purely
// presentational — pass it a GeneratedSchedule.

import type { GeneratedSchedule, BuildPhase } from '@/lib/schedule/types';

const PHASE_COLORS: Record<BuildPhase, string> = {
  'Pre-Construction': '#8B7355',
  'Foundation': '#A6824C',
  'Framing': '#C9A96E',
  'Rough-In': '#B8924A',
  'Pre-Drywall': '#9C7E4F',
  'Finish': '#C9A96E',
  'Closeout': '#6E5A3A',
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}
function fmtMoney(n: number): string {
  return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
}

export function ScheduleTimeline({
  schedule,
  className = '',
}: {
  schedule: GeneratedSchedule;
  className?: string;
}) {
  const { startDate, endDate, totalDays, phases, tradeCount } = schedule;
  const months = (totalDays / 30.44).toFixed(1);

  return (
    <div className={className}>
      {/* Summary header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Estimated Schedule</div>
          <div className="text-lg font-semibold text-[#141414]">
            {fmtDate(startDate)} <span className="text-gray-400">→</span> {fmtDate(endDate)}
          </div>
        </div>
        <div className="text-sm text-gray-500">
          ~{months} months · {phases.length} phases · {tradeCount} trades
        </div>
      </div>

      {/* Proportional segmented bar — the at-a-glance timeline */}
      <div className="flex w-full h-7 rounded-md overflow-hidden mb-5 border border-gray-200">
        {phases.map(p => (
          <div
            key={p.phase}
            title={`${p.phase}: ${fmtDate(p.startDate)} → ${fmtDate(p.endDate)} (${p.durationDays}d)`}
            style={{
              width: `${(p.durationDays / Math.max(1, totalDays)) * 100}%`,
              backgroundColor: PHASE_COLORS[p.phase],
            }}
            className="h-full"
          />
        ))}
      </div>

      {/* Phase detail rows */}
      <div className="space-y-3">
        {phases.map(p => (
          <div key={p.phase} className="flex gap-3">
            <div
              className="w-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: PHASE_COLORS[p.phase] }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <div className="font-semibold text-sm text-[#141414]">{p.phase}</div>
                <div className="text-xs text-gray-500">
                  {fmtDate(p.startDate)} → {fmtDate(p.endDate)} · {p.durationDays}d
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.trades.map((t, i) => (
                  <span
                    key={`${t.trade}-${i}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700"
                  >
                    {t.trade}
                    {t.amount > 0 && <span className="text-gray-400">{fmtMoney(t.amount)}</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Estimated timeline generated from this estimate's line items. Phase durations are
        defaults and may shift with selections, weather, and inspections.
      </p>
    </div>
  );
}
