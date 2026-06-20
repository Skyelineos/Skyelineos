// Skyelineos Gantt — clean, single-view construction schedule.
// One timeline, a minimal toolbar, and advanced options tucked behind a menu.
import React, { useState } from 'react';
import { useGantt } from '../state';
import { SkyelineGantt } from './SkyelineGantt';
import { AddTaskModal } from './AddTaskModal';
import { EditTaskModal } from './EditTaskModal';
import { SaveTemplateModal, LoadTemplateModal } from './TemplateModal';
import { autoSchedule } from '../engine/autoSchedule';
import { saveSchedule } from '../useSchedulePersistence';
import { useToast } from '@/hooks/use-toast';
import type { WbsTask, Link } from '../types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Plus, Save, Sparkles, MoreHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';

const ZOOMS = ['Day', 'Week', 'Month'] as const;

export const BuildTrackerPro: React.FC = () => {
  const {
    projectName,
    projectId,
    tasks,
    links,
    setTasks,
    setLinks,
    setMetrics,
    metrics,
    zoom,
    setZoom,
    showCritical,
    toggleCritical,
    showBaseline,
    toggleBaseline,
    showWeekends,
    toggleWeekends,
    holidays,
  } = useGantt();

  const [isScheduling, setIsScheduling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [editingTask, setEditingTask] = useState<WbsTask | null>(null);
  const { toast } = useToast();

  const criticalCount = metrics ? metrics.criticalIds.size : 0;

  const leafStats = (() => {
    let total = 0;
    let done = 0;
    const walk = (nodes: WbsTask[]) =>
      nodes.forEach((n) => {
        const leaf = !n.children || n.children.length === 0;
        if (leaf) {
          total++;
          if ((n.progress ?? 0) >= 100) done++;
        }
        n.children && walk(n.children);
      });
    walk(tasks);
    return { total, done };
  })();

  const extractLinksFromTasks = (list: WbsTask[]): Link[] => {
    const all: Link[] = [];
    const walk = (node: WbsTask) => {
      node.predecessors?.forEach((p) =>
        all.push({ id: `${p.sourceId}-${p.targetId}`, sourceId: p.sourceId, targetId: p.targetId, type: p.type, lagDays: p.lagDays })
      );
      node.children?.forEach(walk);
    };
    list.forEach(walk);
    return all;
  };

  const handleAutoSchedule = async () => {
    if (tasks.length === 0) {
      toast({ title: 'No tasks', description: 'Add some tasks before auto-scheduling.', variant: 'destructive' });
      return;
    }
    setIsScheduling(true);
    try {
      const result = autoSchedule(tasks, extractLinksFromTasks(tasks), { respectLocked: true, holidays });
      setTasks(result.tasks);
      setMetrics(result.metrics);
      toast({
        title: 'Schedule recalculated',
        description: result.metrics.warnings.length ? `Done — ${result.metrics.warnings.length} warning(s).` : 'All dependencies resolved.',
      });
    } catch (e) {
      toast({ title: 'Schedule error', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsScheduling(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) {
      toast({ title: 'Cannot save', description: 'No project linked to this schedule.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      await saveSchedule(projectId, tasks, links);
      toast({ title: 'Schedule saved', description: 'Timeline saved to this project.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyTemplate = (template: { tasks: WbsTask[]; links: Link[] }) => {
    setTasks(template.tasks);
    setLinks(template.links);
    toast({ title: 'Template applied', description: 'Tasks loaded. Recalculate to set dates.' });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ===== Toolbar ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-gray-900">{projectName}</h1>
          <span className="hidden items-center gap-1 text-sm text-gray-500 sm:flex">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {leafStats.done}/{leafStats.total} done
          </span>
          {showCritical && criticalCount > 0 && (
            <span className="hidden items-center gap-1 text-sm text-red-500 sm:flex">
              <AlertCircle className="h-4 w-4" />
              {criticalCount} critical
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* zoom segmented control */}
          <div className="flex items-center rounded-lg border bg-gray-50 p-0.5">
            {ZOOMS.map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                  zoom === z ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={() => setShowAddTaskModal(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add Task
          </Button>

          {/* Advanced options menu — keeps the main bar uncluttered */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleAutoSchedule} disabled={isScheduling}>
                <Sparkles className="mr-2 h-4 w-4" />
                {isScheduling ? 'Recalculating…' : 'Recalculate dates'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-gray-400">Display</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showCritical} onCheckedChange={toggleCritical}>
                Critical path
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showBaseline} onCheckedChange={toggleBaseline}>
                Baseline variance
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showWeekends} onCheckedChange={toggleWeekends}>
                Shade weekends
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-gray-400">Templates</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setShowLoadTemplate(true)}>Load template…</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowSaveTemplate(true)} disabled={tasks.length === 0}>
                Save as template…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || tasks.length === 0}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
          >
            <Save className="mr-1 h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* ===== Chart ===== */}
      <div className="relative min-h-0 flex-1">
        <SkyelineGantt onAddTask={() => setShowAddTaskModal(true)} onEditTask={setEditingTask} />
        {/* Mobile-only floating action button — same callback as the toolbar
            "+ Add Task" button. Hidden at md and up. */}
        <button
          type="button"
          onClick={() => setShowAddTaskModal(true)}
          aria-label="Add task"
          className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg active:scale-95 md:hidden"
          style={{
            bottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))',
            backgroundColor: '#C9A96E',
          }}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* ===== Modals ===== */}
      <AddTaskModal open={showAddTaskModal} onClose={() => setShowAddTaskModal(false)} />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      <SaveTemplateModal
        open={showSaveTemplate}
        onClose={() => setShowSaveTemplate(false)}
        tasks={tasks}
        links={links}
        onSaved={(name) => toast({ title: 'Template saved', description: `"${name}" is ready for future projects.` })}
      />
      <LoadTemplateModal open={showLoadTemplate} onClose={() => setShowLoadTemplate(false)} onLoad={handleApplyTemplate} />
    </div>
  );
};
