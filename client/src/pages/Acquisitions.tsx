/**
 * Acquisitions — Live deal feed from skyeline-acq pipeline.
 *
 * Pulls all documents from the `acq_deals` Firestore collection where
 * status != "archived". Shows source badge, financials, score, and link
 * for every opportunity scraped by BizBuySell / BizQuest / DealStream /
 * BusinessBroker / KSL / BizScout / Craigslist + Gmail alert ingestion.
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw,
  ExternalLink,
  TrendingUp,
  DollarSign,
  MapPin,
  Calendar,
  Star,
  Filter,
  Building2,
  AlertCircle,
  Loader2,
  Search,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AcqDeal {
  dealId: string;
  source: string;
  sourceUrl: string;
  title: string;
  location: string;
  industry: string;
  askingPrice: number | null;
  revenue: number | null;
  sde: number | null;
  yearsEstablished: number | null;
  employees: number | null;
  score: number | null;
  scoreReasons: string[];
  hardFilterPass: boolean | null;
  hardFilterReasons: string[];
  licenseDependent: boolean | null;
  brief: string | null;
  status: string;
  firstSeen: string;
  lastSeen: string;
  rawText: string;
}

// ─── Source metadata ─────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  bizbuysell: {
    label: 'BizBuySell',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  bizbuysell_email: {
    label: 'BizBuySell Email',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  bizquest: {
    label: 'BizQuest',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  dealstream: {
    label: 'DealStream',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  businessbroker: {
    label: 'BusinessBroker',
    color: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  ksl: {
    label: 'KSL Classifieds',
    color: 'bg-red-100 text-red-800 border-red-200',
  },
  bizscout: {
    label: 'BizScout',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  craigslist: {
    label: 'Craigslist',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
};

function getSourceBadge(source: string) {
  const meta = SOURCE_LABELS[source] ?? {
    label: source,
    color: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  return meta;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$$(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400';
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-500';
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-gray-50';
  if (score >= 70) return 'bg-green-50 border border-green-200';
  if (score >= 50) return 'bg-yellow-50 border border-yellow-200';
  return 'bg-red-50 border border-red-200';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Acquisitions() {
  const [deals, setDeals] = useState<AcqDeal[]>([]);
  const [filtered, setFiltered] = useState<AcqDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastImported, setLastImported] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [minScore, setMinScore] = useState('0');
  const [maxPrice, setMaxPrice] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [showPassedOnly, setShowPassedOnly] = useState(false);
  const [expandedDeal, setExpandedDeal] = useState<string | null>(null);

  const { toast } = useToast();

  // ── Load deals from Firestore ──────────────────────────────────────────────

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'acq_deals'),
        where('status', '!=', 'archived'),
        orderBy('status'),
        orderBy('lastSeen', 'desc')
      );
      const snap = await getDocs(q);
      const raw: AcqDeal[] = snap.docs.map((d) => ({
        dealId: d.id,
        ...(d.data() as Omit<AcqDeal, 'dealId'>),
      }));
      setDeals(raw);
      setTotalCount(raw.length);
      setLastImported(new Date().toLocaleTimeString());
      toast({
        title: `Loaded ${raw.length} live opportunities`,
        description: 'All sources synced from Firestore.',
      });
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? 'Failed to load deals';
      setError(msg);
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  // ── Apply filters ──────────────────────────────────────────────────────────

  useEffect(() => {
    let result = [...deals];

    if (sourceFilter !== 'all') {
      result = result.filter((d) => d.source === sourceFilter);
    }

    const minScoreN = parseInt(minScore) || 0;
    if (minScoreN > 0) {
      result = result.filter((d) => (d.score ?? 0) >= minScoreN);
    }

    if (maxPrice) {
      const cap =
        parseFloat(maxPrice.replace(/[^0-9.]/g, '')) *
        (maxPrice.toLowerCase().includes('m')
          ? 1_000_000
          : maxPrice.toLowerCase().includes('k')
            ? 1_000
            : 1);
      result = result.filter(
        (d) => d.askingPrice == null || d.askingPrice <= cap
      );
    }

    if (minPrice) {
      const floor =
        parseFloat(minPrice.replace(/[^0-9.]/g, '')) *
        (minPrice.toLowerCase().includes('m')
          ? 1_000_000
          : minPrice.toLowerCase().includes('k')
            ? 1_000
            : 1);
      result = result.filter(
        (d) => d.askingPrice == null || d.askingPrice >= floor
      );
    }

    if (showPassedOnly) {
      result = result.filter((d) => d.hardFilterPass === true);
    }

    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(s) ||
          d.location.toLowerCase().includes(s) ||
          d.industry.toLowerCase().includes(s) ||
          (d.brief ?? '').toLowerCase().includes(s)
      );
    }

    // Sort: hard-filter passed first, then by score desc
    result.sort((a, b) => {
      const passA = a.hardFilterPass ? 1 : 0;
      const passB = b.hardFilterPass ? 1 : 0;
      if (passB !== passA) return passB - passA;
      return (b.score ?? -1) - (a.score ?? -1);
    });

    setFiltered(result);
  }, [
    deals,
    sourceFilter,
    minScore,
    maxPrice,
    minPrice,
    showPassedOnly,
    searchText,
  ]);

  // ── Available sources for filter dropdown ──────────────────────────────────
  const availableSources = Array.from(
    new Set(deals.map((d) => d.source))
  ).sort();

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              Acquisition Pipeline
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Live opportunities scraped daily — BizBuySell · BizQuest ·
              DealStream · BusinessBroker · KSL · BizScout · Craigslist
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {lastImported && (
              <span className="text-xs text-gray-400">
                Last sync: {lastImported}
              </span>
            )}
            <Button
              onClick={loadDeals}
              disabled={loading}
              size="sm"
              className="flex items-center gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              {loading ? 'Syncing…' : 'Import Deals'}
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-3">
          <div className="bg-white border rounded-lg px-4 py-2.5 flex items-center gap-2 shadow-sm">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">
              {totalCount} total
            </span>
          </div>
          <div className="bg-white border rounded-lg px-4 py-2.5 flex items-center gap-2 shadow-sm">
            <Star className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-gray-700">
              {deals.filter((d) => d.hardFilterPass === true).length} passed
              screening
            </span>
          </div>
          <div className="bg-white border rounded-lg px-4 py-2.5 flex items-center gap-2 shadow-sm">
            <Star className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium text-gray-700">
              {deals.filter((d) => (d.score ?? 0) >= 70).length} score ≥70
            </span>
          </div>
          <div className="bg-white border rounded-lg px-4 py-2.5 flex items-center gap-2 shadow-sm">
            <Filter className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-medium text-gray-700">
              {filtered.length} showing
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs text-gray-500 mb-1">Search</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                <Input
                  aria-label="Search deals"
                  placeholder="Title, location, industry…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>
            <div className="min-w-[160px]">
              <p className="text-xs text-gray-500 mb-1">Source</p>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger
                  aria-label="Filter by source"
                  className="h-9 text-sm"
                >
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {availableSources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getSourceBadge(s).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px]">
              <p className="text-xs text-gray-500 mb-1">Min Score</p>
              <Select value={minScore} onValueChange={setMinScore}>
                <SelectTrigger
                  aria-label="Minimum score filter"
                  className="h-9 text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any score</SelectItem>
                  <SelectItem value="50">≥50</SelectItem>
                  <SelectItem value="60">≥60</SelectItem>
                  <SelectItem value="70">≥70 (hot)</SelectItem>
                  <SelectItem value="80">≥80</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px]">
              <p className="text-xs text-gray-500 mb-1">Min Price</p>
              <Input
                aria-label="Minimum asking price"
                placeholder="e.g. 250K"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="min-w-[120px]">
              <p className="text-xs text-gray-500 mb-1">Max Price</p>
              <Input
                aria-label="Maximum asking price"
                placeholder="e.g. 2M"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={showPassedOnly}
                  onChange={(e) => setShowPassedOnly(e.target.checked)}
                  className="rounded"
                />
                Passed screening only
              </label>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 py-4 border border-red-200 rounded-lg bg-red-50 px-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && deals.length === 0 && (
          <div className="flex items-center gap-3 justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Pulling deals from Firestore…</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && deals.length === 0 && !error && (
          <div className="text-center py-16 space-y-3">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-gray-500 font-medium">No deals imported yet</p>
            <p className="text-sm text-gray-400">
              Run the skyeline-acq pipeline to scrape opportunities, then click
              "Import Deals" above.
            </p>
            <Button
              onClick={loadDeals}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Try Import Now
            </Button>
          </div>
        )}

        {/* Deals table */}
        {filtered.length > 0 && (
          <div className="space-y-2">
            {/* Column headers */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_80px_80px_100px_48px] gap-3 px-4 py-2 text-xs text-gray-400 font-medium uppercase tracking-wide border-b">
              <span>Business</span>
              <span>Asking Price</span>
              <span>SDE / Cash Flow</span>
              <span>Location</span>
              <span>Score</span>
              <span>Screened</span>
              <span>Scraped</span>
              <span></span>
            </div>

            {filtered.map((deal) => {
              const src = getSourceBadge(deal.source);
              const expanded = expandedDeal === deal.dealId;
              return (
                <div
                  key={deal.dealId}
                  className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${expanded ? 'ring-2 ring-blue-200' : 'hover:border-blue-200'}`}
                >
                  {/* Main row */}
                  <div
                    className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_80px_80px_100px_48px] gap-3 px-4 py-3 items-center cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setExpandedDeal(expanded ? null : deal.dealId)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        setExpandedDeal(expanded ? null : deal.dealId);
                    }}
                  >
                    {/* Business name + source badge */}
                    <div className="min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-xs px-2 py-0.5 flex-shrink-0 ${src.color}`}
                        >
                          {src.label}
                        </Badge>
                        {deal.licenseDependent && (
                          <Badge
                            variant="outline"
                            className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 flex-shrink-0"
                          >
                            🎯 License opp
                          </Badge>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 text-sm mt-1 leading-snug line-clamp-2">
                        {deal.title}
                      </p>
                      {deal.industry && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {deal.industry}
                        </p>
                      )}
                    </div>

                    {/* Asking price */}
                    <div className="flex items-center gap-1.5 text-sm">
                      <DollarSign className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span
                        className={`font-medium ${deal.askingPrice ? 'text-gray-900' : 'text-gray-400'}`}
                      >
                        {fmt$$(deal.askingPrice)}
                      </span>
                    </div>

                    {/* SDE */}
                    <div className="flex items-center gap-1.5 text-sm">
                      <TrendingUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span
                        className={`font-medium ${deal.sde ? 'text-gray-900' : 'text-gray-400'}`}
                      >
                        {fmt$$(deal.sde)}
                      </span>
                    </div>

                    {/* Location */}
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{deal.location || '—'}</span>
                    </div>

                    {/* Score */}
                    <div
                      className={`rounded-lg px-2 py-1 text-center ${scoreBg(deal.score)}`}
                    >
                      <span
                        className={`text-sm font-bold ${scoreColor(deal.score)}`}
                      >
                        {deal.score != null ? deal.score : '—'}
                      </span>
                    </div>

                    {/* Hard filter */}
                    <div className="text-center text-sm">
                      {deal.hardFilterPass === true && (
                        <span className="text-green-600 font-medium">
                          ✓ Pass
                        </span>
                      )}
                      {deal.hardFilterPass === false && (
                        <span className="text-red-500 font-medium">✗ Fail</span>
                      )}
                      {deal.hardFilterPass === null && (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>

                    {/* Date scraped */}
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      <span>{fmtDate(deal.lastSeen)}</span>
                    </div>

                    {/* Link */}
                    <div className="flex justify-center">
                      <a
                        href={deal.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-blue-500 hover:text-blue-700 transition-colors p-1 rounded-md hover:bg-blue-50"
                        title="Open listing"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="border-t bg-gray-50 px-4 py-4 space-y-3">
                      {/* Brief */}
                      {deal.brief && (
                        <div className="bg-white border border-blue-100 rounded-lg p-3">
                          <p className="text-xs text-blue-600 font-medium mb-1">
                            AI Brief
                          </p>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {deal.brief}
                          </p>
                        </div>
                      )}

                      {/* Score reasons */}
                      {deal.scoreReasons && deal.scoreReasons.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">
                            Score factors
                          </p>
                          <ul className="flex flex-wrap gap-1.5">
                            {deal.scoreReasons.map((r, i) => (
                              <li
                                key={i}
                                className="text-xs bg-white border rounded px-2 py-0.5 text-gray-600"
                              >
                                {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Hard filter reasons */}
                      {deal.hardFilterReasons &&
                        deal.hardFilterReasons.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-500 font-medium mb-1">
                              Screening reasons
                            </p>
                            <ul className="flex flex-wrap gap-1.5">
                              {deal.hardFilterReasons.map((r, i) => (
                                <li
                                  key={i}
                                  className={`text-xs border rounded px-2 py-0.5 ${deal.hardFilterPass ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}
                                >
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {/* Raw details grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {deal.revenue != null && (
                          <div className="bg-white border rounded p-2">
                            <p className="text-xs text-gray-400">Revenue</p>
                            <p className="font-medium text-gray-800">
                              {fmt$$(deal.revenue)}
                            </p>
                          </div>
                        )}
                        {deal.yearsEstablished != null && (
                          <div className="bg-white border rounded p-2">
                            <p className="text-xs text-gray-400">Years Est.</p>
                            <p className="font-medium text-gray-800">
                              {deal.yearsEstablished}
                            </p>
                          </div>
                        )}
                        {deal.employees != null && (
                          <div className="bg-white border rounded p-2">
                            <p className="text-xs text-gray-400">Employees</p>
                            <p className="font-medium text-gray-800">
                              {deal.employees}
                            </p>
                          </div>
                        )}
                        <div className="bg-white border rounded p-2">
                          <p className="text-xs text-gray-400">First seen</p>
                          <p className="font-medium text-gray-800">
                            {fmtDate(deal.firstSeen)}
                          </p>
                        </div>
                      </div>

                      {/* Raw text excerpt */}
                      {deal.rawText && (
                        <details className="text-xs text-gray-500">
                          <summary className="cursor-pointer hover:text-gray-700 font-medium">
                            Raw listing text
                          </summary>
                          <p className="mt-2 leading-relaxed line-clamp-6 bg-white border rounded p-2">
                            {deal.rawText}
                          </p>
                        </details>
                      )}

                      <a
                        href={deal.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View on {getSourceBadge(deal.source).label}
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* No results after filter */}
        {!loading && deals.length > 0 && filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">No deals match your filters.</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs"
              onClick={() => {
                setSearchText('');
                setSourceFilter('all');
                setMinScore('0');
                setMinPrice('');
                setMaxPrice('');
                setShowPassedOnly(false);
              }}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
