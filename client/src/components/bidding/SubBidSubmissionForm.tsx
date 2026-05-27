import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/lib/notifications';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, FileText, Send, Trash2, Plus, Shield, Building2,
  AlertCircle, ExternalLink, Paperclip, X, Loader2, Ruler, FileUp, ListChecks,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import TakeoffStudio from '@/components/takeoff/TakeoffStudio';
import type { BidRequest, BidLineItem, BidInsurance, ContractorLicense } from './types';

interface AttachedMeasurement {
  id: string;
  type: 'linear' | 'area' | 'count';
  label: string;
  value: number;
  unit: string;
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function SubBidSubmissionForm({
  request, onClose, alreadySubmitted,
}: {
  request: BidRequest;
  onClose: () => void;
  alreadySubmitted: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coiInputRef = useRef<HTMLInputElement>(null);

  const subId = user?.id?.toString() || user?.email || '';

  // Compliance status — loaded for the advisory banner, but per D-016 it is
  // NOT a gate on bid submission. The submit button works for any signed-in
  // sub. Compliance is enforced server-side at AWARD time only.
  const [compliance, setCompliance] = useState<{
    w9Filed?: boolean;
    insuranceCurrent?: boolean;
    agreementSigned?: boolean;
    contractorLicenseNumber?: string;
  }>({});
  useEffect(() => {
    if (!(user as any)?.firebaseUid && !user?.id) return;
    const uid = (user as any)?.firebaseUid || user?.id?.toString();
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const d = snap.data() as any;
          setCompliance({
            w9Filed: !!d.w9Filed,
            insuranceCurrent: !!d.insuranceCurrent,
            agreementSigned: !!d.agreementSigned,
            contractorLicenseNumber: typeof d.contractorLicenseNumber === 'string'
              ? d.contractorLicenseNumber.trim()
              : undefined,
          });
        }
      } catch { /* ignore */ }
    })();
  }, [user]);
  const complianceMissing: string[] = [
    !compliance.w9Filed && 'W-9',
    !compliance.insuranceCurrent && 'Insurance',
    !compliance.agreementSigned && 'Subcontractor agreement',
    !compliance.contractorLicenseNumber && 'Contractor license number',
  ].filter(Boolean) as string[];
  // Kept for the banner only — never used to disable the submit button.
  const complianceComplete = complianceMissing.length === 0;

  // Submission path: build line items inside the form, or upload a finished PDF quote.
  const [bidMode, setBidMode] = useState<'lineItems' | 'pdfQuote'>('lineItems');

  // Line items
  const [lines, setLines] = useState<BidLineItem[]>([
    { id: newId(), description: '', qty: 1, unit: 'lump sum', unitCost: 0, total: 0 },
  ]);
  const [notes, setNotes] = useState('');

  // PDF quote path
  const [quoteFile, setQuoteFile] = useState<{ name: string; url: string; storagePath: string } | null>(null);
  const [quoteTotal, setQuoteTotal] = useState<number>(0);
  const [quoteUploading, setQuoteUploading] = useState(false);
  const [quoteProgress, setQuoteProgress] = useState(0);
  const quoteInputRef = useRef<HTMLInputElement>(null);

  // Estimated duration — "a close guess is fine". Required so the GC has a
  // schedulable number when comparing bids. Stored as integer business days.
  const [daysToComplete, setDaysToComplete] = useState<number>(0);

  // Project documents (read-only) — anything attached to the project that subs
  // invited to a bid can reference. Loaded when the form mounts.
  const [projectDocs, setProjectDocs] = useState<{ id: string; name: string; fileUrl: string; category?: string }[]>([]);

  // Compliance
  const [insurance, setInsurance] = useState<BidInsurance>({
    carrier: '', policyNumber: '', expiration: '',
  });
  const [license, setLicense] = useState<ContractorLicense>({
    number: '', state: 'UT', type: '', expiration: '',
  });
  const [agreementAcknowledged, setAgreementAcknowledged] = useState(false);

  const [coiUploading, setCoiUploading] = useState(false);
  const [coiProgress, setCoiProgress] = useState(0);

  const [attachments, setAttachments] = useState<{ name: string; url: string; storagePath: string }[]>([]);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachProgress, setAttachProgress] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  // Takeoff: optional measurements the sub takes against the project's plans
  // and chooses to attach to this bid.
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [attachedMeasurements, setAttachedMeasurements] = useState<AttachedMeasurement[]>([]);

  // Pre-fill from sub's contact profile if available
  useEffect(() => {
    if (!subId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'contacts', subId));
        if (snap.exists()) {
          const c = snap.data() as any;
          if (c.insurance) setInsurance(c.insurance);
          if (c.contractorLicense) setLicense(c.contractorLicense);
        }
      } catch {}
    })();
  }, [subId]);

  // Load all project documents the sub can reference for this bid.
  useEffect(() => {
    if (!request.projectId) return;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'documents'),
          where('projectId', '==', request.projectId),
        ));
        setProjectDocs(snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: String(data.name || data.fileName || 'Document'),
            fileUrl: String(data.fileUrl || ''),
            category: data.category,
          };
        }).filter(d => d.fileUrl));
      } catch {
        // Permission errors here just mean the sub can't see project docs;
        // they can still use the plans attached directly to the bid request.
      }
    })();
  }, [request.projectId]);

  const addLine = () => setLines(l => [...l, { id: newId(), description: '', qty: 1, unit: 'lump sum', unitCost: 0, total: 0 }]);
  const removeLine = (id: string) => setLines(l => l.filter(x => x.id !== id));
  const updateLine = (id: string, patch: Partial<BidLineItem>) => {
    setLines(l => l.map(x => {
      if (x.id !== id) return x;
      const next = { ...x, ...patch };
      next.total = (next.qty || 0) * (next.unitCost || 0);
      return next;
    }));
  };

  const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0);

  const handleCoiUpload = async (file: File) => {
    if (!user) return;
    setCoiUploading(true);
    setCoiProgress(0);
    try {
      const path = `bids/${request.projectId}/${subId}/coi-${Date.now()}-${file.name}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setCoiProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          reject, () => resolve(),
        );
      });
      const url = await getDownloadURL(sref);
      setInsurance(i => ({ ...i, certificateUrl: url, certificateStoragePath: path }));
      toast({ title: 'Insurance certificate uploaded' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setCoiUploading(false);
    }
  };

  const handleQuoteUpload = async (file: File) => {
    if (!user) return;
    setQuoteUploading(true);
    setQuoteProgress(0);
    try {
      const path = `bids/${request.projectId}/${subId}/quote-${Date.now()}-${file.name}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setQuoteProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          reject, () => resolve(),
        );
      });
      const url = await getDownloadURL(sref);
      setQuoteFile({ name: file.name, url, storagePath: path });
      toast({ title: 'Quote PDF uploaded' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setQuoteUploading(false);
    }
  };

  const handleAttachUpload = async (file: File) => {
    if (!user) return;
    setAttachUploading(true);
    setAttachProgress(0);
    try {
      const path = `bids/${request.projectId}/${subId}/${Date.now()}-${file.name}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setAttachProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          reject, () => resolve(),
        );
      });
      const url = await getDownloadURL(sref);
      setAttachments(a => [...a, { name: file.name, url, storagePath: path }]);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setAttachUploading(false);
    }
  };

  const validate = (): string | null => {
    if (bidMode === 'lineItems') {
      if (lines.length === 0 || lines.every(l => !l.description.trim())) return 'Add at least one line item';
    } else {
      if (!quoteFile) return 'Upload your quote PDF';
      if (!quoteTotal || quoteTotal <= 0) return 'Enter the total bid amount';
    }
    if (!daysToComplete || daysToComplete <= 0) return 'Enter estimated business days to complete';
    if (!insurance.carrier.trim()) return 'Insurance carrier is required';
    if (!insurance.policyNumber.trim()) return 'Insurance policy number is required';
    if (!insurance.expiration) return 'Insurance expiration date is required';
    if (!license.number.trim()) return 'Contractor license number is required';
    if (!agreementAcknowledged) return 'You must acknowledge the subcontractor agreement requirement';
    return null;
  };

  const handleSubmit = async () => {
    if (!user) return;
    // Per D-016 the compliance gate moved from bid-submit to bid-award. Subs
    // can submit bids any time; Skyeline simply can't AWARD an incomplete sub.
    // (The /api/bids/award endpoint enforces the four-item check server-side.)
    const err = validate();
    if (err) {
      toast({ title: err, variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const validLines = bidMode === 'lineItems' ? lines.filter(l => l.description.trim()) : [];
      const lineTotal = validLines.reduce((s, l) => s + (l.total || 0), 0);
      const total = bidMode === 'lineItems' ? lineTotal : quoteTotal;

      const bidPayload: Record<string, any> = {
        bidRequestId: request.id,
        projectId: request.projectId,
        projectName: request.projectName || '',
        trade: request.trade,
        subContactId: subId,
        subUserId: user.id?.toString() || '',
        subName: user.name || 'Unknown',
        subCompany: '',
        subEmail: user.email || '',
        bidMode,
        lineItems: validLines,
        subtotal: total,
        totalAmount: total,
        // Estimated business days from start to finish (sub's best guess —
        // gives the GC a schedulable number when comparing bids).
        daysToComplete: Math.round(daysToComplete),
        notes: notes.trim(),
        attachments,
        attachedMeasurements,
        insurance,
        contractorLicense: license,
        agreementAcknowledged: true,
        agreementAcknowledgedAt: serverTimestamp(),
        status: 'received',
        submittedViaPortal: true,
        // Default visibility off — GC must explicitly toggle on for client.
        visibleToClient: false,
        submittedAt: serverTimestamp(),
      };
      if (bidMode === 'pdfQuote' && quoteFile) {
        bidPayload.quoteFile = quoteFile;
      }

      await addDoc(collection(db, 'bids'), bidPayload);

      // Notify GC
      await createNotification({
        userId: request.invitedByUserId,
        kind: 'system',
        title: `New bid received: ${request.trade} from ${user.name || 'sub'}`,
        body: `Total: $${total.toLocaleString()}. Open Project Bids to review.`,
        link: `/projects/${request.projectId}/bids`,
        projectId: request.projectId,
        refType: 'task',
        refId: request.id,
        fromUserName: user.name || 'Subcontractor',
      });

      toast({ title: 'Bid submitted', description: `Total: $${total.toLocaleString()}` });
      onClose();
    } catch (e: any) {
      toast({ title: 'Submit failed', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ChevronLeft className="w-4 h-4" /> All requests
        </Button>
      </div>

      {/* Required-field legend */}
      <p className="text-xs text-gray-500">
        Fields marked with <span className="text-red-500 font-bold">*</span> are required.
      </p>

      {alreadySubmitted && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-sm text-green-900 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            You've already submitted a bid for this request. Submitting again will create a revised bid.
          </CardContent>
        </Card>
      )}

      {/* Request details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {request.trade}
                <Badge variant="outline">{request.projectName}</Badge>
              </CardTitle>
              <CardDescription>Due {request.dueDate} · From {request.invitedByName}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs uppercase tracking-wide text-gray-500">Scope of Work</Label>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{request.scope}</p>
          </div>
          {request.callouts && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2.5">
              <Label className="text-xs uppercase tracking-wide text-amber-700">Special Notes / Callouts</Label>
              <p className="text-sm text-amber-900 whitespace-pre-wrap mt-0.5">{request.callouts}</p>
            </div>
          )}
          {request.plans?.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-gray-500">Plans</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {request.plans.map((p, i) => (
                  <a
                    key={i}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[#C9A96E] hover:underline border border-[#C9A96E]/30 rounded px-2 py-1 bg-[#FFF8E7]"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {p.name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {projectDocs.length > 0 && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-gray-500">Project Files</Label>
              <p className="text-[11px] text-gray-500 mb-1">All documents attached to this project — read-only.</p>
              <div className="flex flex-wrap gap-1.5">
                {projectDocs.map(d => (
                  <a
                    key={d.id}
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded px-2 py-1 bg-white"
                  >
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    {d.name}
                    {d.category && <Badge variant="outline" className="text-[10px]">{d.category}</Badge>}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Optional: takeoff tool — sub does their own measurements and can
          attach selected ones to this bid. */}
      <Card className="border-[#C9A96E]/40 bg-[#FFF8E7]/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="w-4 h-4 text-[#C9A96E]" />
            Takeoff (Optional)
          </CardTitle>
          <CardDescription>
            Use the takeoff tool to measure on the plans. Anything you measure can be attached to your bid so the GC sees the same numbers you used to price.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            onClick={() => setTakeoffOpen(true)}
            className="border-[#C9A96E] text-[#141414]"
          >
            <Ruler className="w-4 h-4 mr-2" />
            Open Takeoff Tool
          </Button>
          {attachedMeasurements.length > 0 && (
            <div className="border border-[#C9A96E]/30 rounded-lg p-3 bg-white">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                Attached to this bid · {attachedMeasurements.length}
              </p>
              <div className="space-y-1.5">
                {attachedMeasurements.map((m, i) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-gray-800">{m.label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {m.value.toLocaleString()} {m.unit}
                      </Badge>
                      <button
                        onClick={() => setAttachedMeasurements(list => list.filter((_, j) => j !== i))}
                        className="text-gray-400 hover:text-red-600"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Takeoff dialog — full-screen modal hosting the sub-scoped TakeoffStudio */}
      <Dialog open={takeoffOpen} onOpenChange={setTakeoffOpen}>
        <DialogContent className="max-w-7xl w-[calc(100vw-2rem)] h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-4 pt-3 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-[#C9A96E]" />
              My Takeoff — {request.trade} · {request.projectName || ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <TakeoffStudio
              projectId={request.projectId}
              projectName={request.projectName}
              scope={{ kind: 'sub', bidRequestId: request.id }}
              onAttachToBid={(selected) => {
                // De-dupe by id so attaching twice doesn't double-add.
                setAttachedMeasurements(prev => {
                  const merged = [...prev];
                  selected.forEach(m => {
                    const idx = merged.findIndex(p => p.id === m.id);
                    if (idx >= 0) merged[idx] = m;
                    else merged.push(m);
                  });
                  return merged;
                });
                setTakeoffOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Bid input — choose path */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Bid</CardTitle>
          <CardDescription>
            Either upload a finished quote PDF or build a line-item bid here. Pick whichever fits how you already estimate.
          </CardDescription>
          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              variant={bidMode === 'lineItems' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setBidMode('lineItems')}
              className="gap-1.5"
              style={bidMode === 'lineItems' ? { backgroundColor: '#C9A96E', color: '#141414' } : {}}
            >
              <ListChecks className="w-4 h-4" />
              Build Estimate
            </Button>
            <Button
              type="button"
              variant={bidMode === 'pdfQuote' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setBidMode('pdfQuote')}
              className="gap-1.5"
              style={bidMode === 'pdfQuote' ? { backgroundColor: '#C9A96E', color: '#141414' } : {}}
            >
              <FileUp className="w-4 h-4" />
              Upload PDF Quote
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {bidMode === 'pdfQuote' ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="quote-file">Quote PDF <span className="text-red-500 font-bold">*</span></Label>
                {quoteFile ? (
                  <div className="flex items-center gap-2 mt-1.5 border rounded p-2 bg-gray-50">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium flex-1 truncate">{quoteFile.name}</span>
                    <a href={quoteFile.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A96E] hover:underline">View</a>
                    <button
                      onClick={() => setQuoteFile(null)}
                      className="text-gray-400 hover:text-red-500"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1.5">
                    <input
                      ref={quoteInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleQuoteUpload(f); }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => quoteInputRef.current?.click()}
                      disabled={quoteUploading}
                      className="gap-1.5"
                    >
                      <FileUp className="w-4 h-4" />
                      {quoteUploading ? `Uploading… ${Math.round(quoteProgress)}%` : 'Upload quote PDF'}
                    </Button>
                  </div>
                )}
              </div>
              <div className="max-w-xs">
                <Label htmlFor="quote-total">Total Bid Amount <span className="text-red-500 font-bold">*</span></Label>
                <div className="relative mt-1.5">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input
                    id="quote-total"
                    type="number"
                    value={quoteTotal || ''}
                    onChange={e => setQuoteTotal(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="pl-6"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  This is what shows in the GC's bid comparison. Detail lives in the PDF.
                </p>
              </div>
            </div>
          ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b text-xs text-gray-500 uppercase">
                  <th className="py-2 pr-2">Description</th>
                  <th className="py-2 pr-2 w-16">Qty</th>
                  <th className="py-2 pr-2 w-24">Unit</th>
                  <th className="py-2 pr-2 w-24 text-right">Unit Cost</th>
                  <th className="py-2 pr-2 w-28 text-right">Total</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <Input
                        value={l.description}
                        onChange={e => updateLine(l.id, { description: e.target.value })}
                        placeholder="Labor / Material / Service"
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        value={l.qty || ''}
                        onChange={e => updateLine(l.id, { qty: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={l.unit}
                        onChange={e => updateLine(l.id, { unit: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        value={l.unitCost || ''}
                        onChange={e => updateLine(l.id, { unitCost: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm text-right"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-gray-700">
                      ${l.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2">
                      <button onClick={() => removeLine(l.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td colSpan={4} className="py-2 text-right font-semibold">Total</td>
                  <td className="py-2 text-right font-bold text-lg font-mono">${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={addLine} className="mt-2 gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add line
          </Button>
          </>
          )}
        </CardContent>
      </Card>

      {/* Timeline + notes + attachments */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="max-w-xs">
            <Label htmlFor="days-to-complete">
              Estimated business days from start to finish <span className="text-red-500 font-bold">*</span>
            </Label>
            <Input
              id="days-to-complete"
              type="number"
              min={1}
              step={1}
              value={daysToComplete || ''}
              onChange={e => setDaysToComplete(parseInt(e.target.value, 10) || 0)}
              placeholder="e.g. 10"
              className="mt-1.5"
            />
            <p className="text-[11px] text-gray-500 mt-1">A close guess is fine — the GC uses this to slot your work into the schedule.</p>
          </div>
          <div>
            <Label htmlFor="notes">What's included, what's not (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything excluded, conditions, alternates, or assumptions"
            />
          </div>
          <div>
            <Label>Attachments</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map((a, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  <FileText className="w-3 h-3" /> {a.name}
                  <button onClick={() => setAttachments(arr => arr.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAttachUpload(f); }}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={attachUploading} className="gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              {attachUploading ? `${Math.round(attachProgress)}%` : 'Attach file'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Insurance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            Insurance
          </CardTitle>
          <CardDescription className="text-xs">Required for all submitted bids.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ins-carrier">Carrier <span className="text-red-500 font-bold">*</span></Label>
              <Input id="ins-carrier" value={insurance.carrier} onChange={e => setInsurance(i => ({ ...i, carrier: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ins-policy">Policy # <span className="text-red-500 font-bold">*</span></Label>
              <Input id="ins-policy" value={insurance.policyNumber} onChange={e => setInsurance(i => ({ ...i, policyNumber: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ins-exp">Expiration <span className="text-red-500 font-bold">*</span></Label>
              <Input id="ins-exp" type="date" value={insurance.expiration} onChange={e => setInsurance(i => ({ ...i, expiration: e.target.value }))} />
            </div>
            <div>
              <Label>Certificate (COI)</Label>
              <input
                ref={coiInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleCoiUpload(f); }}
              />
              {insurance.certificateUrl ? (
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="w-3 h-3" /> Uploaded
                  </Badge>
                  <a href={insurance.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#C9A96E] hover:underline">view</a>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => coiInputRef.current?.click()} disabled={coiUploading} className="gap-1.5 mt-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  {coiUploading ? `${Math.round(coiProgress)}%` : 'Upload COI'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* License */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-500" />
            Contractor License
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Label htmlFor="lic-num">License # <span className="text-red-500 font-bold">*</span></Label>
              <Input id="lic-num" value={license.number} onChange={e => setLicense(l => ({ ...l, number: e.target.value }))} />
            </div>
            <div className="col-span-1">
              <Label htmlFor="lic-state">State <span className="text-red-500 font-bold">*</span></Label>
              <Input id="lic-state" value={license.state} onChange={e => setLicense(l => ({ ...l, state: e.target.value }))} />
            </div>
            <div className="col-span-1">
              <Label htmlFor="lic-exp">Expiration</Label>
              <Input id="lic-exp" type="date" value={license.expiration || ''} onChange={e => setLicense(l => ({ ...l, expiration: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agreement acknowledgment */}
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="pt-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreementAcknowledged}
              onChange={e => setAgreementAcknowledged(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Subcontractor Agreement Acknowledgment
              </p>
              <p className="text-xs text-amber-800 mt-1">
                I acknowledge that <strong>if this bid is awarded</strong>, I will be required to sign Skyeline Homes' standard
                subcontractor agreement, provide a current Certificate of Insurance, and meet all license and safety requirements
                <strong> before any work begins on site</strong>.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Compliance gate banner — shown when any required doc is missing.
          Submit button is disabled to enforce the policy on the client side;
          server validation should mirror this in a Cloud Function for now. */}
      {/* Advisory banner only — submission is no longer gated on compliance.
          Per D-016 the gate runs server-side at AWARD time instead. */}
      {!complianceComplete && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Verification needed before Skyeline can award this work
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              You can submit your bid now. Skyeline can't award the job until these are on file:{' '}
              {complianceMissing.join(', ')}.
            </p>
            <a
              href="/subcontractor-portal/compliance"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 mt-2 hover:underline"
            >
              Open compliance profile <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="gap-2 text-white"
          style={{ backgroundColor: '#22c55e' }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? 'Submitting…' : 'Submit Bid'}
        </Button>
      </div>
    </div>
  );
}
