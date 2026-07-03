// QuickExpenseCapture — mobile-friendly modal for snapping a receipt and
// recording a project expense. The camera/file picker captures an image which
// gets posted to /api/expenses/capture, where Claude vision extracts vendor /
// amount / date / line items. The user reviews the extracted fields, assigns a
// project + draw + trade category, and submits.
//
// Brand notes:
//   - Primary action button uses Skyeline gold (#C9A96E hover #A8864A).
//   - Body text uses Inter, the modal title uses Cormorant Garamond.

import { useEffect, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Camera, Loader2, Sparkles, Upload, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types

type ExpenseCategory =
  | 'materials'
  | 'labor'
  | 'equipment'
  | 'fees'
  | 'subcontractor'
  | 'other';

interface Project {
  id: string;
  name: string;
}

interface QuickExpenseCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  onCaptured?: (expense: any) => void;
}

// Mirror the trade list used across the app (Framing, Electrical, etc.).
// Kept inline to avoid a runtime fetch — the user can override with "Other".
const TRADE_CATEGORIES = [
  'Framing',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Concrete',
  'Roofing',
  'Drywall',
  'Insulation',
  'Flooring',
  'Painting',
  'Cabinets',
  'Countertops',
  'Tile',
  'Landscaping',
  'Excavation',
  'Foundation',
  'Windows',
  'Doors',
  'Siding',
  'Fixtures',
  'Appliances',
  'Other',
] as const;

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'materials', label: 'Materials' },
  { value: 'labor', label: 'Labor' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'fees', label: 'Fees' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'other', label: 'Other' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

function apiBase(): string {
  return (
    ((import.meta as any).env?.VITE_API_BASE_URL as string) ||
    'https://api-mtph34upva-uc.a.run.app'
  );
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Read a File into a base64 string (without the data: URL prefix). */
async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      // result looks like "data:image/jpeg;base64,AAAA..." — strip prefix
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component

export function QuickExpenseCapture({
  open,
  onOpenChange,
  defaultProjectId,
  onCaptured,
}: QuickExpenseCaptureProps) {
  const { toast } = useToast();

  // Form state ─────────────────────────────────────────────────────────────
  const [projectId, setProjectId] = useState<string>(defaultProjectId || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(todayIso());
  const [category, setCategory] = useState<ExpenseCategory>('materials');
  const [description, setDescription] = useState('');
  const [drawNumber, setDrawNumber] = useState<string>('');
  const [tradeCategory, setTradeCategory] = useState<string>('');
  const [notes, setNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset form on close ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setImageFile(null);
      setImagePreview(null);
      setVendor('');
      setAmount('');
      setDate(todayIso());
      setCategory('materials');
      setDescription('');
      setDrawNumber('');
      setTradeCategory('');
      setNotes('');
      setAnalyzing(false);
      setSubmitting(false);
    }
  }, [open]);

  // Load projects when the dialog opens ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingProjects(true);
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        const headers: Record<string, string> = {};
        if (user) {
          const token = await user.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch(`${apiBase()}/api/projects`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const list: Project[] = Array.isArray(data)
          ? data
              .map((p: any) => ({ id: String(p.id), name: String(p.name || 'Untitled') }))
              .filter((p) => !!p.id)
          : [];
        setProjects(list);
        if (!projectId && defaultProjectId) setProjectId(defaultProjectId);
      } catch (err: any) {
        console.error('[QuickExpenseCapture] load projects failed:', err);
        if (!cancelled) {
          toast({
            title: 'Could not load projects',
            description: err.message || 'Try again in a moment.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Image handlers ─────────────────────────────────────────────────────────
  function handleFilePicked(file: File | null) {
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(String(reader.result || ''));
    reader.readAsDataURL(file);
    // Auto-trigger extraction so the user sees prefilled fields fast.
    void runExtraction(file);
  }

  async function runExtraction(file: File) {
    setAnalyzing(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const token = await user.getIdToken();

      const base64 = await fileToBase64(file);
      // We post WITHOUT projectId — this is just for OCR preview. We'll re-post
      // with projectId on Submit. Backend requires projectId for create, so we
      // call a lightweight path: post the full capture call with a temp marker
      // only if projectId is set; otherwise extract locally is not available.
      // Workaround: if no projectId picked yet, just store the file and wait.
      if (!projectId) {
        // Defer extraction until the user picks a project.
        toast({
          title: 'Pick a project',
          description: 'Choose a project and we\u2019ll auto-extract the receipt.',
        });
        return;
      }

      const res = await fetch(`${apiBase()}/api/expenses/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          imageBase64: base64,
          imageMimeType: file.type || 'image/jpeg',
          // Sentinel marker: the user will Submit again to confirm. We DO
          // create the expense doc here (status 'pending') and return it with
          // the extraction so the user can edit + PATCH it on Submit.
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const ex = json.extraction || {};
      const created = json.expense || {};
      // Pre-fill the form from the extraction (fall back to whatever the
      // create-side ended up storing if extraction was null).
      if (ex.vendor || created.vendor) setVendor(String(ex.vendor || created.vendor || ''));
      if (typeof (ex.amount ?? created.amount) === 'number')
        setAmount(String(ex.amount ?? created.amount));
      if (ex.date || created.date) setDate(String(ex.date || created.date || todayIso()));
      if (ex.category || created.category)
        setCategory((ex.category || created.category) as ExpenseCategory);
      if (ex.description || created.description)
        setDescription(String(ex.description || created.description || ''));
      // Stash the created expense id on the file element so Submit can PATCH.
      (file as any)._expenseId = created.id;
      (file as any)._expenseProjectId = created.projectId;
      toast({
        title: 'Receipt analyzed',
        description: 'Review the fields below and submit when ready.',
      });
    } catch (err: any) {
      console.error('[QuickExpenseCapture] OCR failed:', err);
      toast({
        title: 'Could not analyze receipt',
        description: err.message || 'You can still fill the fields manually.',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  }

  // Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!projectId) {
      toast({
        title: 'Project required',
        description: 'Choose a project to record this expense against.',
        variant: 'destructive',
      });
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({
        title: 'Amount required',
        description: 'Enter the receipt total.',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const token = await user.getIdToken();

      const drawNum =
        drawNumber.trim() === '' ? null : Number(drawNumber);
      const project = projects.find((p) => p.id === projectId);

      const existingId: string | undefined = imageFile
        ? (imageFile as any)._expenseId
        : undefined;
      const existingProject: string | undefined = imageFile
        ? (imageFile as any)._expenseProjectId
        : undefined;

      let saved: any;
      if (existingId && existingProject) {
        // We already created a pending expense during OCR; PATCH it with the
        // confirmed fields.
        const res = await fetch(
          `${apiBase()}/api/expenses/${encodeURIComponent(existingId)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              projectId: existingProject,
              vendor,
              amount: amountNum,
              date,
              category,
              description,
              drawNumber: drawNum,
              tradeCategory,
              notes,
            }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        saved = await res.json();
      } else {
        // No image / no prior OCR call — create fresh. Include image if we
        // have one but skipped extraction.
        const body: any = {
          projectId,
          projectName: project?.name,
          vendor,
          amount: amountNum,
          date,
          category,
          description,
          drawNumber: drawNum,
          tradeCategory,
          notes,
        };
        if (imageFile) {
          body.imageBase64 = await fileToBase64(imageFile);
          body.imageMimeType = imageFile.type || 'image/jpeg';
        }
        const res = await fetch(`${apiBase()}/api/expenses/capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        saved = json.expense;
      }

      toast({
        title: 'Expense saved',
        description: `${vendor || 'Expense'} \u2014 $${amountNum.toFixed(2)}`,
      });
      onCaptured?.(saved);
      onOpenChange(false);
    } catch (err: any) {
      console.error('[QuickExpenseCapture] submit failed:', err);
      toast({
        title: 'Could not save expense',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', backgroundColor: '#ffffff' }}
      >
        <DialogHeader>
          <DialogTitle
            className="text-2xl"
            style={{ fontFamily: '"Cormorant Garamond", serif' }}
          >
            Quick Expense Capture
          </DialogTitle>
          <DialogDescription>
            Snap a receipt and we&apos;ll pre-fill the details with AI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Project picker */}
          <div className="space-y-2">
            <Label htmlFor="qec-project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="qec-project" disabled={loadingProjects}>
                <SelectValue
                  placeholder={
                    loadingProjects ? 'Loading projects\u2026' : 'Choose a project'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Receipt image */}
          <div className="space-y-2">
            <Label>Receipt</Label>
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Receipt preview"
                  className="w-full max-h-64 object-contain rounded-md border border-gray-200 bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 rounded-full bg-black/60 text-white p-1 hover:bg-black/80"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
                {analyzing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-md shadow">
                      <Loader2 className="w-4 h-4 animate-spin text-[#C9A96E]" />
                      <span className="text-sm">Analyzing receipt&hellip;</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24 flex-col gap-1"
                >
                  <Camera className="w-6 h-6 text-[#C9A96E]" />
                  <span>Take photo</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24 flex-col gap-1"
                >
                  <Upload className="w-6 h-6 text-[#C9A96E]" />
                  <span>Upload image</span>
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) =>
                handleFilePicked(e.target.files?.[0] || null)
              }
            />
          </div>

          {/* Extracted / editable fields */}
          <div className="space-y-2">
            <Label htmlFor="qec-vendor">Vendor</Label>
            <Input
              id="qec-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Home Depot, Ferguson, etc."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qec-amount">Amount ($)</Label>
              <Input
                id="qec-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qec-date">Date</Label>
              <Input
                id="qec-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qec-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as ExpenseCategory)}
              >
                <SelectTrigger id="qec-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qec-draw">Draw #</Label>
              <Input
                id="qec-draw"
                type="number"
                inputMode="numeric"
                value={drawNumber}
                onChange={(e) => setDrawNumber(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qec-trade">Trade category</Label>
            <Select value={tradeCategory} onValueChange={setTradeCategory}>
              <SelectTrigger id="qec-trade">
                <SelectValue placeholder="Select a trade" />
              </SelectTrigger>
              <SelectContent>
                {TRADE_CATEGORIES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qec-desc">Description</Label>
            <Input
              id="qec-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qec-notes">Notes</Label>
            <Textarea
              id="qec-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || analyzing}
            className="bg-[#C9A96E] hover:bg-[#A8864A] text-white"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving&hellip;
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Save expense
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QuickExpenseCapture;
