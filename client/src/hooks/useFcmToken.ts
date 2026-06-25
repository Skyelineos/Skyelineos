// FCM token registration hook — newer, React-friendly companion to
// `client/src/lib/push-notifications.ts`.
//
// Two storage patterns coexist for FCM tokens:
//   1. Legacy: `users/{uid}.fcmTokens` (array) — written by enablePushButton
//   2. New:    `users/{uid}/fcmTokens/{token}` (subcollection) — written here
//
// Both are read by the notification dispatcher so existing devices keep
// working while new opt-ins use the richer subcollection schema (per-doc
// platform / userAgent / active flag for token hygiene).
//
// The hook also tracks a localStorage dismiss flag so the
// PushNotificationPrompt banner doesn't re-appear after the user clicks
// "Maybe Later".

import { useState, useEffect, useCallback } from 'react';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, serverTimestamp, setDoc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase';
import { useAuth } from '@/auth/AuthContext';

// Fall back to the legacy default VAPID key so dev/staging keep working
// even when `.env` is missing — push-notifications.ts has the same fallback.
const FALLBACK_VAPID = 'BGfsLlovUnVGKpjeM_dIRKn_ST1SYAh6GneUe107nts3eM1xkYu96zLdkVwAxWkhDK-iHMn9C2hUoFbp3dY8QRE';
const VAPID_KEY = (import.meta.env as any).VITE_FIREBASE_VAPID_KEY
  || (import.meta.env as any).VITE_FCM_VAPID_KEY
  || FALLBACK_VAPID;

const DISMISSED_KEY = 'fcm_prompt_dismissed';
const SW_PATH = '/firebase-messaging-sw.js';

/**
 * Resolve the Firebase Auth UID. The legacy `BackendUser` type carries
 * `firebaseUid` explicitly; at runtime `user.id` is also the Auth UID
 * (see AuthContext T0-3 note), so prefer `firebaseUid` and fall back to
 * the stringified `id`.
 */
function resolveUid(user: { firebaseUid?: string; id?: number | string } | null): string | null {
  if (!user) return null;
  if (user.firebaseUid) return user.firebaseUid;
  if (user.id !== undefined && user.id !== null) return String(user.id);
  return null;
}

export function useFcmToken() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const saveToken = useCallback(async (fcmToken: string, uid: string) => {
    // Write to the array field on the user doc — covered by the existing
    // users/{uid} write rule. The subcollection path has no rule yet.
    await updateDoc(doc(db, 'users', uid), {
      fcmTokens: arrayUnion(fcmToken),
      pushUpdatedAt: serverTimestamp(),
    });
  }, []);

  const requestPermission = useCallback(async () => {
    const uid = resolveUid(user);
    if (!uid) { setError('Not signed in'); return; }
    setError(null);
    setRegistering(true);
    try {
      // Check browser support
      if (typeof Notification === 'undefined') {
        setError('Notifications not supported on this browser');
        return;
      }

      const supported = await isSupported().catch(() => false);
      if (!supported) {
        // iOS PWA sometimes fails isSupported() — try anyway
        console.warn('FCM isSupported() returned false, attempting anyway');
      }

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError('Permission denied — enable notifications in iOS Settings → Skyeline');
        return;
      }

      // Register service worker
      let swReg: ServiceWorkerRegistration;
      try {
        const existing = await navigator.serviceWorker.getRegistration('/');
        swReg = existing || await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('SW timeout')), 8000))
        ]);
      } catch (err: any) {
        setError(`Service worker error: ${err?.message || err}`);
        return;
      }

      // Get FCM token
      let fcmToken: string;
      try {
        const messaging = getMessaging(app);
        fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });
      } catch (err: any) {
        setError(`Token error: ${err?.message || err}`);
        return;
      }

      if (!fcmToken) {
        setError('No token returned — check VAPID key or try again');
        return;
      }

      setToken(fcmToken);
      await saveToken(fcmToken, uid);
      setError(null);
    } catch (e: any) {
      setError(`Failed: ${e?.message || String(e)}`);
      console.warn('FCM token error:', e);
    } finally {
      setRegistering(false);
    }
  }, [user, saveToken]);

  // Auto-register if the user previously granted permission — keeps the
  // subcollection in sync after sign-in / fresh device installs.
  useEffect(() => {
    if (permission === 'granted' && resolveUid(user) && !token) {
      void requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.firebaseUid, user?.id]);

  const isDismissed = useCallback(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(DISMISSED_KEY) === '1',
    [],
  );
  const dismiss = useCallback(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(DISMISSED_KEY, '1');
  }, []);

  return { permission, token, error, registering, requestPermission, isDismissed, dismiss };
}
