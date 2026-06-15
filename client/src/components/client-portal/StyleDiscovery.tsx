// Style Discovery — the client-facing blind preference flow.
//
// The client reacts to curated renderings with Like / Pass buttons. They flow
// EXTERIOR first, then interior rooms. The style NAME is never shown during the
// flow — only at the reveal at the end — so people pick what they actually love
// rather than the label they think they should pick.
//
// Everything is contact-scoped (clientContactId), so a lead can do this before a
// project exists. Reactions persist as they go (resume-friendly); finishing
// writes the computed style profile for designers.

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import {
  Heart,
  X,
  Sparkles,
  RotateCcw,
  Loader2,
  ChevronLeft,
  Check,
  Image as ImageIcon,
} from 'lucide-react';
import {
  DISCOVERY_ROOMS,
  roomLabel,
  styleSeed,
  subscribeStyleLibrary,
  subscribeReactions,
  saveReaction,
  computeProfile,
  saveStyleProfile,
  type StyleLibraryImage,
  type StyleReaction,
  type Reaction,
} from '@/lib/styleLibrary';

const GOLD = '#C9A96E';
const BLACK = '#141414';

interface Props {
  clientContactId: string;
  clientName?: string;
  /** Optional context only — Style Discovery is contact-scoped so it works
   *  before a project exists. Accepted so project-scoped callers can pass it. */
  projectId?: string;
}

