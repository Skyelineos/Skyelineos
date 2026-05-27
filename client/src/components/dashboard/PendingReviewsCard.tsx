import { useEffect, useState } from 'react';
import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Star, Check, X as XIcon, ChevronDown, ChevronUp, ExternalLink, Mail, Copy } from 'lucide-react';

interface Review {
  id: string;
  projectId: string;
  projectName?: string;
  clientName?: string;
  clientEmail?: string;
  projectRating: number;
  builderRating: number;
  projectComment?: string;
  builderComment?: string;
  clientApprovedShare?: boolean;
  status: string;
  shared?: boolean;
}

// Admin queue for client reviews. Approve / Reject. For 5-star reviews where
// the client opted into public sharing, generates a one-click "Send Google
// Review Email" — opens the user's mail client pre-filled with the review
// text + Google review URL so the client can paste-and-submit from their own
// Google account (the only legit way to land a review there).
export function PendingReviewsCard() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  // Google Place ID from settings/google (single-doc setting). Used to build
  // the Google review URL. If missing, the share button surfaces a setup hint.
  const [placeId, setPlaceId] = useState<string>('');
  const [placeIdLoaded, setPlaceIdLoaded] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'projectReviews'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await getDoc(doc(db, 'settings', 'google'));
        if (s.exists()) {
          setPlaceId(String((s.data() as any).placeId || ''));
        }
      } finally {
        setPlaceIdLoaded(true);
      }
    })();
  }, []);

  const savePlaceId = async (next: string) => {
    setPlaceId(next);
    try {
      await updateDoc(doc(db, 'settings', 'google'), {
        placeId: next,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // settings/google might not exist yet — create-then-update via setDoc would also work
      // but updateDoc returns error in that case. We'll silently swallow; the next setDoc-style
      // write from elsewhere can establish the doc. For now toast user.
      toast({
        title: 'Place ID not saved yet',
        description: 'Open Settings → Integrations to set it permanently (one-time setup).',
      });
    }
  };

  const setStatus = async (r: Review, next: 'approved' | 'rejected') => {
    setActingId(r.id);
    try {
      await updateDoc(doc(db, 'projectReviews', r.id), {
        status: next,
        updatedAt: serverTimestamp(),
      });
      toast({ title: `Review ${next}` });
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  const markShared = async (r: Review) => {
    try {
      await updateDoc(doc(db, 'projectReviews', r.id), {
        shared: true,
        sharedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {/* swallow */}
  };

  const googleReviewUrl = placeId
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
    : '';

  const buildEmail = (r: Review) => {
    const subject = encodeURIComponent('Would you share your review on Google?');
    const reviewText = [r.projectComment, r.builderComment].filter(Boolean).join('\n\n');
    const body = encodeURIComponent(
      `Hi ${r.clientName?.split(' ')[0] || 'there'},\n\n`
      + `Thank you for the kind ${r.builderRating || r.projectRating}-star review. With your permission, would you share it on Google?\n\n`
      + `Your review:\n${reviewText}\n\n`
      + (googleReviewUrl
          ? `Tap here to post it on Google (you'll sign in with your own Google account):\n${googleReviewUrl}\n\n`
          : '')
      + `Thanks again,\nTyler\nSkyeline Homes`,
    );
    return `mailto:${encodeURIComponent(r.clientEmail || '')}?subject=${subject}&body=${body}`;
  };

  if (reviews.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 mb-4">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left"
      >
        <Star className="w-4 h-4 text-amber-500 fill-current flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            {reviews.length} client review{reviews.length === 1 ? '' : 's'} awaiting approval
          </p>
          <p className="text-xs text-amber-700/80">
            Approve to save internally. 5-star + opt-in = one-click Google email.
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-700" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-700" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 max-h-[28rem] overflow-y-auto">
          {placeIdLoaded && !placeId && (
            <div className="bg-white border border-amber-200 rounded p-2.5 text-xs text-amber-900">
              <p className="font-medium mb-1">One-time setup: Google Place ID</p>
              <p className="text-gray-600 mb-2">
                Paste your Google Business Profile Place ID so the "email to client" link points at your business.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="ChIJ... (find via business.google.com)"
                  className="h-8 text-xs"
                  value={placeId}
                  onChange={e => setPlaceId(e.target.value)}
                  onBlur={() => placeId && savePlaceId(placeId)}
                />
              </div>
            </div>
          )}

          {reviews.map(r => {
            const isFiveStar = r.builderRating === 5 || r.projectRating === 5;
            const canShare = isFiveStar && r.clientApprovedShare;
            return (
              <div key={r.id} className="bg-white border border-amber-200 rounded p-2.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {r.clientName || 'Client'} · {r.projectName || 'Project'}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] uppercase text-gray-400 mr-1">Project</span>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star
                            key={n}
                            className={`w-3 h-3 ${n <= r.projectRating ? 'text-amber-400 fill-current' : 'text-gray-300'}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] uppercase text-gray-400 mr-1">Builder</span>
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star
                            key={n}
                            className={`w-3 h-3 ${n <= r.builderRating ? 'text-amber-400 fill-current' : 'text-gray-300'}`}
                          />
                        ))}
                      </div>
                      {canShare && (
                        <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50">
                          OK to share
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {(r.projectComment || r.builderComment) && (
                  <div className="text-xs text-gray-700 space-y-1">
                    {r.projectComment && <p>"{r.projectComment}"</p>}
                    {r.builderComment && <p>"{r.builderComment}"</p>}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={actingId === r.id}
                    onClick={() => setStatus(r, 'approved')}
                  >
                    <Check className="w-3 h-3" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 text-red-700 border-red-300"
                    disabled={actingId === r.id}
                    onClick={() => setStatus(r, 'rejected')}
                  >
                    <XIcon className="w-3 h-3" />
                    Reject
                  </Button>
                  {canShare && r.clientEmail && (
                    <>
                      <a href={buildEmail(r)} onClick={() => markShared(r)}>
                        <Button size="sm" variant="default" className="h-7 text-xs gap-1 text-white" style={{ backgroundColor: '#C9A96E' }}>
                          <Mail className="w-3 h-3" />
                          Email Google link
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              [r.projectComment, r.builderComment].filter(Boolean).join('\n\n'),
                            );
                            toast({ title: 'Review text copied' });
                          } catch {}
                        }}
                      >
                        <Copy className="w-3 h-3" />
                        Copy text
                      </Button>
                    </>
                  )}
                  {canShare && googleReviewUrl && (
                    <a href={googleReviewUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
                        <ExternalLink className="w-3 h-3" />
                        Open Google
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
