import { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection, addDoc, setDoc, serverTimestamp, getDocs, query, orderBy, doc, updateDoc, where,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
// Note: in-app notification fan-out moved to a deliberate no-op below.
// The styled HTML email from /api/bid-requests/send IS the notification now.
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TradeTypeComboBox } from '@/components/contacts/TradeTypeComboBox';
import { StarRating } from '@/components/common/StarRating';
import { BidPackageTemplatePicker } from './BidPackageTemplatePicker';
import {
  Send, X, Hammer, FileText, Paperclip, Plus, Trash2, AlertCircle, Save, Sparkles,
  ChevronDown, ChevronRight, Image as ImageIcon, ExternalLink,
} from 'lucide-react';
import type { BidRequestPlan } from './types';
import { defaultsForTrade, isDefaultPlanForTrade, isDefaultSelectionForTrade } from '@/lib/bidPackageTradeMap';
import { getBidSetGate, missingApprovals, type BidSetGate } from '@/lib/ssot/bidSet';

interface Props {
  open: boolean;
  projectId: string;
  projectName?: string;
  onClose: () => void;
}

interface Sub {
  id: string;
  name: string;
  company?: string;
  email?: string;
  // Effective list of trades — `trades[]` if present, else [trade] if set.
  trades: string[];
  phone?: string;
  // Firebase Auth UID, if this contact has been linked to a portal user. Used
  // to address in-app notifications so they show up in the sub's bell.
  linkedUserId?: string;
  // 1–5 manual quality rating (sorts highest-first in the picker).
  rating?: number;
}

interface TradeSection {
  // Stable client-side key (not the saved doc id).
  key: string;
  trade: string;
  scope: string;
  // Override the common due date if non-empty.
  dueDate?: string;
  selectedSubIds: Set<string>;
  // Auto-attached project plans + selections per trade. Pre-checked using
  // trade→category defaults from bidPackageTradeMap; Tyler can manually
  // toggle and the change sticks (see touchedPlans/touchedSelections).
  attachedPlanIds: string[];
  attachedSelectionIds: string[];
  // Tracks whether the user has manually overridden defaults — once true we
  // never recompute that set behind their back.
  touchedPlans: boolean;
  touchedSelections: boolean;
  // Local UI: collapse the attachment lists by default to keep modal compact.
  showPlans: boolean;
  showSelections: boolean;
}

// Project plans pulled from documents/ (Step5Plans.tsx writes them with
// category 'plans' and the project plan filename). Surfaced per trade so
// Tyler doesn't have to re-upload on every send.
interface ProjectPlan {
  id: string;
  name: string;       // friendly display name
  fileName: string;   // raw uploaded filename — used for sheet-prefix fallback match
  fileUrl: string;
  storagePath?: string;
  size?: number;
  category?: string;     // 'plans', 'structural', 'architectural', ...
  sheetPrefix?: string;  // 'A', 'S', 'M', 'E', 'P', 'R', 'C', 'L' — written by some upload paths
}

// Project selections pulled from projects/{id}/selections. SelectionsManager
// stores items inside .items[] — we flatten the first item's product data for
// display, since most selection cards show one product per category+area.
interface ProjectSelection {
  id: string;
  category?: string;     // 'Tile', 'Cabinets & Millwork', 'Plumbing Fixtures', ...
  area?: string;
  room?: string;
  floor?: string;
  productName?: string;  // from items[0]?.productName
  vendor?: string;       // brand
  imageUrl?: string;     // items[0]?.imageUrls?.[0]
  productUrl?: string;
  description?: string;  // size / layout / grout summary
}

const newKey = () => Math.random().toString(36).slice(2, 9);

function blankTradeSection(): TradeSection {
  return {
    key: newKey(),
    trade: '',
    scope: '',
    selectedSubIds: new Set(),
    attachedPlanIds: [],
    attachedSelectionIds: [],
    touchedPlans: false,
    touchedSelections: false,
    showPlans: false,
    showSelections: false,
  };
}

