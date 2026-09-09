// Accounts Payable Dashboard
// ===========================
//
// Displays invoices captured from Gmail email scanning, classified by Claude AI.
// Tabs: Invoices | By Job | By Trade
// Manual scan trigger, inline edit for job/trade corrections.

import { useState, useEffect, useCallback, useRef } from 'react';
import { ref as storageRef, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { getAuth } from 'firebase/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  DollarSign,
  Receipt,
  Clock,
  TrendingUp,
  RefreshCw,
  ScanLine,
  ChevronDown,
  ChevronUp,
  Edit2,
  CheckCircle2,
  Paperclip,
  ExternalLink,
  XCircle,
  AlertCircle,
  Building2,
  Hammer,
  FileText,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'https://api-mtph34upva-uc.a.run.app';

// Fallback list — real projects fetched from API at runtime
const FALLBACK_PROJECTS = [
  'Maple Manor', 'Maple Lakes', 'Rosecroft', 'Crestview Solace',
  'Belmont', 'Montclair', 'Carrington', 'Cascade', 'Ashford',
];

const VALID_TRADES = [
  'Framing', 'Concrete', 'Electrical', 'Plumbing', 'HVAC', 'Roofing',
  'Drywall', 'Flooring', 'Painting', 'Landscaping', 'Cabinets', 'Countertops',
  'Windows', 'Doors', 'Insulation', 'Excavation', 'Foundation', 'Masonry',
  'Tile', 'Hardware', 'Materials', 'Subcontractor', 'Professional Services', 'Other',
];

const BRAND_GOLD = '#C9A96E';
const BRAND_BLACK = '#141414';

const TRADE_COLORS = [
  '#C9A96E', '#B8955E', '#A8814E', '#976D3E', '#86592E',
  '#D4B085', '#DFBF96', '#E9CDA7', '#F4DCB8', '#6B9E8A',
  '#7BACAC', '#8BBACE', '#9BC8F0', '#A9C4DC', '#B7C0C8',
  '#C5BCA4', '#D3B880', '#E1B45C', '#EFB038', '#FDAC14',
  '#C9A96E', '#B8955E', '#A8814E', '#976D3E',
];

// ── Types ────────────────────────────────────────────────────────────────────

interface ApInvoice {
  id: string;
  gmailMessageId: string;
  vendor: string;
  amount: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  jobName: string | null;
  trade: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'auto_approved' | 'pending_review' | 'approved' | 'rejected';
  paymentStatus: 'unpaid' | 'paid' | 'partial' | 'unknown';
  paidDate: string | null;
  paidAmount: number | null;
  aiNotes: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  attachmentPaths: string[];
  rawBodySnippet: string;
  createdAt: any;
}

interface Summary {
  grandTotal: number;         // total of all non-rejected invoices
  outstandingTotal: number;   // unpaid + partial
  paidThisMonth: number;      // paid this calendar month
  thisMonthTotal: number;     // all invoices this month
  pendingCount: number;       // pending_review count
  unpaidCount: number;
  paidCount: number;
  topTrade: { trade: string; total: number } | null;
  byJob: Array<{ job: string; total: number; count: number; byTrade: Record<string, number> }>;
  byTrade: Array<{ trade: string; total: number; count: number }>;
}

interface EditState {
  invoiceId: string;
  field: 'job' | 'trade';
  currentValue: string;
  newValue: string;
  creatingJob?: boolean; // true = showing inline create-job form
}

interface ProjectOption {
  id: string;
  name: string;
  address?: string;
  status?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getIdToken(): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = await getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  // YYYY-MM-DD → MM/DD/YY
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0].slice(2)}`;
  return d;
}

// ── Status badge ─────────────────────────────────────────────────────────────

// ── Payment status badge — THE most important visual ─────────────────────────
function PaymentBadge({
  paymentStatus,
  amount,
  paidDate,
}: {
  paymentStatus: string;
  amount: number | null;
  paidDate: string | null;
}) {
  if (paymentStatus === 'paid') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ background: '#dcfce7', color: '#15803d' }}
        title={paidDate ? `Paid ${paidDate}` : 'Paid'}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        PAID
      </span>
    );
  }
  if (paymentStatus === 'partial') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ background: '#fef9c3', color: '#854d0e' }}
      >
        <Clock className="h-3.5 w-3.5" />
        PARTIAL
      </span>
    );
  }
  // unpaid / unknown
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: '#fee2e2', color: '#991b1b' }}
    >
      <AlertCircle className="h-3.5 w-3.5" />
      UNPAID{amount ? ` · ${fmt(amount)}` : ''}
    </span>
  );
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: any }> = {
  auto_approved: { label: 'Auto-approved', bg: '#d1fae5', color: '#065f46', icon: CheckCircle2 },
  approved:      { label: 'Approved',      bg: '#d1fae5', color: '#065f46', icon: CheckCircle2 },
  pending_review:{ label: 'Pending Review', bg: '#fef3c7', color: '#92400e', icon: Clock },
  rejected:      { label: 'Rejected',      bg: '#fee2e2', color: '#991b1b', icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: '#f3f4f6', color: '#374151', icon: AlertCircle };
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const color = confidence === 'high' ? '#22c55e' : confidence === 'medium' ? '#eab308' : '#ef4444';
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {confidence}
    </span>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  highlight,
  highlightColor,
  highlightText,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  highlight?: boolean;
  highlightColor?: string;
  highlightText?: string;
}) {
  const bgColor = highlightColor ?? (highlight ? 'rgba(201,169,110,0.08)' : '#fff');
  const textColor = highlightText ?? (highlight ? BRAND_GOLD : BRAND_BLACK);
  const iconBg = highlightColor ? highlightColor : (highlight ? 'rgba(201,169,110,0.12)' : '#f9fafb');
  const iconColor = highlightText ?? (highlight ? BRAND_GOLD : '#6b7280');
  return (
    <Card className="border-0 shadow-sm" style={{ backgroundColor: bgColor }}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider font-sans" style={{ color: highlightText ? highlightText + 'bb' : undefined }}>{title}</p>
            <p className="text-2xl font-semibold mt-1 font-heading" style={{ color: textColor }}>
              {value}
            </p>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: highlightText ? highlightText + '99' : '#6b7280' }}>{subtitle}</p>}
          </div>
          <div className="p-2.5 rounded-lg" style={{ backgroundColor: iconBg }}>
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Expanded row detail ────────────────────────────────────────────────────────

function InvoiceRowDetail({ invoice }: { invoice: ApInvoice }) {
  return <ExpandedDetail invoice={invoice} />;
}

// ── Attachment viewer with Firebase Storage URLs ──────────────────────────────
function AttachmentList({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!paths || paths.length === 0) return;
    setLoading(true);
    Promise.all(
      paths.map(async (p) => {
        try {
          const url = await getDownloadURL(storageRef(storage, p));
          return [p, url] as [string, string];
        } catch {
          return [p, ''] as [string, string];
        }
      }),
    ).then((results) => {
      setUrls(Object.fromEntries(results.filter(([, u]) => u)));
      setLoading(false);
    });
  }, [paths]);

  if (!paths || paths.length === 0) return null;

  const filename = (p: string) => p.split('/').pop() || p;
  const isPdf = (p: string) => p.toLowerCase().endsWith('.pdf');

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
        <Paperclip className="h-3.5 w-3.5" />
        {paths.length} attachment{paths.length !== 1 ? 's' : ''}
      </p>
      {loading && <p className="text-xs text-gray-400">Loading files…</p>}
      {paths.map((p) => (
        <div key={p} className="flex items-center gap-2">
          {urls[p] ? (
            <a
              href={urls[p]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border hover:bg-gray-100 transition-colors"
              style={{ color: BRAND_GOLD, borderColor: BRAND_GOLD + '55' }}
            >
              {isPdf(p) ? '📄' : '🖼️'}
              {filename(p)}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>
          ) : (
            <span className="text-xs text-gray-400">{filename(p)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Expanded row detail ───────────────────────────────────────────────────────
function ExpandedDetail({ invoice }: { invoice: ApInvoice }) {
  return (
    <div className="px-4 py-4 bg-gray-50 border-t text-sm space-y-3">

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span><b>Subject:</b> {invoice.subject || '—'}</span>
        <span><b>From:</b> {invoice.fromName || invoice.fromEmail}</span>
        {invoice.fromEmail && invoice.fromName && (
          <span className="text-gray-400">&lt;{invoice.fromEmail}&gt;</span>
        )}
      </div>

      {/* AI notes */}
      {invoice.aiNotes && (
        <div>
          <span className="font-medium text-gray-600">AI reasoning: </span>
          <span className="text-gray-700 italic">{invoice.aiNotes}</span>
        </div>
      )}

      {/* Email snippet */}
      {invoice.rawBodySnippet && (
        <div>
          <span className="font-medium text-gray-600">Email body: </span>
          <span className="text-gray-500 font-mono text-xs">
            {invoice.rawBodySnippet.slice(0, 300)}{invoice.rawBodySnippet.length > 300 ? '…' : ''}
          </span>
        </div>
      )}

      {/* Attachments — full download links */}
      {invoice.attachmentPaths?.length > 0 && (
        <AttachmentList paths={invoice.attachmentPaths} />
      )}

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountsPayable() {
  const { toast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'invoices' | 'byJob' | 'byTrade'>('invoices');
  const [invoices, setInvoices] = useState<ApInvoice[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterJob, setFilterJob] = useState('');
  const [filterTrade, setFilterTrade] = useState('');

  // Edit modal
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Projects (fetched from API so we always have live list)
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const projectsLoadedRef = useRef(false);

  // Inline create-job form state
  const [newJobName, setNewJobName] = useState('');
  const [newJobAddress, setNewJobAddress] = useState('');
  const [creatingJob, setCreatingJob] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [invData, sumData] = await Promise.all([
        apiFetch('/api/ap/invoices?limit=200'),
        apiFetch('/api/ap/summary'),
      ]);
      setInvoices((invData.invoices || []) as ApInvoice[]);
      setSummary(sumData as Summary);
    } catch (e: any) {
      toast({ title: 'Failed to load AP data', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Load live project list ────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    if (projectsLoadedRef.current) return;
    try {
      const data = await apiFetch('/api/projects');
      const items: ProjectOption[] = (data || []).map((p: any) => ({
        id: p.id || p.projectId || String(Math.random()),
        name: p.name || p.projectName || '',
        address: p.address || p.location || '',
        status: p.status || '',
      })).filter((p: ProjectOption) => p.name);
      if (items.length > 0) {
        setProjectOptions(items);
        projectsLoadedRef.current = true;
      } else {
        // Fallback to hardcoded list if Firestore is empty
        setProjectOptions(FALLBACK_PROJECTS.map((n) => ({ id: n, name: n })));
      }
    } catch {
      setProjectOptions(FALLBACK_PROJECTS.map((n) => ({ id: n, name: n })));
    }
  }, []);

  // ── Create a new project from AP modal ───────────────────────────────────
  const handleCreateJob = async () => {
    const name = newJobName.trim();
    if (!name) return;
    setCreatingJob(true);
    try {
      const created = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          address: newJobAddress.trim() || undefined,
          status: 'active',
          source: 'ap_invoice_flow',
        }),
      });
      const newOpt: ProjectOption = { id: created?.id || name, name, address: newJobAddress.trim() };
      setProjectOptions((prev) => [...prev, newOpt]);
      // Assign the new project to the invoice being edited
      setEditState((s) => s ? { ...s, newValue: name, creatingJob: false } : null);
      setNewJobName('');
      setNewJobAddress('');
      toast({ title: `Job "${name}" created and assigned` });
    } catch (e: any) {
      // If project creation fails, still assign locally so the AP entry is tagged
      const newOpt: ProjectOption = { id: name, name };
      setProjectOptions((prev) => [...prev, newOpt]);
      setEditState((s) => s ? { ...s, newValue: name, creatingJob: false } : null);
      setNewJobName('');
      setNewJobAddress('');
      toast({ title: `Job "${name}" saved locally`, description: 'Will sync to Projects when fully connected.' });
    } finally {
      setCreatingJob(false);
    }
  };

  // ── Filtered invoices ──────────────────────────────────────────────────────
  const filtered = invoices.filter((inv) => {
    if (filterStatus && inv.status !== filterStatus) return false;
    if (filterJob && inv.jobName !== filterJob) return false;
    if (filterTrade && inv.trade !== filterTrade) return false;
    return true;
  });

  // ── Manual scan trigger ────────────────────────────────────────────────────
  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await apiFetch('/api/ap/scan', { method: 'POST' });
      toast({
        title: 'Scan complete',
        description: `Found ${res.scannedCount} emails · ${res.newCount} new invoices · ${res.skippedCount} skipped`,
      });
      await loadAll();
    } catch (e: any) {
      toast({ title: 'Scan failed', description: e.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  // ── Invoice update ─────────────────────────────────────────────────────────
  const handlePaymentStatus = async (id: string, paymentStatus: 'paid' | 'unpaid' | 'partial') => {
    try {
      const paidDate = paymentStatus === 'paid' ? new Date().toISOString().slice(0, 10) : null;
      await apiFetch(`/api/ap/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentStatus, paidDate }),
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === id ? { ...inv, paymentStatus, paidDate } : inv,
        ),
      );
      toast({ title: paymentStatus === 'paid' ? '✅ Marked as paid' : 'Payment status updated' });
      // Refresh summary totals
      apiFetch('/api/ap/summary').then(setSummary).catch(() => {});
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await apiFetch(`/api/ap/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === id ? { ...inv, status: newStatus as any } : inv)),
      );
      toast({ title: `Invoice ${newStatus}` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const openEdit = (invoice: ApInvoice, field: 'job' | 'trade') => {
    if (field === 'job') loadProjects(); // ensure live project list is loaded
    setNewJobName('');
    setNewJobAddress('');
    setEditState({
      invoiceId: invoice.id,
      field,
      currentValue: field === 'job' ? (invoice.jobName || '') : invoice.trade,
      newValue: field === 'job' ? (invoice.jobName || '') : invoice.trade,
      creatingJob: false,
    });
  };

  const saveEdit = async () => {
    if (!editState) return;
    setEditSaving(true);
    try {
      const patch =
        editState.field === 'job'
          ? { jobName: editState.newValue || null }
          : { trade: editState.newValue };
      await apiFetch(`/api/ap/invoices/${editState.invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === editState.invoiceId
            ? {
                ...inv,
                jobName: editState.field === 'job' ? (editState.newValue || null) : inv.jobName,
                trade: editState.field === 'trade' ? editState.newValue : inv.trade,
              }
            : inv,
        ),
      );
      toast({ title: `${editState.field === 'job' ? 'Job' : 'Trade'} updated` });
      setEditState(null);
      // Refresh summary
      apiFetch('/api/ap/summary').then(setSummary).catch(() => {});
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const tabStyle = (tab: string) => ({
    padding: '8px 20px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    background: activeTab === tab ? 'rgba(201,169,110,0.15)' : 'transparent',
    color: activeTab === tab ? BRAND_GOLD : '#6b7280',
    borderBottom: activeTab === tab ? `2px solid ${BRAND_GOLD}` : '2px solid transparent',
    transition: 'all 0.15s',
  });

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 px-1">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-semibold" style={{ color: BRAND_BLACK }}>
              Accounts Payable
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Email-scanned vendor invoices · AI-classified with Claude
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAll}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleScan}
              disabled={scanning}
              className="text-white font-medium"
              style={{ backgroundColor: BRAND_GOLD }}
            >
              {scanning ? (
                <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <ScanLine className="h-4 w-4 mr-1.5" />
              )}
              {scanning ? 'Scanning…' : 'Scan Gmail Now'}
            </Button>
          </div>
        </div>

        {/* ── Summary cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Unpaid — THE number that matters most */}
          <SummaryCard
            title="Unpaid"
            value={fmt(summary?.outstandingTotal ?? null)}
            subtitle={summary?.unpaidCount != null ? `${summary.unpaidCount} invoice${summary.unpaidCount !== 1 ? 's' : ''} outstanding` : 'outstanding'}
            icon={AlertCircle}
            highlight
            highlightColor="#fee2e2"
            highlightText="#991b1b"
          />
          {/* Card 2: Paid this month */}
          <SummaryCard
            title="Paid This Month"
            value={fmt(summary?.paidThisMonth ?? null)}
            subtitle={summary?.paidCount != null ? `${summary.paidCount} paid` : undefined}
            icon={CheckCircle2}
            highlightColor="#dcfce7"
            highlightText="#15803d"
          />
          {/* Card 3: Pending review */}
          <SummaryCard
            title="Pending Review"
            value={summary?.pendingCount != null ? String(summary.pendingCount) : '—'}
            subtitle="Need your attention"
            icon={Clock}
            highlight={!!summary?.pendingCount}
          />
          {/* Card 4: Total invoiced this month */}
          <SummaryCard
            title="Total Invoiced"
            value={fmt(summary?.grandTotal ?? null)}
            subtitle={new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            icon={DollarSign}
          />
        </div>

        {/* ── Tab nav ──────────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-1 border-b"
          style={{ borderColor: 'rgba(201,169,110,0.2)' }}
        >
          <button style={tabStyle('invoices')} onClick={() => setActiveTab('invoices')}>
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Invoices
              {filtered.length > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded-full text-xs"
                  style={{ background: 'rgba(201,169,110,0.2)', color: BRAND_GOLD }}
                >
                  {filtered.length}
                </span>
              )}
            </span>
          </button>
          <button style={tabStyle('byJob')} onClick={() => setActiveTab('byJob')}>
            <span className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> By Job
            </span>
          </button>
          <button style={tabStyle('byTrade')} onClick={() => setActiveTab('byTrade')}>
            <span className="flex items-center gap-1.5">
              <Hammer className="h-4 w-4" /> By Trade
            </span>
          </button>
        </div>

        {/* ────────────────────── INVOICES TAB ───────────────────────────── */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={filterStatus || 'all'} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="auto_approved">Auto-approved</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterJob || 'all'} onValueChange={(v) => setFilterJob(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="All jobs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All jobs</SelectItem>
                  {(projectOptions.length > 0 ? projectOptions : FALLBACK_PROJECTS.map((n) => ({ id: n, name: n }))).map((p) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterTrade || 'all'} onValueChange={(v) => setFilterTrade(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue placeholder="All trades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trades</SelectItem>
                  {VALID_TRADES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(filterStatus || filterJob || filterTrade) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setFilterStatus(''); setFilterJob(''); setFilterTrade(''); }}
                >
                  Clear filters
                </Button>
              )}
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-6 w-6 animate-spin" style={{ color: BRAND_GOLD }} />
              </div>
            ) : filtered.length === 0 ? (
              <div
                className="text-center py-16 rounded-xl border"
                style={{ borderColor: 'rgba(201,169,110,0.15)' }}
              >
                <Receipt className="h-10 w-10 mx-auto mb-3" style={{ color: 'rgba(201,169,110,0.4)' }} />
                <p className="text-sm text-muted-foreground">No invoices found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Scan Gmail Now" to check for new invoices
                </p>
              </div>
            ) : (
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="text-left"
                        style={{ borderBottom: '1px solid rgba(201,169,110,0.15)', background: '#fafaf9' }}
                      >
                        {['Payment', 'Vendor', 'Job', 'Trade', 'Amount', 'Due Date', 'Review', 'Actions'].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-xs uppercase tracking-wider font-medium"
                            style={{ color: 'rgba(201,169,110,0.7)' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((inv) => (
                        <>
                          <tr
                            key={inv.id}
                            className="border-b hover:bg-amber-50/30 transition-colors cursor-pointer"
                            style={{ borderColor: 'rgba(0,0,0,0.06)' }}
                            onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                          >
                            {/* PAYMENT STATUS — leftmost, most prominent */}
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-col gap-1">
                                <PaymentBadge
                                  paymentStatus={inv.paymentStatus || 'unpaid'}
                                  amount={inv.amount}
                                  paidDate={inv.paidDate}
                                />
                                {(inv.paymentStatus !== 'paid') && (
                                  <button
                                    className="text-xs px-2 py-0.5 rounded border font-medium transition-colors hover:bg-green-50"
                                    style={{ color: '#15803d', borderColor: '#bbf7d0' }}
                                    onClick={() => handlePaymentStatus(inv.id, 'paid')}
                                  >
                                    ✓ Mark Paid
                                  </button>
                                )}
                                {(inv.paymentStatus === 'paid') && (
                                  <button
                                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                                    onClick={() => handlePaymentStatus(inv.id, 'unpaid')}
                                  >
                                    Undo
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* VENDOR */}
                            <td className="px-4 py-3 font-medium" style={{ color: BRAND_BLACK }}>
                              <div>{inv.vendor}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[140px]">
                                {inv.fromEmail}
                              </div>
                            </td>

                            {/* JOB */}
                            <td className="px-4 py-3">
                              <button
                                className="text-left hover:underline text-xs"
                                style={{ color: inv.jobName ? BRAND_BLACK : '#9ca3af' }}
                                onClick={(e) => { e.stopPropagation(); openEdit(inv, 'job'); }}
                              >
                                {inv.jobName || '— set job'}
                                <Edit2 className="h-3 w-3 inline ml-1 opacity-50" />
                              </button>
                            </td>

                            {/* TRADE */}
                            <td className="px-4 py-3">
                              <button
                                className="text-left hover:underline text-xs"
                                style={{ color: BRAND_BLACK }}
                                onClick={(e) => { e.stopPropagation(); openEdit(inv, 'trade'); }}
                              >
                                {inv.trade}
                                <Edit2 className="h-3 w-3 inline ml-1 opacity-50" />
                              </button>
                            </td>

                            {/* AMOUNT */}
                            <td className="px-4 py-3 font-semibold" style={{ color: BRAND_GOLD }}>
                              {fmt(inv.amount)}
                            </td>

                            {/* DUE DATE — highlight overdue */}
                            <td className="px-4 py-3 text-xs">
                              {inv.dueDate ? (
                                <span
                                  style={{
                                    color: (inv.paymentStatus !== 'paid' && inv.dueDate < new Date().toISOString().slice(0, 10))
                                      ? '#dc2626'
                                      : '#6b7280',
                                    fontWeight: (inv.paymentStatus !== 'paid' && inv.dueDate < new Date().toISOString().slice(0, 10)) ? 600 : 400,
                                  }}
                                >
                                  {fmtDate(inv.dueDate)}
                                  {(inv.paymentStatus !== 'paid' && inv.dueDate < new Date().toISOString().slice(0, 10)) && ' ⚠️'}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>

                            {/* REVIEW STATUS */}
                            <td className="px-4 py-3">
                              <StatusBadge status={inv.status} />
                            </td>

                            {/* ACTIONS */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {(inv.status === 'pending_review') && (
                                  <>
                                    <button
                                      title="Approve"
                                      className="p-1 rounded hover:bg-green-50"
                                      onClick={() => handleStatusChange(inv.id, 'approved')}
                                    >
                                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    </button>
                                    <button
                                      title="Reject"
                                      className="p-1 rounded hover:bg-red-50"
                                      onClick={() => handleStatusChange(inv.id, 'rejected')}
                                    >
                                      <XCircle className="h-4 w-4 text-red-500" />
                                    </button>
                                  </>
                                )}
                                <button
                                  title={expandedId === inv.id ? 'Collapse' : 'Expand'}
                                  className="p-1 rounded hover:bg-gray-100"
                                  onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                                >
                                  {expandedId === inv.id
                                    ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                    : <ChevronDown className="h-4 w-4 text-gray-400" />
                                  }
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedId === inv.id && (
                            <tr key={`${inv.id}-detail`}>
                              <td colSpan={8} className="p-0">
                                <InvoiceRowDetail invoice={inv} />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ──────────────────── BY JOB TAB ────────────────────────────────── */}
        {activeTab === 'byJob' && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-6 w-6 animate-spin" style={{ color: BRAND_GOLD }} />
              </div>
            ) : !summary || summary.byJob.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                No job data available
              </div>
            ) : (
              <div className="grid gap-4">
                {summary.byJob.map((jobRow) => {
                  const tradeEntries = Object.entries(jobRow.byTrade).sort(([, a], [, b]) => b - a);
                  return (
                    <Card key={jobRow.job} className="border-0 shadow-sm">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-heading font-semibold text-base" style={{ color: BRAND_BLACK }}>
                              {jobRow.job}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {jobRow.count} invoice{jobRow.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <p className="text-xl font-semibold" style={{ color: BRAND_GOLD }}>
                            {fmt(jobRow.total)}
                          </p>
                        </div>
                        {tradeEntries.length > 0 && (
                          <div className="space-y-1.5">
                            {tradeEntries.map(([trade, amount]) => {
                              const pct = jobRow.total > 0 ? (amount / jobRow.total) * 100 : 0;
                              return (
                                <div key={trade} className="flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground w-36 truncate">{trade}</span>
                                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${pct}%`, backgroundColor: BRAND_GOLD }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium w-20 text-right" style={{ color: BRAND_BLACK }}>
                                    {fmt(amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─────────────────── BY TRADE TAB ─────────────────────────────── */}
        {activeTab === 'byTrade' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-6 w-6 animate-spin" style={{ color: BRAND_GOLD }} />
              </div>
            ) : !summary || summary.byTrade.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                No trade data available
              </div>
            ) : (
              <>
                {/* Bar chart */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-0 pt-5">
                    <CardTitle className="text-base font-heading" style={{ color: BRAND_BLACK }}>
                      Spend by Trade
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 pb-4">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={summary.byTrade.slice(0, 12)}
                        margin={{ top: 4, right: 16, bottom: 40, left: 16 }}
                      >
                        <XAxis
                          dataKey="trade"
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          angle={-35}
                          textAnchor="end"
                          interval={0}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#9ca3af' }}
                          tickFormatter={(v) =>
                            v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                          }
                        />
                        <Tooltip
                          formatter={(value: any) => [fmt(value), 'Amount']}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                          {summary.byTrade.slice(0, 12).map((entry, idx) => (
                            <Cell
                              key={entry.trade}
                              fill={TRADE_COLORS[idx % TRADE_COLORS.length]}
                              opacity={0.85}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Trade table */}
                <Card className="border-0 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr
                          style={{
                            borderBottom: '1px solid rgba(201,169,110,0.15)',
                            background: '#fafaf9',
                          }}
                        >
                          {['Trade', 'Invoices', 'Total'].map((h) => (
                            <th
                              key={h}
                              className="px-5 py-3 text-left text-xs uppercase tracking-wider font-medium"
                              style={{ color: 'rgba(201,169,110,0.7)' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summary.byTrade.map((row, idx) => (
                          <tr
                            key={row.trade}
                            className="border-b"
                            style={{ borderColor: 'rgba(0,0,0,0.06)' }}
                          >
                            <td className="px-5 py-3 font-medium flex items-center gap-2">
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: TRADE_COLORS[idx % TRADE_COLORS.length] }}
                              />
                              {row.trade}
                            </td>
                            <td className="px-5 py-3 text-muted-foreground">{row.count}</td>
                            <td className="px-5 py-3 font-semibold" style={{ color: BRAND_GOLD }}>
                              {fmt(row.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      <Dialog open={!!editState} onOpenChange={(open) => { if (!open) { setEditState(null); setNewJobName(''); setNewJobAddress(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading" style={{ color: BRAND_BLACK }}>
              Edit {editState?.field === 'job' ? 'Job Assignment' : 'Trade Category'}
            </DialogTitle>
          </DialogHeader>

          {editState && (
            <div className="py-2 space-y-4">

              {/* ---- JOB FIELD ---- */}
              {editState.field === 'job' && !editState.creatingJob && (
                <>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                      Select Job
                    </Label>
                    <Select
                      value={editState.newValue || 'none'}
                      onValueChange={(v) => {
                        if (v === '__create__') {
                          setEditState((s) => s ? { ...s, creatingJob: true } : null);
                        } else {
                          setEditState((s) => s ? { ...s, newValue: v === 'none' ? '' : v } : null);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a job..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="none">— Unassigned</SelectItem>
                        {projectOptions.map((p) => (
                          <SelectItem key={p.id} value={p.name}>
                            {p.name}{p.address ? ` · ${p.address}` : ''}
                          </SelectItem>
                        ))}
                        <SelectItem value="__create__" className="text-brand-gold font-medium border-t mt-1">
                          + Create new job…
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editState.newValue && editState.newValue !== '' && (
                    <p className="text-xs text-muted-foreground">
                      Assigning to: <strong>{editState.newValue}</strong>
                    </p>
                  )}
                </>
              )}

              {/* ---- INLINE CREATE JOB FORM ---- */}
              {editState.field === 'job' && editState.creatingJob && (
                <div className="space-y-3 border rounded-lg p-4" style={{ borderColor: BRAND_GOLD + '55', background: 'rgba(201,169,110,0.05)' }}>
                  <p className="text-sm font-medium" style={{ color: BRAND_BLACK }}>Create New Job</p>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Job Name <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="e.g. Cedar Ridge — Spanish Fork"
                      value={newJobName}
                      onChange={(e) => setNewJobName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Address (optional)</Label>
                    <Input
                      placeholder="e.g. 1234 Main St, Spanish Fork UT"
                      value={newJobAddress}
                      onChange={(e) => setNewJobAddress(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setEditState((s) => s ? { ...s, creatingJob: false } : null)}
                    >
                      Back
                    </Button>
                    <Button
                      size="sm"
                      disabled={!newJobName.trim() || creatingJob}
                      onClick={handleCreateJob}
                      className="text-white"
                      style={{ backgroundColor: BRAND_GOLD }}
                    >
                      {creatingJob ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Create &amp; Assign
                    </Button>
                  </div>
                </div>
              )}

              {/* ---- TRADE FIELD ---- */}
              {editState.field === 'trade' && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                    Select Trade
                  </Label>
                  <Select
                    value={editState.newValue || ''}
                    onValueChange={(v) =>
                      setEditState((s) => s ? { ...s, newValue: v } : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {VALID_TRADES.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditState(null)}>
              Cancel
            </Button>
            {/* Don't show Save while in create-job sub-form */}
            {editState && !editState.creatingJob && (
              <Button
                onClick={saveEdit}
                disabled={editSaving}
                className="text-white"
                style={{ backgroundColor: BRAND_GOLD }}
              >
                {editSaving ? (
                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                ) : null}
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
