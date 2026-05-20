// Web push notifications via Firebase Cloud Messaging. Handles permission,
// service-worker registration, token capture, and persisting the token to the
// signed-in user's Firestore doc so the notifications dispatcher can target
// it via admin.messaging().
//
// Activation requires a VAPID public key from Firebase Console → Project
// Settings → Cloud Messaging → Web Push certificates. Until that's set the
// helpers below return a clear "not configured" error so the UI can degrade.

import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, getDoc, setDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { app, db } from './firebase';

// VAPID public key from Firebase Console → Cloud Messaging → Web Push
// certificates. Public — safe to ship in the client bundle. Override via
// VITE_FCM_VAPID_KEY at build time if you regenerate the key pair.
const DEFAULT_VAPID = 'BGfsLlovUnVGKpjeM_dIRKn_ST1SYAh6GneUe107nts3eM1xkYu96zLdkVwAxWkhDK-iHMn9C2hUoFbp3dY8QRE';
const VAPID_KEY = ((import.meta.env as any).VITE_FCM_VAPID_KEY as string | undefined) || DEFAULT_VAPID;
const SW_PATH = '/firebase-messaging-sw.js';

export interface PushStatus {
  /** true when the browser supports the required APIs (SW + Notification + FCM) */
  supported: boolean;
  /** Notification.permission value */
  permission: NotificationPermission;
  /** True when VITE_FCM_VAPID_KEY is set at build time. */
  configured: boolean;
  /** The current FCM token if subscribed on this device. */
  token: string | null;
}

export async function pushStatus(): Promise<PushStatus> {
  const supported = (await isSupported().catch(() => false))
    && typeof Notification !== 'undefined'
    && 'serviceWorker' in navigator;
  return {
    supported,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    configured: !!VAPID_KEY,
    token: null,
  };
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH);
}

/**
 * Request notification permission, register the FCM service worker, get a
 * device token, and save it to the given user's Firestore doc under
 * `fcmTokens` (array union).
 *
 * Returns the token on success, throws a labelled error on failure so the
 * caller can show an actionable toast.
 */
export async function enablePushForUser(userDocPath: string): Promise<string> {
  if (!VAPID_KEY) throw new Error('Web push is not configured yet — admin needs to set the VAPID key.');
  if (!('Notification' in window)) throw new Error('This browser doesn\'t support web push notifications.');
  if (!('serviceWorker' in navigator)) throw new Error('Service workers aren\'t available in this browser.');
  const supported = await isSupported().catch(() => false);
  if (!supported) throw new Error('Web push isn\'t supported on this device. On iPhone, install Skyeline to your Home Screen first (Share → Add to Home Screen), then re-open and try again.');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was denied. Allow notifications in your browser settings to receive bid invites here.');

  const swReg = await ensureServiceWorker();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });
  if (!token) throw new Error('FCM did not return a token. Try again or check your browser\'s notification settings.');

  // Persist the token. arrayUnion is idempotent so we can call enable from
  // multiple devices for the same user without duplicates.
  const [collectionId, ...rest] = userDocPath.split('/');
  await setDoc(
    doc(db, collectionId, ...rest),
    {
      fcmTokens: arrayUnion(token),
      pushUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return token;
}

/**
 * Disable push on the current device — deletes the FCM token client-side
 * AND removes it from the user's `fcmTokens` array.
 */
export async function disablePushForUser(userDocPath: string): Promise<void> {
  try {
    const messaging = getMessaging(app);
    const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY || undefined } as any).catch(() => null);
    if (currentToken) {
      const [collectionId, ...rest] = userDocPath.split('/');
      await setDoc(
        doc(db, collectionId, ...rest),
        { fcmTokens: arrayRemove(currentToken), pushUpdatedAt: serverTimestamp() },
        { merge: true },
      );
      await deleteToken(messaging).catch(() => {});
    }
  } catch {
    // Best-effort — even if deleting the token fails locally, the user
    // experience is that they no longer get notifications.
  }
}

/**
 * Whether the given user doc has at least one FCM token registered. The UI
 * uses this to render "Already enabled on N devices" vs the enable button.
 */
export async function hasActivePushTokens(userDocPath: string): Promise<number> {
  try {
    const [collectionId, ...rest] = userDocPath.split('/');
    const snap = await getDoc(doc(db, collectionId, ...rest));
    if (!snap.exists()) return 0;
    const tokens = (snap.data() as any)?.fcmTokens;
    return Array.isArray(tokens) ? tokens.length : 0;
  } catch {
    return 0;
  }
}
