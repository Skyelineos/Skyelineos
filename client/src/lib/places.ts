// Client helpers for the server-side Google Places proxy (see
// functions/src/places/placesRoutes.ts). The Maps API key lives only on the
// server; here we just call our own /api/places/* endpoints with the user's
// Firebase token.
//
// Session tokens: Google bills a "type → pick" sequence as one session when the
// same token is sent on every autocomplete call and the final details call.
// Create one with newSessionToken(), reuse it while the user types, then throw
// it away (call newSessionToken() again) after a result is chosen.

import { authFetch } from '@/lib/authFetch';

export interface PlacePrediction {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  description: string;
}

export interface PlaceDetails {
  lat: number | null;
  lng: number | null;
  formatted: string;
  address: {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
    county?: string;
  };
}

/** A fresh opaque session token. Reuse across keystrokes, rotate after a pick. */
export function newSessionToken(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// `null` signals "Places is unavailable" (not configured / network / auth) so
// callers can fall back to saved-address suggestions instead of showing an
// empty list as if there were no matches.
export async function placesAutocomplete(
  q: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlacePrediction[] | null> {
  if (q.trim().length < 3) return [];
  try {
    const res = await authFetch(
      `/api/places/autocomplete?q=${encodeURIComponent(q)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
      { signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.suggestions) ? data.suggestions : [];
  } catch {
    return null;
  }
}

export async function placeDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  try {
    const res = await authFetch(
      `/api/places/details?placeId=${encodeURIComponent(placeId)}&sessiontoken=${encodeURIComponent(sessionToken)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as PlaceDetails;
  } catch {
    return null;
  }
}
