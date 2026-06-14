// ─────────────────────────────────────────────────────────────────────────────
// E2E harness — core library
//
// A small, dependency-light harness for end-to-end testing the live app from
// Node. It signs in as a test account, drives the real /api Cloud Functions and
// Firestore, asserts behavior, and — critically — tracks everything it creates
// so it can AUTO-DELETE on the way out (even if a test throws).
//
// SAFETY MODEL (so this can never nuke real data):
//   1. Every doc the harness creates directly is tagged { __e2e: true, __e2eRun }
//      and registered for teardown.
//   2. Cloud-Function-created docs (e.g. projectTasks from "generate") are scoped
//      to a throwaway test project; teardown deletes them by projectId.
//   3. teardown() only ever deletes docs the harness registered or that carry the
//      __e2e tag. It never issues an unscoped delete.
//   4. The standalone cleanup.mjs can sweep any leftover __e2e-tagged docs if a
//      run was killed mid-flight.
//
// Config (put in .env.local — gitignored):
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
//   VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
//   VITE_FIREBASE_APP_ID
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD   (a DEDICATED test admin account)
//   E2E_BASE_URL   (optional, default https://skyelineos.web.app)
//   E2E_API_BASE   (optional, default `${E2E_BASE_URL}/api`)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

// ── Tiny .env loader (no dependency on dotenv's auto-load order) ──────────────
function loadEnvFile(name) {
  try {
    const text = readFileSync(resolve(REPO_ROOT, name), 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* file optional */
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('\n❌ Missing required env vars in .env.local:\n   ' + missing.join('\n   '));
    console.error('\nSee scripts/e2e/README.md for setup.\n');
    process.exit(2);
  }
}

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};

export const BASE_URL = process.env.E2E_BASE_URL || 'https://skyelineos.web.app';
export const API_BASE = process.env.E2E_API_BASE || `${BASE_URL}/api`;
export const RUN_ID = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
export const E2E_TAG = '__e2e';

export class AssertionError extends Error {}
export function assert(cond, msg) {
  if (!cond) throw new AssertionError(msg || 'assertion failed');
}
export function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new AssertionError(`${msg || 'expected equality'} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

export function createHarness() {
  requireEnv([
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'E2E_ADMIN_EMAIL',
    'E2E_ADMIN_PASSWORD',
  ]);

  const app = initializeApp({
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  // ── Teardown registry ──────────────────────────────────────────────────────
  // Records exactly what to delete. `docs` = direct doc refs we created.
  // `projectScopes` = projectIds whose projectTasks / taskImprovements (created
  // by Cloud Functions) must be swept by query.
  const registry = { docRefs: [], projectScopes: [] };

  const results = [];
  let currentUser = null;

  const log = (...a) => console.log(...a);

  async function signIn() {
    const cred = await signInWithEmailAndPassword(
      auth,
      process.env.E2E_ADMIN_EMAIL,
      process.env.E2E_ADMIN_PASSWORD,
    );
    currentUser = cred.user;
    log(`${C.dim}✓ signed in as ${currentUser.email}${C.reset}`);
    return currentUser;
  }

  // Call the live /api Cloud Function with the signed-in user's ID token.
  async function api(path, method = 'GET', body) {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-json */
    }
    return { status: res.status, ok: res.ok, data };
  }

  // ── Tracked Firestore writes (auto-tagged + registered for teardown) ────────
  async function createDoc(collectionName, data) {
    const ref = await addDoc(collection(db, collectionName), {
      ...data,
      [E2E_TAG]: true,
      __e2eRun: RUN_ID,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    registry.docRefs.push(ref);
    return ref;
  }
  function trackDocPath(collectionName, id) {
    registry.docRefs.push(doc(db, collectionName, id));
  }
  function trackProjectScope(projectId) {
    registry.projectScopes.push(projectId);
  }

  // ── Test runner ─────────────────────────────────────────────────────────────
  async function test(name, fn) {
    const t0 = Date.now();
    try {
      await fn();
      results.push({ name, ok: true, ms: Date.now() - t0 });
      log(`  ${C.green}✓${C.reset} ${name} ${C.dim}(${Date.now() - t0}ms)${C.reset}`);
    } catch (e) {
      results.push({ name, ok: false, ms: Date.now() - t0, err: e.message });
      log(`  ${C.red}✗ ${name}${C.reset}\n      ${C.red}${e.message}${C.reset}`);
    }
  }

  // ── Teardown — always runs (orchestrator calls in finally) ──────────────────
  async function teardown({ keep = false } = {}) {
    if (keep) {
      log(`${C.yellow}⚠ --keep set: leaving ${registry.docRefs.length} docs + ${registry.projectScopes.length} project scopes in place.${C.reset}`);
      return { deleted: 0, kept: true };
    }
    let deleted = 0;
    // 1) Sweep Cloud-Function-created docs scoped to test projects.
    for (const projectId of registry.projectScopes) {
      for (const coll of ['projectTasks', 'taskImprovements']) {
        try {
          const snap = await getDocs(query(collection(db, coll), where('projectId', '==', projectId)));
          for (const d of snap.docs) {
            await deleteDoc(d.ref);
            deleted++;
          }
        } catch (e) {
          log(`${C.yellow}  cleanup warn (${coll}/${projectId}): ${e.message}${C.reset}`);
        }
      }
    }
    // 2) Delete directly-created docs (reverse order).
    for (const ref of registry.docRefs.reverse()) {
      try {
        await deleteDoc(ref);
        deleted++;
      } catch (e) {
        log(`${C.yellow}  cleanup warn (${ref.path}): ${e.message}${C.reset}`);
      }
    }
    log(`${C.cyan}🧹 teardown removed ${deleted} doc(s).${C.reset}`);
    return { deleted, kept: false };
  }

  function summary() {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    log('');
    log(`${C.bold}── E2E summary ──${C.reset}`);
    log(`  ${C.green}${passed} passed${C.reset}` + (failed ? `, ${C.red}${failed} failed${C.reset}` : ''));
    if (failed) {
      log(`${C.red}Failures:${C.reset}`);
      results.filter((r) => !r.ok).forEach((r) => log(`  ✗ ${r.name}: ${r.err}`));
    }
    return { passed, failed };
  }

  return {
    app, auth, db, registry, RUN_ID,
    signIn, signOut: () => signOut(auth),
    api, createDoc, trackDocPath, trackProjectScope,
    test, assert, assertEq, teardown, summary, log,
    // re-export firestore helpers suites may need
    fs: { collection, doc, getDoc, getDocs, query, where, addDoc, setDoc, deleteDoc, serverTimestamp },
  };
}
