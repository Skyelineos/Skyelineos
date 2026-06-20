// Project matching for the AI Inbox.
//
// Loads a lightweight index of live `projects` (id, name, clientName, address)
// so the brain can match an incoming email/receipt to a real SkyelineOS
// project. Read-only on production data. Two layers:
//   1. renderKnownProjects() feeds the index into the extraction prompt so
//      Claude can reason over names/addresses/clients.
//   2. deterministicMatch() is a cheap string-overlap fallback used to confirm
//      or backfill Claude's projectId when the model is unsure.

import type { firestore as adminFirestore } from 'firebase-admin';

export interface ProjectIndexEntry {
  id: string;
  name: string;
  clientName: string;
  address: string;
}

// Cap how many projects we load into the prompt. A single GC won't have
// thousands of ACTIVE jobs; we prefer non-archived ones and cap for token cost.
const MAX_PROJECTS = 60;

export async function loadProjectIndex(
  db: adminFirestore.Firestore,
): Promise<ProjectIndexEntry[]> {
  const snap = await db.collection('projects').limit(MAX_PROJECTS * 2).get();
  const entries: ProjectIndexEntry[] = [];
  for (const d of snap.docs) {
    const p: any = d.data() || {};
    // Skip clearly-archived/closed jobs to keep the index relevant.
    const status = String(p.status || '').toLowerCase();
    if (status === 'archived' || status === 'deleted') continue;
    const address =
      p.address ||
      p.buildLocation?.addressLine1 ||
      [p.city, p.state].filter(Boolean).join(', ') ||
      '';
    entries.push({
      id: d.id,
      name: String(p.name || p.projectName || '').trim() || `Project ${d.id.slice(0, 6)}`,
      clientName: String(p.clientName || p.client || '').trim(),
      address: String(address).trim(),
    });
    if (entries.length >= MAX_PROJECTS) break;
  }
  return entries;
}

export function renderKnownProjects(projects: ProjectIndexEntry[]): string {
  if (projects.length === 0) {
    return 'KNOWN PROJECTS: (none on file — set projectId to null)';
  }
  const lines: string[] = ['KNOWN PROJECTS (match by id):'];
  for (const p of projects) {
    const bits = [p.clientName, p.address].filter(Boolean).join(' — ');
    lines.push(`  - ${p.id}  "${p.name}"${bits ? `  (${bits})` : ''}`);
  }
  return lines.join('\n');
}

// Cheap fallback: score each project by token overlap of name/client/address
// against the email text. Returns the best match id only if it clears a
// minimum score, else null. Used to confirm or backfill Claude's choice.
export function deterministicMatch(
  text: string,
  projects: ProjectIndexEntry[],
): { id: string; name: string } | null {
  const hay = ` ${normalize(text)} `;
  let best: { id: string; name: string; score: number } | null = null;
  for (const p of projects) {
    let score = 0;
    for (const tok of significantTokens(`${p.name} ${p.clientName} ${p.address}`)) {
      if (hay.includes(` ${tok} `)) score += tok.length >= 6 ? 2 : 1;
    }
    if (!best || score > best.score) best = { id: p.id, name: p.name, score };
  }
  if (best && best.score >= 3) return { id: best.id, name: best.name };
  return null;
}

function normalize(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Tokens worth matching on — drop short/common words that cause false hits.
const STOP = new Set([
  'the', 'and', 'for', 'project', 'home', 'homes', 'llc', 'inc', 'ut', 'utah',
  'street', 'st', 'ave', 'rd', 'road', 'dr', 'drive', 'ln', 'lane', 'n', 's', 'e', 'w',
]);

function significantTokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t));
}
