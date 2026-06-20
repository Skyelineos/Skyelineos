// POST /api/compliance/upload
//
// Sub self-service compliance doc registration. Pairs with the client-side
// Storage upload — the browser uploads the actual file to
//   projects/{projectId}/compliance/{subContactId}/{type}-{ts}.{ext}
// (protected by Stream 1's isOnProject(projectId) rule) and then calls this
// endpoint to write the Firestore side-effects.
//
// Why a separate server endpoint and not a direct client write?
//   1. Server verifies request.auth.uid === contact.linkedUserId so a sub
//      can only register docs on THEIR OWN contact, even if they tried to
//      tamper with subContactId in DevTools.
//   2. Server enforces the size cap (<=10MB) and MIME allowlist
//      (application/pdf, image/*) on the metadata the client claims.
//   3. Server mirrors the per-doc compliance entry into the legacy
//      users/{uid} flags that the D-016 award gate (awardBidRoute.ts) reads —
//      w9Filed, insuranceCurrent, agreementSigned, contractorLicenseNumber.
//      Once a follow-up dispatch updates the gate to read from
//      contacts/{subContactId}.compliance.{type}, this mirror block
//      becomes redundant. Until then, dual-write is the correct move.
//
// Auth: inherits /api authMiddleware from Stream 1 — req.user.uid is set.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_EXACT = new Set(['application/pdf']);

type ComplianceType = 'w9' | 'coi' | 'agreement' | 'contractorLicense';

const VALID_TYPES = new Set<ComplianceType>(['w9', 'coi', 'agreement', 'contractorLicense']);

interface UploadPayload {
  subContactId: string;
  projectId: string;           // path scope under Storage isOnProject rule
  type: ComplianceType;
  storagePath: string;         // projects/{projectId}/compliance/{subContactId}/{type}-{ts}.{ext}
  fileName: string;
  fileUrl: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt?: string;          // ISO date — required for type='coi'
  contractorLicenseNumber?: string; // required for type='contractorLicense'
}

function isMimeAllowed(mime: string): boolean {
  if (!mime) return false;
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some(p => mime.startsWith(p));
}

export function registerComplianceUploadRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/compliance/upload', async (req: any, res: any) => {
    try {
      // req.user is set by /api authMiddleware (Stream 1).
      const uid: string | undefined = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Sign in required' });

      const data = req.body as UploadPayload;

      // ── Shape validation ──────────────────────────────────────────────
      if (!data?.subContactId || !data?.type || !data?.storagePath || !data?.fileUrl) {
        return res.status(400).json({ error: 'Missing subContactId, type, storagePath, or fileUrl' });
      }
      if (!VALID_TYPES.has(data.type)) {
        return res.status(400).json({ error: `Invalid type — must be one of: ${[...VALID_TYPES].join(', ')}` });
      }
      if (!data.projectId) {
        return res.status(400).json({ error: 'projectId required (Storage path is project-scoped)' });
      }
      if (typeof data.sizeBytes !== 'number' || data.sizeBytes <= 0) {
        return res.status(400).json({ error: 'sizeBytes required' });
      }
      if (data.sizeBytes > MAX_BYTES) {
        return res.status(400).json({ error: `File too large — max ${MAX_BYTES / 1024 / 1024}MB` });
      }
      if (!isMimeAllowed(data.mimeType)) {
        return res.status(400).json({ error: 'File type not allowed — PDF or image only' });
      }
      // Server-side enforce the path shape so a tampered client can't
      // register a file that landed outside the rule's project scope.
      const expectedPrefix = `projects/${data.projectId}/compliance/${data.subContactId}/`;
      if (!data.storagePath.startsWith(expectedPrefix)) {
        return res.status(400).json({
          error: 'storagePath must live under projects/{projectId}/compliance/{subContactId}/',
        });
      }

      // Type-specific required fields
      if (data.type === 'coi' && !data.expiresAt) {
        return res.status(400).json({ error: 'COI requires an expiresAt date' });
      }
      if (data.type === 'contractorLicense' && !String(data.contractorLicenseNumber || '').trim()) {
        return res.status(400).json({ error: 'Contractor license requires contractorLicenseNumber' });
      }

      // ── Ownership: sub uploads to their OWN contact only ─────────────
      const contactRef = db.collection('contacts').doc(data.subContactId);
      const contactSnap = await contactRef.get();
      if (!contactSnap.exists) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      const contact = contactSnap.data() as any;
      if (contact.linkedUserId !== uid) {
        // Don't leak whose contact this is.
        return res.status(403).json({ error: 'You can only upload compliance docs to your own contact record' });
      }

      // ── Write to Firestore ────────────────────────────────────────────
      const now = admin.firestore.FieldValue.serverTimestamp();
      const entry: Record<string, any> = {
        uploadedAt: now,
        fileUrl: data.fileUrl,
        fileName: data.fileName || data.storagePath.split('/').pop() || 'doc',
        storagePath: data.storagePath,
        sizeBytes: data.sizeBytes,
        mimeType: data.mimeType,
      };
      if (data.expiresAt) entry.expiresAt = data.expiresAt;
      if (data.contractorLicenseNumber) {
        entry.contractorLicenseNumber = String(data.contractorLicenseNumber).trim();
      }

      // Batch write: contact compliance entry + legacy user-doc gate flags.
      const batch = db.batch();
      batch.set(
        contactRef,
        {
          compliance: { [data.type]: entry },
          updatedAt: now,
        },
        { merge: true },
      );

      // Mirror to users/{uid} so the D-016 award gate in
      // awardBidRoute.ts (which reads users/{uid}.w9Filed etc.) sees the
      // upload immediately. Keep this in sync with the gate's field names.
      const userRef = db.collection('users').doc(uid);
      const userMirror: Record<string, any> = { complianceUpdatedAt: now };
      if (data.type === 'w9') userMirror.w9Filed = true;
      if (data.type === 'coi') {
        userMirror.insuranceCurrent = true;
        if (data.expiresAt) userMirror.insuranceExpiresAt = data.expiresAt;
      }
      if (data.type === 'agreement') {
        userMirror.agreementSigned = true;
        userMirror.agreementSignedAt = new Date().toISOString();
      }
      if (data.type === 'contractorLicense' && data.contractorLicenseNumber) {
        userMirror.contractorLicenseNumber = String(data.contractorLicenseNumber).trim();
      }
      batch.set(userRef, userMirror, { merge: true });
      await batch.commit();

      // TODO Dispatch 6: fire `compliance_doc_uploaded` trigger
      // audience=gc, projectId=data.projectId, recipient=project GC, vars={
      //   subName: contact.name, docType: data.type, link: '/contacts/{id}'
      // }. Suppressed until the registry lands so we don't dual-fire.

      return res.json({
        ok: true,
        type: data.type,
        subContactId: data.subContactId,
        // Tell the client which legacy flags we mirrored so it can update
        // its local view of users/{uid} without a re-read round trip.
        mirroredUserFlags: Object.keys(userMirror).filter(k => k !== 'complianceUpdatedAt'),
      });
    } catch (err: any) {
      console.error('[complianceUpload] failed', err);
      return res.status(500).json({ error: err?.message || 'Upload registration failed' });
    }
  });
}
