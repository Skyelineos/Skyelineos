// Designer-side view of a client's Style Discovery result.
//
// Reads the contact-scoped style profile + reactions the client produced in the
// blind like/pass flow, and joins liked reactions back to the curated library so
// the designer can SEE exactly which renderings landed. This is the payoff of the
// exercise: the designer knows what the client leans toward before recommending.

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Sparkles, Heart, Loader2 } from 'lucide-react';
import {
  subscribeStyleProfile,
  subscribeReactions,
  subscribeStyleLibrary,
  DISCOVERY_ROOMS,
  roomLabel,
  type StyleProfile,
  type StyleReaction,
  type StyleLibraryImage,
} from '@/lib/styleLibrary';

const GOLD = '#C9A96E';

interface Props {
  projectId: string;
  /** Pass directly if known; otherwise resolved from the project's client link. */
  clientContactId?: string;
}

export function StyleProfileCard({ projectId, clientContactId }: Props) {
  const [contactId, setContactId] = useState<string>(clientContactId || '');
  const [resolving, setResolving] = useState(!clientContactId);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [reactions, setReactions] = useState<StyleReaction[]>([]);
  const [library, setLibrary] = useState<StyleLibraryImage[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Resolve the client's contact id from the project if not supplied.
  useEffect(() => {
    if (clientContactId) {
      setContactId(clientContactId);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        const data = snap.data() as any;
        const cid = data?.clientIds?.[0] || data?.clientId || '';
        if (!cancelled) setContactId(cid);
      } catch {
        /* leave empty */
      }
      if (!cancelled) setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, clientContactId]);

  useEffect(() => {
    if (!contactId) return;
    const u1 = subscribeStyleProfile(
      contactId,
      (p) => {
        setProfile(p);
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    const u2 = subscribeReactions(contactId, setReactions, () => {});
    const u3 = subscribeStyleLibrary(setLibrary, () => {});
    return () => {
      u1();
      u2();
      u3();
    };
  }, [contactId]);

  const libById = useMemo(() => {
    const m = new Map<string, StyleLibraryImage>();
    library.forEach((i) => m.set(i.id, i));
    return m;
  }, [library]);

  const likedImages = useMemo(
    () =>
      reactions
        .filter((r) => r.reaction === 'like')
        .map((r) => libById.get(r.imageId))
        .filter(Boolean) as StyleLibraryImage[],
    [reactions, libById]
  );

  const hasData = !!profile && (profile.top?.length || 0) > 0;

  if (resolving || (contactId && !loaded)) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-center text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${GOLD}22` }}
        >
          <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
        </div>
        <h3 className="text-sm font-bold text-gray-900">
          Client Style Profile
        </h3>
        {hasData && profile?.completedAt && (
          <span className="ml-auto text-[11px] text-gray-400">
            from Style Discovery
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-sm text-gray-400 py-3">
          This client hasn't completed Style Discovery yet — once they do, their
          style lean and the looks they loved show here.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Headline lean */}
          <div>
            <p className="text-lg font-bold text-gray-900">
              Leans{' '}
              <span style={{ color: '#8a6a3a' }}>{profile!.top[0].label}</span>
              {profile!.top[1] && (
                <span className="text-gray-500 font-normal text-sm">
                  {' '}
                  · {profile!.top[1].label} influence
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {profile!.totalLikes} loved of {profile!.totalSeen} reviewed
            </p>
          </div>

          {/* Ranked styles */}
          <div className="flex flex-wrap gap-1.5">
            {profile!.top.slice(0, 5).map((t, i) => (
              <span
                key={t.styleId}
                className={`text-xs px-2 py-0.5 rounded-full ${i === 0 ? 'font-semibold' : ''}`}
                style={{
                  backgroundColor: i === 0 ? GOLD : `${GOLD}1f`,
                  color: i === 0 ? '#141414' : '#8a6a3a',
                }}
              >
                {t.label} · {Math.round(t.score * 100)}%
              </span>
            ))}
          </div>

          {/* Per-room lean */}
          {Object.keys(profile!.byRoom || {}).length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Room by room
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {DISCOVERY_ROOMS.filter(
                  (r) => profile!.byRoom[r.id]?.length
                ).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-500">{r.label}</span>
                    <span className="font-medium text-gray-800">
                      {profile!.byRoom[r.id][0].label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Looks they loved */}
          {likedImages.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1">
                <Heart className="h-3 w-3" style={{ color: GOLD }} /> Loved (
                {likedImages.length})
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {likedImages.slice(0, 18).map((img) => (
                  <div
                    key={img.id}
                    className="relative rounded-md overflow-hidden border border-gray-200 aspect-square"
                    title={`${img.styleLabel} · ${roomLabel(img.room)}`}
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.styleLabel}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
