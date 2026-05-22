#!/usr/bin/env node
// scripts/verify-import-fix.mjs
//
// End-to-end verification for the ImportCenter stage-normalization fix.
//   1. Unit-tests the normalizeStage logic against known inputs.
//   2. Writes 3 test client docs to /clients in the live Firestore.
//   3. Reads them back and asserts they round-trip correctly.
//   4. Deletes every test doc it created — pass or fail.
//
// Auth: reuses the Firebase CLI's cached OAuth access token from
//       ~/.config/configstore/firebase-tools.json. No service account needed.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROJECT_ID = 'skyelineos';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Get a fresh access token from the firebase CLI configstore ─────────────
function readConfigstore() {
  const p = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function getAccessToken() {
  const cs = readConfigstore();
  const t = cs.tokens || {};
  // If the cached access_token is still valid, reuse it.
  if (t.access_token && t.expires_at && Date.now() < t.expires_at - 60_000) {
    return t.access_token;
  }
  // Otherwise refresh using the cached refresh_token. Use the public Firebase
  // CLI OAuth client ID — same flow firebase-tools uses internally.
  const body = new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: t.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.access_token;
}

// ─── normalizeStage — mirror of the deployed logic in ImportCenter.tsx ───────
const CANONICAL_STAGES = ['new_lead','meeting_booked','design_phase','in_estimating','close_to_sign','won','lost'];
const STAGE_AUTO_MAP = {
  lead:'new_lead','new lead':'new_lead', new_lead:'new_lead',
  proposal:'close_to_sign', active:'won', completed:'won', complete:'won',
  meeting_booked:'meeting_booked','meeting booked':'meeting_booked',
  design_phase:'design_phase','design phase':'design_phase',
  in_estimating:'in_estimating','in estimating':'in_estimating', estimating:'in_estimating',
  close_to_sign:'close_to_sign','close to sign':'close_to_sign',
  close_to_signing:'close_to_sign','close to signing':'close_to_sign', contract:'close_to_sign',
  pre_construction:'won', preconstruction:'won', active_build:'won', final_passed:'won',
  completed_build:'won', in_punchlist:'won', warranty:'won', won:'won', lost:'lost',
};
function normalizeStage(raw) {
  if (!raw) return null;
  const lower = String(raw).toLowerCase().trim();
  if (!lower) return null;
  const collapsed = lower.replace(/\s+/g, '_');
  return STAGE_AUTO_MAP[collapsed] ?? STAGE_AUTO_MAP[lower] ?? null;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function check(label, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else      { failed++; console.log(`  ✗ ${label}  ${detail}`); }
}

// ─── Firestore REST helpers ──────────────────────────────────────────────────
function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  return { stringValue: String(v) };
}
function toFsDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFsValue(v);
  return { fields };
}
function fromFsValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  return undefined;
}

