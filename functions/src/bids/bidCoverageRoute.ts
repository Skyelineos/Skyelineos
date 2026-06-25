// GET /api/projects/:id/bids/coverage
//
// Per-project "Bid Coverage" view. Tyler wants to see, at a glance, every
// trade we'll need on a project and whether we have bids in flight (or
// already awarded) for each one. This route walks the 22 canonical phases
// from phaseCatalog.ts, picks the primary trade for each phase, and cross-
// references the project's bidRequests collection to compute a status.
//
// Status track per phase:
//   MISSING    — no bidRequest sent for this trade yet
//   INVITED    — bidRequest sent, no vendor has submitted a bid
//   SUBMITTED  — at least one vendor has submitted a bid
//   ANALYZED   — AI / human analysis run on the package
//   AWARDED    — a bid has been awarded for this trade
//
// If multiple bidRequests cover the same trade (e.g. re-bid), we pick the
// most advanced one (AWARDED > ANALYZED > SUBMITTED > INVITED).
//
// Auth: any Skyeline staff role (gc/admin/projectManager).

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import {
  CONSTRUCTION_PHASES,
  type ConstructionPhase,
} from '../tasks/phaseCatalog';

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

// Status weights for picking the "most advanced" bidRequest when multiple
// cover the same trade. Higher wins.
const STATUS_WEIGHT: Record<string, number> = {
  MISSING: 0,
  INVITED: 1,
  SUBMITTED: 2,
  ANALYZED: 3,
  AWARDED: 4,
};

type CoverageStatus = 'MISSING' | 'INVITED' | 'SUBMITTED' | 'ANALYZED' | 'AWARDED';

// Human label per phase. Kept tight — the panel shows these on each row.
const PHASE_LABELS: Record<ConstructionPhase, string> = {
  SITE_PREP: 'Site Prep / Excavation',
  FOUNDATION: 'Foundation / Concrete',
  FRAMING: 'Framing',
  ROUGH_PLUMBING: 'Rough Plumbing',
  ROUGH_ELECTRICAL: 'Rough Electrical',
  ROUGH_HVAC: 'Rough HVAC',
  FRAMING_INSPECTION: 'Framing Inspection',
  INSULATION: 'Insulation',
  DRYWALL: 'Drywall',
  PAINT: 'Paint',
  CABINETS: 'Cabinets',
  FLOORING: 'Flooring / Tile',
  TRIM: 'Trim & Millwork',
  FINISH_PLUMBING: 'Finish Plumbing',
  FINISH_ELECTRICAL: 'Finish Electrical',
  FINISH_HVAC: 'Finish HVAC',
  DOORS_HARDWARE: 'Doors & Hardware',
  EXTERIOR: 'Exterior / Siding / Roof',
  LANDSCAPING: 'Landscaping',
  PUNCH_LIST: 'Punch List',
  FINAL_INSPECTION: 'Final Inspection',
  CLOSE: 'Project Close-out',
};

