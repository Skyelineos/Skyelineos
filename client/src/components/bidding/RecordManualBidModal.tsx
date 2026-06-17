// Record Manual Bid Modal
//
// Tyler often receives sub quotes via email (PDF attachment) instead of through
// the magic-link bid portal. This modal is the GC-side affordance that takes
// that emailed quote and writes a proper `bids/{id}` doc so it shows up in the
// leveling matrix alongside portal-submitted bids — same schema, audit-stamped
// with `submissionMethod: 'manual'` so we can tell the source apart later.
//
// Save flow (intentionally split so partial-failure is honest):
//   1. addDoc(bids) with status='pending_review' to get a bidId
//   2. uploadBidAttachment(projectId, bidId, file) — Storage write keyed off
//      the new bidId so the filename is stable
//   3. updateDoc(bid, { attachment, status: 'received' }) — promote to the
//      same status portal-submitted bids land in
//   4. updateDoc(bidRequest, { vendors }) — flip this vendor's bidStatus to
//      'submitted' and stamp bidResponseId. Firestore can't update a nested
//      array element by index, so we read-mutate-write the whole array.
//
// If step 2 (upload) fails after step 1 succeeded, we still flip the vendor
// status + finalize the bid so the GC isn't blocked; the toast surfaces the
// partial failure with actionable copy ("edit the bid later to attach").

