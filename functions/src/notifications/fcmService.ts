// FCM helper that reads tokens from the **subcollection** schema
// (`users/{uid}/fcmTokens/{token}`) written by useFcmToken.ts.
//
// The legacy array schema (`users/{uid}.fcmTokens: string[]`) is still
// handled inside dispatch.ts directly. Until every device has rotated to
// the new schema we keep both code paths so notifications fan out to all
// known devices for a user.
//
// All errors are logged and swallowed — push is best-effort, never blocks
// the primary email/SMS channels.

import * as admin from 'firebase-admin';

export interface PushNotificationInput {
  title: string;
  body: string;
  /** Deep link path appended to the app base URL. */
  url?: string;
  /** Extra string-only fields delivered alongside the notification. */
  data?: Record<string, string>;
}

interface TokenRecord {
  uid: string;
  token: string;
}

export async function sendPushNotification(
  db: FirebaseFirestore.Firestore,
  userIds: string[],
  notification: PushNotificationInput,
): Promise<void> {
  if (!userIds.length) return;
  try {
    // Collect (uid, token) pairs for every active subscription so we can
    // disable the right doc later if a token comes back stale.
    const records: TokenRecord[] = [];
    await Promise.all(userIds.map(async (uid) => {
      try {
        const snap = await db
          .collection('users').doc(uid)
          .collection('fcmTokens')
          .where('active', '==', true)
          .get();
        snap.docs.forEach((d) => {
          const t = (d.data() as any)?.token;
          if (typeof t === 'string' && t.length > 0) records.push({ uid, token: t });
        });
      } catch (e: any) {
        console.warn(`[fcmService] token fetch failed for uid=${uid}: ${e?.message || e}`);
      }
    }));

    if (!records.length) return;

    const tokens = records.map((r) => r.token);
    const url = notification.url || '/';

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: { title: notification.title, body: notification.body },
      data: { url, ...(notification.data || {}) },
      webpush: {
        fcmOptions: { link: url },
        notification: { icon: 'https://skyelineos.web.app/favicon.ico' },
      },
    };

    const result = await admin.messaging().sendEachForMulticast(message);

    // Mark stale tokens inactive so future calls skip them. Each doc id is
    // the token string, so we can address it directly without scanning.
    const staleOps: Promise<void>[] = [];
    result.responses.forEach((resp, i) => {
      if (resp.success) return;
      const code = (resp.error as any)?.code || '';
      if (
        code === 'messaging/registration-token-not-registered'
        || code.includes('invalid-registration-token')
      ) {
        const { uid, token } = records[i];
        staleOps.push((async () => {
          try {
            await db.collection('users').doc(uid).collection('fcmTokens').doc(token)
              .update({ active: false });
          } catch {
            // best-effort
          }
        })());
      } else if (resp.error) {
        console.warn(`[fcmService] push failed for token #${i}: ${resp.error.message}`);
      }
    });
    await Promise.all(staleOps);
  } catch (e: any) {
    console.error('[fcmService] sendPushNotification error:', e?.message || e);
  }
}
