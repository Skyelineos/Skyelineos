import { useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';
import { Trash2, X, Save, Loader2 } from 'lucide-react';

export interface PlaybookEntry {
  id?: string;
  title: string;
  body: string;
  trade?: string;
  tags?: string[];
  category: 'best_practice' | 'delay_cause' | 'design_tip' | 'personal_home' | 'vendor_recommendation';
  surfaceTo?: ('team' | 'designer' | 'client')[];
  createdBy?: string;
  createdByName?: string;
}

const CATEGORY_OPTIONS: Array<{ value: PlaybookEntry['category']; label: string; desc: string }> = [
  { value: 'best_practice',         label: 'Best Practice',         desc: 'Something that went well — repeat it.' },
  { value: 'delay_cause',           label: 'Delay Cause',           desc: 'Something that bit us — avoid it.' },
  { value: 'design_tip',            label: 'Design Tip',            desc: 'Selection guidance for designers / clients.' },
  { value: 'personal_home',         label: 'Personal Home Build',   desc: 'Notes for your own future build.' },
  { value: 'vendor_recommendation', label: 'Vendor Recommendation', desc: 'A sub / product worth recommending.' },
];

const AUDIENCE_OPTIONS: Array<{ value: 'team' | 'designer' | 'client'; label: string }> = [
  { value: 'team',     label: 'Team / Superintendents' },
  { value: 'designer', label: 'Designers' },
  { value: 'client',   label: 'Clients (Design Selections)' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  editing: PlaybookEntry | null;
}

export function PlaybookEntryModal({ open, onClose, editing }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [trade, setTrade] = useState('');
  const [category, setCategory] = useState<PlaybookEntry['category']>('best_practice');
  const [surfaceTo, setSurfaceTo] = useState<PlaybookEntry['surfaceTo']>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title || '');
      setBody(editing.body || '');
      setTrade(editing.trade || '');
      setCategory(editing.category || 'best_practice');
      setSurfaceTo(editing.surfaceTo || []);
      setTags(editing.tags || []);
    } else {
      setTitle('');
      setBody('');
      setTrade('');
      setCategory('best_practice');
      setSurfaceTo([]);
      setTags([]);
    }
    setTagInput('');
  }, [open, editing]);

  const toggleAudience = (v: 'team' | 'designer' | 'client') => {
    setSurfaceTo(prev => {
      const arr = prev || [];
      return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
    });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Title and body required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        trade: trade.trim() || '',
        category,
        tags,
        surfaceTo: surfaceTo || [],
        updatedAt: serverTimestamp(),
      } as any;
      if (editing?.id) {
        await updateDoc(doc(db, 'playbookEntries', editing.id), payload);
      } else {
        await addDoc(collection(db, 'playbookEntries'), {
          ...payload,
          createdBy: user?.id?.toString() || user?.email || '',
          createdByName: user?.name || '',
          createdAt: serverTimestamp(),
        });
      }
      toast({ title: editing ? 'Entry updated' : 'Entry saved' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing?.id) return;
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'playbookEntries', editing.id));
      toast({ title: 'Entry deleted' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Playbook Entry' : 'New Playbook Entry'}</DialogTitle>
          <DialogDescription>
            Capture a best practice, delay cause, design tip, or recommendation. Only admins see the raw notes — surfacing to team/designer/client is on a roadmap.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="pb-title">Title <span className="text-red-500 font-bold">*</span></Label>
            <Input
              id="pb-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Pre-rocking pre-wire walk catches missed outlets"
            />
          </div>

          <div>
            <Label htmlFor="pb-body">Notes <span className="text-red-500 font-bold">*</span></Label>
            <Textarea
              id="pb-body"
              rows={6}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What happened, why it mattered, what to do next time…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pb-category">Category</Label>
              <Select value={category} onValueChange={v => setCategory(v as PlaybookEntry['category'])}>
                <SelectTrigger id="pb-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500 mt-1">
                {CATEGORY_OPTIONS.find(o => o.value === category)?.desc}
              </p>
            </div>
            <div>
              <Label>Trade (optional)</Label>
              <TradeTypeComboBox value={trade} onValueChange={setTrade} />
              <p className="text-[11px] text-gray-500 mt-1">
                Pick a trade so it surfaces when filtering by that scope.
              </p>
            </div>
          </div>

          <div>
            <Label>Surface To (future)</Label>
            <p className="text-[11px] text-gray-500 mb-1.5">
              Who should eventually see this. Surfacing isn't wired into client/designer views yet — tag it now so it lands automatically when we wire it up.
            </p>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTIONS.map(o => {
                const active = (surfaceTo || []).includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleAudience(o.value)}
                    className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                      active
                        ? 'bg-[#C9A96E] text-white border-[#C9A96E]'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Press Enter to add"
              />
              <Button type="button" variant="outline" onClick={addTag} disabled={!tagInput.trim()}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(t => (
                  <Badge key={t} variant="secondary" className="gap-1 pr-1">
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(prev => prev.filter(x => x !== t))}
                      className="ml-0.5 hover:bg-black/10 rounded p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t pt-4 mt-2">
          {editing && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="mr-auto text-red-700 border-red-300 hover:bg-red-50 gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