import { useState, useRef } from 'react';
import {
  collection, addDoc, doc, updateDoc, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { uploadBidAttachment } from '@/lib/bidSubmissions/uploadBidAttachment';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileUp, Loader2, Paperclip, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface RecordManualBidVendor {
  vendorName: string;
  email?: string;
  phone?: string;
  subContactId?: string;
  linkedUserId?: string;
  bidStatus?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  bidRequestId: string;
  bidRequestTrade: string;
  vendor: RecordManualBidVendor;
}

const ACCEPT_TYPES = '.pdf,application/pdf,image/*';

export function RecordManualBidModal({
  open,
  onClose,
  projectId,
  projectName,
  bidRequestId,
  bidRequestTrade,
  vendor,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [totalAmountStr, setTotalAmountStr] = useState('');
  const [inclusions, setInclusions] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Hard guard - if the portal beat us to it, refuse to open. We still render
  // the Dialog shell so the user gets clear feedback rather than a silent
  // no-op; the body short-circuits to an "already submitted" hint.
  const alreadySubmitted = vendor.bidStatus === 'submitted';

  const reset = () => {
    setFile(null);
    setDragActive(false);
    setTotalAmountStr('');
    setInclusions('');
    setExclusions('');
    setNotes('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const onPickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    // 25MB cap matches the storage rule's max + keeps mobile uploads sane.
    if (f.size > 25 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Max 25 MB - try compressing the PDF or attaching a photo instead.',
        variant: 'destructive',
      });
      return;
    }
    setFile(f);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const parseAmount = (raw: string): number | null => {
    // Strip commas, $ signs, spaces; allow plain decimal.
    const cleaned = raw.replace(/[$,\s]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({ title: 'Sign in required', variant: 'destructive' });
      return;
    }
    const total = parseAmount(totalAmountStr);
    if (total == null) {
      toast({ title: 'Enter a valid total amount', variant: 'destructive' });
      return;
    }

    setSubmitting(true);

    // Step 1 - create the bid doc first so we have a stable bidId for the
    // attachment filename. Status is intentionally 'pending_review' until we
    // finalize so a partial-failure leaves a clear audit trail.
    let bidId: string | null = null;
    try {
      const bidPayload: Record<string, any> = {
        bidRequestId,
        projectId,
        projectName: projectName || '',
        trade: bidRequestTrade,
        // Mirror the SubBidSubmissionForm shape so leveling/comparison views
        // don't have to special-case manual bids.
        subContactId: vendor.subContactId || '',
        subUserId: vendor.linkedUserId || '',
        subName: vendor.vendorName || 'Unknown',
        subCompany: '',
        subEmail: vendor.email || '',
        subPhone: vendor.phone || '',
        bidMode: 'pdfQuote',
        lineItems: [],
        subtotal: total,
        totalAmount: total,
        notes: notes.trim(),
        inclusions: inclusions.trim(),
        exclusions: exclusions.trim(),
        insurance: {} as Record<string, string>,
        contractorLicense: {} as Record<string, string>,
        agreementAcknowledged: false,
        // visibleToClient stays off - GC must opt in same as portal flow.
        visibleToClient: false,
        // Keep submittedViaPortal=true so the existing matrix subscription
        // (which filters where submittedViaPortal == true) picks this up. The
        // submissionMethod field is the canonical "did this come from the
        // portal vs an email PDF" discriminator.
        submittedViaPortal: true,
        submissionMethod: 'manual',
        submittedByUid: user.id?.toString() || '',
        submittedByName: user.name || '',
        recordedAt: serverTimestamp(),
        submittedAt: serverTimestamp(),
        status: 'pending_review',
      };

      const ref = await addDoc(collection(db, 'bids'), bidPayload);
      bidId = ref.id;
      // From this point bidId is guaranteed non-null; capture it in a const
      // so TS narrowing survives across await points.
      const newBidId: string = ref.id;

      // Step 2 - upload file (if any). Failure here is recoverable: we still
      // promote the bid to 'received' and flip the vendor status; the GC can
      // edit the bid later to attach the missing file.
      let uploadOk = true;
      let uploadErr: any = null;
      let attachment: Record<string, any> | null = null;
      if (file) {
        try {
          const meta = await uploadBidAttachment(projectId, newBidId, file);
          attachment = {
            name: meta.fileName,
            url: meta.downloadUrl,
            storagePath: meta.storagePath,
            sizeBytes: meta.sizeBytes,
            mimeType: meta.mimeType,
          };
        } catch (e) {
          uploadOk = false;
          uploadErr = e;
          // eslint-disable-next-line no-console
          console.error('[RecordManualBidModal] attachment upload failed', e);
        }
      }

      // Step 3 - finalize the bid doc. Always run, even on upload failure,
      // so the GC can see the bid total in the matrix.
      const finalPatch: Record<string, any> = {
        status: 'received',
      };
      if (attachment) {
        finalPatch.attachment = attachment;
        finalPatch.attachments = [attachment];
        finalPatch.quoteFile = attachment;
      }
      await updateDoc(doc(db, 'bids', newBidId), finalPatch);

      // Step 4 - flip the vendor's bidStatus on the bidRequest. Read-modify-
      // write because Firestore can't patch a nested array element by index.
      try {
        const bidRequestRef = doc(db, 'projects', projectId, 'bidRequests', bidRequestId);
        const snap = await getDoc(bidRequestRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          const vendors: any[] = Array.isArray(data.vendors) ? [...data.vendors] : [];
          // Match by contactId first (most stable), then email, then name.
          const targetContactId = vendor.subContactId || null;
          const targetEmail = (vendor.email || '').toLowerCase();
          const targetName = (vendor.vendorName || '').toLowerCase();
          let idx = -1;
          if (targetContactId) {
            idx = vendors.findIndex(v => v?.contactId === targetContactId);
          }
          if (idx < 0 && targetEmail) {
            idx = vendors.findIndex(v => (v?.email || '').toLowerCase() === targetEmail);
          }
          if (idx < 0 && targetName) {
            idx = vendors.findIndex(v => (v?.vendorName || '').toLowerCase() === targetName);
          }
          if (idx >= 0) {
            vendors[idx] = {
              ...vendors[idx],
              bidStatus: 'submitted',
              bidResponseId: newBidId,
              respondedAt: new Date(),
            };
            await updateDoc(bidRequestRef, {
              vendors,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (e) {
        // Non-fatal: the bid still saved, the matrix subscription will show it.
        // eslint-disable-next-line no-console
        console.error('[RecordManualBidModal] vendor status update failed', e);
      }

      if (!uploadOk) {
        toast({
          title: 'Bid saved, file upload failed',
          description: `${vendor.vendorName}'s bid was recorded but the attachment didn't upload. You can edit the bid later to attach the file. (${uploadErr?.message || 'Unknown error'})`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Bid recorded',
          description: `${vendor.vendorName} - $${total.toLocaleString()}${file ? ' - file attached' : ''}`,
        });
      }
      reset();
      onClose();
    } catch (e: any) {
      toast({
        title: 'Could not record bid',
        description: e?.message || String(e),
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="w-5 h-5 text-[#C9A96E]" />
            Record bid manually
          </DialogTitle>
          <DialogDescription>
            Recording bid from <strong>{vendor.vendorName}</strong> for{' '}
            <strong>{bidRequestTrade}</strong>
            {projectName ? <> on <strong>{projectName}</strong></> : null}.
          </DialogDescription>
        </DialogHeader>

        {alreadySubmitted ? (
          <div className="flex items-start gap-2 p-3 rounded border border-green-200 bg-green-50 text-sm text-green-900">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">This sub has already submitted a bid</p>
              <p className="text-xs mt-0.5">
                {vendor.vendorName} responded via the portal. Recording manually would create a
                duplicate - open the existing bid in the leveling matrix to view or edit it.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File upload - drag-drop + click-to-pick */}
            <div>
              <Label className="text-sm">Quote file (PDF or photo)</Label>
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-1.5 rounded-md border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
                  dragActive
                    ? 'border-[#C9A96E] bg-amber-50/50'
                    : file
                    ? 'border-green-400 bg-green-50/40'
                    : 'border-gray-300 hover:border-[#C9A96E] hover:bg-amber-50/30'
                }`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Paperclip className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-gray-900 truncate max-w-[260px]">{file.name}</span>
                    <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(0)} KB)</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onPickFile(null); }}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <FileUp className="w-6 h-6 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-600">
                      Drop the quote PDF or photo here, or <span className="text-[#C9A96E] font-medium">browse</span>
                    </p>
                    <p className="text-[11px] text-gray-400">.pdf or any image - up to 25 MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_TYPES}
                className="hidden"
                onChange={e => onPickFile(e.target.files?.[0] || null)}
              />
            </div>

            {/* Total amount */}
            <div>
              <Label htmlFor="manual-bid-total" className="text-sm">
                Total amount <span className="text-red-500">*</span>
              </Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <Input
                  id="manual-bid-total"
                  type="text"
                  inputMode="decimal"
                  placeholder="125,000"
                  value={totalAmountStr}
                  onChange={e => setTotalAmountStr(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>

            {/* Inclusions */}
            <div>
              <Label htmlFor="manual-bid-inclusions" className="text-sm">Inclusions</Label>
              <Textarea
                id="manual-bid-inclusions"
                placeholder="What's covered in this number (materials, labor, specific scope items...)"
                value={inclusions}
                onChange={e => setInclusions(e.target.value)}
                rows={3}
                className="mt-1.5"
              />
            </div>

            {/* Exclusions */}
            <div>
              <Label htmlFor="manual-bid-exclusions" className="text-sm">Exclusions</Label>
              <Textarea
                id="manual-bid-exclusions"
                placeholder="What's NOT in this number (permits, finishes, allowances...)"
                value={exclusions}
                onChange={e => setExclusions(e.target.value)}
                rows={3}
                className="mt-1.5"
              />
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="manual-bid-notes" className="text-sm">Notes</Label>
              <Textarea
                id="manual-bid-notes"
                placeholder="Anything else worth saving with the bid"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="mt-1.5"
              />
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                This bid will be saved as if {vendor.vendorName} had submitted it via the portal,
                with an audit stamp showing you recorded it manually.
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            {alreadySubmitted ? 'Close' : 'Cancel'}
          </Button>
          {!alreadySubmitted && (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-1.5 text-white"
              style={{ backgroundColor: '#C9A96E' }}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
              Save bid
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
