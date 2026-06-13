// Shown in a project's Schedule tab when no schedule exists yet. Lets the GC
// start from a saved template (matched to this project's type first) or from a
// blank Gantt — instead of silently loading demo data.
import { useEffect, useMemo, useState } from 'react';
import { listTemplates, type ScheduleTemplate } from '../useSchedulePersistence';
import { normalizeProjectType } from '../projectTypes';
import { CalendarPlus, LayoutTemplate, FilePlus2, ArrowRight } from 'lucide-react';

interface Props {
  projectType?: string;
  onPickTemplate: (t: ScheduleTemplate) => void;
  onStartBlank: () => void;
}

export function CreateScheduleScreen({ projectType, onPickTemplate, onStartBlank }: Props) {
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const wantType = normalizeProjectType(projectType);

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((t) => !cancelled && setTemplates(t))
      .catch(() => !cancelled && setTemplates([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // Templates for this project type float to the top.
  const sorted = useMemo(() => {
    return [...templates].sort((a, b) => {
      const am = normalizeProjectType(a.projectType) === wantType ? 0 : 1;
      const bm = normalizeProjectType(b.projectType) === wantType ? 0 : 1;
      if (am !== bm) return am - bm;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [templates, wantType]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg" style={{ background: '#C9A96E22' }}>
          <CalendarPlus className="h-6 w-6 text-[#C9A96E]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Create the schedule</h2>
          <p className="text-sm text-gray-500">
            Start from a template for a <span className="font-medium">{wantType}</span>, or build it from scratch.
          </p>
        </div>
      </div>

      {/* Start blank */}
      <button
        onClick={onStartBlank}
        className="mb-6 flex w-full items-center justify-between rounded-lg border-2 border-dashed border-gray-200 px-5 py-4 text-left hover:border-[#C9A96E] hover:bg-amber-50/40"
      >
        <span className="flex items-center gap-3">
          <FilePlus2 className="h-5 w-5 text-gray-500" />
          <span>
            <span className="block font-medium text-gray-900">Start blank</span>
            <span className="block text-xs text-gray-500">An empty Gantt — add activities yourself.</span>
          </span>
        </span>
        <ArrowRight className="h-4 w-4 text-gray-400" />
      </button>

      <div className="mb-2 flex items-center gap-2">
        <LayoutTemplate className="h-4 w-4 text-gray-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assign a template</h3>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading templates…</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No schedule templates yet. Create reusable templates in <span className="font-medium">Templates → Schedule</span>,
          or start blank above.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((t) => {
            const tType = normalizeProjectType(t.projectType);
            const match = tType === wantType;
            return (
              <button
                key={t.id}
                onClick={() => onPickTemplate(t)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition hover:border-[#C9A96E] hover:bg-amber-50/40 ${
                  match ? 'border-[#C9A96E]/50 bg-amber-50/30' : 'border-gray-200'
                }`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-gray-900">{t.name || 'Untitled template'}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      match ? 'bg-[#C9A96E] text-[#141414]' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tType}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    {(t.tasks?.length ?? 0)} activities{t.description ? ` · ${t.description}` : ''}
                  </span>
                </span>
                <ArrowRight className="ml-3 h-4 w-4 shrink-0 text-gray-400" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
