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
  const debounceRef = useRef<number | null>(null);

  // Load existing prefs.
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    let cancelled = false;
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
      } catch (e) {
        console.warn('[NotificationPrefsMatrix] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [uid]);

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
  if (!uid) {
    return <div className="text-sm text-muted-foreground">Sign in to manage notification preferences.</div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Choose how you want to hear about each kind of event. In-app and push are
        on by default; email and SMS are opt-in unless your administrator
        flipped the default. SMS STOP is always honored.
      </p>

      {/* Column header row */}
      <div className="grid grid-cols-[1fr_repeat(4,minmax(60px,auto))] gap-3 text-xs font-medium text-muted-foreground px-2">
        <span></span>
        {CHANNEL_COLUMNS.map(col => (
          <span key={col.key} className="text-center">{col.label}</span>
        ))}
      </div>

      {PREFS_CATEGORY_ORDER.map(cat => {
        const rows = grouped.get(cat) || [];
        if (rows.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <h4 className="text-sm font-semibold">{cat}</h4>
            <Separator />
            {rows.map(([kind, spec]) => (
              <div
                key={kind}
                className="grid grid-cols-[1fr_repeat(4,minmax(60px,auto))] items-center gap-3 px-2 py-2 rounded hover:bg-muted/50"
              >
                <Label htmlFor={`np-${kind}`} className="text-sm">{spec.label}</Label>
                {CHANNEL_COLUMNS.map(col => {
                  const inCatalog = spec.channels[col.key] !== undefined;
                  const checked = isChannelEnabledForUser(kind, col.key, prefs);
                  return (
                    <div key={col.key} className="flex justify-center">
                      <Switch
                        id={`np-${kind}-${col.key}`}
                        disabled={!inCatalog}
                        checked={inCatalog ? checked : false}
                        onCheckedChange={(v: boolean) => toggle(kind, col.key, v)}
                        aria-label={`${spec.label} — ${col.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
