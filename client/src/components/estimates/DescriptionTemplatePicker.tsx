import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BookOpen, Plus, Trash2, Save, Search } from 'lucide-react';

const GOLD = '#C9A96E';

export interface DescriptionTemplate {
  id: string;
  name: string;        // short label shown in the picker
  content: string;     // full scope description text
  trade?: string;      // optional trade tag for filtering
  createdBy?: string;
  createdAt?: any;
}

interface Props {
  /** Current description value — used for "Save as template" + to know if there's anything to save. */
  currentValue: string;
  /** Active trade on the line (for sorting matching templates to the top). */
  currentTrade?: string;
  /** Called when user picks a template — receives the template content to insert. */
  onInsert: (content: string) => void;
}

export function DescriptionTemplatePicker({ currentValue, currentTrade, onInsert }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<DescriptionTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  // Subscribe to templates from Firestore.
  useEffect(() => {
    const q = query(
      collection(db, 'companySettings', 'shared', 'descriptionTemplates'),
      orderBy('name'),
    );
    const unsub = onSnapshot(q,
      snap => setTemplates(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DescriptionTemplate, 'id'>) }))),
      () => { /* permission error — ignore, hide picker */ },
    );
    return () => unsub();
  }, []);

  const filtered = templates
    .filter(t => {
      if (!search) return true;
      const q = search.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Trade-matching templates come first, alphabetical within groups
      if (currentTrade) {
        const am = a.trade === currentTrade ? 0 : 1;
        const bm = b.trade === currentTrade ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      return a.name.localeCompare(b.name);
    });

  const handleInsert = (t: DescriptionTemplate) => {
    onInsert(t.content);
    setOpen(false);
    toast({ title: 'Template inserted', description: t.name });
  };

  const handleSaveAsTemplate = async () => {
    const name = newName.trim();
    if (!name) { toast({ title: 'Give the template a name', variant: 'destructive' }); return; }
    if (!currentValue.trim()) { toast({ title: 'Description is empty — nothing to save', variant: 'destructive' }); return; }
    setSavingNew(true);
    try {
      await addDoc(collection(db, 'companySettings', 'shared', 'descriptionTemplates'), {
        name,
        content: currentValue,
        trade: currentTrade || null,
        createdBy: user?.id?.toString() || user?.email || 'unknown',
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Template saved', description: `"${name}" added to your library` });
      setNewName('');
      setShowSaveForm(false);
    } catch (e: any) {
      toast({ title: 'Could not save template', description: e.message, variant: 'destructive' });
    } finally {
      setSavingNew(false);
    }
  };

  const handleDelete = async (t: DescriptionTemplate) => {
    if (!confirm(`Delete template "${t.name}"? This affects everyone in the company.`)) return;
    try {
      await deleteDoc(doc(db, 'companySettings', 'shared', 'descriptionTemplates', t.id));
    } catch (e: any) {
      toast({ title: 'Could not delete', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 w-8 flex items-center justify-center rounded border transition-colors flex-shrink-0"
          style={{
            borderColor: templates.length > 0 ? 'rgba(201,169,110,0.4)' : '#E5E7EB',
            color: templates.length > 0 ? GOLD : '#9CA3AF',
            backgroundColor: 'rgba(201,169,110,0.04)',
          }}
          title={`Insert from ${templates.length} saved description template${templates.length === 1 ? '' : 's'}`}
        >
          <BookOpen className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        {/* Search */}
        <div className="p-2 border-b" style={{ borderColor: '#E5E7EB' }}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6 px-3">
              {templates.length === 0
                ? 'No saved templates yet. Type a description below and click "+ Save current as template" to start your library.'
                : 'No templates match the search.'}
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {filtered.map(t => (
                <div key={t.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => handleInsert(t)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm font-medium truncate" style={{ color: '#141414' }}>
                      {t.name}
                      {t.trade === currentTrade && t.trade && (
                        <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: '#8B6F3F' }}>
                          {t.trade}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{t.content}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(t)}
                    className="text-gray-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5"
                    title="Delete template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save current as template */}
        <div className="p-2 border-t" style={{ borderColor: '#E5E7EB' }}>
          {showSaveForm ? (
            <div className="space-y-2">
              <Textarea
                value={currentValue}
                disabled
                rows={2}
                className="text-xs text-gray-600 bg-gray-50"
              />
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Template name (e.g., 'Master bath rough plumbing')"
                  className="flex-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); }}
                />
                <Button
                  size="sm"
                  onClick={handleSaveAsTemplate}
                  disabled={savingNew || !newName.trim() || !currentValue.trim()}
                  style={{ backgroundColor: GOLD, color: '#141414' }}
                  className="h-8 px-2 hover:opacity-90"
                >
                  <Save className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowSaveForm(false); setNewName(''); }}
                  className="h-8 px-2"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSaveForm(true)}
              disabled={!currentValue.trim()}
              className="w-full justify-center text-xs gap-1.5"
              title={!currentValue.trim() ? 'Type a description first' : 'Save the current description as a reusable template'}
            >
              <Plus className="w-3.5 h-3.5" />
              Save current as template
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
