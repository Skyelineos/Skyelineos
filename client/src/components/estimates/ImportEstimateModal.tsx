// "Import from PDF/Email" modal for Estimate Builder.
//
// Workaround for the broken bid-package flow (Workflow 3 in the CTO audit) so
// Tyler can get sub quotes into client-visible estimates without going through
// bid packages. Two paths:
//   1. Upload a PDF (or photographed printout) of a sub's quote.
//   2. Paste an email body — we save the text as a .txt for auditability.
// In both cases the user fills (or edits) vendor / trade / total / description,
// hits Save, and we create a draft estimate with the file attached.
//
// Storage path: projects/{projectId}/estimate-imports/{uuid}.{ext} — Stream 1's
// tightened isOnProject(projectId) rules cover it.
//
// Saved as `status: 'draft'`. Tyler manually flips to 'sent' from the
// Estimates list when he's ready to share with the client.

import { useState, useRef, useEffect } from 'react';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '@/lib/firebase';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Upload, FileText, X, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  uploadEstimateAttachment,
  type UploadedEstimateAttachment,
} from '@/lib/estimateImports/uploadEstimateAttachment';

interface ImportEstimateModalProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  /** Called after save so the parent can refresh / toast. Optional. */
  onSaved?: (estimateId: string) => void;
}

const FALLBACK_TRADES = [
  'General Conditions', 'Site Work', 'Concrete / Foundation', 'Framing',
  'Roofing', 'Electrical', 'Plumbing', 'HVAC', 'Insulation', 'Drywall',
  'Flooring', 'Paint', 'Cabinets / Millwork', 'Tile', 'Exterior Finishes',
  'Landscaping', 'Other',
];

// Mirrors lib/qbo.ts API_BASE convention.
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'https://api-mtph34upva-uc.a.run.app';

interface ExtractionResult {
  vendor_name: string | null;
  trade: string | null;
  total_amount: number | null;
  line_items: Array<{
    description: string;
    qty?: number | null;
    unit?: string | null;
    unit_cost?: number | null;
    total?: number | null;
  }> | null;
  notes: string | null;
}

async function callExtractEstimate(
  storagePath: string,
  mimeType: string,
): Promise<ExtractionResult | null> {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE}/api/extract-estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ storagePath, mimeType }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.extraction ?? null;
  } catch {
    return null;
  }
}

