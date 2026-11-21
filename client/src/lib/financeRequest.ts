import { auth } from '@/lib/firebase';

export async function financeRequest<T>(
  url: string,
  body?: object
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to SkyelineOS.');
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + (await user.getIdToken()),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(
      details?.error || 'Request failed (' + response.status + ').'
    );
  }
  return response.json();
}
