// Design Style Discovery — schema + helpers for the guided visual flow:
//   Step 1 style direction · Step 2 pairwise comparison · Step 3 design profile,
//   plus the Other / Upload Inspiration capture.
// AI scoring is NOT built yet — these prep the schema + structure so it can be
// added later without a database redesign.

import { collection, doc, addDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { StyleOption } from '@/data/standardStyleQuiz';

// ── Step 2: pairwise comparison ──────────────────────────────────────────────
export interface StyleComparison {
  comparisonId: string;
  projectId: string;
  clientId: string | null;
  optionAId: string;
  optionBId: string;
  selectedOptionId: string | null;
  skipped: boolean;
  createdAt?: any;
}

export async function saveComparison(projectId: string, c: Omit<StyleComparison, 'comparisonId' | 'createdAt'>) {
  const ref = await addDoc(collection(db, 'projects', projectId, 'styleComparisons'), {
    ...c, createdAt: serverTimestamp(),
  });
  return ref.id;
}

// Build the "which feels more like you?" pairs. Leads with the client's chosen
// style vs. a few alternates; falls back to pairing the featured styles.
export function generateComparisonPairs(selectedIds: string[], styleOptions: StyleOption[], max = 3): [StyleOption, StyleOption][] {
  const styles = styleOptions.filter(o => o.kind !== 'upload');
  const byId = (id: string) => styles.find(s => s.id === id);
  const pairs: [StyleOption, StyleOption][] = [];
  const seen = new Set<string>();
  const primary = selectedIds.map(byId).filter(Boolean)[0] as StyleOption | undefined;
  const pool = styles.filter(s => s.id !== primary?.id);
  if (primary) {
    for (const alt of pool) {
      if (pairs.length >= max) break;
      const key = [primary.id, alt.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([primary, alt]);
    }
  } else {
    for (let i = 0; i < pool.length - 1 && pairs.length < max; i += 2) {
      pairs.push([pool[i], pool[i + 1]]);
    }
  }
  return pairs;
}

// ── Step 3: design profile (placeholder logic until AI scoring exists) ────────
export interface StyleProfileSeed {
  materials: string[];
  colors: string[];
  mood: string[];
  recommended: string[];
}

// Keyed by overall-style option id. TODO: replace with AI-derived profiles.
export const STYLE_PROFILES: Record<string, StyleProfileSeed> = {
  'organic-modern':     { materials: ['white oak', 'limestone', 'plaster', 'soft textiles'], colors: ['warm white', 'taupe', 'natural wood', 'muted earth tones'], mood: ['calm', 'natural', 'refined', 'minimal'], recommended: ['Cabinetry & Trim Style', 'Kitchen Countertops', 'Lighting Feel'] },
  'mountain-modern':    { materials: ['timber beams', 'natural stone', 'blackened steel', 'wool'], colors: ['charcoal', 'warm wood', 'stone gray', 'deep green'], mood: ['rugged', 'cozy', 'grounded', 'dramatic'], recommended: ['Exterior Finish Direction', 'Main-Level Flooring', 'Lighting Feel'] },
  'japandi':            { materials: ['light oak', 'rattan', 'matte ceramic', 'linen'], colors: ['warm white', 'soft black', 'natural wood', 'clay'], mood: ['serene', 'minimal', 'warm', 'intentional'], recommended: ['Wall Color Approach', 'Kitchen Cabinet Color Direction', 'Lighting Feel'] },
  'transitional':       { materials: ['painted millwork', 'quartz', 'brushed brass', 'natural wood'], colors: ['greige', 'soft white', 'warm gray', 'navy accent'], mood: ['classic', 'balanced', 'elegant', 'versatile'], recommended: ['Cabinetry & Trim Style', 'Kitchen Countertops', 'Wall Color Approach'] },
  'modern-farmhouse':   { materials: ['shiplap', 'white oak', 'matte black', 'butcher block'], colors: ['warm white', 'black', 'natural wood', 'sage'], mood: ['warm', 'inviting', 'casual', 'timeless'], recommended: ['Exterior Finish Direction', 'Cabinetry & Trim Style', 'Kitchen Cabinet Color Direction'] },
  'scandinavian':       { materials: ['pale wood', 'wool', 'matte white', 'glass'], colors: ['bright white', 'pale gray', 'blonde wood', 'soft pastel'], mood: ['light', 'airy', 'functional', 'cozy'], recommended: ['Wall Color Approach', 'Lighting Feel', 'Main-Level Flooring'] },
  'european-heritage':  { materials: ['plaster', 'limestone', 'reclaimed oak', 'unlacquered brass'], colors: ['warm cream', 'stone', 'olive', 'aged wood'], mood: ['timeless', 'old-world', 'refined', 'warm'], recommended: ['Cabinetry & Trim Style', 'Kitchen Countertops', 'Exterior Finish Direction'] },
  'contemporary':       { materials: ['flat-panel cabinetry', 'large-format tile', 'glass', 'matte metal'], colors: ['white', 'charcoal', 'monochrome', 'one warm wood note'], mood: ['sleek', 'minimal', 'crisp', 'bold'], recommended: ['Kitchen Cabinet Color Direction', 'Lighting Feel', 'Main-Level Flooring'] },
  'mid-century-modern': { materials: ['walnut', 'terrazzo', 'brass', 'leather'], colors: ['warm wood', 'mustard', 'olive', 'cream'], mood: ['retro', 'warm', 'clean', 'characterful'], recommended: ['Cabinetry & Trim Style', 'Lighting Feel', 'Kitchen Countertops'] },
  'traditional':        { materials: ['detailed millwork', 'natural stone', 'hardwood', 'polished brass'], colors: ['warm neutrals', 'deep wood', 'navy', 'cream'], mood: ['timeless', 'refined', 'symmetrical', 'classic'], recommended: ['Cabinetry & Trim Style', 'Kitchen Countertops', 'Wall Color Approach'] },
};

export interface DesignProfile {
  primaryStyleId: string | null;
  primaryStyle: string;
  secondaryStyleId: string | null;
  secondaryInfluence: string;
  materials: string[];
  colors: string[];
  mood: string[];
  recommended: string[];
}

// Derive a preliminary profile from the chosen style + comparison wins.
// Placeholder logic for now — primary = chosen style, secondary = top comparison
// pick that isn't the primary.
export function computeDesignProfile(
  primaryStyleId: string | null,
  comparisons: StyleComparison[],
  styleOptions: StyleOption[],
): DesignProfile {
  const label = (id: string | null) => styleOptions.find(o => o.id === id)?.label || '';
  // Tally comparison wins to find a secondary influence.
  const wins: Record<string, number> = {};
  comparisons.forEach(c => { if (c.selectedOptionId) wins[c.selectedOptionId] = (wins[c.selectedOptionId] || 0) + 1; });
  const secondaryStyleId = Object.entries(wins)
    .filter(([id]) => id !== primaryStyleId)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const seed = (primaryStyleId && STYLE_PROFILES[primaryStyleId]) || { materials: [], colors: [], mood: [], recommended: [] };
  return {
    primaryStyleId,
    primaryStyle: label(primaryStyleId) || 'Your style',
    secondaryStyleId,
    secondaryInfluence: label(secondaryStyleId),
    materials: seed.materials,
    colors: seed.colors,
    mood: seed.mood,
    recommended: seed.recommended,
  };
}

// ── Other / Upload Inspiration ───────────────────────────────────────────────
export const INSPIRATION_TAGS = [
  'overall feeling', 'colors', 'cabinetry', 'flooring', 'exterior', 'lighting', 'materials', 'layout',
] as const;

export interface StyleInspiration {
  projectId: string;
  clientId: string | null;
  uploadedImages: { url: string; storagePath: string }[];
  notes: string;
  selectedTags: string[];
  reviewedByDesigner: boolean;
  aiAnalysisStatus: 'pending' | 'processing' | 'done' | null;
  // Future AI analysis (nullable for now):
  styleTags: string[] | null;
  materialTags: string[] | null;
  colorTags: string[] | null;
  designKeywords: string[] | null;
  confidenceScore: number | null;
  aiSummary: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export async function saveStyleInspiration(
  projectId: string,
  data: Pick<StyleInspiration, 'clientId' | 'uploadedImages' | 'notes' | 'selectedTags'>,
) {
  const ref = doc(collection(db, 'projects', projectId, 'styleInspiration'));
  const payload: StyleInspiration = {
    projectId,
    clientId: data.clientId ?? null,
    uploadedImages: data.uploadedImages,
    notes: data.notes,
    selectedTags: data.selectedTags,
    reviewedByDesigner: false,
    aiAnalysisStatus: 'pending',
    styleTags: null,
    materialTags: null,
    colorTags: null,
    designKeywords: null,
    confidenceScore: null,
    aiSummary: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  return ref.id;
}