// Map each phase → the canonical lowercased trade slug we use on bidRequests.
// Bid requests store free-form `trade` strings (see SendBidPackageModal +
// bidPackageTradeMap.ts) — we normalize for matching. The first entry is
// the primary slug; remaining entries are aliases that also count as
// covering this phase.
const PHASE_TRADE_SLUGS: Record<ConstructionPhase, string[]> = {
  SITE_PREP: ['excavation', 'site prep', 'site work', 'sitework', 'grading', 'dirtwork'],
  FOUNDATION: ['concrete', 'foundation'],
  FRAMING: ['framing', 'framer'],
  ROUGH_PLUMBING: ['plumbing', 'rough plumbing', 'plumber'],
  ROUGH_ELECTRICAL: ['electrical', 'rough electrical', 'electrician'],
  ROUGH_HVAC: ['hvac', 'rough hvac', 'mechanical'],
  FRAMING_INSPECTION: ['inspection', 'framing inspection', 'inspector'],
  INSULATION: ['insulation'],
  DRYWALL: ['drywall', 'drywaller', 'sheetrock'],
  PAINT: ['paint', 'painter', 'painting'],
  CABINETS: ['cabinets', 'cabinetry', 'cabinet'],
  FLOORING: ['flooring', 'tile', 'carpet', 'hardwood'],
  TRIM: ['trim', 'millwork', 'finish carpentry'],
  FINISH_PLUMBING: ['finish plumbing', 'plumbing finish', 'plumbing'],
  FINISH_ELECTRICAL: ['finish electrical', 'electrical finish', 'electrical'],
  FINISH_HVAC: ['finish hvac', 'hvac finish', 'hvac'],
  DOORS_HARDWARE: ['doors', 'hardware', 'doors & hardware', 'doors and hardware', 'door', 'door_window'],
  EXTERIOR: ['exterior', 'siding', 'stucco', 'roofing', 'roof', 'stucco_siding'],
  LANDSCAPING: ['landscaping', 'landscape'],
  PUNCH_LIST: ['punch list', 'punch', 'punchlist'],
  FINAL_INSPECTION: ['final inspection', 'final', 'inspection'],
  CLOSE: ['close', 'closeout', 'close out', 'close-out'],
};

