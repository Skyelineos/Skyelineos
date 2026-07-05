// Task List Library — a hub of per-build-type task lists.
//
// Each tile opens the task list for one of our job types:
//   • Custom Home → the Master Task List (the build playbook, /master-tasks)
//   • Spec Home / Basement Finish / Remodel / Pool → that type's Schedule
//     Template, edited in the same Gantt editor.
//
// Reached from Templates → "Task List Library".
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { listTemplates, type ScheduleTemplate } from '@/modules/gantt/useSchedulePersistence';
import { normalizeProjectType } from '@/modules/gantt/projectTypes';
import { seedStarterScheduleTemplates } from '@/lib/seedStarterScheduleTemplates';
import { ScheduleTemplateEditor } from '@/components/templates/ScheduleTemplateEditor';
import { Home, Building2, Layers, Hammer, Waves, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';

type Kind = 'master' | 'schedule';
interface Tile {
  type: string;            // normalized project type
  label: string;
  kind: Kind;
  desc: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const TILES: Tile[] = [
  { type: 'Custom Home', label: 'Custom Home', kind: 'master',
    desc: 'The Custom Home build playbook — phases, tasks, acceptance criteria.',
    icon: Home, color: '#C9A96E', bg: '#fdf8f0' },
  { type: 'Spec Home', label: 'Spec Home', kind: 'schedule',
    desc: 'Builder-spec home: lot readiness → build → sell.',
    icon: Building2, color: '#3b82f6', bg: '#eff6ff' },
  { type: 'Basement', label: 'Basement Finish', kind: 'schedule',
    desc: 'Finishing an existing basement.',
    icon: Layers, color: '#22c55e', bg: '#f0fdf4' },
  { type: 'Remodel', label: 'Remodel', kind: 'schedule',
    desc: 'Whole-home / room remodel in an occupied house.',
    icon: Hammer, color: '#d97706', bg: '#fffbeb' },
  { type: 'Pool', label: 'Pool', kind: 'schedule',
    desc: 'In-ground pool build: dig → shell → startup.',
    icon: Waves, color: '#0ea5e9', bg: '#f0f9ff' },
];

export default function TaskListLibrary() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ type: string; id: string } | null>(null);

  const load = async () => {
    try {
      setTemplates(await listTemplates());
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const idFor = (type: string, list: ScheduleTemplate[] = templates) =>
    list.find((t) => normalizeProjectType((t as any).projectType) === normalizeProjectType(type))?.id;
  const countFor = (type: string) =>
    (templates.find((t) => normalizeProjectType((t as any).projectType) === normalizeProjectType(type)) as any)?.taskCount as number | undefined;

  const open = async (tile: Tile) => {
    if (tile.kind === 'master') { navigate('/master-tasks'); return; }
    let id = idFor(tile.type);
    if (!id) {
      // Not seeded yet — create the standard templates, then open.
      setBusyType(tile.type);
      try {
        await seedStarterScheduleTemplates(user?.email || '');
        const fresh = await listTemplates();
        setTemplates(fresh);
        id = idFor(tile.type, fresh);
      } catch (e: any) {
        toast({ title: 'Could not load template', description: e?.message, variant: 'destructive' });
      } finally {
        setBusyType(null);
      }
    }
    if (id) setSelected({ type: tile.type, id });
    else toast({ title: 'Template not found', description: `No ${tile.label} template yet.`, variant: 'destructive' });
  };

  if (selected) {
    return (
      <AppLayout>
        <ScheduleTemplateEditor templateId={selected.id} onBack={() => { setSelected(null); load(); }} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold text-brand-black tracking-tight">Task List Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            The task list for each job type. Pick a type to view and edit its tasks.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            const count = tile.kind === 'schedule' ? countFor(tile.type) : undefined;
            const busy = busyType === tile.type;
            return (
              <button key={tile.type} onClick={() => open(tile)} disabled={busy} className="text-left group">
                <Card className="border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: tile.bg }}>
                          <Icon className="w-5 h-5" style={{ color: tile.color }} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 group-hover:text-[#C9A96E] transition-colors">
                            {tile.label}
                          </h3>
                          <p className="text-sm text-gray-500 mt-0.5">{tile.desc}</p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {tile.kind === 'master'
                              ? 'Master Task List'
                              : loading ? 'Loading…' : count != null ? `${count} tasks` : 'Tap to set up'}
                          </p>
                        </div>
                      </div>
                      {busy
                        ? <Loader2 className="w-5 h-5 text-gray-300 animate-spin shrink-0" />
                        : <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 shrink-0" />}
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>

        <button onClick={() => navigate('/templates')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="w-4 h-4" /> Back to Templates
        </button>
      </div>
    </AppLayout>
  );
}