// Stable pseudo-random key from an id so the deck order doesn't reshuffle on
// every render (which would make cards jump around).
function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export default function StyleDiscovery({ clientContactId, clientName }: Props) {
  const [images, setImages] = useState<StyleLibraryImage[]>([]);
  const [reactions, setReactions] = useState<StyleReaction[]>([]);
  const [libLoaded, setLibLoaded] = useState(false);
  const [reLoaded, setReLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(
    () =>
      subscribeStyleLibrary(
        (imgs) => {
          setImages(imgs);
          setLibLoaded(true);
        },
        () => setLibLoaded(true)
      ),
    []
  );
  useEffect(() => {
    if (!clientContactId) {
      setReLoaded(true);
      return;
    }
    return subscribeReactions(
      clientContactId,
      (rs) => {
        setReactions(rs);
        setReLoaded(true);
      },
      () => setReLoaded(true)
    );
  }, [clientContactId]);

  // Build the deck: room flow order (exterior first), styles interleaved within
  // each room via the stable hash so the client doesn't see the same look twice
  // in a row.
  const deck = useMemo<StyleLibraryImage[]>(() => {
    const active = images.filter((i) => i.active);
    const known = new Set(DISCOVERY_ROOMS.map((r) => r.id));
    const ordered: StyleLibraryImage[] = [];
    for (const r of DISCOVERY_ROOMS) {
      ordered.push(
        ...active
          .filter((i) => i.room === r.id)
          .sort((a, b) => hashKey(a.id) - hashKey(b.id))
      );
    }
    ordered.push(
      ...active
        .filter((i) => !known.has(i.room))
        .sort((a, b) => hashKey(a.id) - hashKey(b.id))
    );
    return ordered;
  }, [images]);

  const reactedById = useMemo(() => {
    const m = new Map<string, Reaction>();
    reactions.forEach((r) => m.set(r.imageId, r.reaction));
    return m;
  }, [reactions]);

  // Once data is in, jump to the first card they haven't reacted to (resume).
  useEffect(() => {
    if (started || !libLoaded || !reLoaded || deck.length === 0) return;
    const firstUnreacted = deck.findIndex((d) => !reactedById.has(d.id));
    setIdx(firstUnreacted === -1 ? deck.length : Math.max(0, firstUnreacted));
    setStarted(true);
  }, [started, libLoaded, reLoaded, deck, reactedById]);

  const total = deck.length;
  const answered = deck.filter((d) => reactedById.has(d.id)).length;
  const atEnd = started && idx >= total && total > 0;

  const profile = useMemo(() => computeProfile(reactions), [reactions]);

  const choose = async (reaction: Reaction) => {
    const card = deck[idx];
    const uid = auth.currentUser?.uid;
    if (!card || !uid || !clientContactId) {
      setIdx((i) => i + 1);
      return;
    }
    // Optimistic advance; persistence happens in the background.
    setIdx((i) => i + 1);
    try {
      await saveReaction(clientContactId, uid, card, reaction);
    } catch {
      /* listener will reconcile */
    }
  };

  const finish = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !clientContactId) {
      setShowResults(true);
      return;
    }
    setSaving(true);
    try {
      await saveStyleProfile(clientContactId, uid, computeProfile(reactions));
    } catch {
      /* non-fatal */
    }
    setSaving(false);
    setShowResults(true);
  };

  const restart = () => {
    setShowResults(false);
    setIdx(0);
  };

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (!libLoaded || !reLoaded) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
        <Sparkles
          className="h-9 w-9 mx-auto mb-3 opacity-40"
          style={{ color: GOLD }}
        />
        <p className="font-semibold text-gray-700">
          Your style cards are being prepared
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Your Skyeline team is curating images for you — check back shortly.
        </p>
      </div>
    );
  }

  // ── Results / reveal ────────────────────────────────────────────────────────
  if (showResults || atEnd) {
    const primary = profile.top[0];
    const secondary = profile.top[1];
    const seed = primary ? styleSeed(primary.styleId) : null;
    const likedImages = deck.filter((d) => reactedById.get(d.id) === 'like');

    return (
      <div className="space-y-6">
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-8 sm:px-9 sm:py-10"
          style={{
            background: `linear-gradient(135deg, ${BLACK} 0%, #1f1d1a 55%, #2a2419 100%)`,
          }}
        >
          <div
            className="pointer-events-none absolute -top-20 -right-12 h-60 w-60 rounded-full opacity-25 blur-3xl"
            style={{ backgroundColor: GOLD }}
          />
          <div className="relative">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
              style={{
                backgroundColor: 'rgba(201,169,110,0.15)',
                color: GOLD,
                letterSpacing: '0.16em',
              }}
            >
              <Sparkles className="h-3.5 w-3.5" /> Your Style Profile
            </div>
            {primary ? (
              <>
                <h2 className="mt-4 text-2xl sm:text-3xl font-bold text-white">
                  {clientName
                    ? `${clientName.split(' ')[0]}, you lean `
                    : 'You lean '}
                  <span style={{ color: GOLD }}>{primary.label}</span>
                </h2>
                {secondary && (
                  <p className="mt-2 text-sm text-gray-300">
                    with a{' '}
                    <span className="text-white font-medium">
                      {secondary.label}
                    </span>{' '}
                    influence
                  </p>
                )}
              </>
            ) : (
              <h2 className="mt-4 text-2xl font-bold text-white">
                Let's find your style
              </h2>
            )}
            <p className="mt-3 text-sm text-gray-400">
              Based on {profile.totalLikes} look
              {profile.totalLikes === 1 ? '' : 's'} you loved out of{' '}
              {profile.totalSeen} you reviewed.
            </p>
          </div>
        </div>

        {seed && primary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(
              [
                ['Materials', seed.materials],
                ['Colors', seed.colors],
                ['The feel', seed.mood],
              ] as const
            ).map(([label, vals]) => (
              <div
                key={label}
                className="rounded-xl border border-gray-200 bg-white p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  {label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {vals.map((v) => (
                    <span
                      key={v}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${GOLD}1f`, color: '#8a6a3a' }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Per-room lean — handy for designers, reassuring for clients */}
        {Object.keys(profile.byRoom).length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-bold text-gray-900 mb-3">
              Your lean, room by room
            </p>
            <div className="space-y-2">
              {DISCOVERY_ROOMS.filter((r) => profile.byRoom[r.id]?.length).map(
                (r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-600">{r.label}</span>
                    <span className="font-medium text-gray-900">
                      {profile.byRoom[r.id][0].label}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {likedImages.length > 0 && (
          <div>
            <p className="text-sm font-bold text-gray-900 mb-3">
              Looks you loved
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {likedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative rounded-lg overflow-hidden border border-gray-200 aspect-square"
                >
                  <img
                    src={img.imageUrl}
                    alt={roomLabel(img.room)}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={restart}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Start over
          </Button>
          <p className="text-xs text-gray-400">
            Your designer can see this profile and will use it to guide your
            selections.
          </p>
        </div>
      </div>
    );
  }

  // ── The deck (one card at a time) ───────────────────────────────────────────
  const card = deck[idx];
  const progressPct = total
    ? Math.round((Math.min(idx, total) / total) * 100)
    : 0;

  return (
    <div className="max-w-xl mx-auto">
      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span
            className="font-semibold uppercase tracking-wide"
            style={{ color: '#8a6a3a' }}
          >
            {card ? roomLabel(card.room) : ''}
          </span>
          <span>
            {Math.min(idx + 1, total)} of {total}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progressPct}%`, backgroundColor: GOLD }}
          />
        </div>
      </div>

      <p className="text-center text-sm text-gray-500 mb-3">
        Does this feel like{' '}
        <span className="font-medium text-gray-800">your home</span>? Go with
        your gut — there's no wrong answer.
      </p>

      {/* Card */}
      <div
        className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 shadow-sm"
        style={{ aspectRatio: '4 / 3' }}
      >
        {card?.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={roomLabel(card.room)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <ImageIcon className="h-10 w-10" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm">
            {card ? roomLabel(card.room) : ''}
          </span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-center gap-4 mt-5">
        <button
          onClick={() => choose('pass')}
          className="flex items-center gap-2 px-6 py-3 rounded-full border-2 border-gray-200 bg-white text-gray-600 font-semibold hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <X className="h-5 w-5" /> Not for me
        </button>
        <button
          onClick={() => choose('like')}
          className="flex items-center gap-2 px-7 py-3 rounded-full font-semibold shadow-sm transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: GOLD, color: BLACK }}
        >
          <Heart className="h-5 w-5" /> Love it
        </button>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between mt-5">
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          onClick={finish}
          disabled={saving || answered === 0}
          className="inline-flex items-center gap-1 text-xs font-medium disabled:opacity-40"
          style={{ color: '#8a6a3a' }}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {answered >= total
            ? 'See my style'
            : `Finish & see my style (${answered}/${total})`}
        </button>
      </div>
    </div>
  );
}
