import { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection, addDoc, serverTimestamp, getDocs, query, orderBy, doc, updateDoc, where,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { createNotificationsBatch } from '@/lib/notifications';
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
import { BidPackageTemplatePicker } from './BidPackageTemplatePicker';
import {
  Send, X, Hammer, FileText, Paperclip, Plus, Trash2, AlertCircle, Save, Sparkles,
} from 'lucide-react';
import type { BidRequestPlan } from './types';

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
}

interface TradeSection {
  // Stable client-side key (not the saved doc id).
  key: string;
  trade: string;
  scope: string;
  // Override the common due date if non-empty.
  dueDate?: string;
  selectedSubIds: Set<string>;
}

const newKey = () => Math.random().toString(36).slice(2, 9);

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

  const [allSubs, setAllSubs] = useState<Sub[]>([]);
  // Trade name → { id, defaultScope } so we can apply / save default scopes.
  const [tradeTemplates, setTradeTemplates] = useState<Record<string, { id: string; defaultScope: string }>>({});
  const [applyDefaultScopes, setApplyDefaultScopes] = useState(true);

  const [tradeSections, setTradeSections] = useState<TradeSection[]>([
    { key: newKey(), trade: '', scope: '', selectedSubIds: new Set() },
  ]);

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
    setTradeSections([{ key: newKey(), trade: '', scope: '', selectedSubIds: new Set() }]);

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
            };
          });
        setAllSubs(subs);
      } catch (e: any) {
        toast({ title: 'Could not load subs', description: e.message, variant: 'destructive' });
      }
    })();
  }, [open, projectName, toast]);

  const addTradeSection = () => {
    setTradeSections(s => [...s, { key: newKey(), trade: '', scope: '', selectedSubIds: new Set() }]);
  };
  const removeTradeSection = (key: string) => {
    setTradeSections(s => s.length === 1 ? s : s.filter(x => x.key !== key));
  };
  const updateSection = (key: string, patch: Partial<TradeSection>) => {
    setTradeSections(s => s.map(x => x.key === key ? { ...x, ...patch } : x));
  };

  // When the user picks a trade for a section, auto-fill scope from the saved
  // template if `applyDefaultScopes` is on and the current scope is empty.
  const setTradeOnSection = (key: string, trade: string) => {
    setTradeSections(s => s.map(x => {
      if (x.key !== key) return x;
      const template = tradeTemplates[trade]?.defaultScope || '';
      const shouldFill = applyDefaultScopes && template && !x.scope.trim();
      return {
        ...x,
        trade,
        selectedSubIds: new Set(),
        scope: shouldFill ? template : x.scope,
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
      return {
        key: newKey(),
        trade,
        scope: applyDefaultScopes ? template : '',
        selectedSubIds: new Set(matched.map(s => s.id)),
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
    return allSubs.filter(s =>
      s.trades.some(st => {
        const lower = st.toLowerCase();
        return lower.includes(t) || t.includes(lower);
      }),
    );
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

    setSubmitting(true);
    try {
      // Create the bid package doc. Stays at projects/{projectId}/bidPackages
      // so it travels with the project.
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
      await addDoc(collection(db, 'projects', projectId, 'bidPackages'), pkgPayload);

      // Create one bidRequest per trade. Each carries the package id so the
      // bid-management view can group them.
      const requestRefs: { id: string; trade: string; subIds: string[] }[] = [];
      for (const sec of validSections) {
        const reqRef = await addDoc(
          collection(db, 'projects', projectId, 'bidRequests'),
          {
            projectId,
            projectName: projectName || '',
            bidPackageId: pkgRef.id,
            trade: sec.trade.trim(),
            scope: sec.scope.trim(),
            callouts: commonNotes.trim(),
            plans,
            dueDate: sec.dueDate?.trim() || commonDueDate,
            // invitedSubIds carries every identifier we might match the sub
            // by on the portal side: their contact-doc ID, their linked
            // Firebase Auth UID (if known), and their email. This way the
            // sub-portal collectionGroup query resolves the request whether
            // or not the contact has been linkedUserId-stamped yet.
            invitedSubIds: (() => {
              const out = new Set<string>();
              for (const id of Array.from(sec.selectedSubIds)) {
                out.add(id);
                const s = allSubs.find(a => a.id === id);
                if (s?.linkedUserId) out.add(s.linkedUserId);
                if (s?.email) out.add(s.email.toLowerCase().trim());
              }
              return Array.from(out);
            })(),
            invitedSubContactIds: Array.from(sec.selectedSubIds),
            invitedByUserId: user.id?.toString() || user.email || 'unknown',
            invitedByName: user.name || 'GC',
            status: 'open',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        );
        requestRefs.push({ id: reqRef.id, trade: sec.trade.trim(), subIds: Array.from(sec.selectedSubIds) });
      }

      // Notify each invited sub (deduped across trades — one notification per
      // sub even if invited to multiple trades in the same package).
      // Address by linkedUserId (Firebase Auth UID) when available so the
      // in-app bell shows it. The Cloud Function dispatcher falls back to the
      // contact doc for email lookup when the userId isn't a real user UID.
      const notifiedSubIds = new Set<string>();
      const notifications: Parameters<typeof createNotificationsBatch>[0] = [];
      for (const r of requestRefs) {
        for (const subId of r.subIds) {
          if (notifiedSubIds.has(subId)) continue;
          notifiedSubIds.add(subId);
          const sub = allSubs.find(s => s.id === subId);
          const recipientId = sub?.linkedUserId || subId;
          // Deep-link to the bids tab and carry the request ID + the sub's
          // email as query params. The portal can highlight the specific
          // request; the sign-in form (if not yet authenticated) pre-fills
          // the email. ProtectedRoute preserves the full path+query as
          // ?next=<url> through the sign-in bounce so they land back here.
          const qs = new URLSearchParams();
          qs.set('bidRequest', r.id);
          if (sub?.email) qs.set('email', sub.email);
          const deepLink = `/subcontractor-portal/bids?${qs.toString()}`;
          notifications.push({
            userId: recipientId,
            kind: 'system',
            title: `New bid package: ${pkgPayload.name}`,
            body: `Project: ${projectName || ''}. Click "View in Skyeline OS" below to open this bid request and submit your quote.`,
            link: deepLink,
            projectId,
            refType: 'task',
            refId: r.id,
            fromUserName: user.name || 'Skyeline Homes',
          });
        }
      }
      if (notifications.length > 0) await createNotificationsBatch(notifications);

      toast({
        title: 'Bid package sent',
        description: `${validSections.length} trade${validSections.length === 1 ? '' : 's'}, ${notifiedSubIds.size} sub${notifiedSubIds.size === 1 ? '' : 's'} invited.`,
      });
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
            Send Bid Package
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
                    setTradeSections(imported.map(s => ({
                      key: newKey(),
                      trade: s.trade,
                      scope: s.scope,
                      selectedSubIds: new Set(),
                    })));
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

        <DialogFooter className="border-t pt-4 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || totalInvitedSubs === 0}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            <Send className="w-4 h-4" />
            {submitting
              ? 'Sending…'
              : `Send package (${totalInvitedSubs} sub${totalInvitedSubs === 1 ? '' : 's'})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
