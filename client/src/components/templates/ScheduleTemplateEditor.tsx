// Schedule-template editor (Templates → Schedule). Uses the SAME Gantt as a
// project (SkyelineGantt) so creating/editing a template has identical inline
// activity entry, drag-to-resize, and drag-to-connect dependency bubbles.
// Reads/writes the shared useGantt store and persists to scheduleTemplates/{id}.
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Trash2, Save } from 'lucide-react';
import { useGantt } from '@/modules/gantt/state';
import { SkyelineGantt } from '@/modules/gantt/ui/SkyelineGantt';
import { AddTaskModal } from '@/modules/gantt/ui/AddTaskModal';
import { EditTaskModal } from '@/modules/gantt/ui/EditTaskModal';
import { PROJECT_TYPES } from '@/modules/gantt/projectTypes';
import type { WbsTask } from '@/modules/gantt/types';

interface Props {
  templateId: string;
  onBack: () => void;
}

const ZOOMS = ['Day', 'Week', 'Month'] as const;

export function ScheduleTemplateEditor({ templateId, onBack }: Props) {
  const { toast } = useToast();
  const { setTasks, setLinks, setProjectName, zoom, setZoom } = useGantt();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [projectType, setProjectType] = useState('Other');
  const [showAdd, setShowAdd] = useState(false);
  const [editingTask, setEditingTask] = useState<WbsTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'scheduleTemplates', templateId));
        if (cancelled) return;
        if (!snap.exists()) {
          toast({ title: 'Template not found', variant: 'destructive' });
          onBack();
          return;
        }
        const data = snap.data() as any;
        setName(data.name || '');
        setProjectType(data.projectType || 'Other');
        setProjectName(data.name || 'Schedule template');
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
        setLinks(Array.isArray(data.links) ? data.links : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId, toast, onBack, setTasks, setLinks, setProjectName]);

  const save = async () => {
    setSaving(true);
    try {
      const { tasks, links } = useGantt.getState();
      await updateDoc(doc(db, 'scheduleTemplates', templateId), {
        name: name.trim() || 'Untitled schedule',
        projectType,
        tasks,
        links,
        taskCount: tasks.length,
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Template saved', description: `${tasks.length} activities · ${links.length} dependencies.` });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async () => {
    if (!confirm(`Delete "${name}" template? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'scheduleTemplates', templateId));
      toast({ title: 'Template deleted' });
      onBack();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading schedule template…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button onClick={onBack} className="mb-1.5 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ChevronLeft className="h-4 w-4" /> Templates
          </button>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-64" placeholder="Custom Home — Standard Build" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Project type</Label>
            <Select value={projectType} onValueChange={setProjectType}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Project type" /></SelectTrigger>
              <SelectContent>{PROJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" onClick={removeTemplate} className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
          <Button onClick={save} disabled={saving} style={{ backgroundColor: '#C9A96E', color: '#141414' }} className="font-semibold">
            <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Build the schedule like a project: <strong>+ Add activity</strong>, Enter for the next row, Tab to indent into
        phases, drag bar edges to resize, and drag the dot on a bar's end onto another activity to link them.
      </p>

      {/* Gantt */}
      <Card>
        <CardContent className="p-0">
          <div className="h-[68vh]">
            <SkyelineGantt onAddTask={() => setShowAdd(true)} onEditTask={setEditingTask} />
          </div>
        </CardContent>
      </Card>

      <AddTaskModal open={showAdd} onClose={() => setShowAdd(false)} />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
    </div>
  );
}
