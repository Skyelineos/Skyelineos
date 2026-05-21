// Review Queue — one card per pending item. Approve / Correct / Reject.
// Writes only the five whitelisted fields: reviewStatus, reviewedAt,
// reviewedByUid, correction, clarificationAnswer. Anything else is blocked
// by the Firestore rule at firestore.rules processed_items match.

import { useMemo, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Check, X, Pencil } from 'lucide-react';
import type { ProcessedItem, RawItem } from './types';

interface Props {
  items: ProcessedItem[];
  rawItems: RawItem[];
}

export function ReviewQueueTab({ items, rawItems }: Props) {
  const rawIndex = useMemo(() => {
    const m = new Map<string, RawItem>();
    for (const r of rawItems) m.set(r.id, r);
    return m;
  }, [rawItems]);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-gray-500">
          Review queue is empty.
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
        <ReviewCard key={item.id} item={item} raw={rawIndex.get(item.rawItemId)} />
      ))}
    </div>
  );
}

function ReviewCard({ item, raw }: { item: ProcessedItem; raw?: RawItem }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [draft, setDraft] = useState(() => JSON.stringify(item.structuredPayload || {}, null, 2));

  const docRef = doc(db, 'ingestion_lab', 'data', 'processed_items', item.id);

  async function setReview(status: 'approved' | 'rejected') {
    setBusy(status);
    try {
      await updateDoc(docRef, {
        reviewStatus: status,
        reviewedAt: serverTimestamp(),
        reviewedByUid: user?.firebaseUid || '',
      });
      toast({ title: status === 'approved' ? 'Approved' : 'Rejected' });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function submitCorrection() {
    setBusy('corrected');
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(draft);
      } catch {
        toast({ title: 'Invalid JSON', description: 'Fix the correction JSON and retry.', variant: 'destructive' });
        setBusy(null);
        return;
      }
      await updateDoc(docRef, {
        reviewStatus: 'corrected',
        reviewedAt: serverTimestamp(),
        reviewedByUid: user?.firebaseUid || '',
        correction: parsed,
      });
      toast({ title: 'Correction saved' });
      setCorrectOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  const rawSnippet = (raw?.content || '').slice(0, 600);
  const truncated = (raw?.content?.length || 0) > 600;

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">{item.category.replace(/_/g, ' ')}</Badge>
          <Badge variant="outline">{item.source}</Badge>
          <Badge variant="outline">{item.projectId || 'no project'}</Badge>
          <Badge variant="outline">{(item.confidence * 100).toFixed(0)}% conf</Badge>
          <span className="text-xs text-gray-400 ml-auto">{formatTimestamp(item.processedAt)}</span>
        </div>

        {item.confidenceReason && (
          <p className="text-xs text-gray-500 italic">{item.confidenceReason}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Raw</p>
            <div className="bg-gray-50 border rounded p-3 text-xs whitespace-pre-wrap text-gray-700">
              {rawSnippet || <span className="text-gray-400">(no raw content)</span>}
              {truncated && <p className="text-gray-400 mt-2">[truncated…]</p>}
            </div>
            {raw?.sourceMeta && (
              <p className="text-xs text-gray-500 mt-2">
                {raw.sourceMeta.subject ? `Subject: ${raw.sourceMeta.subject} · ` : ''}
                {raw.sourceMeta.fromEmail || raw.sourceMeta.fromPhone || raw.sourceMeta.fileName || ''}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Extracted payload</p>
            <pre className="bg-gray-50 border rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(item.structuredPayload || {}, null, 2)}
            </pre>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setReview('approved')}
            disabled={busy !== null}
            className="gap-2 text-white"
            style={{ backgroundColor: '#22c55e' }}
          >
            <Check className="w-4 h-4" /> {busy === 'approved' ? 'Saving…' : 'Approve'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setCorrectOpen(true)}
            disabled={busy !== null}
            className="gap-2"
          >
            <Pencil className="w-4 h-4" /> Correct
          </Button>
          <Button
            variant="outline"
            onClick={() => setReview('rejected')}
            disabled={busy !== null}
            className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            <X className="w-4 h-4" /> {busy === 'rejected' ? 'Saving…' : 'Reject'}
          </Button>
        </div>

        <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Correct extracted payload</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-gray-500">
              Edit the JSON below. Saved as <code>correction</code> on the processed item;
              <code> reviewStatus</code> becomes <code>corrected</code>.
            </p>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-xs h-72"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCorrectOpen(false)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button
                onClick={submitCorrection}
                disabled={busy !== null}
                className="text-white"
                style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              >
                {busy === 'corrected' ? 'Saving…' : 'Save correction'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
