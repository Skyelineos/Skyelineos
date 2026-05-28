import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Palette, ChevronRight, Sparkles } from 'lucide-react';
import { computeSelectionsProgress, type SelectionLike } from '@/lib/selectionsProgress';

/**
 * Compact selections-progress card for the GC project overview.
 *
 * Lets the GC see at a glance how far the homeowner is on selections —
 * same definition of "completed" + same color scale as the homeowner's
 * own progress bar in the client portal, so a 60%-gold reading on the
 * client side matches a 60%-gold reading on the GC side.
 *
 * Live — subscribes to projects/{id}/selections, so picks made in the
 * client portal update this card without a refresh.
 *
 * Click-through routes to /design-board, which is the GC-side
 * selections surface today.
 */

interface Props {
  projectId: string;
  /** Optional href override — defaults to /design-board which is the
   *  current GC selections surface. */
  href?: string;
}

export function SelectionsProgressCard({ projectId, href = '/design-board' }: Props) {
  const [progress, setProgress] = useState<{ completed: number; total: number; percent: number; toneHex: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    // Live subscription — picks in the client portal reflect here without
    // a refresh. We only need lifecycle / clientPreference / selectedOptionId
    // / gcApproved fields, but Firestore can't project subset reads cheaply,
    // so we just take the whole doc and let the helper read what it needs.
    const unsub = onSnapshot(
      collection(db, 'projects', projectId, 'selections'),
      (snap) => {
        const sels = snap.docs.map(d => d.data() as SelectionLike);
        setProgress(computeSelectionsProgress(sels));
        setError(null);
      },
      (err) => {
        console.warn('[selections-progress] subscribe failed', err);
        setError(err.message);
      },
    );
    return unsub;
  }, [projectId]);

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-[#C9A96E]" />
            Selections Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-red-600">Couldn't load selections — {error}</p>
        </CardContent>
      </Card>
    );
  }

  // Initial load — show a skeleton bar so the layout doesn't jump.
  if (!progress) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-[#C9A96E]" />
            Selections Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full rounded-full bg-gray-100 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const { completed, total, percent, toneHex } = progress;
  const done = percent === 100 && total > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4 text-[#C9A96E]" />
            Selections Progress
            {total > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {completed}/{total}
              </Badge>
            )}
          </CardTitle>
          <Link
            href={href}
            className="text-xs text-gray-500 hover:text-[#C9A96E] flex items-center gap-0.5"
            aria-label="Open selections board"
          >
            Open board <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {total === 0 ? (
          <p className="text-xs text-gray-400 italic py-1">
            No selections set up yet. Add selections from the design board and the homeowner will see them in their portal.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-heading font-semibold text-[#141414]">
                {percent}%
              </span>
              <span className="text-xs text-gray-500">
                {done ? 'Everything is in' : `${total - completed} left for the homeowner`}
              </span>
            </div>
            {/* Brand-toned bar — manually painted with the same toneHex
                the client-portal bar uses so visual progress reads
                identically across portals. */}
            <div className="relative h-3 w-full rounded-full overflow-hidden bg-gray-100">
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{ width: `${percent}%`, backgroundColor: toneHex }}
              />
            </div>
            {done && (
              <p className="text-xs text-green-700 flex items-center gap-1 pt-0.5">
                <Sparkles className="w-3 h-3" /> Homeowner has weighed in on every selection.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