export function ImportEstimateModal({
  open, onClose, projectId, projectName, onSaved,
}: ImportEstimateModalProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'pdf' | 'email'>('pdf');

  // Trades
  const [trades, setTrades] = useState<string[]>(FALLBACK_TRADES);
  useEffect(() => {
    if (!open) return;
    getDocs(query(collection(db, 'trades'), orderBy('name')))
      .then(snap => {
        const list = snap.docs.map(d => (d.data() as any).name).filter(Boolean);
        if (list.length) setTrades(list);
      })
      .catch(() => { /* fallback list is fine */ });
  }, [open]);

  // Shared form state
  const [vendorName, setVendorName] = useState('');
  const [trade, setTrade] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [description, setDescription] = useState('');

  // PDF tab state
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadedEstimateAttachment | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Email tab state
  const [emailBody, setEmailBody] = useState('');

  const [saving, setSaving] = useState(false);

  const resetAll = () => {
    setTab('pdf');
    setVendorName('');
    setTrade('');
    setTotalAmount('');
    setDescription('');
    setFile(null);
    setUploaded(null);
    setUploadPct(0);
    setUploading(false);
    setExtracting(false);
    setEmailBody('');
    setSaving(false);
    setDragOver(false);
  };

  const handleClose = () => {
    if (saving || uploading) return;
    resetAll();
    onClose();
  };

  const guardProject = (): boolean => {
    if (!projectId) {
      toast({
        title: 'Open this from a project',
        description:
          'Imports are scoped to a project so the PDF/email can be attached to its files. Open the project, then click Import.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  // ── PDF upload + (optional) Claude extraction ──────────────────────────────
  const handleFileSelected = async (selected: File) => {
    if (!guardProject()) return;
    setFile(selected);
    if (!description) setDescription(selected.name);
    setUploading(true);
    setUploadPct(0);
    try {
      const result = await uploadEstimateAttachment(projectId!, selected, pct =>
        setUploadPct(Math.round(pct)),
      );
      setUploaded(result);
      // Best-effort Claude vision extraction. Silent-fail to keep manual path working.
      setExtracting(true);
      const extracted = await callExtractEstimate(result.storagePath, result.mimeType);
      if (extracted) {
        if (extracted.vendor_name && !vendorName) setVendorName(extracted.vendor_name);
        if (extracted.trade && !trade) setTrade(extracted.trade);
        if (extracted.total_amount != null && !totalAmount) {
          setTotalAmount(String(extracted.total_amount));
        }
        if (extracted.notes && (!description || description === selected.name)) {
          setDescription(extracted.notes);
        }
        toast({ title: 'Auto-filled from PDF', description: 'Review the fields before saving.' });
      }
    } catch (e: any) {
      toast({
        title: 'Upload failed',
        description: e?.message || 'Storage rejected the upload.',
        variant: 'destructive',
      });
      setFile(null);
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelected(f);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!guardProject()) return;

    // Validate per-tab
    if (tab === 'pdf' && !uploaded) {
      toast({ title: 'Upload a PDF first', variant: 'destructive' });
      return;
    }
    if (tab === 'email' && !emailBody.trim()) {
      toast({ title: 'Paste the email body first', variant: 'destructive' });
      return;
    }
    if (!vendorName.trim()) {
      toast({ title: 'Vendor name is required', variant: 'destructive' });
      return;
    }
    if (!trade.trim()) {
      toast({ title: 'Pick a trade', variant: 'destructive' });
      return;
    }
    const totalNum = Number(totalAmount);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      toast({ title: 'Enter a valid total amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // If email tab, upload the body as a .txt for auditability.
      let attachment: UploadedEstimateAttachment | null = uploaded;
      let importedFrom: 'pdf' | 'email' = tab === 'email' ? 'email' : 'pdf';
      if (tab === 'email') {
        const txtFile = new File(
          [emailBody],
          `email-${Date.now()}.txt`,
          { type: 'text/plain' },
        );
        attachment = await uploadEstimateAttachment(projectId!, txtFile);
      }

      const title = `${vendorName} — ${trade}${projectName ? ` (${projectName})` : ''}`;
      const lineItem = {
        id: crypto.randomUUID(),
        trade,
        description: description || vendorName,
        qty: 1,
        unit: 'lump sum',
        unitCost: totalNum,
        subCost: totalNum,
        total: totalNum,
        subName: vendorName,
        kind: 'subcontractor' as const,
        lineStatus: 'inc' as const,
      };

      const docRef = await addDoc(collection(db, 'estimates'), {
        title,
        status: 'draft',
        projectId: projectId!,
        ...(projectName ? { projectName } : {}),
        vendorName,
        trade,
        totalAmount: totalNum,
        subtotal: totalNum,
        overhead: 0,
        profit: 0,
        lineItems: [lineItem],
        importedFrom,
        attachments: attachment
          ? [{
              storagePath: attachment.storagePath,
              url: attachment.url,
              fileName: attachment.fileName,
              sizeBytes: attachment.sizeBytes,
              mimeType: attachment.mimeType,
              source: importedFrom,
            }]
          : [],
        pipelineStage: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Estimate imported',
        description: 'Saved as draft. Flip to "Sent" from the Estimates list when ready to share.',
      });
      onSaved?.(docRef.id);
      resetAll();
      onClose();
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: e?.message || 'Could not create the estimate.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[#C9A96E]" />
            Import Estimate from PDF or Email
          </DialogTitle>
        </DialogHeader>

        {/* Heads-up banner — sets expectation about draft + client visibility */}
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          Saved as <strong>draft</strong> — switch status to <strong>"sent"</strong> from the
          Estimates list when you're ready to share with the client.
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as 'pdf' | 'email')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pdf"><Upload className="h-4 w-4 mr-1.5" /> Upload PDF</TabsTrigger>
            <TabsTrigger value="email"><FileText className="h-4 w-4 mr-1.5" /> Paste email body</TabsTrigger>
          </TabsList>

          {/* ── PDF tab ─────────────────────────────────────────────────────── */}
          <TabsContent value="pdf" className="space-y-3 pt-2">
            {!uploaded && (
              <div
                onDrop={onDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver ? 'border-[#C9A96E] bg-amber-50/30' : 'border-gray-300'
                }`}
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-700">
                  Drag a PDF (or photo of a printed quote) here
                </p>
                <p className="text-xs text-gray-500 mt-1">or</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading… {uploadPct}%</> : 'Choose file'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                  }}
                />
              </div>
            )}
            {uploading && !uploaded && (
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#C9A96E] transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
            )}
            {uploaded && (
              <div className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 bg-gray-50">
                <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{uploaded.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {(uploaded.sizeBytes / 1024).toFixed(1)} KB
                    {extracting && <> · <Sparkles className="inline h-3 w-3" /> Extracting…</>}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-700"
                  onClick={() => { setUploaded(null); setFile(null); setUploadPct(0); }}
                  disabled={extracting || saving}
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </TabsContent>

          {/* ── Email tab ──────────────────────────────────────────────────── */}
          <TabsContent value="email" className="space-y-3 pt-2">
            <Label htmlFor="email-body" className="text-sm">Email body</Label>
            <Textarea
              id="email-body"
              rows={8}
              placeholder="Paste the email content here. We'll save it as a .txt alongside the estimate."
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-gray-500">
              We save the text body as a file for auditability — Tyler always has the receipt.
            </p>
          </TabsContent>
        </Tabs>

        {/* ── Shared form fields ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div>
            <Label htmlFor="vendorName" className="text-sm">Vendor / Subcontractor *</Label>
            <Input
              id="vendorName"
              value={vendorName}
              onChange={e => setVendorName(e.target.value)}
              placeholder="ACME Electric LLC"
            />
          </div>
          <div>
            <Label htmlFor="trade" className="text-sm">Trade *</Label>
            <Select value={trade} onValueChange={setTrade}>
              <SelectTrigger id="trade">
                <SelectValue placeholder="Pick a trade" />
              </SelectTrigger>
              <SelectContent>
                {trades.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="totalAmount" className="text-sm">Total amount (USD) *</Label>
            <Input
              id="totalAmount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              placeholder="12500.00"
            />
          </div>
          <div>
            <Label htmlFor="description" className="text-sm">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="One-line summary"
            />
          </div>
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={handleClose} disabled={saving || uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || uploading || extracting}
            style={{ backgroundColor: '#16a34a', color: '#fff' }}
            className="hover:opacity-90"
          >
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save as draft estimate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportEstimateModal;