export function SendBidPackageModal({ open, projectId, projectName, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [packageName, setPackageName] = useState('');
  const [commonDueDate, setCommonDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [commonNotes, setCommonNotes] = useState('');

  // Pre-bid client-approval gate (design §5b): no sub can be invited until the
  // bid set clears the Approval Quorum.
  const [bidGate, setBidGate] = useState<BidSetGate | null>(null);
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    getBidSetGate(projectId)
      .then(g => { if (!cancelled) setBidGate(g); })
      .catch(e => console.warn('[ssot] bid-set gate load failed', e));
    return () => { cancelled = true; };
  }, [open, projectId]);

  const [allSubs, setAllSubs] = useState<Sub[]>([]);
  // Trade name → { id, defaultScope } so we can apply / save default scopes.
  const [tradeTemplates, setTradeTemplates] = useState<Record<string, { id: string; defaultScope: string }>>({});
  const [applyDefaultScopes, setApplyDefaultScopes] = useState(true);

  // Project plans + selections — pulled once when the modal opens, then used
  // to auto-attach per trade. The trade map (bidPackageTradeMap.ts) determines
  // which docs/selections are pre-checked. Tyler can override per trade.
  const [projectPlans, setProjectPlans] = useState<ProjectPlan[]>([]);
  const [projectSelections, setProjectSelections] = useState<ProjectSelection[]>([]);

  const [tradeSections, setTradeSections] = useState<TradeSection[]>([blankTradeSection()]);

  const [plans, setPlans] = useState<BidRequestPlan[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savingTemplateKey, setSavingTemplateKey] = useState<string | null>(null);

  // Reset on open + load subs
  useEffect(() => {
    if (!open) return;
    setPackageName(projectName ? `Bid Package — ${projectName}` : 'Bid Package');
    setCommonNotes('');
    setPlans([]);
    setTradeSections([blankTradeSection()]);
    setProjectPlans([]);
    setProjectSelections([]);

    (async () => {
      try {
        // Load trade templates so we can apply / save default scopes.
        const tradesSnap = await getDocs(collection(db, 'trades'));
        const templates: Record<string, { id: string; defaultScope: string }> = {};
        tradesSnap.docs.forEach(d => {
          const data = d.data() as any;
          if (data.name) templates[String(data.name)] = { id: d.id, defaultScope: String(data.defaultScope || '') };
        });
        setTradeTemplates(templates);
      } catch {
        // Ignore — applying defaults is optional.
      }

      try {
        const snap = await getDocs(query(collection(db, 'contacts'), orderBy('name')));
        const subs: Sub[] = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter((c: any) => c.role === 'subcontractor' || c.role === 'sub' || c.role === 'vendor')
          .map((c: any) => {
            const arr: string[] = Array.isArray(c.trades) ? c.trades.filter((t: any) => typeof t === 'string' && t.trim()) : [];
            const legacy = typeof c.trade === 'string' && c.trade.trim() ? c.trade.trim() : '';
            const trades = arr.length > 0 ? arr : (legacy ? [legacy] : []);
            return {
              id: c.id,
              name: c.name,
              company: c.company,
              email: c.email,
              trades,
              phone: c.phone,
              linkedUserId: c.linkedUserId,
              rating: typeof c.rating === 'number' ? c.rating : 0,
            };
          });
        setAllSubs(subs);
      } catch (e: any) {
        toast({ title: 'Could not load subs', description: e.message, variant: 'destructive' });
      }
    })();

    // Load project documents (filtered to plan-ish categories) + selections.
    // Soft-fails on either side so the modal still works without them.
    (async () => {
      if (!projectId) return;
      try {
        const docsSnap = await getDocs(query(
          collection(db, 'documents'),
          where('projectId', '==', projectId),
        ));
        const planLike = new Set([
          'plans', 'plan', 'structural', 'architectural', 'electrical',
          'mechanical', 'plumbing', 'roof', 'site', 'civil', 'landscape',
        ]);
        const docs: ProjectPlan[] = (docsSnap.docs as any[])
          .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
          .filter((d: any) => {
            const cat = String(d.category || '').toLowerCase();
            // Match either an exact known category OR a sheet-prefix in the
            // filename — handles plans uploaded without a category tag.
            const fname = String(d.fileName || d.name || '');
            const sheetMatch = /^([A-Z])[-_.]/.test(fname);
            return planLike.has(cat) || sheetMatch;
          })
          .map((d: any) => ({
            id: d.id,
            name: String(d.name || d.fileName || 'Plan'),
            fileName: String(d.fileName || d.name || ''),
            fileUrl: String(d.fileUrl || ''),
            storagePath: typeof d.storagePath === 'string' ? d.storagePath : undefined,
            size: typeof d.size === 'number' ? d.size : undefined,
            category: typeof d.category === 'string' ? d.category : undefined,
            sheetPrefix: typeof d.sheetPrefix === 'string' ? d.sheetPrefix : undefined,
          }))
          .filter((d: ProjectPlan) => d.fileUrl);
        setProjectPlans(docs);
      } catch (e) {
        console.warn('[bid-package-modal] could not load project plans', e);
      }
      try {
        const selSnap = await getDocs(collection(db, 'projects', projectId, 'selections'));
        const sels: ProjectSelection[] = (selSnap.docs as any[]).map((d: any) => {
          const data = d.data() as any;
          // SelectionsManager stores actual products inside items[]. Pull the
          // first non-removed item for display — that's the canonical "what
          // the client picked" for this category+area.
          const items: any[] = Array.isArray(data.items) ? data.items : [];
          const firstItem = items.find(i => i && i.status !== 'removed') || items[0] || {};
          const parts: string[] = [];
          if (firstItem.size) parts.push(String(firstItem.size));
          if (firstItem.tileLayout) parts.push(`Layout: ${firstItem.tileLayout}`);
          if (firstItem.grout) parts.push(`Grout: ${firstItem.grout}`);
          if (data.area) parts.push(String(data.area));
          if (data.room) parts.push(String(data.room));
          return {
            id: d.id,
            category: typeof data.category === 'string' ? data.category : undefined,
            area: typeof data.area === 'string' ? data.area : undefined,
            room: typeof data.room === 'string' ? data.room : undefined,
            floor: typeof data.floor === 'string' ? data.floor : undefined,
            productName: typeof firstItem.productName === 'string' ? firstItem.productName : undefined,
            vendor: typeof firstItem.vendor === 'string' ? firstItem.vendor : undefined,
            imageUrl: Array.isArray(firstItem.imageUrls) && firstItem.imageUrls[0] ? String(firstItem.imageUrls[0]) : undefined,
            productUrl: typeof firstItem.productUrl === 'string' ? firstItem.productUrl : undefined,
            description: parts.length > 0 ? parts.join(' · ') : undefined,
          };
        });
        setProjectSelections(sels);
      } catch (e) {
        console.warn('[bid-package-modal] could not load project selections', e);
      }
      // Reset per-modal so a re-open does not stack data.
      // (state is also reset above when modal opens)
    })();
  }, [open, projectId, projectName, toast]);

  const addTradeSection = () => {
    setTradeSections(s => [...s, blankTradeSection()]);
  };
  const removeTradeSection = (key: string) => {
    setTradeSections(s => s.length === 1 ? s : s.filter(x => x.key !== key));
  };
  const updateSection = (key: string, patch: Partial<TradeSection>) => {
    setTradeSections(s => s.map(x => x.key === key ? { ...x, ...patch } : x));
  };

  // When the user picks a trade for a section, auto-fill scope from the saved
  // template if `applyDefaultScopes` is on and the current scope is empty.
  // Also recompute default plan + selection attachments based on the trade
  // map — unless Tyler has manually toggled the lists already, in which case
  // we preserve his picks.
  const setTradeOnSection = (key: string, trade: string) => {
    setTradeSections(s => s.map(x => {
      if (x.key !== key) return x;
      const template = tradeTemplates[trade]?.defaultScope || '';
      const shouldFill = applyDefaultScopes && template && !x.scope.trim();
      const nextPlanIds = x.touchedPlans
        ? x.attachedPlanIds
        : projectPlans
            .filter(d => isDefaultPlanForTrade({ category: d.category, sheetPrefix: d.sheetPrefix, filename: d.fileName }, trade))
            .map(d => d.id);
      const nextSelectionIds = x.touchedSelections
        ? x.attachedSelectionIds
        : projectSelections
            .filter(sel => isDefaultSelectionForTrade({ category: sel.category }, trade))
            .map(sel => sel.id);
      return {
        ...x,
        trade,
        selectedSubIds: new Set(),
        scope: shouldFill ? template : x.scope,
        attachedPlanIds: nextPlanIds,
        attachedSelectionIds: nextSelectionIds,
        // Reveal the lists when something was auto-checked so Tyler sees them.
        showPlans: x.showPlans || nextPlanIds.length > 0,
        showSelections: x.showSelections || nextSelectionIds.length > 0,
      };
    }));
  };

  // Toggle helpers for the per-trade plan + selection checklists. Setting
  // `touched: true` prevents future trade renames from blowing away manual
  // picks.
  const toggleAttachedPlan = (key: string, planId: string) => {
    setTradeSections(s => s.map(x => {
      if (x.key !== key) return x;
      const has = x.attachedPlanIds.includes(planId);
      return {
        ...x,
        attachedPlanIds: has ? x.attachedPlanIds.filter(id => id !== planId) : [...x.attachedPlanIds, planId],
        touchedPlans: true,
      };
    }));
  };
  const toggleAttachedSelection = (key: string, selId: string) => {
    setTradeSections(s => s.map(x => {
      if (x.key !== key) return x;
      const has = x.attachedSelectionIds.includes(selId);
      return {
        ...x,
        attachedSelectionIds: has ? x.attachedSelectionIds.filter(id => id !== selId) : [...x.attachedSelectionIds, selId],
        touchedSelections: true,
      };
    }));
  };

  // Build one section per distinct trade in the contact list, with all matching
  // subs preselected. Used by the "broadcast to all subs" shortcut.
  const broadcastToAllSubs = () => {
    const tradeSet = new Set<string>();
    allSubs.forEach(s => s.trades.forEach(t => t.trim() && tradeSet.add(t.trim())));
    if (tradeSet.size === 0) {
      toast({
        title: 'No subs with trades found',
        description: 'Add subs with trades in Contacts first.',
        variant: 'destructive',
      });
      return;
    }
    const sections: TradeSection[] = Array.from(tradeSet).sort().map(trade => {
      const matched = subsForTrade(trade);
      const template = tradeTemplates[trade]?.defaultScope || '';
      const base = blankTradeSection();
      return {
        ...base,
        trade,
        scope: applyDefaultScopes ? template : '',
        selectedSubIds: new Set(matched.map(s => s.id)),
        attachedPlanIds: projectPlans.filter(d => isDefaultPlanForTrade({ category: d.category, sheetPrefix: d.sheetPrefix, filename: d.fileName }, trade)).map(d => d.id),
        attachedSelectionIds: projectSelections.filter(s => isDefaultSelectionForTrade({ category: s.category }, trade)).map(s => s.id),
      };
    });
    setTradeSections(sections);
    toast({
      title: 'Broadcast prepared',
      description: `${sections.length} trade${sections.length === 1 ? '' : 's'} loaded with all matching subs selected.`,
    });
  };

  // Persist the current scope text as the default scope for this trade so the
  // next bid package can auto-apply it.
  const saveScopeAsDefault = async (sec: TradeSection) => {
    const trade = sec.trade.trim();
    const scope = sec.scope.trim();
    if (!trade || !scope) {
      toast({ title: 'Pick a trade and write a scope first', variant: 'destructive' });
      return;
    }
    setSavingTemplateKey(sec.key);
    try {
      const existing = tradeTemplates[trade];
      if (existing?.id) {
        await updateDoc(doc(db, 'trades', existing.id), {
          defaultScope: scope,
          updatedAt: serverTimestamp(),
        });
        setTradeTemplates(t => ({ ...t, [trade]: { id: existing.id, defaultScope: scope } }));
      } else {
        // Trade row may not exist yet (TradeTypeComboBox auto-creates them, but
        // be defensive in case of races).
        const tradesSnap = await getDocs(query(collection(db, 'trades'), where('name', '==', trade)));
        let id = '';
        if (!tradesSnap.empty) {
          id = tradesSnap.docs[0].id;
          await updateDoc(doc(db, 'trades', id), {
            defaultScope: scope,
            updatedAt: serverTimestamp(),
          });
        } else {
          const ref = await addDoc(collection(db, 'trades'), {
            name: trade,
            description: 'Added from bid package scope template',
            category: 'Construction',
            isActive: true,
            defaultScope: scope,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          id = ref.id;
        }
        setTradeTemplates(t => ({ ...t, [trade]: { id, defaultScope: scope } }));
      }
      toast({ title: `Saved as default scope for ${trade}` });
    } catch (e: any) {
      toast({ title: 'Could not save default', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSavingTemplateKey(null);
    }
  };

  // Subs auto-filtered for a given trade. We do a loose substring match so a
  // contact tagged "Concrete / Foundation" matches a section trade "Concrete".
  // Multi-trade subs match if ANY of their trades hits.
  const subsForTrade = (trade: string): Sub[] => {
    const t = trade.trim().toLowerCase();
    if (!t) return [];
    return allSubs
      .filter(s =>
        s.trades.some(st => {
          const lower = st.toLowerCase();
          return lower.includes(t) || t.includes(lower);
        }),
      )
      // Highest-rated subs first, then alphabetical.
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (a.name || '').localeCompare(b.name || ''));
  };

  const totalInvitedSubs = useMemo(() => {
    const ids = new Set<string>();
    tradeSections.forEach(s => s.selectedSubIds.forEach(id => ids.add(id)));
    return ids.size;
  }, [tradeSections]);

  const handlePlanUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const filename = `${Date.now()}-${file.name}`;
      const path = `projects/${projectId}/bid-packages/${filename}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          reject, () => resolve(),
        );
      });
      const url = await getDownloadURL(sref);
      setPlans(p => [...p, { name: file.name, url, storagePath: path }]);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    const validSections = tradeSections.filter(s => s.trade.trim() && s.selectedSubIds.size > 0);
    if (validSections.length === 0) {
      toast({
        title: 'Add at least one trade with subs',
        description: 'Pick a trade and at least one sub to invite for it.',
        variant: 'destructive',
      });
      return;
    }
    const incomplete = validSections.filter(s => !s.scope.trim());
    if (incomplete.length > 0) {
      toast({
        title: 'Scope of work missing',
        description: `Add a scope description for: ${incomplete.map(s => s.trade).join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    // Pre-bid gate: the client must approve the bid set before any sub is invited.
    if (bidGate && !bidGate.approved) {
      toast({
        title: 'Bid set not approved yet',
        description: `The client must approve the bid set before subs are invited. Waiting on: ${missingApprovals(bidGate).join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      // Create the bid package doc. Stays at projects/{projectId}/bidPackages
      // so it travels with the project.
      //
      // Use setDoc(ref, payload) instead of addDoc so the doc's path ID and
      // the `id` content field stay in sync. The prior addDoc + doc() pattern
      // generated two different IDs (the doc landed at one auto-ID while
      // pkgPayload.id pointed at a different orphaned ref) — meaning
      // bidPackageId references on child bidRequests didn't resolve to a real
      // doc path. Fixed here so the bidPackages parent is actually addressable.
      const pkgRef = doc(collection(db, 'projects', projectId, 'bidPackages'));
      const pkgPayload = {
        id: pkgRef.id,
        projectId,
        projectName: projectName || '',
        name: packageName.trim() || `Bid Package — ${projectName || ''}`,
        commonNotes: commonNotes.trim(),
        commonPlans: plans,
        defaultDueDate: commonDueDate,
        trades: validSections.map(s => s.trade.trim()),
        status: 'open' as const,
        createdAt: serverTimestamp(),
        createdByUid: user.id?.toString() || user.email || 'unknown',
        createdByName: user.name || 'GC',
        updatedAt: serverTimestamp(),
      };
      await setDoc(pkgRef, pkgPayload);

      // Two-step dispatch:
      //   1. Per trade: call /api/bid-requests/send with skipDispatch=true.
      //      Creates the bidRequest doc + per-vendor magic-link tokens but
      //      does NOT send any notifications.
      //   2. Once all trades are persisted, call /api/bid-packages/dispatch
      //      with the bidPackageId. Server-side, it groups vendors across
      //      trades and sends ONE consolidated HTML email + ONE SMS per
      //      vendor listing every trade they're invited to.
      //
      // Net effect: a sub invited to 3 trades in one package gets 1 email,
      // not 3. The button URL uses one of their tokens; the portal shows
      // every bid request they're invited to after sign-in.
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in — please refresh and try again');

      interface VendorLink {
        vendorName: string;
        contactId: string | null;
        email: string | null;
        inviteToken: string;
        magicLink: string;
      }
      interface SendResponse {
        ok: boolean;
        bidRequestId: string;
        sentEmails: number;
        sentSms: number;
        total: number;
        vendorLinks: VendorLink[];
        error?: string;
      }

      const requestRefs: {
        id: string;
        trade: string;
        subIds: string[];
        vendorLinks: VendorLink[];
      }[] = [];
      const droppedNoContact: string[] = [];  // names of subs skipped for missing email + phone

      for (const sec of validSections) {
        const subIds = Array.from(sec.selectedSubIds);
        const allVendors = subIds.map(id => {
          const s = allSubs.find(a => a.id === id);
          return {
            contactId: id,
            vendorName: s?.name || '(unnamed vendor)',
            email: s?.email || undefined,
            phone: s?.phone || undefined,
            // Pass linkedUserId so the backend can include it in invitedSubIds.
            // The existing SubcontractorPortal's collectionGroup query matches
            // signed-in subs by UID, so without this an already-portal-signed-in
            // sub wouldn't see the bid request in their portal tab (they'd
            // still get the email + magic link though).
            linkedUserId: s?.linkedUserId || undefined,
          };
        });
        // Track which vendors are getting silently dropped so the GC can fix
        // their contact records later (warning surfaced after send).
        for (const v of allVendors) {
          if (!v.email && !v.phone) droppedNoContact.push(`${v.vendorName} (${sec.trade.trim()})`);
        }
        const vendors = allVendors.filter(v => v.email || v.phone);

        if (vendors.length === 0) continue; // no contactable vendors for this trade

        // Auto-attached project plans: convert the document IDs into the
        // bid-request plan shape (name, url, storagePath, size). MERGE with
        // freshly-uploaded plans so Tyler's re-upload path keeps working.
        const attachedPlansForTrade = sec.attachedPlanIds
          .map(id => projectPlans.find(p => p.id === id))
          .filter((p): p is ProjectPlan => !!p && !!p.fileUrl)
          .map(p => ({
            name: p.name,
            url: p.fileUrl,
            storagePath: p.storagePath,
            size: p.size,
          }));
        // De-dup by url so a freshly-uploaded copy of an existing plan does
        // not appear twice in the email.
        const planUrls = new Set<string>();
        const mergedPlans: BidRequestPlan[] = [];
        for (const pl of [...plans, ...attachedPlansForTrade]) {
          if (planUrls.has(pl.url)) continue;
          planUrls.add(pl.url);
          mergedPlans.push(pl as BidRequestPlan);
        }

        const res = await fetch('/api/bid-requests/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            projectName: projectName || '',
            bidPackageId: pkgRef.id,
            type: 'item',
            stage: 'rough',
            trade: sec.trade.trim(),
            scope: sec.scope.trim(),
            callouts: commonNotes.trim(),
            customMessage: commonNotes.trim() || undefined,
            plans: mergedPlans,
            // IA-audit gap #1 + #3: pass IDs so the server can resolve full
            // selection records, and so the bidRequest doc preserves them for
            // BidRespond / the sub portal.
            attachedPlanIds: sec.attachedPlanIds,
            attachedSelectionIds: sec.attachedSelectionIds,
            dueDate: sec.dueDate?.trim() || commonDueDate || undefined,
            requesterName: user.name || 'Skyeline Homes',
            vendors,
            // Suppress per-trade email/SMS — we'll batch one email per
            // vendor across all trades via /api/bid-packages/dispatch below.
            skipDispatch: true,
          }),
        });

        const json = (await res.json()) as SendResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json?.error || `Trade "${sec.trade}" failed to send (${res.status})`);
        }
        requestRefs.push({
          id: json.bidRequestId,
          trade: sec.trade.trim(),
          subIds,
          vendorLinks: json.vendorLinks || [],
        });
      }

      // Step 2: dispatch ONE consolidated email per vendor across all trades.
      // The endpoint reads all bidRequests under this package, groups vendors
      // by contactId/email, and sends a single styled HTML email + SMS per
      // vendor listing all the trades they're invited to.
      interface DispatchResponse {
        ok: boolean;
        uniqueVendors: number;
        sentEmails: number;
        sentSms: number;
        droppedNoContact: string[];
        error?: string;
      }
      let dispatchSummary: DispatchResponse | null = null;
      if (requestRefs.length > 0) {
        const dispatchRes = await fetch('/api/bid-packages/dispatch', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            bidPackageId: pkgRef.id,
            requesterName: user.name || 'Skyeline Homes',
          }),
        });
        const dispatchJson = (await dispatchRes.json()) as DispatchResponse;
        if (!dispatchRes.ok || !dispatchJson.ok) {
          throw new Error(dispatchJson?.error || `Dispatch failed (${dispatchRes.status})`);
        }
        dispatchSummary = dispatchJson;
      }

      // NOTE: We deliberately do NOT call createNotificationsBatch here.
      //
      // Previously SendBidPackageModal fired both the in-app notification path
      // (which triggers an HTML email via the dispatcher) AND a direct
      // plain-text email from /api/bid-requests/send — subs received TWO
      // emails per package send ("New bid package" notification + per-trade
      // "Bid request" emails). After this consolidation, /api/bid-requests/send
      // emits a single styled HTML email per trade with the same "View in
      // Skyeline OS" button + Skyeline brand chrome, so the notification path
      // is redundant and was producing the duplicate inbox clutter.
      //
      // If we want in-app bell entries (no email) later, add a separate
      // notification-only path (e.g., createNotificationsBatch with a
      // suppressEmail flag, plus a dispatcher-side guard).

      // Guardrail: if every trade was skipped (no contactable vendors anywhere),
      // surface that loudly rather than showing a misleading "sent" toast.
      if (requestRefs.length === 0) {
        toast({
          title: 'Nothing sent',
          description: droppedNoContact.length > 0
            ? `No selected subs have an email or phone on file. Missing contact info for: ${droppedNoContact.join(', ')}.`
            : 'No valid trade + sub combinations to send.',
          variant: 'destructive',
        });
        return; // keep the modal open so the user can fix + retry
      }

      // Use the server-side dispatch summary for accurate per-vendor numbers
      // (uniqueVendors dedups across trades).
      const vendorCount = dispatchSummary?.uniqueVendors ?? requestRefs.length;
      toast({
        title: 'Bid package sent',
        description: `${requestRefs.length} trade${requestRefs.length === 1 ? '' : 's'} sent to ${vendorCount} sub${vendorCount === 1 ? '' : 's'}.`,
      });
      const allDropped = Array.from(new Set([
        ...droppedNoContact,
        ...(dispatchSummary?.droppedNoContact ?? []),
      ]));
      if (allDropped.length > 0) {
        toast({
          title: 'Some subs skipped',
          description: `Missing email or phone on contact for: ${allDropped.join(', ')}. Update their contact info to invite them next time.`,
        });
      }
      onClose();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="w-5 h-5 text-[#C9A96E]" />
            Create new bid package
          </DialogTitle>
          <DialogDescription>
            Send a project-wide bid package across multiple trades. Each trade gets its own scope and sub list.{' '}
            <span className="text-red-500 font-bold">*</span>{' '}
            <span className="text-gray-500">indicates a required field.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Package-level fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pkgName">
                Package Name <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input
                id="pkgName"
                value={packageName}
                onChange={e => setPackageName(e.target.value)}
                placeholder="e.g. Bid Package — Modern Lakehouse"
              />
            </div>
            <div>
              <Label htmlFor="due">
                Default Bids Due By <span className="text-red-500 font-bold">*</span>
              </Label>
              <Input id="due" type="date" value={commonDueDate} onChange={e => setCommonDueDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes for All Subs</Label>
            <Textarea
              id="notes"
              rows={2}
              value={commonNotes}
              onChange={e => setCommonNotes(e.target.value)}
              placeholder="Anything every trade should know — site access, timeline, etc."
            />
          </div>

          {/* Common files */}
          <div>
            <Label>Plans / Documents (Shared with All Subs)</Label>
            <div className="flex flex-wrap gap-2 mb-2 mt-1">
              {plans.map((p, i) => (
                <Badge key={i} variant="secondary" className="gap-1.5">
                  <FileText className="w-3 h-3" />
                  <span className="text-xs">{p.name}</span>
                  <button onClick={() => setPlans(ps => ps.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePlanUpload(f); }}
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              <Paperclip className="w-3.5 h-3.5" />
              {uploading ? `Uploading… ${Math.round(uploadProgress)}%` : 'Attach plan / doc'}
            </Button>
          </div>

          {/* Trade sections */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Label>Trades in This Package</Label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyDefaultScopes}
                    onChange={e => setApplyDefaultScopes(e.target.checked)}
                  />
                  Apply saved scopes
                </label>
                <BidPackageTemplatePicker
                  currentSections={tradeSections.map(s => ({ trade: s.trade, scope: s.scope }))}
                  currentNotes={commonNotes}
                  onImport={({ tradeSections: imported, commonNotes: importedNotes }) => {
                    setTradeSections(imported.map(s => {
                      const base = blankTradeSection();
                      const trade = s.trade;
                      // Seed default attachments based on the imported trade
                      // so a template import behaves identically to picking
                      // the trade in directly.
                      return {
                        ...base,
                        trade,
                        scope: s.scope,
                        attachedPlanIds: projectPlans
                          .filter(d => isDefaultPlanForTrade({ category: d.category, sheetPrefix: d.sheetPrefix, filename: d.fileName }, trade))
                          .map(d => d.id),
                        attachedSelectionIds: projectSelections
                          .filter(sel => isDefaultSelectionForTrade({ category: sel.category }, trade))
                          .map(sel => sel.id),
                      };
                    }));
                    if (importedNotes && !commonNotes.trim()) setCommonNotes(importedNotes);
                  }}
                />
                <Button variant="outline" size="sm" onClick={broadcastToAllSubs} className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Broadcast to all subs
                </Button>
                <Button variant="outline" size="sm" onClick={addTradeSection} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Add trade
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 -mt-1">
              "Broadcast to all subs" creates a section per trade in your network with all matching subs preselected. Use Apply saved scopes to auto-fill scope text from each trade's template.
            </p>

            {tradeSections.map((sec, idx) => {
              const candidates = subsForTrade(sec.trade);
              return (
                <div key={sec.key} className="border rounded-lg p-3 bg-gray-50/40 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">
                          Trade <span className="text-red-500 font-bold">*</span>
                        </Label>
                        <TradeTypeComboBox
                          value={sec.trade}
                          onValueChange={v => setTradeOnSection(sec.key, v)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Override Due Date (optional)</Label>
                        <Input
                          type="date"
                          value={sec.dueDate || ''}
                          onChange={e => updateSection(sec.key, { dueDate: e.target.value })}
                        />
                      </div>
                    </div>
                    {tradeSections.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-400 hover:text-red-600"
                        onClick={() => removeTradeSection(sec.key)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">
                        Scope of Work <span className="text-red-500 font-bold">*</span>
                      </Label>
                      {sec.trade && (() => {
                        const tpl = tradeTemplates[sec.trade]?.defaultScope || '';
                        const matchesSaved = tpl && sec.scope.trim() === tpl.trim();
                        return (
                          <div className="flex items-center gap-2">
                            {tpl && !matchesSaved && (
                              <button
                                type="button"
                                onClick={() => updateSection(sec.key, { scope: tpl })}
                                className="text-[11px] text-[#C9A96E] hover:underline inline-flex items-center gap-1"
                              >
                                <Sparkles className="w-3 h-3" />
                                Use saved scope
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => saveScopeAsDefault(sec)}
                              disabled={!sec.scope.trim() || matchesSaved || savingTemplateKey === sec.key}
                              className="text-[11px] text-gray-500 hover:text-gray-800 disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              {savingTemplateKey === sec.key
                                ? 'Saving…'
                                : matchesSaved
                                  ? 'Saved as default'
                                  : tpl ? 'Update default scope' : 'Save as default scope'}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <Textarea
                      rows={3}
                      value={sec.scope}
                      onChange={e => updateSection(sec.key, { scope: e.target.value })}
                      placeholder={`What is the ${sec.trade || 'trade'} scope? Quantities, materials, timeline.`}
                    />
                  </div>

                  {/* Auto-attached project plans for THIS trade. Pre-checked
                      using the trade map (bidPackageTradeMap.ts); Tyler can
                      manually toggle. Collapsed by default to keep the modal
                      compact. */}
                  {sec.trade && (
                    <div className="border rounded bg-white">
                      <button
                        type="button"
                        onClick={() => updateSection(sec.key, { showPlans: !sec.showPlans })}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {sec.showPlans
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                          <FileText className="w-3.5 h-3.5 text-[#C9A96E] shrink-0" />
                          <span className="text-xs font-medium text-gray-800">
                            Project plans for this trade
                          </span>
                          <span className="text-[11px] text-gray-500">
                            ({sec.attachedPlanIds.length} of {projectPlans.length} attached)
                          </span>
                        </div>
                        <span
                          className="text-[10px] text-gray-400"
                          title={defaultsForTrade(sec.trade).rationale}
                        >
                          {defaultsForTrade(sec.trade).rationale}
                        </span>
                      </button>
                      {sec.showPlans && (
                        <div className="border-t max-h-44 overflow-y-auto divide-y">
                          {projectPlans.length === 0 ? (
                            <div className="px-3 py-2 text-[11px] text-gray-400">
                              No plans uploaded to this project yet. Use "Attach plan / doc" above for a one-off, or upload in the project's Plans step.
                            </div>
                          ) : projectPlans.map(pl => {
                            const checked = sec.attachedPlanIds.includes(pl.id);
                            const isDefault = isDefaultPlanForTrade(
                              { category: pl.category, sheetPrefix: pl.sheetPrefix, filename: pl.fileName },
                              sec.trade,
                            );
                            return (
                              <label
                                key={pl.id}
                                className={`flex items-start gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-amber-50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAttachedPlan(sec.key, pl.id)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-gray-900 truncate">{pl.name}</span>
                                    {pl.category && (
                                      <Badge variant="outline" className="text-[10px]">{pl.category}</Badge>
                                    )}
                                    {isDefault && (
                                      <span className="text-[10px] text-[#8a6a2c]">default</span>
                                    )}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Auto-attached client selections for THIS trade. Same
                      pre-check logic as plans — selection categories pulled
                      from bidPackageTradeMap. Renders product image + name +
                      vendor + a quick spec line. */}
                  {sec.trade && projectSelections.length > 0 && (
                    <div className="border rounded bg-white">
                      <button
                        type="button"
                        onClick={() => updateSection(sec.key, { showSelections: !sec.showSelections })}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {sec.showSelections
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                          <ImageIcon className="w-3.5 h-3.5 text-[#C9A96E] shrink-0" />
                          <span className="text-xs font-medium text-gray-800">
                            Selections relevant to this trade
                          </span>
                          <span className="text-[11px] text-gray-500">
                            ({sec.attachedSelectionIds.length} of {projectSelections.length} attached)
                          </span>
                        </div>
                        {defaultsForTrade(sec.trade).selectionCategories.length === 0 && (
                          <span className="text-[10px] text-gray-400">
                            No defaults for {sec.trade} — toggle manually
                          </span>
                        )}
                      </button>
                      {sec.showSelections && (
                        <div className="border-t max-h-56 overflow-y-auto divide-y">
                          {projectSelections.map(sel => {
                            const checked = sec.attachedSelectionIds.includes(sel.id);
                            const isDefault = isDefaultSelectionForTrade({ category: sel.category }, sec.trade);
                            return (
                              <label
                                key={sel.id}
                                className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-amber-50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAttachedSelection(sec.key, sel.id)}
                                  className="mt-1"
                                />
                                {sel.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={sel.imageUrl}
                                    alt={sel.productName || sel.category || 'Selection'}
                                    className="w-10 h-10 rounded object-cover flex-shrink-0 border"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 border">
                                    <ImageIcon className="w-4 h-4 text-gray-300" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium text-gray-900 truncate">
                                      {sel.productName || sel.category || 'Selection'}
                                    </span>
                                    {sel.category && (
                                      <Badge variant="outline" className="text-[10px]">{sel.category}</Badge>
                                    )}
                                    {isDefault && (
                                      <span className="text-[10px] text-[#8a6a2c]">default</span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-gray-500 mt-0.5">
                                    {sel.vendor && <span>{sel.vendor}</span>}
                                    {sel.description && <span>{sel.description}</span>}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">
                        Subs to Invite <span className="text-red-500 font-bold">*</span>{' '}
                        <span className="text-gray-400 font-normal">
                          ({sec.selectedSubIds.size} of {candidates.length} matching{sec.trade ? ` "${sec.trade}"` : ''})
                        </span>
                      </Label>
                      {candidates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => updateSection(sec.key, {
                            selectedSubIds: sec.selectedSubIds.size === candidates.length
                              ? new Set()
                              : new Set(candidates.map(s => s.id)),
                          })}
                          className="text-xs text-gray-500 hover:text-gray-800"
                        >
                          {sec.selectedSubIds.size === candidates.length ? 'Clear all' : 'Select all'}
                        </button>
                      )}
                    </div>
                    {!sec.trade ? (
                      <div className="border rounded p-3 text-xs text-gray-400 bg-white">
                        Pick a trade above to see matching subs.
                      </div>
                    ) : candidates.length === 0 ? (
                      <div className="border rounded p-3 text-xs text-gray-400 bg-white">
                        No subs tagged with "{sec.trade}". Add subs in <a href="/contacts" className="underline">Contacts</a> with this trade first.
                      </div>
                    ) : (
                      <ScrollArea className="h-36 border rounded bg-white">
                        <div className="divide-y">
                          {candidates.map(sub => {
                            const checked = sec.selectedSubIds.has(sub.id);
                            return (
                              <label
                                key={sub.id}
                                className={`flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-amber-50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = new Set(sec.selectedSubIds);
                                    next.has(sub.id) ? next.delete(sub.id) : next.add(sub.id);
                                    updateSection(sec.key, { selectedSubIds: next });
                                  }}
                                  className="mt-1"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-gray-900 truncate">{sub.name}</span>
                                    {(sub.rating ?? 0) > 0 && <StarRating value={sub.rating || 0} size={12} />}
                                    {sub.trades.map(t => (
                                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                                    ))}
                                  </div>
                                  {sub.company && <div className="text-xs text-gray-500 truncate">{sub.company}</div>}
                                  {!sub.email && (
                                    <div className="text-[10px] text-orange-500 flex items-center gap-1">
                                      <AlertCircle className="w-2.5 h-2.5" /> No email — won't get auto-notification
                                    </div>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                  {idx < tradeSections.length - 1 && <div className="h-px bg-gray-200" />}
                </div>
              );
            })}
          </div>
        </div>

        {bidGate && !bidGate.approved && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 mt-2">
            The client hasn’t approved the bid set yet — sending is blocked until they do
            (waiting on: {missingApprovals(bidGate).join(', ')}). Approve it from the
            project’s Bids page.
          </div>
        )}

        <DialogFooter className="border-t pt-4 mt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || totalInvitedSubs === 0 || (!!bidGate && !bidGate.approved)}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Send className="w-4 h-4" />
            {submitting
              ? 'Sending…'
              : `Send to ${totalInvitedSubs} sub${totalInvitedSubs === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
