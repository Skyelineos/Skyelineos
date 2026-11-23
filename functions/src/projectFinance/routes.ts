import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import type { Express } from 'express';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { google } from 'googleapis';
import { getAuthorizedClient } from '../ingestionLab/googleClient';
import { requireAdmin, requireGcOnly } from '../middleware/rbac';
import { getValidToken, qbo } from '../qbo/client';
import { Invoice, loadInvoices, matchInvoices } from './ledger';

const path = '/api/project-finance';
type DB = FirebaseFirestore.Firestore;
function companyKey(env: string, realm: string) {
  return createHash('sha256')
    .update(env + '/' + realm)
    .digest('hex');
}
function snapshotFile(key: string) {
  return admin
    .storage()
    .bucket()
    .file('project-finance/' + key + '/invoices.json');
}
async function currentCompany(db: DB) {
  const doc = await db.collection('qboConnections').doc('global').get();
  const conn = doc.data();
  if (!conn?.realmId || !conn.refreshToken) return null;
  const env = conn.env || process.env.QBO_ENV || 'sandbox';
  return { env, key: companyKey(env, String(conn.realmId)) };
}
interface Snapshot {
  asOf: string;
  invoices: Invoice[];
}
async function readSnapshot(key: string): Promise<Snapshot | null> {
  try {
    const [bytes] = await snapshotFile(key).download();
    return JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    if (Number(err.code) === 404) return null;
    throw err;
  }
}
async function refresh(db: DB) {
  const token = await getValidToken(db);
  const key = companyKey(token.env, token.realmId);
  const file = snapshotFile(key);
  let generation = 0;
  try {
    generation = Number((await file.getMetadata())[0].generation);
  } catch (err) {
    if (Number(err.code) !== 404) throw err;
  }
  const asOf = new Date().toISOString();
  const invoices = await loadInvoices((sql) =>
    qbo(token, 'query', { query: 'query=' + encodeURIComponent(sql) })
  );
  // Publish only a complete pull. An overlapping refresh cannot overwrite a newer publication.
  await file.save(JSON.stringify({ asOf, invoices }), {
    gzip: true,
    resumable: false,
    contentType: 'application/json',
    preconditionOpts: { ifGenerationMatch: generation },
  });
}

export const refreshProjectReceivables = onSchedule(
  {
    schedule: '0 6 * * *',
    timeZone: 'America/Denver',
    timeoutSeconds: 540,
    secrets: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_ENV'],
  },
  async () => {
    const db = admin.firestore();
    if (!(await currentCompany(db))) return;
    try {
      await refresh(db);
    } catch (err) {
      if (Number(err.code) !== 412)
        throw new Error('Receivables refresh failed');
    }
  }
);

export function registerProjectFinance(app: Express, db: DB) {
  app.get(path, requireGcOnly, async (_req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      const company = await currentCompany(db);
      if (!company) return res.json({ connected: false });
      const [snapshot, jobs, reviews, links] = await Promise.all([
        readSnapshot(company.key),
        db.collection('projects').select('name', 'qboCustomerId').get(),
        db
          .collection('projectFinanceReviews')
          .doc(company.key)
          .collection('invoices')
          .get(),
        db
          .collection('projectFinanceReviews')
          .doc(company.key)
          .collection('customers')
          .get(),
      ]);
      const projects = jobs.docs.map((d) => ({
        id: d.id,
        name: String(d.get('name') || d.id),
        customerId: String(d.get('qboCustomerId') || ''),
      }));
      const approvals = new Map(
        reviews.docs.map((d) => [d.id, String(d.get('projectId'))] as const)
      );
      return res.json({
        connected: true,
        env: company.env,
        company: company.key,
        asOf: snapshot?.asOf || null,
        projects,
        invoices: matchInvoices(
          snapshot?.invoices || [],
          projects,
          approvals,
          new Map(
            links.docs.map((d) => [d.id, String(d.get('projectId'))] as const)
          )
        ),
      });
    } catch {
      return res
        .status(503)
        .json({ error: 'Could not read the project finance dashboard.' });
    }
  });

  app.post(path + '/refresh', requireAdmin, async (_req, res) => {
    try {
      await refresh(db);
      return res.json({ ok: true });
    } catch (err) {
      if (Number(err.code) === 412) return res.json({ ok: true });
      return res
        .status(503)
        .json({
          error:
            'Refresh failed. Check the QuickBooks connection and try again.',
        });
    }
  });

  app.post(path + '/approve', requireAdmin, async (req: any, res) => {
    const { company, invoiceId, projectId } = req.body || {};
    if (
      ![invoiceId, projectId].every(
        (v) =>
          typeof v === 'string' && v && !v.includes('/') && v.length <= 1500
      )
    ) {
      return res.status(400).json({ error: 'Select an invoice and project.' });
    }
    try {
      const active = await currentCompany(db);
      if (!active || active.key !== company)
        return res
          .status(409)
          .json({ error: 'Company changed. Reload the dashboard.' });
      const snapshot = await readSnapshot(active.key);
      const invoice = snapshot?.invoices.find((i) => i.id === invoiceId);
      if (!invoice) return res.status(404).json({ error: 'Invoice missing.' });
      const customerScope = req.body.scope === 'customer';
      if (customerScope && !/^\d+$/.test(invoice.customerId))
        return res.status(400).json({ error: 'Valid customer ID required.' });
      const decisions = db.collection('projectFinanceReviews').doc(active.key);
      const targets = [decisions.collection('invoices').doc(invoiceId)];
      if (customerScope)
        targets.push(decisions.collection('customers').doc(invoice.customerId));
      const recorded = await db.runTransaction(async (tx) => {
        const project = await tx.get(db.collection('projects').doc(projectId));
        if (!project.exists) return false;
        const previous = await tx.getAll(...targets);
        const decision = {
          projectId,
          approvedBy: req.user.uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        for (const prior of previous) {
          if (prior.get('projectId') === projectId) continue;
          tx.set(prior.ref, decision);
          tx.create(prior.ref.collection('history').doc(), decision);
        }
        return true;
      });
      return recorded
        ? res.json({ ok: true })
        : res.status(404).json({ error: 'Project missing.' });
    } catch {
      return res
        .status(503)
        .json({ error: 'Could not save this project assignment.' });
    }
  });

  app.post(path + '/connections', requireAdmin, async (_req, res) => {
    const check = async (test: () => Promise<unknown>) => {
      try {
        await test();
        return true;
      } catch {
        return false;
      }
    };
    const [firestore, quickbooks, gmail, drive] = await Promise.all([
      check(() => db.collection('projects').limit(1).get()),
      check(async () => {
        const token = await getValidToken(db);
        const reply = await qbo(token, 'query', {
          query:
            'query=' + encodeURIComponent('SELECT * FROM Invoice MAXRESULTS 1'),
        });
        if (!reply?.QueryResponse) throw new Error('Invalid invoice response');
      }),
      check(async () =>
        google
          .gmail({
            version: 'v1',
            auth: await getAuthorizedClient(db, 'gmail'),
          })
          .users.getProfile({ userId: 'me' })
      ),
      check(async () =>
        google
          .drive({
            version: 'v3',
            auth: await getAuthorizedClient(db, 'drive'),
          })
          .files.list({ pageSize: 1, fields: 'files(id)' })
      ),
    ]);
    return res.json({ firestore, quickbooks, gmail, drive });
  });
}
