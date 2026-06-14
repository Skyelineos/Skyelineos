// Google Places (New) proxy. Powers the address autocomplete used by the
// jobsite "Set pin" flow. The Maps API key NEVER reaches the browser — it lives
// in Secret Manager (GOOGLE_MAPS_API_KEY) and only this server holds it, so the
// key can be IP-restricted to Cloud Functions instead of referrer-restricted.
//
// Two endpoints, both signed-in-only (any authenticated role) to keep the key
// from being abused by anonymous traffic:
//   GET /api/places/autocomplete?q=<text>&sessiontoken=<uuid>
//       → [{ placeId, primaryText, secondaryText, description }]
//   GET /api/places/details?placeId=<id>&sessiontoken=<uuid>
//       → { lat, lng, formatted, address: { line1, city, state, zip, county } }
//
// Session tokens (one uuid per "user typing → picks a result" sequence) let
// Google bill the autocomplete keystrokes + the final details call as a single
// session — much cheaper than per-request. The client generates the uuid and
// passes the same one to autocomplete and details, then rotates it.
//
// If GOOGLE_MAPS_API_KEY isn't configured the routes return 503 and the client
// silently falls back to its saved-address (database) suggestions.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = (placeId: string) =>
  `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

// Any signed-in user may use the proxy; the key is the asset we're protecting,
// not the place data (which is public).
async function requireSignedIn(req: any, res: any, next: any): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  try {
    req.user = await admin.auth().verifyIdToken(authHeader.substring(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function apiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

// Pull a single address component value by type from the Places (New) response.
function comp(components: any[], type: string, short = false): string | undefined {
  const hit = (components || []).find((c: any) => Array.isArray(c.types) && c.types.includes(type));
  if (!hit) return undefined;
  return (short ? hit.shortText : hit.longText) || hit.longText || hit.shortText || undefined;
}

export function registerPlacesRoutes(app: Express): void {
  // ── Autocomplete ──────────────────────────────────────────────────────────
  app.get('/api/places/autocomplete', requireSignedIn, async (req: any, res: any) => {
    const key = apiKey();
    if (!key) { res.status(503).json({ error: 'Places not configured' }); return; }

    const input = String(req.query.q || '').trim();
    if (input.length < 3) { res.json({ suggestions: [] }); return; }
    const sessionToken = req.query.sessiontoken ? String(req.query.sessiontoken) : undefined;

    try {
      const r = await fetch(AUTOCOMPLETE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ['us'],
          // Street addresses + buildings — what a jobsite is. Leaving this off
          // would also return cities, businesses, etc.
          includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      if (!r.ok) {
        console.error('Places autocomplete failed', r.status, await r.text().catch(() => ''));
        res.status(502).json({ error: 'Upstream error' });
        return;
      }
      const data: any = await r.json();
      const suggestions = (data.suggestions || [])
        .map((s: any) => s.placePrediction)
        .filter(Boolean)
        .map((p: any) => ({
          placeId: p.placeId,
          primaryText: p.structuredFormat?.mainText?.text || p.text?.text || '',
          secondaryText: p.structuredFormat?.secondaryText?.text || '',
          description: p.text?.text || '',
        }));
      res.json({ suggestions });
    } catch (e: any) {
      console.error('Places autocomplete error', e?.message || e);
      res.status(502).json({ error: 'Upstream error' });
    }
  });

  // ── Place details (coordinates + parsed address) ──────────────────────────
  app.get('/api/places/details', requireSignedIn, async (req: any, res: any) => {
    const key = apiKey();
    if (!key) { res.status(503).json({ error: 'Places not configured' }); return; }

    const placeId = String(req.query.placeId || '').trim();
    if (!placeId) { res.status(400).json({ error: 'placeId required' }); return; }
    const sessionToken = req.query.sessiontoken ? String(req.query.sessiontoken) : undefined;

    try {
      const url = DETAILS_URL(placeId) + (sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '');
      const r = await fetch(url, {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'location,formattedAddress,addressComponents',
        },
      });
      if (!r.ok) {
        console.error('Places details failed', r.status, await r.text().catch(() => ''));
        res.status(502).json({ error: 'Upstream error' });
        return;
      }
      const d: any = await r.json();
      const c = d.addressComponents || [];
      const streetNumber = comp(c, 'street_number');
      const route = comp(c, 'route');
      const line1 = [streetNumber, route].filter(Boolean).join(' ') || undefined;
      res.json({
        lat: d.location?.latitude ?? null,
        lng: d.location?.longitude ?? null,
        formatted: d.formattedAddress || '',
        address: {
          line1,
          city: comp(c, 'locality') || comp(c, 'postal_town') || comp(c, 'sublocality'),
          state: comp(c, 'administrative_area_level_1', true),
          zip: comp(c, 'postal_code'),
          county: comp(c, 'administrative_area_level_2'),
        },
      });
    } catch (e: any) {
      console.error('Places details error', e?.message || e);
      res.status(502).json({ error: 'Upstream error' });
    }
  });
}