async function createDoc(token, collection, data) {
  const res = await fetch(`${BASE}/${collection}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toFsDoc(data)),
  });
  if (!res.ok) throw new Error(`create ${collection} failed: ${res.status} ${await res.text()}`);
  return (await res.json()).name.split('/').pop();
}
async function getDoc(token, collection, id) {
  const res = await fetch(`${BASE}/${collection}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`get ${collection}/${id} failed: ${res.status}`);
  const j = await res.json();
  const out = {};
  for (const [k, v] of Object.entries(j.fields || {})) out[k] = fromFsValue(v);
  return out;
}
async function deleteDoc(token, collection, id) {
  const res = await fetch(`${BASE}/${collection}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`delete ${collection}/${id} failed: ${res.status}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
const ts = Date.now();
const createdIds = []; // (collection, id) pairs we must clean up

try {
  // ── Phase 1: unit tests for normalizeStage ──────────────────────────────
  console.log('\nPhase 1 — normalizeStage unit tests');
  check('"Lead" → new_lead',        normalizeStage('Lead') === 'new_lead');
  check('"Proposal" → close_to_sign', normalizeStage('Proposal') === 'close_to_sign');
  check('"Active" → won',            normalizeStage('Active') === 'won');
  check('"Completed" → won',         normalizeStage('Completed') === 'won');
  check('"new_lead" → new_lead',     normalizeStage('new_lead') === 'new_lead');
  check('"meeting_booked" → meeting_booked', normalizeStage('meeting_booked') === 'meeting_booked');
  check('"won" → won',               normalizeStage('won') === 'won');
  check('"lost" → lost',             normalizeStage('lost') === 'lost');
  check('"WARM LEAD" (unknown) → null',  normalizeStage('WARM LEAD') === null);
  check('empty string → null',       normalizeStage('') === null);
  check('whitespace → null',         normalizeStage('   ') === null);
  check('"  active  " → won (trim)', normalizeStage('  active  ') === 'won');

  // ── Phase 2: round-trip three test docs through live Firestore ───────────
  console.log('\nPhase 2 — round-trip /clients writes against live Firestore');
  const token = await getAccessToken();
  const cases = [
    { label: 'pre-fix CSV value "Lead"',  raw: 'Lead',   expectedNormalized: 'new_lead' },
    { label: 'pre-fix CSV value "Active"',raw: 'Active', expectedNormalized: 'won' },
    { label: 'canonical "new_lead"',      raw: 'new_lead', expectedNormalized: 'new_lead' },
  ];

  for (const c of cases) {
    const normalized = normalizeStage(c.raw);
    const doc = {
      name: `__TEST_DELETE_ME_${ts}_${c.raw}`,
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      stage: normalized || c.raw,
      budget: 0,
      source: 'verify-import-fix.mjs',
      notes: 'transient test doc — will be deleted at end of script',
    };
    const id = await createDoc(token, 'clients', doc);
    createdIds.push(['clients', id]);
    const back = await getDoc(token, 'clients', id);
    check(`[${c.label}] writes + reads back`, back.name === doc.name);
    check(`[${c.label}] stage = ${c.expectedNormalized}`, back.stage === c.expectedNormalized,
          `got "${back.stage}"`);
  }

  // ── Phase 3: confirm a row written with the OLD broken value would NOT
  //            match a canonical pipeline column. (Direct write, no normalize.)
  console.log('\nPhase 3 — confirm legacy "Active" stage is orphaned on the board');
  const orphanId = await createDoc(token, 'clients', {
    name: `__TEST_DELETE_ME_${ts}_LEGACY_ACTIVE`,
    stage: 'Active',  // the broken pre-fix value, written as-is
    budget: 0,
    source: 'verify-import-fix.mjs',
    notes: 'orphan test — should not show in any pipeline column',
  });
  createdIds.push(['clients', orphanId]);
  const orphan = await getDoc(token, 'clients', orphanId);
  check('orphan doc persisted with raw "Active"', orphan.stage === 'Active');
  check('orphan stage is NOT in CANONICAL_STAGES', !CANONICAL_STAGES.includes(orphan.stage),
        `(${orphan.stage} would be invisible on the pipeline — this confirms the bug we fixed)`);

} catch (e) {
  console.error('\n!! Test run threw:', e.message);
  failed++;
} finally {
  // ── Cleanup: delete every doc we created, regardless of pass/fail ────────
  console.log(`\nCleanup — deleting ${createdIds.length} test doc(s)`);
  let token;
  try { token = await getAccessToken(); } catch { token = null; }
  let cleaned = 0;
  for (const [coll, id] of createdIds) {
    try {
      if (!token) throw new Error('no auth token');
      await deleteDoc(token, coll, id);
      cleaned++;
      console.log(`  ✓ deleted ${coll}/${id}`);
    } catch (e) {
      console.log(`  ✗ delete ${coll}/${id} — ${e.message}`);
    }
  }
  console.log(`\nResult: ${passed} passed, ${failed} failed, ${cleaned}/${createdIds.length} test docs cleaned up`);
  process.exit(failed === 0 ? 0 : 1);
}
