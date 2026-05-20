import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookOpen, Trash2, Save, Plus, FileText, Search } from 'lucide-react';

export interface BidPackageTemplate {
  id: string;
  name: string;
  commonNotes?: string;
  tradeSections: { trade: string; scope: string }[];
  createdBy?: string;
  createdAt?: any;
}

interface Props {
  currentSections: { trade: string; scope: string }[];
  currentNotes: string;
  onImport: (template: { tradeSections: { trade: string; scope: string }[]; commonNotes: string }) => void;
}

/**
 * Drop-in picker for bid-package templates. Lives next to "Add trade" in the
 * SendBidPackageModal. Lets the user save the current trade/scope list as a
 * reusable template OR pick a saved template to replace the current sections.
 * Templates store the trade+scope structure only — invited subs and due dates
 * are project-specific and stay user-entered.
 */
export function BidPackageTemplatePicker({ currentSections, currentNotes, onImport }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<BidPackageTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [savingName, setSavingName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'bidPackageTemplates'), orderBy('name'));
    const unsub = onSnapshot(q,
      snap => setTemplates(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<BidPackageTemplate, 'id'>) }))),
      () => { /* permission/no-data — silent */ },
    );
    return () => unsub();
  }, []);

  const filtered = templates.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q)
      || (t.tradeSections || []).some(s => (s.trade || '').toLowerCase().includes(q));
  });

  const handleImport = (t: BidPackageTemplate) => {
    onImport({
      tradeSections: (t.tradeSections || []).map(s => ({ trade: s.trade, scope: s.scope })),
      commonNotes: t.commonNotes || '',
    });
    setOpen(false);
    toast({ title: 'Template imported', description: `"${t.name}" — ${(t.tradeSections || []).length} trade${(t.tradeSections || []).length === 1 ? '' : 's'}` });
  };

  const handleSave = async () => {
    const name = savingName.trim();
    if (!name) { toast({ title: 'Give the template a name', variant: 'destructive' }); return; }
    const sectionsToSave = currentSections.filter(s => s.trade.trim() || s.scope.trim());
    if (sectionsToSave.length === 0) {
      toast({ title: 'Nothing to save', description: 'Fill in at least one trade + scope first.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'bidPackageTemplates'), {
        name,
        commonNotes: currentNotes || '',
        tradeSections: sectionsToSave,
        createdBy: user?.id?.toString() || user?.email || 'unknown',
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Template saved', description: `"${name}" added — ${sectionsToSave.length} trade${sectionsToSave.length === 1 ? '' : 's'} captured.` });
      setSavingName('');
      setShowSaveForm(false);
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: BidPackageTemplate) => {
    if (!confirm(`Delete template "${t.name}"? This affects everyone in the company.`)) return;
    try {
      await deleteDoc(doc(db, 'bidPackageTemplates', t.id));
      toast({ title: 'Template deleted' });
    } catch (e: any) {
      toast({ title: 'Could not delete', description: e?.message || String(e), variant: 'destructive' });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" title={`${templates.length} saved template${templates.length === 1 ? '' : 's'}`}>
          <BookOpen className="w-3.5 h-3.5" />
          Templates
          {templates.length > 0 && (
            <span className="text-[10px] font-bold px-1 rounded" style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: '#8B6F3F' }}>
              {templates.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
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
                ? 'No bid templates yet. Fill in trades + scopes below and save your first one.'
                : 'No templates match the search.'}
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {filtered.map(t => (
                <div key={t.id} className="group flex items-start gap-2 px-3 py-2 hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => handleImport(t)}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm font-medium truncate text-gray-900">
                      <FileText className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" style={{ color: '#C9A96E' }} />
                      {t.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {(t.tradeSections || []).map(s => s.trade).filter(Boolean).join(' · ') || '(no trades)'}
                    </p>
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

        {/* Save current */}
        <div className="p-2 border-t" style={{ borderColor: '#E5E7EB' }}>
          {showSaveForm ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={savingName}
                  onChange={e => setSavingName(e.target.value)}
                  placeholder="Template name (e.g. 'Custom home spec build')"
                  className="flex-1 h-8 text-sm"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                />
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !savingName.trim()}
                  style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                  className="h-8 px-2 hover:opacity-90"
                >
                  <Save className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowSaveForm(false); setSavingName(''); }}
                  className="h-8 px-2"
                >
                  Cancel
                </Button>
              </div>
              <p className="text-[10px] text-gray-500 leading-snug">
                Saves the current trade names + scope text. Invited subs and due dates are project-specific and aren't included.
              </p>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSaveForm(true)}
              className="w-full justify-center text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Save current package as a template
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
