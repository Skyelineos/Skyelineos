#!/usr/bin/env node
/**
 * Seed the master costCodes collection from data/skyeline_cost_codes.csv
 * Run from repo root:  node scripts/seed-cost-codes.mjs
 * Auth: uses Application Default Credentials (gcloud auth application-default login)
 * or GOOGLE_APPLICATION_CREDENTIALS pointing at a service account key.
 *
 * Safe to re-run: upserts by code (merge), never deletes.
 * NOTE: This is the company-wide master catalog (root collection `costCodes`),
 * separate from the per-estimate costGroups/costCodes subcollections.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
initializeApp({ credential: applicationDefault() });
const db = getFirestore();

// Minimal CSV parse (no quoted commas in this file except item names w/ '&' only)
const csvPath = path.join(__dirname, '..', 'data', 'skyeline_cost_codes.csv');
const lines = readFileSync(csvPath, 'utf8').trim().split('\n');
const headers = lines[0].split(',');

const rows = lines.slice(1).map((line) => {
  const cols = line.split(',');
  // Re-join overflow columns into notes (last field) if item text had commas
  const fixed = cols.slice(0, headers.length - 1);
  fixed.push(cols.slice(headers.length - 1).join(','));
  return Object.fromEntries(headers.map((h, i) => [h, (fixed[i] || '').trim()]));
});

let count = 0;
let batch = db.batch();

for (const r of rows) {
  if (!r.code) continue;
  const ref = db.collection('costCodes').doc(r.code);
  batch.set(ref, {
    code: r.code,
    item: r.item,
    division: r.division,
    divisionNum: r.code.split('-')[0],
    bidPackage: r.bid_package,
    clientCategory: r.client_category,
    allowance: r.allowance === 'Y',
    tierVariable: r.tier_variable === 'Y',
    notes: r.notes || '',
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  count++;
  if (count % 400 === 0) { await batch.commit(); batch = db.batch(); }
}
await batch.commit();
console.log(`Seeded ${count} master cost codes to Firestore.`);
