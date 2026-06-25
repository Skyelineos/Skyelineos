// Per-user notification preferences matrix.
//
// Reads/writes users/{uid}.notificationPrefs[kind][channel] = boolean. Defaults
// come from shared/notifications-catalog.ts (catalog 'default' = ON unless the
// user opts out, 'opt_in' = OFF unless the user opts in). Writes are debounced
// 500ms so dragging a row of checkboxes doesn't fire a Firestore write per tick.

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/auth/AuthContext';
import {
  TRIGGER_KINDS,
  PREFS_CATEGORY_ORDER,
  isChannelEnabledForUser,
  type TriggerKind,
  type ChannelKind,
  type UserNotificationPrefs,
  type TriggerKindSpec,
} from '@shared/notifications-catalog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

const CHANNEL_COLUMNS: { key: ChannelKind; label: string }[] = [
  { key: 'in_app', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'Text' },
  { key: 'push', label: 'Push' },
];

export function NotificationPrefsMatrix() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const [prefs, setPrefs] = useState<UserNotificationPrefs>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const debounceRef = useRef<number | null>(null);

  // Load existing prefs. A 5s timeout flips to a retryable error state so the
  // dialog doesn't sit on "Loading…" forever if Firestore is unreachable.
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      setLoadFailed(true);
    }, 5000);
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (cancelled) return;
        const raw = (snap.data() as any)?.notificationPrefs || {};
        // The legacy shape also lived under notificationPrefs (email/sms top-level
        // + kinds.*); the new shape keys directly off TriggerKind. Filter to
        // only the kind-shaped entries.
        const cleaned: UserNotificationPrefs = {};
        for (const k of Object.keys(raw)) {
          if (k in TRIGGER_KINDS && raw[k] && typeof raw[k] === 'object') {
            cleaned[k as TriggerKind] = raw[k];
          }
        }
        setPrefs(cleaned);
        setLoadFailed(false);
      } catch (e) {
        console.warn('[NotificationPrefsMatrix] load failed', e);
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [uid, reloadKey]);

  // Debounced Firestore write.
  const persist = (next: UserNotificationPrefs) => {
    if (!uid) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const payload: Record<string, any> = {};
      // Stamp SMS consent the first time a user enables ANY SMS row.
      const anySmsTurnedOn = Object.values(next).some(p => p?.sms === true);
      for (const [k, v] of Object.entries(next)) payload[k] = v;
      setDoc(doc(db, 'users', uid), {
        notificationPrefs: payload,
        ...(anySmsTurnedOn ? { smsConsentAt: serverTimestamp(), smsConsentSource: 'self_settings_matrix' } : {}),
      }, { merge: true }).catch((e: unknown) => {
        console.warn('[NotificationPrefsMatrix] save failed', e);
      });
    }, 500);
  };

  const toggle = (kind: TriggerKind, channel: ChannelKind, value: boolean) => {
    setPrefs(prev => {
      const next: UserNotificationPrefs = {
        ...prev,
        [kind]: { ...(prev[kind] || {}), [channel]: value },
      };
      persist(next);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const out = new Map<TriggerKindSpec['category'], [TriggerKind, TriggerKindSpec][]>();
    for (const cat of PREFS_CATEGORY_ORDER) out.set(cat, []);
    for (const [k, spec] of Object.entries(TRIGGER_KINDS)) {
      out.get(spec.category)!.push([k as TriggerKind, spec]);
    }
    return out;
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading notification preferences…</div>;
  }
  if (loadFailed) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted-foreground">
          Couldn't load preferences — tap to retry.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setReloadKey(k => k + 1)}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!uid) {
    return <div className="text-sm text-muted-foreground">Sign in to manage notification preferences.</div>;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Choose how you hear about each event. SMS STOP always honored.
      </p>

      {PREFS_CATEGORY_ORDER.map(cat => {
        const rows = grouped.get(cat) || [];
        if (rows.length === 0) return null;
        return (
          <div key={cat} className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pb-1">{cat}</h4>
            <Separator />
            {rows.map(([kind, spec]) => (
              <div key={kind} className="py-2.5 border-b border-gray-100 last:border-0">
                {/* Label row */}
                <p className="text-sm font-medium text-gray-800 mb-2">{spec.label}</p>
                {/* Channel toggles in a responsive row */}
                <div className="flex flex-wrap gap-3">
                  {CHANNEL_COLUMNS.map(col => {
                    const inCatalog = spec.channels[col.key] !== undefined;
                    const checked = isChannelEnabledForUser(kind, col.key, prefs);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center gap-1.5 text-xs select-none ${
                          inCatalog ? 'text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
                        }`}
                      >
                        <Switch
                          id={`np-${kind}-${col.key}`}
                          disabled={!inCatalog}
                          checked={inCatalog ? checked : false}
                          onCheckedChange={(v: boolean) => toggle(kind, col.key, v)}
                          aria-label={`${spec.label} — ${col.label}`}
                          className="scale-90"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
