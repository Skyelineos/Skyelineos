import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc,
  doc, serverTimestamp, where, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, ChevronRight, ChevronLeft, Star, Pencil, Trash2,
  FileText, FolderOpen, CheckSquare, Briefcase, Calendar, Palette, Sparkles,
} from 'lucide-react';
import { JobTemplateEditor } from '@/components/templates/JobTemplateEditor';
import { DocumentTemplateEditor } from '@/components/templates/DocumentTemplateEditor';
import { ScheduleTemplateEditor } from '@/components/templates/ScheduleTemplateEditor';
import { SelectionsTemplateEditor } from '@/components/templates/SelectionsTemplateEditor';
import { EstimateTemplateEditor } from '@/components/templates/EstimateTemplateEditor';
import { StyleQuizTemplateEditor } from '@/components/templates/StyleQuizTemplateEditor';

// ── Types ─────────────────────────────────────────────────────────────────────

type TemplateCategory = 'estimate' | 'document' | 'task' | 'job' | 'schedule' | 'selections' | 'styleQuiz';

interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  description?: string;
  content?: string;
  isDefault?: boolean;
  createdByName?: string;
  createdAt?: { toDate: () => Date } | null;
  // Schedule-template specific: number of tasks shown on the card.
  taskCount?: number;
}

// ── Category config ────────────────────────────────────────────────────────────

interface CategoryMeta {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  contentPlaceholder: string;
}

const CATEGORIES: Record<TemplateCategory, CategoryMeta> = {
  estimate: {
    label: 'Estimate Templates',
    description: 'Manage estimate templates which can be applied to jobs.',
    icon: FileText,
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    contentPlaceholder: 'Line items, labor rates, material costs…',
  },
  document: {
    label: 'Document Templates',
    description: 'Manage document templates which can be applied to jobs.',
    icon: FolderOpen,
    color: '#3b82f6',
    bg: '#eff6ff',
    border: '#bfdbfe',
    contentPlaceholder: 'Contract clauses, scope language, lien waiver text…',
  },
  task: {
    label: 'Task List Library',
    description: 'Task lists per job type — Custom Home (master playbook), Spec Home, Basement Finish, Remodel, Pool.',
    icon: CheckSquare,
    color: '#22c55e',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    contentPlaceholder: 'Phases, tasks, acceptance criteria…',
  },
  job: {
    label: 'Job Templates',
    description: 'Manage job templates which can be applied when creating jobs.',
    icon: Briefcase,
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    contentPlaceholder: 'Job phases, standard milestones, default subs…',
  },
  schedule: {
    label: 'Schedule Templates',
    description: 'Setup schedule templates to save time when creating schedule items for jobs and leads.',
    icon: Calendar,
    color: '#ef4444',
    bg: '#fef2f2',
    border: '#fecaca',
    contentPlaceholder: 'Phase durations, sequencing, buffer days…',
  },
  selections: {
    label: 'Selections Templates',
    description: 'The client “selections needed” list seeded into new projects.',
    icon: Palette,
    color: '#C9A96E',
    bg: '#fdf8f0',
    border: '#eaddc4',
    contentPlaceholder: 'Floor / room / category / area decisions…',
  },
  styleQuiz: {
    label: 'Style Quiz',
    description: 'The guided, image-based style quiz clients click through in the portal.',
    icon: Sparkles,
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    contentPlaceholder: 'Questions + image options per area…',
  },
};

