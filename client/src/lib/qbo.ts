// Client helpers for the QuickBooks payment-link backend routes.
// Mirrors the API_BASE convention used by lib/portalInvite.ts.

import { authFetch } from '@/lib/authFetch';

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'https://api-mtph34upva-uc.a.run.app';

// Is QuickBooks connected for the company? Used to decide whether to show
// "Pay now" buttons in the client portal.
export async function getQboStatus(): Promise<{ connected: boolean; env?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/qbo/status`);
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch {
    return { connected: false };
  }
}

// Mint (or reuse) a QuickBooks online-payment link for a draw. Returns the URL
// the homeowner can open to pay. Throws with a readable message on failure
// (not connected, payments not enabled, etc.).
export async function createDrawPaymentLink(projectId: string, drawId: string): Promise<string> {
  const res = await authFetch(`${API_BASE}/api/qbo/draw-payment-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, drawId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Could not create a payment link');
  }
  return data.url as string;
}
