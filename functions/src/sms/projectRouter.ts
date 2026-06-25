// Skyeline Homes SMS — Project Router (Phase 2)
//
// Decides which Skyeline project an inbound text belongs to. Tyler identifies
// projects by client last name + city ("Christensens", "Giboney", "Joseph's",
// "Mapleton") so we match against any/all of those signals in the message.
//
// Confidence ladder:
//   certain    — contact only has 1 project, or message names a project
//                explicitly with no ambiguity
//   inferred   — multiple candidates, one matches the text strongly
//   ambiguous  — multiple candidates, none match strongly. Caller asks Tyler.
//
// When ambiguous, we return a `disambiguationQuestion` written in Tyler's
// voice: "Hey — is this about [A] or [B]?" (or Spanish equivalent when the
// contact's language is es).

import type { firestore as adminFirestore } from 'firebase-admin';
import type { SmsContact } from './types';

// ── Public types ─────────────────────────────────────────────────────────────

export interface RoutingResult {
  projectId: string | null;
  projectName: string | null;
  confidence: 'certain' | 'inferred' | 'ambiguous';
  /** Set when confidence === 'ambiguous'. Caller sends this back to the contact. */
  disambiguationQuestion?: string;
  /** Project ids considered for inference (debugging / logs). */
  candidates: Array<{ projectId: string; projectName: string }>;
}

// ── Cached project metadata for matching ─────────────────────────────────────

interface ProjectMatchData {
  projectId: string;
  projectName: string;
  matchTerms: string[]; // lowercased terms we try against the message
}

// ── Main API ─────────────────────────────────────────────────────────────────

export async function routeToProject(
  db: adminFirestore.Firestore,
  contact: SmsContact,
  messageText: string,
  language: 'en' | 'es' = 'en',
): Promise<RoutingResult> {
  const projectIds = Array.isArray(contact.projectIds) ? contact.projectIds : [];

  // 0 projects → null, log as general.
  if (projectIds.length === 0) {
    return {
      projectId: null,
      projectName: null,
      confidence: 'certain',
      candidates: [],
    };
  }

  // 1 project → certain. Pull the project name for the log.
  if (projectIds.length === 1) {
    const id = projectIds[0];
    const name = await fetchProjectName(db, id);
    return {
      projectId: id,
      projectName: name,
      confidence: 'certain',
      candidates: [{ projectId: id, projectName: name || id }],
    };
  }

  // Multiple projects — load match data and try to infer.
  const projects = await loadProjectsForMatching(db, projectIds);
  if (projects.length === 0) {
    // Couldn't load any — fall back to first id with low confidence.
    return {
      projectId: projectIds[0],
      projectName: null,
      confidence: 'ambiguous',
      disambiguationQuestion: ambiguousQuestion([], language),
      candidates: [],
    };
  }

  const normalized = normalize(messageText);
  const scored = projects
    .map((p) => ({ ...p, score: scoreProject(p, normalized) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  // Strong match: top score is positive and clearly beats the runner-up.
  if (top.score > 0 && (!second || top.score >= second.score + 2)) {
    return {
      projectId: top.projectId,
      projectName: top.projectName,
      confidence: 'inferred',
      candidates: scored.map((s) => ({ projectId: s.projectId, projectName: s.projectName })),
    };
  }

  // Single small hit is still useful (better than asking).
  if (top.score > 0 && (!second || second.score === 0)) {
    return {
      projectId: top.projectId,
      projectName: top.projectName,
      confidence: 'inferred',
      candidates: scored.map((s) => ({ projectId: s.projectId, projectName: s.projectName })),
    };
  }

  // No usable signal — ambiguous. Ask which project.
  const namesForQuestion = scored
    .filter((s) => !!s.projectName)
    .slice(0, 3)
    .map((s) => s.projectName);
  return {
    projectId: null,
    projectName: null,
    confidence: 'ambiguous',
    disambiguationQuestion: ambiguousQuestion(namesForQuestion, language),
    candidates: scored.map((s) => ({ projectId: s.projectId, projectName: s.projectName })),
  };
}

// ── Scoring ──────────────────────────────────────────────────────────────────

function scoreProject(p: ProjectMatchData, normalizedText: string): number {
  let score = 0;
  for (const term of p.matchTerms) {
    if (!term) continue;
    // Multi-word terms (addresses) get more weight when matched.
    if (term.includes(' ')) {
      if (normalizedText.includes(term)) score += 5;
      continue;
    }
    // Word-boundary single-token match. Skip tiny terms (≤2 chars) to avoid
    // matching "st" inside "stop" etc.
    if (term.length <= 2) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}([^\\p{L}\\p{N}]|$)`, 'u');
    if (re.test(normalizedText)) score += 3;
  }
  return score;
}

// ── Project loading ─────────────────────────────────────────────────────────

async function loadProjectsForMatching(
  db: adminFirestore.Firestore,
  projectIds: string[],
): Promise<ProjectMatchData[]> {
  const out: ProjectMatchData[] = [];
  // Sequential fetches keep this simple; project count per contact is small
  // (1-5 typical).
  await Promise.all(
    projectIds.map(async (id) => {
      try {
        const snap = await db.collection('projects').doc(id).get();
        if (!snap.exists) return;
        const data = (snap.data() || {}) as Record<string, unknown>;
        const projectName = String(
          data.name || data.clientLastName || data.title || id,
        ) || id;
        out.push({
          projectId: id,
          projectName,
          matchTerms: buildMatchTerms(data, projectName),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[projectRouter/loadProjectsForMatching] ${id} fetch failed:`, message);
      }
    }),
  );
  return out;
}