const CATEGORY_ORDER: TemplateCategory[] = ['estimate', 'document', 'task', 'job', 'schedule', 'selections', 'styleQuiz'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(t?: { toDate: () => Date } | null) {
  if (!t) return '—';
  try {
    return t.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

// ── Hub (category cards) ───────────────────────────────────────────────────────

function HubView({ onSelect }: { onSelect: (c: TemplateCategory) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <p className="text-sm text-gray-500 mt-0.5">Reusable templates for estimates, documents, tasks, jobs, and schedules</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORY_ORDER.map(cat => {
          const meta = CATEGORIES[cat];
          const Icon = meta.icon;
          return (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              className="text-left group"
            >
              <Card className="border border-gray-200 hover:shadow-md hover:border-gray-300 transition-all h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: meta.bg }}
                      >
                        <Icon className="w-5 h-5" style={{ color: meta.color }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 group-hover:text-[#C9A96E] transition-colors">
                          {meta.label}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5 leading-snug">{meta.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#C9A96E] transition-colors shrink-0 mt-0.5" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail view (list within a category) ──────────────────────────────────────

function DetailView({
  category,
  onBack,
}: {
  category: TemplateCategory;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const meta = CATEGORIES[category];
  const Icon = meta.icon;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', description: '', content: '' });

  useEffect(() => {
    setLoading(true);
    // Schedule templates live in their own collection (`scheduleTemplates`)
    // because the Gantt's Load Template API reads from it. Other categories
    // share the unified `templates` collection.
    if (category === 'schedule') {
      const unsub = onSnapshot(
        query(collection(db, 'scheduleTemplates'), orderBy('createdAt', 'desc')),
        snap => {
          setTemplates(snap.docs.map(d => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: data.name || 'Untitled schedule',
              category: 'schedule',
              description: data.description,
              createdAt: data.createdAt,
              taskCount: Array.isArray(data.tasks) ? data.tasks.length : 0,
            } as Template;
          }));
          setLoading(false);
        },
        () => setLoading(false),
      );
      return () => unsub();
    }
    const unsub = onSnapshot(
      query(
        collection(db, 'templates'),
        where('category', '==', category),
        orderBy('createdAt', 'desc'),
      ),
      snap => {
        setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as Template)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [category]);

  async function openCreate() {
    if (category === 'document') {
      // Create stub doc first so editor can save to a real ID
      try {
        const ref = await addDoc(collection(db, 'templates'), {
          name: 'New Template',
          category: 'document',
          content: '',
          description: '',
          isDefault: false,
          createdBy: user?.id,
          createdByName: user?.name,
          createdAt: serverTimestamp(),
        });
        setEditingTemplate({ id: ref.id, name: 'New Template', category: 'document' });
      } catch {
        toast({ title: 'Error creating template', variant: 'destructive' });
      }
      return;
    }
    if (category === 'schedule') {
      // Schedule templates live in `scheduleTemplates` and open straight into the
      // Gantt editor (the shared dialog wrote to the wrong collection before).
      try {
        const ref = await addDoc(collection(db, 'scheduleTemplates'), {
          name: 'New Schedule',
          description: '',
          tasks: [],
          links: [],
          taskCount: 0,
          isStarter: false,
          createdBy: user?.id,
          createdByName: user?.name,
          createdAt: serverTimestamp(),
        });
        setEditingTemplate({ id: ref.id, name: 'New Schedule', category: 'schedule' });
      } catch {
        toast({ title: 'Error creating template', variant: 'destructive' });
      }
      return;
    }
    if (category === 'selections' || category === 'estimate' || category === 'styleQuiz') {
      try {
        const seed = category === 'selections' ? { items: [] }
          : category === 'estimate' ? { lineItems: [] }
          : { questions: [] };
        const ref = await addDoc(collection(db, 'templates'), {
          name: category === 'selections' ? 'New Selections List' : category === 'estimate' ? 'New Estimate' : 'New Style Quiz',
          category,
          ...seed,
          description: '',
          isDefault: false,
          createdBy: user?.id,
          createdByName: user?.name,
          createdAt: serverTimestamp(),
        });
        setEditingTemplate({ id: ref.id, name: 'New Template', category });
      } catch {
        toast({ title: 'Error creating template', variant: 'destructive' });
      }
      return;
    }
    setEditTarget(null);
    setForm({ name: '', description: '', content: '' });
    setShowDialog(true);
  }

  function openEdit(t: Template) {
    setEditTarget(t);
    setForm({ name: t.name, description: t.description || '', content: t.content || '' });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'templates', editTarget.id), {
          name: form.name.trim(),
          description: form.description.trim(),
          content: form.content.trim(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Template updated' });
      } else {
        await addDoc(collection(db, 'templates'), {
          name: form.name.trim(),
          category,
          description: form.description.trim(),
          content: form.content.trim(),
          isDefault: false,
          createdBy: user?.id,
          createdByName: user?.name,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Template created' });
      }
      setShowDialog(false);
    } catch {
      toast({ title: 'Error saving template', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const collectionName = category === 'schedule' ? 'scheduleTemplates' : 'templates';
      await deleteDoc(doc(db, collectionName, id));
      toast({ title: 'Template deleted' });
    } catch {
      toast({ title: 'Error deleting template', variant: 'destructive' });
    }
  }

  // "Publish" a template as the project default for its category. New projects
  // seed from whatever is marked default here (schedule → Gantt, job → task
  // list). Setting one clears the flag on the others in the same category.
  async function setAsDefault(id: string) {
    try {
      const collectionName = category === 'schedule' ? 'scheduleTemplates' : 'templates';
      await Promise.all(templates.map(t =>
        updateDoc(doc(db, collectionName, t.id), { isDefault: t.id === id, updatedAt: serverTimestamp() })
      ));
      toast({ title: 'Set as default', description: 'New projects will seed from this template.' });
    } catch (e: any) {
      toast({ title: 'Could not set default', description: e?.message || '', variant: 'destructive' });
    }
  }

  if (category === 'document' && editingTemplate) {
    return (
      <DocumentTemplateEditor
        template={editingTemplate}
        onBack={() => setEditingTemplate(null)}
        onSave={async (data) => {
          await updateDoc(doc(db, 'templates', editingTemplate.id), {
            name: data.name,
            content: data.content,
            description: data.description,
            updatedAt: serverTimestamp(),
          });
          setEditingTemplate(null);
        }}
        onDelete={async () => {
          await deleteDoc(doc(db, 'templates', editingTemplate.id));
          setEditingTemplate(null);
        }}
      />
    );
  }

  if (category === 'job' && editingTemplate) {
    return (
      <JobTemplateEditor
        template={editingTemplate}
        onBack={() => setEditingTemplate(null)}
      />
    );
  }

  if (category === 'schedule' && editingTemplate) {
    return (
      <ScheduleTemplateEditor
        templateId={editingTemplate.id}
        onBack={() => setEditingTemplate(null)}
      />
    );
  }

  if (category === 'selections' && editingTemplate) {
    return <SelectionsTemplateEditor templateId={editingTemplate.id} onBack={() => setEditingTemplate(null)} />;
  }

  if (category === 'estimate' && editingTemplate) {
    return <EstimateTemplateEditor templateId={editingTemplate.id} onBack={() => setEditingTemplate(null)} />;
  }

  if (category === 'styleQuiz' && editingTemplate) {
    return <StyleQuizTemplateEditor templateId={editingTemplate.id} onBack={() => setEditingTemplate(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Templates
          </button>
          <span className="text-gray-300">/</span>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: meta.bg }}
          >
            <Icon className="w-4 h-4" style={{ color: meta.color }} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 truncate">{meta.label}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {category === 'schedule' && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const { seedStarterScheduleTemplates } = await import('@/lib/seedStarterScheduleTemplates');
                  const { created, refreshed, skipped } = await seedStarterScheduleTemplates(user?.email || '');
                  const parts: string[] = [];
                  if (created) parts.push(`${created} added`);
                  if (refreshed) parts.push(`${refreshed} refreshed`);
                  if (skipped) parts.push(`${skipped} left as-is`);
                  toast({
                    title: created || refreshed ? 'Standard templates updated' : 'No changes',
                    description: `${parts.join(' · ') || 'Nothing to do'} — open any to edit in the Gantt.`,
                  });
                } catch (e: any) {
                  toast({
                    title: 'Seed failed',
                    description: e?.message || 'Could not create standard templates.',
                    variant: 'destructive',
                  });
                }
              }}
              className="gap-2"
            >
              <Plus className="w-4 h-4" /> Add Standard Templates
            </Button>
          )}
          {category === 'job' && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  const { seedStandardTaskList } = await import('@/lib/seedStandardTaskList');
                  const { created, taskCount } = await seedStandardTaskList(user?.email || '');
                  toast({
                    title: created ? 'Standard task list added' : 'Already exists',
                    description: created ? `${taskCount} tasks — open to edit, then ★ to set as default.` : 'A "Standard Task List" job template already exists.',
                  });
                } catch (e: any) {
                  toast({ title: 'Seed failed', description: e?.message || '', variant: 'destructive' });
                }
              }}
            >
              <Plus className="w-4 h-4" /> Add Standard Task List
            </Button>
          )}
          {category === 'selections' && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  const { seedStandardSelectionsTemplate } = await import('@/lib/seedStandardSelectionsTemplate');
                  const { created, count } = await seedStandardSelectionsTemplate(user?.email || '');
                  toast({
                    title: created ? 'Standard selections added' : 'Already exists',
                    description: created ? `${count} client decisions — open to edit, then ★ to set as default.` : 'A "Standard Selections" template already exists.',
                  });
                } catch (e: any) {
                  toast({ title: 'Seed failed', description: e?.message || '', variant: 'destructive' });
                }
              }}
            >
              <Plus className="w-4 h-4" /> Add Standard Selections
            </Button>
          )}
          {category === 'estimate' && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  const { seedStandardEstimateTemplate } = await import('@/lib/seedStandardEstimateTemplate');
                  const { created, count, total } = await seedStandardEstimateTemplate(user?.email || '');
                  toast({
                    title: created ? 'Standard estimate added' : 'Already exists',
                    description: created ? `${count} line items ($${total.toLocaleString()}) — open to edit, then ★ to set as default.` : 'A "Standard Estimate" template already exists.',
                  });
                } catch (e: any) {
                  toast({ title: 'Seed failed', description: e?.message || '', variant: 'destructive' });
                }
              }}
            >
              <Plus className="w-4 h-4" /> Add Standard Estimate
            </Button>
          )}
          {category === 'styleQuiz' && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                try {
                  const { seedStandardStyleQuiz } = await import('@/lib/seedStandardStyleQuiz');
                  const { created, count } = await seedStandardStyleQuiz(user?.email || '');
                  toast({
                    title: created ? 'Standard style quiz added' : 'Already exists',
                    description: created ? `${count} questions — open to add photos, then ★ to set as default.` : 'A "Standard Style Quiz" already exists.',
                  });
                } catch (e: any) {
                  toast({ title: 'Seed failed', description: e?.message || '', variant: 'destructive' });
                }
              }}
            >
              <Plus className="w-4 h-4" /> Add Standard Style Quiz
            </Button>
          )}
          <Button
            onClick={openCreate}
            style={{ backgroundColor: '#C9A96E' }}
            className="text-white hover:opacity-90 gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" /> New Template
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-36 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Icon className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: meta.color }} />
          <p className="font-medium">No {meta.label.toLowerCase()} yet</p>
          <p className="text-sm mt-1">Create your first template to get started</p>
          <Button
            onClick={openCreate}
            className="mt-4 gap-2"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Plus className="w-4 h-4" /> New Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tmpl => (
            <Card key={tmpl.id} className="border border-gray-200 hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 leading-snug">{tmpl.name}</h3>
                  {tmpl.isDefault && (
                    <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200 gap-1 border shrink-0">
                      <Star className="w-3 h-3 fill-amber-500 stroke-amber-500" /> Default
                    </Badge>
                  )}
                </div>
                {tmpl.description && (
                  <p className="text-sm text-gray-500 line-clamp-2">{tmpl.description}</p>
                )}
                {category === 'schedule' && typeof tmpl.taskCount === 'number' && (
                  <Badge variant="outline" className="text-xs">
                    {tmpl.taskCount} task{tmpl.taskCount === 1 ? '' : 's'}
                  </Badge>
                )}
                <p className="text-xs text-gray-400">Created {fmtDate(tmpl.createdAt)}</p>
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <Button
                    size="sm"
                    className="flex-1 text-xs gap-1.5"
                    style={{ backgroundColor: meta.bg, color: meta.color }}
                    variant="outline"
                    onClick={() => {
                      if (category === 'job' || category === 'document' || category === 'schedule' || category === 'selections' || category === 'estimate' || category === 'styleQuiz') setEditingTemplate(tmpl);
                      else toast({ title: `Applied "${tmpl.name}"` });
                    }}
                  >
                    {category === 'schedule' ? 'Open' : 'Use Template'}
                  </Button>
                  {(category === 'schedule' || category === 'job' || category === 'selections' || category === 'estimate' || category === 'styleQuiz') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={`px-2.5 ${tmpl.isDefault ? 'text-amber-600 border-amber-300' : ''}`}
                      title={tmpl.isDefault ? 'This is the project default' : 'Set as project default (publish)'}
                      disabled={tmpl.isDefault}
                      onClick={() => setAsDefault(tmpl.id)}
                    >
                      <Star className={`w-3.5 h-3.5 ${tmpl.isDefault ? 'fill-amber-500 stroke-amber-500' : ''}`} />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2.5"
                    onClick={() => {
                      if (category === 'job' || category === 'document' || category === 'schedule' || category === 'selections' || category === 'estimate' || category === 'styleQuiz') setEditingTemplate(tmpl);
                      else openEdit(tmpl);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2.5 text-red-500 hover:text-red-600 hover:border-red-300"
                    onClick={() => handleDelete(tmpl.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Template' : `New ${meta.label.replace(' Templates', ' Template')}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Template name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                placeholder="Brief description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea
                placeholder={meta.contentPlaceholder}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={7}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: '#C9A96E' }}
              className="text-white hover:opacity-90"
            >
              {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page root ──────────────────────────────────────────────────────────────────

export default function Templates() {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | null>(null);
  const [, navigate] = useLocation();

  // "Task List Library" is its own hub (a tile per job type) rather than a
  // generic templates list — route there instead of the stub view.
  const handleSelect = (c: TemplateCategory) => {
    if (c === 'task') { navigate('/task-library'); return; }
    setActiveCategory(c);
  };

  return (
    <AppLayout>
      {activeCategory ? (
        <DetailView category={activeCategory} onBack={() => setActiveCategory(null)} />
      ) : (
        <HubView onSelect={handleSelect} />
      )}
    </AppLayout>
  );
}
