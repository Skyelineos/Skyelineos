import { useState, useMemo } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Star, Search } from 'lucide-react';
import { SELECTIONS_TEMPLATE, groupByCategory } from '@/data/selectionsTemplate';

interface Props {
  contactId: string;
  contactName: string;
  initial: string[];
  open: boolean;
  onClose: () => void;
}

/**
 * Lets a GC tag a contact (sub/vendor) as preferred for one or more selection
 * categories. When a designer hits "Request bid" on a selection in that
 * category, this contact is offered as a recipient.
 *
 * Categories come from the standard selections template (one row per
 * category/subcategory combo). The GC can pick at any granularity.
 */
export default function PreferredCategoriesEditor({ contactId, contactName, initial, open, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => groupByCategory(), []);
  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const filteredCats = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return categories;
    return categories.filter(c => c.toLowerCase().includes(s));
  }, [categories, search]);

  const toggle = (cat: string) => {
    const next = new Set(picked);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    setPicked(next);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateDoc(doc(db, 'contacts', contactId), {
        preferredCategories: Array.from(picked).sort(),
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['preferred-vendors'] });
      toast({ title: 'Saved', description: `${picked.size} preferred categor${picked.size === 1 ? 'y' : 'ies'} for ${contactName}` });
      onClose();
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e?.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> Preferred categories — {contactName}</DialogTitle>
          <DialogDescription>
            Pick the selection categories this vendor should be asked to bid on. When the designer requests a bid for any of these, this contact shows up in the vendor picker.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Badge variant="outline">{picked.size} selected</Badge>
        </div>

        <div className="flex-1 overflow-y-auto border rounded p-3 space-y-1">
          {filteredCats.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No matching categories.</div>
          ) : filteredCats.map(cat => (
            <label key={cat} className="flex items-center justify-between gap-2 py-1 cursor-pointer hover:bg-muted/30 rounded px-1">
              <span className="flex items-center gap-2">
                <Checkbox checked={picked.has(cat)} onCheckedChange={() => toggle(cat)} />
                <span className="text-sm">{cat}</span>
              </span>
              <span className="text-xs text-muted-foreground">{grouped[cat]?.length || 0} items</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Save {picked.size} preferred categor{picked.size === 1 ? 'y' : 'ies'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