function buildMatchTerms(data: Record<string, unknown>, projectName: string): string[] {
  const terms = new Set<string>();
  const push = (v: unknown) => {
    if (!v) return;
    const s = normalize(String(v));
    if (!s) return;
    terms.add(s);
    // Also tokenize multi-word names so "Christensen Mapleton" matches either.
    for (const token of s.split(/\s+/)) {
      if (token.length > 2) terms.add(token);
    }
  };

  push(projectName);
  push(data.name);
  push(data.clientLastName);
  push(data.clientName);
  push(data.clientFirstName);
  push(data.address);
  push(data.jobsiteAddress);
  push(data.city);
  push(data.nickname);
  push(data.title);

  // Strip a trailing "s" (Christensens → christensen) so "christensen"
  // matches too. Tyler uses both forms interchangeably.
  for (const t of Array.from(terms)) {
    if (t.endsWith('s') && t.length > 4) terms.add(t.slice(0, -1));
    if (!t.endsWith('s') && t.length > 3) terms.add(`${t}s`);
  }

  return Array.from(terms).filter((t) => t.length >= 3);
}

async function fetchProjectName(
  db: adminFirestore.Firestore,
  projectId: string,
): Promise<string | null> {
  try {
    const snap = await db.collection('projects').doc(projectId).get();
    if (!snap.exists) return null;
    const data = (snap.data() || {}) as Record<string, unknown>;
    return String(data.name || data.clientLastName || data.title || projectId) || projectId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[projectRouter/fetchProjectName] ${projectId} fetch failed:`, message);
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ambiguousQuestion(names: string[], language: 'en' | 'es'): string {
  const cleanNames = names.filter(Boolean);
  if (language === 'es') {
    if (cleanNames.length === 0) {
      return 'Oye — para qué proyecto es esto?';
    }
    if (cleanNames.length === 1) {
      return `Oye — esto es para ${cleanNames[0]}?`;
    }
    if (cleanNames.length === 2) {
      return `Oye — esto es para ${cleanNames[0]} o ${cleanNames[1]}?`;
    }
    const head = cleanNames.slice(0, -1).join(', ');
    const last = cleanNames[cleanNames.length - 1];
    return `Oye — esto es para ${head}, o ${last}?`;
  }
  if (cleanNames.length === 0) {
    return 'Hey — which project is this for?';
  }
  if (cleanNames.length === 1) {
    return `Hey — is this about ${cleanNames[0]}?`;
  }
  if (cleanNames.length === 2) {
    return `Hey — is this about ${cleanNames[0]} or ${cleanNames[1]}?`;
  }
  const head = cleanNames.slice(0, -1).join(', ');
  const last = cleanNames[cleanNames.length - 1];
  return `Hey — is this about ${head}, or ${last}?`;
}
