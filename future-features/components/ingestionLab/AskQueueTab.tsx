// Ask Queue — cards with the brain's clarification question. Two actions:
//   Answer  — stamps clarificationAnswer on the processed item. The next
//             brain pass picks it up (Session 13 will wire re-pass; for the
//             spike, an answered item stays in Ask until the operator
//             chooses Approve/Reject).
//   Reject  — marks reviewStatus = 'rejected' so the item leaves the queue.

import { useMemo, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { HelpCircle, X, Send } from 'lucide-react';
import type { ProcessedItem, RawItem } from './types';

interface Props {
  items: ProcessedItem[];
  rawItems: RawItem[];
}

export function AskQueueTab({ items, rawItems }: Props) {
  const rawIndex = useMemo(() => {
    const m = new Map<string, RawItem>();
    for (const r of rawItems) m.set(r.id, r);
    return m;
  }, [rawItems]);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-gray-500">
          Ask queue is empty.
        </CardContent>
      </Card>
    );
  }

  const sorted = [...items].sort(
    (a, b) => timestampMillis(a.processedAt) - timestampMillis(b.processedAt),
  );

  return (
    <div className="space-y-4">
      {sorted.map((item) => (
        <AskCard key={item.id} item={item} raw={rawIndex.get(item.rawItemId)} />
      ))}
    </div>
  );
}

function AskCard({ item, raw }: { item: ProcessedItem; raw?: RawItem }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [answer, setAnswer] = useState(item.clarificationAnswer || '');
  const [busy, setBusy] = useState<string | null>(null);

  const docRef = doc(db, 'ingestion_lab', 'data', 'processed_items', item.id);

  async function submitAnswer() {
    if (!answer.trim()) {
      toast({ title: 'Type an answer first', variant: 'destructive' });
      return;
    }
    setBusy('answer');
    try {
      await updateDoc(docRef, {
        clarificationAnswer: answer.trim(),
        reviewedAt: serverTimestamp(),
        reviewedByUid: user?.firebaseUid || '',
      });
      toast({
        title: 'Answer saved',
        description: 'Next brain pass can pick it up. (Re-pass wiring lands in Session 13.)',
      });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    try {
      await updateDoc(docRef, {
        reviewStatus: 'rejected',
        reviewedAt: serverTimestamp(),
        reviewedByUid: user?.firebaseUid || '',
      });
      toast({ title: 'Rejected' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  const rawSnippet = (raw?.content || '').slice(0, 400);

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{item.source}</Badge>
          <Badge variant="outline">{item.projectId || 'unknown project'}</Badge>
          <Badge variant="outline">{(item.confidence * 100).toFixed(0)}% conf</Badge>
          <span className="text-xs text-gray-400 ml-auto">{formatTimestamp(item.processedAt)}</span>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-3">
          <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs uppercase tracking-wide text-amber-700">Brain asks</p>
            <p className="text-sm text-amber-900 mt-1">
              {item.clarificationQuestion || '(no question recorded)'}
            </p>
          </div>
        </div>

        {rawSnippet && (
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Raw context</p>
            <div className="bg-gray-50 border rounded p-3 text-xs whitespace-pre-wrap text-gray-700">
              {rawSnippet}
              {(raw?.content?.length || 0) > 400 && (
                <p className="text-gray-400 mt-2">[truncated…]</p>
              )}
            </div>
            {raw?.sourceMeta && (
              <p className="text-xs text-gray-500 mt-2">
                {raw.sourceMeta.fromEmail || raw.sourceMeta.fromPhone || raw.sourceMeta.fileName || ''}
              </p>
            )}
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Your answer</p>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer…"
            className="text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={submitAnswer}
            disabled={busy !== null}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
          >
            <Send className="w-4 h-4" /> {busy === 'answer' ? 'Saving…' : 'Submit Answer'}
          </Button>
          <Button
            variant="outline"
            onClick={reject}
            disabled={busy !== null}
            className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            <X className="w-4 h-4" /> {busy === 'reject' ? 'Saving…' : 'Reject'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimestamp(ts: any): string {
  if (!ts) return '';
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
  try { return new Date(ts).toLocaleString(); } catch { return ''; }
}
function timestampMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'number') return ts;
  try { return new Date(ts).getTime(); } catch { return 0; }
}
