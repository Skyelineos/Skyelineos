// ─────────────────────────────────────────────────────────────────────────────
// Master Task Library & Project Task Template — client API helpers
//
// Thin wrappers over the /api/taskLibrary/* Cloud Function routes. Unlike the
// shared apiRequest, these surface the server's JSON `error` message so the UI
// can show validation feedback ("A reason is required to skip a task", etc.).
//
// Reads are done directly against Firestore (onSnapshot) in the components for
// liveness; these helpers cover the mutations + analysis that run server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from '@/lib/firebase';
import type {
  GenerateTasksRequest,
  GeneratePreview,
  ImprovementAction,
} from '@shared/taskLibrary-types';

async function call<T = any>(url: string, method: string, body?: any): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const u = auth.currentUser;
  if (u) {
    const token = await u.getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

const BASE = '/api/taskLibrary';

// ── Master library ───────────────────────────────────────────────────────────
export const seedMasterLibrary = () => call(`${BASE}/master/seed`, 'POST');
export const createMasterTask = (data: any) => call(`${BASE}/master`, 'POST', data);
export const updateMasterTask = (id: string, data: any) =>
  call(`${BASE}/master/${id}`, 'PATCH', data);
export const archiveMasterTask = (id: string) => call(`${BASE}/master/${id}/archive`, 'POST');
export const unarchiveMasterTask = (id: string) => call(`${BASE}/master/${id}/unarchive`, 'POST');
export const reorderMasterTasks = (orderedIds: string[]) =>
  call(`${BASE}/master/reorder`, 'POST', { orderedIds });

// ── Project task generation ──────────────────────────────────────────────────
export const getGeneratePreview = (
  projectId: string,
  opts: GenerateTasksRequest = {},
): Promise<GeneratePreview> => {
  const params = new URLSearchParams();
  if (opts.includeTags?.length) params.set('includeTags', opts.includeTags.join(','));
  if (opts.includeAllOptional) params.set('includeAllOptional', 'true');
  const qs = params.toString();
  return call(`${BASE}/projects/${projectId}/generate/preview${qs ? `?${qs}` : ''}`, 'GET');
};
export const generateProjectTasks = (projectId: string, opts: GenerateTasksRequest = {}) =>
  call(`${BASE}/projects/${projectId}/generate`, 'POST', opts);

// ── Project tasks ────────────────────────────────────────────────────────────
export const addCustomProjectTask = (projectId: string, data: any) =>
  call(`${BASE}/projects/${projectId}/tasks`, 'POST', data);
export const updateProjectTask = (projectId: string, taskId: string, data: any) =>
  call(`${BASE}/projects/${projectId}/tasks/${taskId}`, 'PATCH', data);
export const deleteCustomProjectTask = (projectId: string, taskId: string) =>
  call(`${BASE}/projects/${projectId}/tasks/${taskId}`, 'DELETE');

// ── Closeout / improvements ──────────────────────────────────────────────────
export const analyzeCloseout = (projectId: string) =>
  call(`${BASE}/projects/${projectId}/closeout/analyze`, 'POST');
export const resolveImprovement = (
  id: string,
  action: ImprovementAction,
  payload?: Record<string, any>,
  adminNote?: string,
) => call(`${BASE}/improvements/${id}/resolve`, 'POST', { action, payload, adminNote });
