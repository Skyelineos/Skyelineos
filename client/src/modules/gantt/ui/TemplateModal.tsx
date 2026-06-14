import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { saveAsTemplate, listTemplates, ScheduleTemplate } from '../useSchedulePersistence';
import type { WbsTask, Link } from '../types';
import { BookTemplate, Save, FolderOpen, Trash2 } from 'lucide-react';

// ── Save Template Dialog ────────────────────────────────────────────────────

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
  tasks: WbsTask[];
  links: Link[];
  createdBy?: string;
  onSaved: (name: string) => void;
}

export function SaveTemplateModal({ open, onClose, tasks, links, createdBy, onSaved }: SaveTemplateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(''); setDescription(''); } }, [open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveAsTemplate(name.trim(), description.trim(), tasks, links, createdBy);
      onSaved(name.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-amber-600" />
            Save as Template
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-500">
            Saves the current {tasks.length} tasks as a reusable template for future projects.
          </p>
          <div className="space-y-1.5">
            <Label>Template Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Custom Home — Standard Build" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="e.g. 6-month custom home timeline with typical phases" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Load Template Dialog ────────────────────────────────────────────────────

interface LoadTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onLoad: (template: ScheduleTemplate) => void;
}

export function LoadTemplateModal({ open, onClose, onLoad }: LoadTemplateModalProps) {
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(null);
    listTemplates().then(setTemplates).finally(() => setLoading(false));
  }, [open]);

  const handleLoad = () => {
    const t = templates.find(t => t.id === selected);
    if (t) { onLoad(t); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-600" />
            Load Schedule Template
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-gray-500">Select a template to apply to this project. Existing tasks will be replaced.</p>
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              No templates saved yet. Build a schedule and use "Save as Template".
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    selected === t.id
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200 hover:border-amber-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                      {t.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{t.description}</p>}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">{t.tasks?.length ?? 0} tasks</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleLoad} disabled={!selected} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
            Apply Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