function normalizeTrade(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

// Pre-compute slug → phase lookup. Built once at import time.
const SLUG_TO_PHASE = new Map<string, ConstructionPhase>();
for (const phase of CONSTRUCTION_PHASES) {
  for (const slug of PHASE_TRADE_SLUGS[phase]) {
    const key = normalizeTrade(slug);
    if (key && !SLUG_TO_PHASE.has(key)) {
      SLUG_TO_PHASE.set(key, phase);
    }
  }
}

// Resolve a bidRequest.trade string back to a phase. Returns the first
// phase where any alias matches.
function phaseForTradeString(raw: unknown): ConstructionPhase | null {
  const norm = normalizeTrade(raw);
  if (!norm) return null;
  // Exact match first.
  const exact = SLUG_TO_PHASE.get(norm);
  if (exact) return exact;
  // Substring fallback (e.g. "Concrete / Foundation" → concrete).
  for (const [slug, phase] of SLUG_TO_PHASE.entries()) {
    if (norm.includes(slug)) return phase;
  }
  return null;
}

function packageStatus(br: any, vendorStatuses: string[]): CoverageStatus {
  if (br?.status === 'awarded' || br?.awardedBidId) return 'AWARDED';
  if (br?.aiAnalysisAt || br?.analyzedAt) return 'ANALYZED';
  if (vendorStatuses.some((s) => s === 'submitted')) return 'SUBMITTED';
  return 'INVITED';
}

export function registerBidCoverageRoute(
  app: Express,
  db: admin.firestore.Firestore,
): void {
  app.get('/api/projects/:id/bids/coverage', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      const role = userSnap.exists ? (userSnap.data() as any)?.role : null;
      if (!role || !STAFF_ROLES.has(String(role))) {
        return res.status(403).json({ error: 'Staff role required' });
      }

      const projectId = req.params.id;
      if (!projectId) return res.status(400).json({ error: 'Missing project id' });

      // Load project name (best-effort — view should still render if missing).
      let projectName = '';
      try {
        const pSnap = await db.collection('projects').doc(projectId).get();
        if (pSnap.exists) {
          const p: any = pSnap.data();
          projectName = p?.name || p?.projectName || p?.title || '';
        }
      } catch { /* ignore */ }

      // Pull all bidRequests for this project (subcollection on the project doc,
      // matching how bidsSummaryRoute.ts reads them).
      const bidRequestsSnap = await db
        .collection('projects').doc(projectId)
        .collection('bidRequests')
        .orderBy('createdAt', 'desc')
        .limit(500)
        .get();

      // Pull all submitted bids in one shot — used for vendorCount / lowestBid /
      // awardedBid / awardedTo on each trade row.
      const bidsSnap = await db.collection('bids')
        .where('projectId', '==', projectId)
        .limit(1000)
        .get();
      const bidsByRequest = new Map<string, any[]>();
      for (const d of bidsSnap.docs) {
        const b: any = d.data();
        const list = bidsByRequest.get(b.bidRequestId) || [];
        list.push({ bidId: d.id, ...b });
        bidsByRequest.set(b.bidRequestId, list);
      }

      // Group bidRequests by phase. Multiple requests may cover the same
      // phase (re-bid, split scope) — keep them all so we can roll up.
      const byPhase = new Map<ConstructionPhase, any[]>();
      for (const d of bidRequestsSnap.docs) {
        const br: any = { id: d.id, ...d.data() };
        const phase = phaseForTradeString(br.trade) || phaseForTradeString(br.stage);
        if (!phase) continue; // unmapped trade — skipped from coverage view
        const list = byPhase.get(phase) || [];
        list.push(br);
        byPhase.set(phase, list);
      }

      const summary = {
        total: CONSTRUCTION_PHASES.length,
        awarded: 0,
        analyzed: 0,
        submitted: 0,
        invited: 0,
        missing: 0,
      };

      const trades = CONSTRUCTION_PHASES.map((phase) => {
        const label = PHASE_LABELS[phase];
        const requests = byPhase.get(phase) || [];

        if (requests.length === 0) {
          summary.missing += 1;
          return {
            trade: phase,
            label,
            status: 'MISSING' as CoverageStatus,
            bidRequestId: null,
            vendorCount: 0,
            lowestBid: null as number | null,
            awardedBid: null as number | null,
            awardedTo: null as string | null,
          };
        }

        // Pick the "most advanced" request for the coverage cell. Tie-break
        // on most-recent createdAt (bidRequestsSnap is already desc).
        let best: any = null;
        let bestStatus: CoverageStatus = 'INVITED';
        for (const br of requests) {
          const vendors: any[] = Array.isArray(br.vendors) ? br.vendors : [];
          const statuses = vendors.map((v) => String(v?.bidStatus || 'pending'));
          const status = packageStatus(br, statuses);
          if (!best || STATUS_WEIGHT[status] > STATUS_WEIGHT[bestStatus]) {
            best = br;
            bestStatus = status;
          }
        }

        const bidList = bidsByRequest.get(best.id) || [];
        const submittedBids = bidList.filter((b: any) => typeof b.totalAmount === 'number');
        const vendorCount = Array.isArray(best.vendors) ? best.vendors.length : 0;
        const lowestBid = submittedBids.length
          ? submittedBids.reduce((m: number, b: any) => (b.totalAmount < m ? b.totalAmount : m), Infinity)
          : null;

        let awardedBid: number | null = null;
        let awardedTo: string | null = null;
        if (best.awardedBidId) {
          const aw = bidList.find((b: any) => b.bidId === best.awardedBidId);
          if (aw) {
            if (typeof aw.totalAmount === 'number') awardedBid = aw.totalAmount;
            awardedTo = aw.subName || aw.subCompany || null;
          }
        }

        // Roll into summary buckets (top-of-track only).
        if (bestStatus === 'AWARDED') summary.awarded += 1;
        else if (bestStatus === 'ANALYZED') summary.analyzed += 1;
        else if (bestStatus === 'SUBMITTED') summary.submitted += 1;
        else summary.invited += 1;

        return {
          trade: phase,
          label,
          status: bestStatus,
          bidRequestId: best.id,
          vendorCount,
          lowestBid: lowestBid === Infinity ? null : lowestBid,
          awardedBid,
          awardedTo,
        };
      });

      return res.json({
        projectId,
        projectName,
        trades,
        summary,
      });
    } catch (e: any) {
      console.error('[bidCoverageRoute] error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}

// Exported for unit tests / shared FE typing if needed.
export const __testables = {
  PHASE_LABELS,
  PHASE_TRADE_SLUGS,
  phaseForTradeString,
  normalizeTrade,
};
