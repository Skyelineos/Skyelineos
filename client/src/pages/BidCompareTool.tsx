// Bid Leveling & Scope Check — the Tools-section screen.
// Flow: pick project -> set trade -> upload subcontractor bid PDFs (each is
// extracted by Claude into structured scope+pricing) -> optionally upload the
// trade's plan sheets -> "Compare & Recommend" levels every bid against the
// plan scope and recommends a winner.
//
// Backend: POST /api/bid-compare/extract-bid and /api/bid-compare/analyze
// (functions/src/bids/analyzeBidsRoute.ts). All calls go through authFetch so
// the Firebase ID token rides along to the api Express app's authMiddleware.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { collection, getDocs } from 'firebase/firestore';
import {
  ArrowLeft,
  Upload,
  FileText,
  Loader2,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Scale,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase';
import { authFetch } from '@/lib/authFetch';
import { uploadBidAttachment } from '@/lib/bidCompare/uploadBidAttachment';

const GOLD = '#C9A96E';
const BLACK = '#141414';

const COMMON_TRADES = [
  'Electrical', 'Plumbing', 'HVAC', 'Framing', 'Concrete', 'Roofing',
  'Drywall', 'Painting', 'Flooring', 'Tile', 'Cabinetry', 'Excavation',
  'Insulation', 'Masonry', 'Landscaping', 'Garage Doors', 'Windows', 'Stucco',
];

// ── Types (kept local to the tool) ──────────────────────────────────────────
interface ExtractedBid {
  vendor_name: string | null;
  trade: string | null;
  base_bid_total: number | null;
  line_items: Array<{ description: string; qty: number | null; unit: string | null; unit_cost: number | null; total: number | null; category: string | null }>;
  inclusions: string[];
  exclusions: string[];
  assumptions: string[];
  allowances: Array<{ description: string; amount: number | null }>;
  alternates: Array<{ description: string; amount: number | null }>;
  unit_prices: Array<{ description: string; unit: string | null; price: number | null }>;
  bid_validity: string | null;
  payment_terms: string | null;
  lead_time: string | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
}

interface BidEntry {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  status: 'uploading' | 'extracting' | 'done' | 'error';
  progress: number;
  error?: string;
  bid?: ExtractedBid;
}

interface PlanEntry {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface Comparison {
  trade: string | null;
  scope_items: Array<{ id: string; label: string; source: 'plan' | 'bid' | 'both' }>;
  matrix: Array<{ scope_item: string; cells: Array<{ vendor: string; status: 'included' | 'missing' | 'excluded' | 'unclear'; amount: number | null; note: string | null }> }>;
  bids_summary: Array<{ vendor: string; base_bid_total: number | null; adjusted_total: number | null; missing_count: number; exclusions_count: number }>;
  differences: string[];
  gaps: Array<{ vendor: string; missing: string[] }>;
  recommendation: { winner: string | null; runner_up: string | null; rationale: string; risks: string[]; price_note: string | null };
}

interface ProjectOption { id: string; label: string }

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function BidCompareTool() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState('');
  const [trade, setTrade] = useState('');
  const [bids, setBids] = useState<BidEntry[]>([]);
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const bidInputRef = useRef<HTMLInputElement>(null);
  const planInputRef = useRef<HTMLInputElement>(null);

  // Load projects for the selector.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'projects'));
        if (!active) return;
        const opts = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const label =
              data.name || data.projectName || data.title || data.clientName || data.address || d.id;
            return { id: d.id, label: String(label) };
          })
          .sort((a, b) => a.label.localeCompare(b.label));
        setProjects(opts);
      } catch (e) {
        console.warn('[BidCompareTool] failed to load projects', e);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const readyBids = useMemo(
    () => bids.filter((b) => b.status === 'done' && b.bid).map((b) => b.bid as ExtractedBid),
    [bids],
  );
  const canAnalyze = !!projectId && readyBids.length >= 2 && !analyzing;
  const busy = bids.some((b) => b.status === 'uploading' || b.status === 'extracting') ||
    plans.some((p) => p.status === 'uploading');

  // ── Bid upload + extraction ──────────────────────────────────────────────
  async function handleBidFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!projectId) {
      setAnalyzeError('Pick a project first — uploads are stored under the project.');
      return;
    }
    setAnalyzeError(null);
    for (const file of Array.from(files)) {
      const id = newId();
      setBids((prev) => [
        ...prev,
        { id, fileName: file.name, storagePath: '', mimeType: file.type, status: 'uploading', progress: 0 },
      ]);
      try {
        const up = await uploadBidAttachment(projectId, file, 'bid', (pct) =>
          setBids((prev) => prev.map((b) => (b.id === id ? { ...b, progress: pct } : b))),
        );
        setBids((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, status: 'extracting', storagePath: up.storagePath, mimeType: up.mimeType } : b,
          ),
        );
        const res = await authFetch('/api/bid-compare/extract-bid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: up.storagePath, mimeType: up.mimeType }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Extract failed (${res.status})`);
        const { bid } = await res.json();
        setBids((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'done', bid } : b)));
      } catch (e: any) {
        setBids((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: 'error', error: e.message || String(e) } : b)),
        );
      }
    }
  }

  // ── Plan upload (extraction happens at analyze time, server-side) ─────────
  async function handlePlanFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!projectId) {
      setAnalyzeError('Pick a project first — uploads are stored under the project.');
      return;
    }
    setAnalyzeError(null);
    for (const file of Array.from(files)) {
      const id = newId();
      setPlans((prev) => [
        ...prev,
        { id, fileName: file.name, storagePath: '', mimeType: file.type, status: 'uploading', progress: 0 },
      ]);
      try {
        const up = await uploadBidAttachment(projectId, file, 'plan', (pct) =>
          setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, progress: pct } : p))),
        );
        setPlans((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: 'done', storagePath: up.storagePath, mimeType: up.mimeType } : p,
          ),
        );
      } catch (e: any) {
        setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'error', error: e.message || String(e) } : p)));
      }
    }
  }

  async function runAnalyze() {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setComparison(null);
    try {
      const readyPlans = plans.filter((p) => p.status === 'done');
      const res = await authFetch('/api/bid-compare/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trade: trade || null,
          bids: readyBids,
          planStoragePaths: readyPlans.map((p) => p.storagePath),
          planMimeTypes: readyPlans.map((p) => p.mimeType),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Analyze failed (${res.status})`);
      const { comparison } = await res.json();
      setComparison(comparison);
    } catch (e: any) {
      setAnalyzeError(e.message || String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <AppLayout>
      <div className="min-h-screen" style={{ backgroundColor: '#F8F7F4' }}>
        {/* Header */}
        <div className="border-b bg-white">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <Link
              href="/tools"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-3"
            >
              <ArrowLeft className="w-4 h-4" /> Tools
            </Link>
            <div className="flex items-center gap-3 mb-1">
              <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
              <span className="text-xs font-sans font-medium uppercase tracking-widest" style={{ color: GOLD, letterSpacing: '0.15em' }}>
                Skyeline Tools
              </span>
            </div>
            <h1 className="text-3xl font-heading font-semibold" style={{ color: BLACK, letterSpacing: '0.02em' }}>
              Bid Leveling &amp; Scope Check
            </h1>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              Upload subcontractor bid PDFs and the plan sheets for the trade. Claude reads each bid,
              pulls scope and pricing, checks it against the plans for missing scope, lays out a side-by-side
              leveling sheet, and recommends a winner with the reasoning.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Setup */}
          <Card className="border-2" style={{ borderColor: 'rgba(201,169,110,0.25)' }}>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1" style={{ color: GOLD }}>
                  Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Uploads are stored under this project.</p>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider mb-1" style={{ color: GOLD }}>
                  Trade (optional)
                </label>
                <input
                  list="trade-options"
                  value={trade}
                  onChange={(e) => setTrade(e.target.value)}
                  placeholder="e.g. Electrical"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                />
                <datalist id="trade-options">
                  {COMMON_TRADES.map((t) => (<option key={t} value={t} />))}
                </datalist>
                <p className="text-xs text-gray-400 mt-1">Sharpens the plan scope check.</p>
              </div>
            </CardContent>
          </Card>

          {/* Uploads */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UploadZone
              title="Subcontractor bids"
              hint="PDFs / images of each sub's bid. Add at least 2."
              accent
              disabled={!projectId}
              onPick={() => bidInputRef.current?.click()}
            />
            <UploadZone
              title="House plans (optional)"
              hint="Upload the trade-relevant plan sheets to scope-check against."
              disabled={!projectId}
              onPick={() => planInputRef.current?.click()}
            />
          </div>
          <input ref={bidInputRef} type="file" accept=".pdf,image/*" multiple className="hidden"
            onChange={(e) => { handleBidFiles(e.target.files); e.currentTarget.value = ''; }} />
          <input ref={planInputRef} type="file" accept=".pdf,image/*" multiple className="hidden"
            onChange={(e) => { handlePlanFiles(e.target.files); e.currentTarget.value = ''; }} />

          {/* Bid cards */}
          {bids.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {bids.map((b) => (
                <BidCard key={b.id} entry={b} onRemove={() => setBids((p) => p.filter((x) => x.id !== b.id))} />
              ))}
            </div>
          )}

          {/* Plan chips */}
          {plans.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 text-xs bg-white border rounded-full px-3 py-1">
                  <FileText className="w-3 h-3" style={{ color: GOLD }} />
                  {p.fileName}
                  {p.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {p.status === 'done' && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                  {p.status === 'error' && <XCircle className="w-3 h-3 text-red-500" />}
                  <button onClick={() => setPlans((prev) => prev.filter((x) => x.id !== p.id))} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Analyze */}
          <div className="flex items-center gap-3">
            <Button
              onClick={runAnalyze}
              disabled={!canAnalyze}
              className="text-white"
              style={{ backgroundColor: canAnalyze ? BLACK : '#9CA3AF' }}
            >
              {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Scale className="w-4 h-4 mr-2" />}
              Compare &amp; Recommend
            </Button>
            <span className="text-xs text-gray-500">
              {readyBids.length < 2
                ? 'Add at least 2 bids that finish extracting.'
                : busy
                ? 'Waiting for uploads/extraction to finish…'
                : `${readyBids.length} bids ready${plans.filter((p) => p.status === 'done').length ? ` · ${plans.filter((p) => p.status === 'done').length} plan file(s)` : ''}`}
            </span>
          </div>

          {analyzeError && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5" /> {analyzeError}
            </div>
          )}

          {comparison && <Results comparison={comparison} />}
        </div>
      </div>
    </AppLayout>
  );
}

// ── Upload zone ──────────────────────────────────────────────────────────────
function UploadZone({ title, hint, onPick, accent, disabled }: {
  title: string; hint: string; onPick: () => void; accent?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={'w-full text-left rounded-lg border-2 border-dashed p-6 transition-all ' +
        (disabled ? 'opacity-50 cursor-not-allowed ' : 'hover:shadow-md ') + 'bg-white'}
      style={{ borderColor: accent ? 'rgba(201,169,110,0.5)' : 'rgba(0,0,0,0.15)' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: accent ? 'rgba(201,169,110,0.12)' : 'rgba(0,0,0,0.04)' }}>
          <Upload className="w-5 h-5" style={{ color: accent ? GOLD : '#6B7280' }} />
        </div>
        <div>
          <div className="font-medium" style={{ color: BLACK }}>{title}</div>
          <div className="text-xs text-gray-500">{hint}</div>
        </div>
      </div>
    </button>
  );
}

// ── Bid card ─────────────────────────────────────────────────────────────────
function BidCard({ entry, onRemove }: { entry: BidEntry; onRemove: () => void }) {
  const b = entry.bid;
  return (
    <Card className="border" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="font-medium truncate" style={{ color: BLACK }}>
              {b?.vendor_name || entry.fileName}
            </div>
            <div className="text-xs text-gray-400 truncate">{entry.fileName}</div>
          </div>
          <button onClick={onRemove} className="text-gray-300 hover:text-red-500 shrink-0 ml-2">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {entry.status === 'uploading' && (
          <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Uploading… {Math.round(entry.progress)}%
          </div>
        )}
        {entry.status === 'extracting' && (
          <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Reading the bid…
          </div>
        )}
        {entry.status === 'error' && (
          <div className="mt-3 text-xs text-red-600 flex items-center gap-2">
            <XCircle className="w-3 h-3" /> {entry.error}
          </div>
        )}

        {entry.status === 'done' && b && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold" style={{ color: BLACK }}>{money(b.base_bid_total)}</span>
              {b.trade && <Badge variant="outline" className="text-xs">{b.trade}</Badge>}
              <Badge
                className="text-xs"
                style={{
                  backgroundColor: b.confidence === 'high' ? 'rgba(34,197,94,0.12)' : b.confidence === 'low' ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)',
                  color: b.confidence === 'high' ? '#15803d' : b.confidence === 'low' ? '#b91c1c' : '#a16207',
                  border: 'none',
                }}
              >
                {b.confidence} confidence
              </Badge>
            </div>
            <div className="text-xs text-gray-600">
              {b.line_items.length} line items · {b.inclusions.length} inclusions ·{' '}
              <span className={b.exclusions.length ? 'text-amber-700 font-medium' : ''}>
                {b.exclusions.length} exclusions
              </span>
            </div>
            {b.exclusions.length > 0 && (
              <details className="text-xs text-gray-600">
                <summary className="cursor-pointer text-amber-700">Exclusions</summary>
                <ul className="list-disc ml-4 mt-1 space-y-0.5">
                  {b.exclusions.map((x, i) => (<li key={i}>{x}</li>))}
                </ul>
              </details>
            )}
            {b.notes && <div className="text-xs text-gray-400 italic">{b.notes}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────
function Results({ comparison }: { comparison: Comparison }) {
  const vendors = comparison.bids_summary.map((b) => b.vendor);
  const rec = comparison.recommendation;

  return (
    <div className="space-y-6">
      {/* Recommendation */}
      <Card className="border-2" style={{ borderColor: GOLD, backgroundColor: 'rgba(201,169,110,0.06)' }}>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="w-5 h-5" style={{ color: GOLD }} />
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: GOLD }}>Recommended winner</span>
          </div>
          <div className="text-2xl font-heading font-semibold" style={{ color: BLACK }}>
            {rec.winner || 'No clear winner'}
          </div>
          {rec.runner_up && <div className="text-sm text-gray-500 mb-2">Runner-up: {rec.runner_up}</div>}
          <p className="text-sm text-gray-700 mt-2">{rec.rationale}</p>
          {rec.price_note && <p className="text-sm text-gray-600 mt-2"><strong>Price:</strong> {rec.price_note}</p>}
          {rec.risks.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-medium uppercase tracking-wider text-amber-700 mb-1">Confirm before awarding</div>
              <ul className="list-disc ml-5 text-sm text-gray-700 space-y-0.5">
                {rec.risks.map((r, i) => (<li key={i}>{r}</li>))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary row */}
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3">Bid</th>
              <th className="px-4 py-3 text-right">Base bid</th>
              <th className="px-4 py-3 text-right">Adjusted (leveled)</th>
              <th className="px-4 py-3 text-center">Missing scope</th>
              <th className="px-4 py-3 text-center">Exclusions</th>
            </tr>
          </thead>
          <tbody>
            {comparison.bids_summary.map((b) => {
              const isWinner = rec.winner && b.vendor === rec.winner;
              return (
                <tr key={b.vendor} className="border-b last:border-0" style={isWinner ? { backgroundColor: 'rgba(201,169,110,0.08)' } : undefined}>
                  <td className="px-4 py-3 font-medium" style={{ color: BLACK }}>
                    {isWinner && <Trophy className="w-3.5 h-3.5 inline mr-1" style={{ color: GOLD }} />}
                    {b.vendor}
                  </td>
                  <td className="px-4 py-3 text-right">{money(b.base_bid_total)}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(b.adjusted_total)}</td>
                  <td className="px-4 py-3 text-center">
                    {b.missing_count > 0
                      ? <span className="text-red-600 font-medium">{b.missing_count}</span>
                      : <span className="text-green-600">0</span>}
                  </td>
                  <td className="px-4 py-3 text-center">{b.exclusions_count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent></Card>

      {/* Leveling matrix */}
      {comparison.matrix.length > 0 && (
        <Card><CardContent className="p-0">
          <div className="px-4 py-3 border-b font-medium" style={{ color: BLACK }}>Scope leveling sheet</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 min-w-[220px]">Scope item</th>
                  {vendors.map((v) => (<th key={v} className="px-4 py-3 text-center min-w-[140px]">{v}</th>))}
                </tr>
              </thead>
              <tbody>
                {comparison.matrix.map((row, ri) => (
                  <tr key={ri} className="border-b last:border-0 align-top">
                    <td className="px-4 py-3 text-gray-800">{row.scope_item}</td>
                    {vendors.map((v) => {
                      const cell = row.cells.find((c) => c.vendor === v);
                      return <td key={v} className="px-4 py-3 text-center"><StatusCell cell={cell} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-400 border-t flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> included</span>
            <span className="inline-flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" /> missing</span>
            <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-500" /> excluded</span>
            <span className="inline-flex items-center gap-1"><HelpCircle className="w-3 h-3 text-gray-400" /> unclear</span>
          </div>
        </CardContent></Card>
      )}

      {/* Differences + gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {comparison.differences.length > 0 && (
          <Card><CardContent className="p-5">
            <div className="font-medium mb-2" style={{ color: BLACK }}>Key differences</div>
            <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1">
              {comparison.differences.map((d, i) => (<li key={i}>{d}</li>))}
            </ul>
          </CardContent></Card>
        )}
        {comparison.gaps.length > 0 && (
          <Card><CardContent className="p-5">
            <div className="font-medium mb-2" style={{ color: BLACK }}>Scope gaps vs plans</div>
            <div className="space-y-3">
              {comparison.gaps.map((g, i) => (
                <div key={i}>
                  <div className="text-sm font-medium" style={{ color: BLACK }}>{g.vendor}</div>
                  {g.missing.length > 0 ? (
                    <ul className="list-disc ml-5 text-sm text-red-700 space-y-0.5">
                      {g.missing.map((m, j) => (<li key={j}>{m}</li>))}
                    </ul>
                  ) : (
                    <div className="text-sm text-green-700 ml-1">No gaps found.</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function StatusCell({ cell }: { cell?: { status: string; amount: number | null; note: string | null } }) {
  if (!cell) return <HelpCircle className="w-4 h-4 text-gray-300 inline" />;
  const icon =
    cell.status === 'included' ? <CheckCircle2 className="w-4 h-4 text-green-600 inline" /> :
    cell.status === 'missing' ? <XCircle className="w-4 h-4 text-red-500 inline" /> :
    cell.status === 'excluded' ? <AlertTriangle className="w-4 h-4 text-amber-500 inline" /> :
    <HelpCircle className="w-4 h-4 text-gray-400 inline" />;
  return (
    <span title={cell.note || cell.status}>
      {cell.amount != null
        ? <span className={cell.status === 'included' ? 'text-gray-800' : 'text-gray-500'}>{money(cell.amount)}</span>
        : icon}
    </span>
  );
}
