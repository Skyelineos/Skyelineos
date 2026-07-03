import { useEffect, useMemo, useState } from 'react';
import { authFetch } from '@/lib/authFetch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Search, CheckCircle2 } from 'lucide-react';

// Row shape mirrors `QboCustomerRow` returned by GET /api/qbo/customers.
// Kept inline (rather than imported from functions/) so the client bundle
// doesn't need a path alias into the cloud-functions source tree.
interface QboCustomerRow {
  qboId: string;
  displayName: string;
  companyName?: string;
  balance: number;
  isSubCustomer: boolean;
  parentId?: string;
  parentName?: string;
  lastUpdated: string;
  alreadyImported: boolean;
}

interface ImportStats {
  synced: number;
  created: number;
  updated: number;
  errors: number;
  requested: number;
  matched: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a successful import so the parent card can refresh whatever
  // it shows (last-sync timestamp etc).
  onImported?: (stats: ImportStats) => void;
}

const BRAND_GOLD = '#C9A96E';
const BRAND_GOLD_HOVER = '#A8864A';

// Format a QBO `Balance` as USD. QBO returns dollars (not cents).
function fmtUsd(n: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
  }
}

// Render an ISO datetime as a short, locale-friendly date. Empty string in
// = empty string out so the row just shows a dash.
function fmtDate(iso: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function QboCustomerImportDialog({ open, onOpenChange, onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<QboCustomerRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [success, setSuccess] = useState<ImportStats | null>(null);

  // Pull the customer list every time the dialog opens. We don't cache
  // between opens — the user is here because something probably changed
  // in QBO since they last looked.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setSelected(new Set());
    setSearch('');
    (async () => {
      try {
        const res = await authFetch('/api/qbo/customers', { method: 'GET' });
        const json = await res.json().catch(() => ({} as any));
        if (cancelled) return;
        if (!res.ok) {
          setError(json?.error || `Failed to load customers (${res.status})`);
          setRows([]);
        } else {
          setRows(Array.isArray(json?.customers) ? json.customers : []);
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Network error');
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Case-insensitive search across the most useful fields. Search of '' is a
  // no-op so the full list shows by default.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.displayName.toLowerCase().includes(q) ||
      (r.companyName || '').toLowerCase().includes(q) ||
      (r.parentName || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  // "Selectable" = rows the user is actually allowed to import — i.e. the
  // ones not already in Firestore. Select-all / counts work off this set so
  // they don't lie about the user's intent.
  const selectableRows = useMemo(
    () => filteredRows.filter((r) => !r.alreadyImported),
    [filteredRows],
  );

  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.qboId));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of selectableRows) next.add(r.qboId);
      return next;
    });
  };

  const deselectAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of selectableRows) next.delete(r.qboId);
      return next;
    });
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await authFetch('/api/qbo/import-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerIds: Array.from(selected) }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(json?.error || `Import failed (${res.status})`);
      } else {
        const stats: ImportStats = {
          synced: Number(json.synced) || 0,
          created: Number(json.created) || 0,
          updated: Number(json.updated) || 0,
          errors: Number(json.errors) || 0,
          requested: Number(json.requested) || 0,
          matched: Number(json.matched) || 0,
        };
        setSuccess(stats);
        onImported?.(stats);
      }
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl font-sans">
        <DialogHeader>
          <DialogTitle className="font-sans">Import from QuickBooks</DialogTitle>
          <DialogDescription className="font-sans">
            Pick which QuickBooks customers to bring into Skyeline as projects.
            Customers already imported are shown but can't be selected again.
          </DialogDescription>
        </DialogHeader>

        {/* Search + bulk-select row. Stays visible regardless of load state
            so the user can pre-type while the fetch is still going. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers…"
              className="pl-8 font-sans"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAllVisible}
            disabled={loading || selectableRows.length === 0}
            className="font-sans"
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={deselectAllVisible}
            disabled={loading || selected.size === 0}
            className="font-sans"
          >
            Deselect all
          </Button>
        </div>

        {/* Body */}
        <div className="border rounded-md max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500 font-sans">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading customers…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 p-3 text-sm text-red-700 font-sans">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500 font-sans">
              No customers match.
            </div>
          ) : (
            <table className="w-full text-sm font-sans">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500">
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(c) => (c ? selectAllVisible() : deselectAllVisible())}
                      disabled={selectableRows.length === 0}
                      aria-label="Select all visible"
                    />
                  </th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Balance</th>
                  <th className="px-3 py-2">Last update</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const isChecked = selected.has(r.qboId);
                  const disabled = r.alreadyImported;
                  return (
                    <tr
                      key={r.qboId}
                      className={`border-t ${disabled ? 'bg-gray-50/60 text-gray-500' : 'hover:bg-gray-50'} cursor-pointer`}
                      onClick={() => { if (!disabled) toggleOne(r.qboId); }}
                    >
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleOne(r.qboId)}
                          disabled={disabled}
                          aria-label={`Select ${r.displayName}`}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-gray-900">
                          {r.displayName}
                        </div>
                        {r.isSubCustomer && r.parentName && (
                          <div className="text-[11px] text-gray-500">
                            Job under {r.parentName}
                          </div>
                        )}
                        {!r.isSubCustomer && r.companyName && r.companyName !== r.displayName && (
                          <div className="text-[11px] text-gray-500">{r.companyName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top tabular-nums">{fmtUsd(r.balance)}</td>
                      <td className="px-3 py-2 align-top text-gray-600">{fmtDate(r.lastUpdated)}</td>
                      <td className="px-3 py-2 align-top">
                        {r.alreadyImported && (
                          <Badge
                            variant="outline"
                            className="bg-gray-100 text-gray-600 border-gray-200 font-sans text-[10px]"
                          >
                            Already imported
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {success && (
          <div className="flex items-start gap-2 p-2.5 bg-green-50 border border-green-200 rounded text-xs text-green-800 font-sans">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Imported {success.synced} customer{success.synced === 1 ? '' : 's'}
              {' '}({success.created} new, {success.updated} updated
              {success.errors > 0 ? `, ${success.errors} error${success.errors === 1 ? '' : 's'}` : ''})
              {success.matched < success.requested && (
                <>
                  {' '}— {success.requested - success.matched} requested ID
                  {success.requested - success.matched === 1 ? '' : 's'} no longer active in QBO.
                </>
              )}
            </span>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <div className="text-xs text-gray-500 font-sans">
            {selected.size > 0 ? `${selected.size} selected` : 'Pick at least one customer'}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importing}
              className="font-sans"
            >
              {success ? 'Close' : 'Cancel'}
            </Button>
            <Button
              type="button"
              onClick={importSelected}
              disabled={importing || selected.size === 0}
              className="font-sans text-white"
              style={{ backgroundColor: BRAND_GOLD }}
              onMouseEnter={(e) => { (e.currentTarget.style.backgroundColor = BRAND_GOLD_HOVER); }}
              onMouseLeave={(e) => { (e.currentTarget.style.backgroundColor = BRAND_GOLD); }}
            >
              {importing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Importing…
                </>
              ) : (
                <>Import {selected.size > 0 ? `${selected.size} ` : ''}Selected</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
