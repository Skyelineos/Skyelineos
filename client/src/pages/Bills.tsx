import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, limit,
  doc, updateDoc, deleteDoc, where, getDocs,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Receipt, Upload, Sparkles, FileText, Camera, Save, X, AlertCircle,
  CheckCircle2, Loader2, Edit, Trash2, Eye,
} from 'lucide-react';

// Call the Express endpoint on the api function — avoids per-function IAM
async function analyzeBillFn({ storagePath, mimeType }: { storagePath: string; mimeType?: string }): Promise<{ data: { extraction: BillExtraction } }> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const idToken = await user.getIdToken();

  // Use the deployed api function URL; fall back to relative path for local dev
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL
    || 'https://api-mtph34upva-uc.a.run.app';

  const res = await fetch(`${apiBase}/api/analyze-bill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ storagePath, mimeType }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const json = await res.json();
  return { data: { extraction: json.extraction } };
}

interface BillExtraction {
  vendor: string | null;
  vendorAddress: string | null;
  vendorPhone: string | null;
  invoiceNumber: string | null;
  billDate: string | null;
  dueDate: string | null;
  amount: number | null;
  subtotal: number | null;
  tax: number | null;
  description: string | null;
  category: string | null;
  projectReference: string | null;
  lineItems: Array<{ description: string; qty?: number; unitCost?: number; amount: number }>;
  paymentTerms: string | null;
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
}

interface Bill {
  id: string;
  type: 'bill';
  vendor: string;
  invoiceNumber?: string;
  description?: string;
  category?: string;
  amount: number;
  // Workflow states mirroring the Jack tabbed flow:
  //   draft → awaiting_approval → approved_for_payment → paid
  //   side states: hold_payment, rejected, bank_charge, credit_note
  status: 'draft' | 'awaiting_approval' | 'hold_payment' | 'approved_for_payment'
        | 'paid' | 'rejected' | 'bank_charge' | 'credit_note'
        | 'unpaid' | 'pending'; // legacy aliases retained for older docs
  billDate?: string;
  dueDate?: string;
  projectId?: string;
  projectName?: string;
  imageUrl?: string;
  storagePath?: string;
  notes?: string;
  ocrConfidence?: string;
  createdAt?: any;
}

const CATEGORIES = ['materials', 'labor', 'equipment', 'fees', 'subcontractor', 'other'];
const STATUSES = [
  'draft', 'awaiting_approval', 'hold_payment', 'approved_for_payment',
  'paid', 'rejected', 'bank_charge', 'credit_note',
];

export default function Bills() {
  return (
    <AppLayout>
      <BillsContent />
    </AppLayout>
  );
}

export function BillsContent({ projectId: scopedProjectId }: { projectId?: string } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bills, setBills] = useState<Bill[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Upload + extract state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState<BillExtraction | null>(null);
  const [storagePath, setStoragePath] = useState<string>('');

  // Review form state (populated from extraction, editable)
  const [draft, setDraft] = useState<Partial<Bill>>({});

  // Load bills + projects
  useEffect(() => {
    const q = query(
      collection(db, 'financials'),
      where('type', '==', 'bill'),
      orderBy('createdAt', 'desc'),
      limit(50),
    );
    return onSnapshot(q, snap => {
      setBills(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bill)));
    }, () => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')));
        setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Untitled' })));
      } catch {}
    })();
  }, []);

  const handleFile = (file: File) => {
    setUploadFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setExtraction(null);
    setDraft({});
  };

  const handleUploadAndExtract = async () => {
    if (!uploadFile || !user) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      // Upload to Firebase Storage
      const ext = uploadFile.name.split('.').pop() || 'jpg';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `bills/${new Date().toISOString().slice(0, 7)}/${filename}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, uploadFile);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          err => reject(err),
          () => resolve(),
        );
      });
      const downloadUrl = await getDownloadURL(sref);
      setStoragePath(path);
      setUploading(false);

      // Call AI extract
      setExtracting(true);
      toast({ title: 'Analyzing bill with Claude...', description: 'This usually takes 5-15 seconds.' });
      const result: any = await analyzeBillFn({ storagePath: path, mimeType: uploadFile.type });
      const ex = result.data.extraction as BillExtraction;
      setExtraction(ex);

      // Pre-populate draft from extraction
      setDraft({
        type: 'bill',
        vendor: ex.vendor || '',
        invoiceNumber: ex.invoiceNumber || '',
        description: ex.description || '',
        category: ex.category || 'materials',
        amount: ex.amount || 0,
        billDate: ex.billDate || '',
        dueDate: ex.dueDate || '',
        status: 'awaiting_approval',
        notes: ex.paymentTerms ? `Terms: ${ex.paymentTerms}` : '',
        imageUrl: downloadUrl,
        storagePath: path,
        projectName: scopedProjectId
          ? (projects.find(p => p.id === scopedProjectId)?.name || '')
          : (ex.projectReference || ''),
        projectId: scopedProjectId || undefined,
        ocrConfidence: ex.confidence,
      });

      toast({
        title: 'Extracted',
        description: `Confidence: ${ex.confidence}. Review and save.`,
      });
    } catch (e: any) {
      const code = e?.code || '';
      const msg = e?.message || String(e);
      console.error('[Bills] error', e);
      toast({
        title: 'Extraction failed',
        description: code === 'functions/permission-denied'
          ? 'You must be signed in.'
          : msg,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!user || !draft.vendor || !draft.amount) {
      toast({ title: 'Vendor + amount required', variant: 'destructive' });
      return;
    }
    try {
      const project = projects.find(p => p.name === draft.projectName);
      await addDoc(collection(db, 'financials'), {
        ...draft,
        type: 'bill',
        amount: Number(draft.amount) || 0,
        projectId: project?.id || null,
        projectName: project?.name || draft.projectName || '',
        status: draft.status || 'unpaid',
        createdAt: serverTimestamp(),
        createdBy: user.id?.toString() || user.email || 'unknown',
      });
      toast({ title: 'Bill saved', description: `${draft.vendor} · $${draft.amount}` });
      reset();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const reset = () => {
    setUploadFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setExtraction(null);
    setDraft({});
    setStoragePath('');
    setUploadProgress(0);
  };

  const handleStatusChange = async (id: string, status: Bill['status']) => {
    try {
      await updateDoc(doc(db, 'financials', id), { status });
      toast({ title: `Marked ${status}` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete this bill?',
      description: 'This cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'financials', id));
      toast({ title: 'Deleted' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  // Scope to project if requested.
  const visibleBills = scopedProjectId ? bills.filter(b => b.projectId === scopedProjectId) : bills;

  // Workflow tab filter — what's currently in view.
  const [statusTab, setStatusTab] = useState<string>('all');
  // Treat legacy 'unpaid'/'pending' as 'draft'/'awaiting_approval' for filter purposes.
  const statusMatch = (b: Bill, key: string) => {
    if (key === 'all') return true;
    if (key === 'draft') return b.status === 'draft' || b.status === 'unpaid';
    if (key === 'awaiting_approval') return b.status === 'awaiting_approval' || b.status === 'pending';
    return b.status === key;
  };
  const filteredByStatus = visibleBills.filter(b => statusMatch(b, statusTab));

  // Stats — by workflow column
  const totals = {
    unpaid: visibleBills.filter(b => b.status === 'unpaid' || b.status === 'draft').reduce((s, b) => s + (b.amount || 0), 0),
    pending: visibleBills.filter(b => b.status === 'pending' || b.status === 'awaiting_approval').reduce((s, b) => s + (b.amount || 0), 0),
    paid: visibleBills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0),
  };

  const STATUS_TABS: Array<{ key: string; label: string }> = [
    { key: 'all',                   label: 'All' },
    { key: 'draft',                 label: 'Draft' },
    { key: 'awaiting_approval',     label: 'Awaiting Approval' },
    { key: 'hold_payment',          label: 'Hold Payment' },
    { key: 'approved_for_payment',  label: 'Approved For Payment' },
    { key: 'paid',                  label: 'Paid' },
    { key: 'rejected',              label: 'Rejected' },
    { key: 'bank_charge',           label: 'Bank Charges' },
    { key: 'credit_note',           label: 'Credit Notes' },
  ];

  return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Receipt className="w-7 h-7 text-[#C9A96E]" />
            <h1 className="text-2xl font-bold text-gray-900">AI Bill OCR</h1>
            <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1">
              <Sparkles className="w-3 h-3" /> Powered by Claude
            </Badge>
          </div>
          <p className="text-gray-500 text-sm">
            Snap a vendor bill — Claude reads it and pre-fills everything. Review, pick the project, save.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Unpaid" value={totals.unpaid} count={visibleBills.filter(b => b.status === 'unpaid').length} color="text-orange-600" />
          <StatCard label="Pending" value={totals.pending} count={visibleBills.filter(b => b.status === 'pending').length} color="text-blue-600" />
          <StatCard label="Paid" value={totals.paid} count={visibleBills.filter(b => b.status === 'paid').length} color="text-green-600" />
        </div>

        {/* Upload + extract */}
        {!extraction ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload a bill</CardTitle>
              <CardDescription>Photo (JPEG, PNG) or PDF. Claude extracts vendor, amount, dates, category, and line items.</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {!uploadFile ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex flex-col items-center gap-3 py-12 border-2 border-dashed border-gray-200 rounded-lg hover:border-[#C9A96E] hover:bg-[#FFF8E7] transition-colors"
                >
                  <Camera className="w-10 h-10 text-[#C9A96E]" />
                  <div className="text-center">
                    <p className="font-medium text-gray-700">Take photo / upload bill</p>
                    <p className="text-xs text-gray-400 mt-1">Phone camera or gallery file</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="relative bg-gray-50 rounded-lg overflow-hidden border">
                    {uploadFile.type.startsWith('image/') ? (
                      <img src={previewUrl} alt="bill" className="w-full max-h-96 object-contain" />
                    ) : (
                      <div className="p-12 text-center">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-700">{uploadFile.name}</p>
                        <p className="text-xs text-gray-400">{(uploadFile.size / 1024).toFixed(0)} KB · PDF</p>
                      </div>
                    )}
                    <button
                      onClick={reset}
                      disabled={uploading || extracting}
                      className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 hover:bg-black/90"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {(uploading || extracting) && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-center gap-2 text-sm text-blue-900">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {uploading ? `Uploading… ${Math.round(uploadProgress)}%` : 'Claude is reading the bill...'}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={reset} disabled={uploading || extracting}>Cancel</Button>
                    <Button
                      onClick={handleUploadAndExtract}
                      disabled={uploading || extracting}
                      className="gap-2 text-white"
                      style={{ backgroundColor: '#C9A96E' }}
                    >
                      <Sparkles className="w-4 h-4" />
                      Extract with AI
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Review form — side-by-side image + extracted fields */
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Review extracted data
                </CardTitle>
                <CardDescription>
                  Confidence: <Badge className="ml-1" variant="outline">{extraction.confidence}</Badge>
                  {extraction.confidence === 'low' && <span className="text-orange-600 ml-2 text-xs">⚠️ low confidence — verify carefully</span>}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="w-4 h-4 mr-1" /> Discard
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Image preview */}
                <div className="bg-gray-50 rounded-lg overflow-hidden border max-h-96">
                  {uploadFile?.type.startsWith('image/') ? (
                    <img src={previewUrl} alt="bill" className="w-full h-full object-contain" />
                  ) : (
                    <div className="p-12 text-center">
                      <FileText className="w-12 h-12 text-gray-400 mx-auto" />
                      <p className="text-sm mt-2">{uploadFile?.name}</p>
                    </div>
                  )}
                </div>

                {/* Editable fields */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Vendor *" value={draft.vendor} onChange={v => setDraft(d => ({ ...d, vendor: v }))} />
                    <Field label="Invoice #" value={draft.invoiceNumber} onChange={v => setDraft(d => ({ ...d, invoiceNumber: v }))} />
                  </div>
                  <Field label="Description" value={draft.description} onChange={v => setDraft(d => ({ ...d, description: v }))} />
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Amount *" value={String(draft.amount || '')} onChange={v => setDraft(d => ({ ...d, amount: parseFloat(v) || 0 }))} type="number" />
                    <Field label="Bill date" value={draft.billDate} onChange={v => setDraft(d => ({ ...d, billDate: v }))} type="date" />
                    <Field label="Due date" value={draft.dueDate} onChange={v => setDraft(d => ({ ...d, dueDate: v }))} type="date" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Category</Label>
                      <Select value={draft.category} onValueChange={v => setDraft(d => ({ ...d, category: v }))}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Project</Label>
                      <Select value={draft.projectName} onValueChange={v => setDraft(d => ({ ...d, projectName: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder={draft.projectName || '— pick project —'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— No project —</SelectItem>
                          {projects.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {extraction.projectReference && !projects.find(p => p.name === draft.projectName) && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          ⚠️ Claude saw "{extraction.projectReference}" — pick a matching project
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      rows={2}
                      value={draft.notes || ''}
                      onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                    />
                  </div>

                  {/* Line items preview */}
                  {extraction.lineItems.length > 0 && (
                    <details className="bg-gray-50 rounded p-2 text-xs">
                      <summary className="cursor-pointer font-medium text-gray-700">Line items ({extraction.lineItems.length})</summary>
                      <table className="w-full mt-2 text-[11px]">
                        <thead><tr className="text-gray-500">
                          <th className="text-left">Description</th><th className="text-right">Qty</th><th className="text-right">Amount</th>
                        </tr></thead>
                        <tbody>
                          {extraction.lineItems.map((li, i) => (
                            <tr key={i} className="border-t border-gray-200">
                              <td className="py-1">{li.description}</td>
                              <td className="text-right py-1">{li.qty || ''}</td>
                              <td className="text-right py-1 font-mono">${li.amount?.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}

                  <Button
                    onClick={handleSave}
                    disabled={!draft.vendor || !draft.amount}
                    className="w-full gap-2 text-white"
                    style={{ backgroundColor: '#22c55e' }}
                  >
                    <Save className="w-4 h-4" /> Save Bill
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bills list */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Bills</CardTitle>
              <div className="text-xs text-gray-500">
                {filteredByStatus.length} of {visibleBills.length} bills{statusTab !== 'all' ? ` · ${STATUS_TABS.find(t => t.key === statusTab)?.label}` : ''}
              </div>
            </div>
            {/* Workflow status tabs (Jack-style) */}
            <div className="flex flex-wrap gap-1 mt-3 -mb-1">
              {STATUS_TABS.map(t => {
                const count = visibleBills.filter(b => statusMatch(b, t.key)).length;
                const isActive = statusTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setStatusTab(t.key)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition ${
                      isActive
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {t.label} <span className={isActive ? 'opacity-70' : 'text-gray-400'}>· {count}</span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredByStatus.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-500">
                {visibleBills.length === 0 ? 'No bills yet. Upload your first one above.' : 'No bills in this state.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-y text-xs text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Vendor / Invoice</th>
                      <th className="px-4 py-2.5 text-left font-medium">Project</th>
                      <th className="px-4 py-2.5 text-left font-medium">Date</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                      <th className="px-4 py-2.5 text-left font-medium">Status</th>
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredByStatus.map(b => (
                      <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{b.vendor}</div>
                          <div className="text-xs text-gray-500">{b.invoiceNumber || ''} {b.description && `· ${b.description}`}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{b.projectName || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">
                          {b.billDate}
                          {b.dueDate && <div className="text-gray-400">due {b.dueDate}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">${b.amount.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <Select value={b.status} onValueChange={v => handleStatusChange(b.id, v as any)}>
                            <SelectTrigger className="h-7 text-xs w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {b.imageUrl && (
                              <a href={b.imageUrl} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="ghost"><Eye className="w-3.5 h-3.5" /></Button>
                              </a>
                            )}
                            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(b.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value?: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value || ''} onChange={e => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}

function StatCard({ label, value, count, color }: { label: string; value: number; count: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>${value.toLocaleString()}</p>
        <p className="text-xs text-gray-400 mt-0.5">{count} bills</p>
      </CardContent>
    </Card>
  );
}
