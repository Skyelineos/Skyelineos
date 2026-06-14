// Canonical build/jobsite location for a project. One verified location per
// build, used consistently across the app. See the BuildLocation component for
// the UI and docs/build-location (Phase 1) for the rollout plan.

import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type LocationStatus =
  | 'unconfirmed'
  | 'pending_client'
  | 'confirmed'
  | 'correction_requested';

export interface BuildLocation {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number | null;
  longitude?: number | null;
  parcelNumber?: string;
  lotNumber?: string;
  subdivision?: string;
  status?: LocationStatus;
  locationConfirmedByClient?: boolean;
  locationConfirmedAt?: string | null;
  locationConfirmedByUserId?: string | null;
  locationNotes?: string;
  correctionNotes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type LocationEventType =
  | 'address_created'
  | 'address_edited'
  | 'pin_moved'
  | 'sent_to_client'
  | 'client_confirmed'
  | 'client_requested_correction'
  | 'admin_override';

export interface LocationEvent {
  type: LocationEventType;
  byUserId?: string;
  byName?: string;
  at?: any;
  details?: string;
}

// ── Status presentation ──────────────────────────────────────────────────────

export const STATUS_META: Record<LocationStatus, { label: string; className: string }> = {
  unconfirmed:           { label: 'Unconfirmed',          className: 'bg-gray-100 text-gray-600' },
  pending_client:        { label: 'Pending Client Confirmation', className: 'bg-amber-100 text-amber-800' },
  confirmed:             { label: 'Confirmed',            className: 'bg-green-100 text-green-700' },
  correction_requested:  { label: 'Correction Requested', className: 'bg-red-100 text-red-700' },
};

export function locationStatus(loc?: BuildLocation | null): LocationStatus {
  return (loc?.status as LocationStatus) || 'unconfirmed';
}

// ── Back-compat read shim ────────────────────────────────────────────────────

/**
 * Build a BuildLocation from a project doc, falling back to the legacy flat
 * address fields (address/city/state/zip) so existing projects render without a
 * migration. Existing `buildLocation` takes precedence.
 */
export function locationFromProject(project: any): BuildLocation {
  const bl = (project?.buildLocation || {}) as BuildLocation;
  return {
    addressLine1: bl.addressLine1 ?? project?.address ?? '',
    addressLine2: bl.addressLine2 ?? '',
    city: bl.city ?? project?.city ?? '',
    state: bl.state ?? project?.state ?? '',
    zipCode: bl.zipCode ?? project?.zip ?? project?.zipCode ?? '',
    county: bl.county ?? '',
    latitude: bl.latitude ?? null,
    longitude: bl.longitude ?? null,
    parcelNumber: bl.parcelNumber ?? '',
    lotNumber: bl.lotNumber ?? '',
    subdivision: bl.subdivision ?? '',
    status: bl.status ?? 'unconfirmed',
    locationConfirmedByClient: bl.locationConfirmedByClient ?? false,
    locationConfirmedAt: bl.locationConfirmedAt ?? null,
    locationConfirmedByUserId: bl.locationConfirmedByUserId ?? null,
    locationNotes: bl.locationNotes ?? '',
    correctionNotes: bl.correctionNotes ?? '',
  };
}

/** One-line address for display / directions / documents. */
export function formatAddress(loc?: BuildLocation | null): string {
  if (!loc) return '';
  const parts = [
    loc.addressLine1,
    loc.addressLine2,
    [loc.city, loc.state].filter(Boolean).join(', '),
    loc.zipCode,
  ].filter(Boolean);
  return parts.join(', ');
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Address must be present before we can send to the client for confirmation. */
export function canSendToClient(loc?: BuildLocation | null): boolean {
  return !!(loc?.addressLine1?.trim() && loc?.city?.trim() && loc?.state?.trim());
}

/** A pin (lat/lng) is required before a location can be marked confirmed. */
export function hasPin(loc?: BuildLocation | null): boolean {
  return typeof loc?.latitude === 'number' && typeof loc?.longitude === 'number';
}

// ── Directions ───────────────────────────────────────────────────────────────

/**
 * Opens the OS default maps app at the pin (preferred) or the address.
 * iOS devices get an Apple Maps link (which opens the Maps app), everything
 * else gets a Google Maps link (opens the Google Maps app if installed, else
 * the web). Both honor "directions to" so the user lands on a navigable route.
 */
export function directionsUrl(loc?: BuildLocation | null): string {
  const isIOS = typeof navigator !== 'undefined'
    && (/iphone|ipad|ipod/i.test(navigator.userAgent || '')
      // iPadOS 13+ reports as Mac; disambiguate via touch points.
      || (/macintosh/i.test(navigator.userAgent || '') && (navigator as any).maxTouchPoints > 1));

  const dest = hasPin(loc)
    ? `${loc!.latitude},${loc!.longitude}`
    : (formatAddress(loc) ? encodeURIComponent(formatAddress(loc)) : '');
  if (!dest) return '#';

  return isIOS
    ? `https://maps.apple.com/?daddr=${dest}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

// ── Persistence ──────────────────────────────────────────────────────────────

/** Append an audit event under projects/{id}/locationEvents. Best-effort. */
export async function logLocationEvent(projectId: string, event: LocationEvent): Promise<void> {
  try {
    await addDoc(collection(db, 'projects', projectId, 'locationEvents'), {
      ...event,
      at: serverTimestamp(),
    });
  } catch {
    /* audit is best-effort */
  }
}

/**
 * Write the buildLocation onto the project, mirroring the key fields to the
 * legacy flat address columns so every existing reader keeps working.
 */
export async function saveBuildLocation(
  projectId: string,
  loc: BuildLocation,
  byUserId?: string,
): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId), {
    buildLocation: { ...loc, updatedAt: new Date().toISOString(), updatedBy: byUserId || null },
    // Back-compat mirror:
    address: loc.addressLine1 || '',
    city: loc.city || '',
    state: loc.state || '',
    zip: loc.zipCode || '',
  });
}
