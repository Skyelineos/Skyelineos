// Builds a googleapis OAuth2 client backed by tokens stored in
// ingestion_lab/config.{provider}. The client auto-refreshes the access
// token when expired; the 'tokens' event handler persists the new access
// token + expiry back to Firestore so the next call doesn't re-refresh.

import * as admin from 'firebase-admin';
import { google } from 'googleapis';

// Bind the OAuth2 type to whichever google-auth-library version `googleapis`
// uses internally — direct imports from google-auth-library can resolve to a
// nested copy that mismatches on stale `gaxios` property typings.
type GoogleOAuth2 = InstanceType<typeof google.auth.OAuth2>;

export type IngestionProvider = 'gmail' | 'drive';

function configRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('config');
}

export async function getAuthorizedClient(
  db: FirebaseFirestore.Firestore,
  provider: IngestionProvider,
): Promise<GoogleOAuth2> {
  const configSnap = await configRef(db).get();
  const config: any = configSnap.data() || {};
  const conn = config[provider];

  if (!conn || !conn.refreshToken) {
    throw new Error(
      `${provider} is not connected. Run the OAuth flow first: POST /api/ingestionLab/oauth/${provider}/start`,
    );
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not bound to this function.');
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);

  // expiresAt was stored as a Firestore Timestamp; convert to ms.
  const expiryMs =
    conn.expiresAt && typeof conn.expiresAt.toMillis === 'function'
      ? conn.expiresAt.toMillis()
      : null;

  oauth2.setCredentials({
    refresh_token: conn.refreshToken,
    access_token: conn.accessToken || undefined,
    expiry_date: expiryMs,
  });

  // On automatic refresh, persist the new token so subsequent calls hit
  // the cached access token instead of re-refreshing every time.
  oauth2.on('tokens', async (tokens) => {
    const patch: any = {};
    if (tokens.access_token) patch.accessToken = tokens.access_token;
    if (tokens.expiry_date) {
      patch.expiresAt = admin.firestore.Timestamp.fromMillis(tokens.expiry_date);
    }
    if (tokens.refresh_token) patch.refreshToken = tokens.refresh_token;
    if (Object.keys(patch).length > 0) {
      try {
        await configRef(db).set({ [provider]: patch }, { merge: true });
      } catch (e) {
        console.error(`[googleClient] failed to persist refreshed tokens for ${provider}:`, e);
      }
    }
  });

  return oauth2;
}
