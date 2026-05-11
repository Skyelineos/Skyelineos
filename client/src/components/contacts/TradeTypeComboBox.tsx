import * as React from 'react';
import { useEffect, useState } from 'react';
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ComboBox } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';

interface Trade {
  id: string;
  name: string;
  isActive?: boolean;
}

interface Props {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string;
}

// Inline-create combobox for trades. Reads `trades` collection in real time;
// typing a brand-new value adds it to the global list immediately so the next
// contact you create can pick it without leaving the form.
export function TradeTypeComboBox({ value, onValueChange, className }: Props) {
  const { toast } = useToast();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('name'));
    const unsub = onSnapshot(
      q,
      snap => {
        setTrades(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const activeNames = trades
    .filter(t => t.isActive !== false)
    .map(t => t.name)
    .sort((a, b) => a.localeCompare(b));

  const handle = async (newValue: string) => {
    const trimmed = (newValue || '').trim();
    if (!trimmed) {
      onValueChange('');
      return;
    }
    const exists = activeNames.some(n => n.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      try {
        await addDoc(collection(db, 'trades'), {
          name: trimmed,
          description: 'Added from contact form',
          category: 'Construction',
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Trade added', description: `Created "${trimmed}"` });
      } catch (e: any) {
        toast({
          title: 'Could not add trade',
          description: e?.message || 'Failed to create trade',
          variant: 'destructive',
        });
      }
    }
    onValueChange(trimmed);
  };

  return (
    <ComboBox
      options={activeNames}
      value={value}
      onValueChange={handle}
      placeholder={loading ? 'Loading trades…' : 'Select or type a trade…'}
      searchPlaceholder="Search trades…"
      className={className}
      allowCustom={true}
      emptyMessage="No trades yet — type to add one."
      disabled={loading}
    />
  );
}
