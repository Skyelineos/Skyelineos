import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { financeRequest } from '@/lib/financeRequest';
import { Button } from '@/components/ui/button';

interface Invoice {
  id: string;
  number: string;
  customer: string;
  issued: string;
  due: string;
  total: number | null;
  balance: number | null;
  currency: string;
  projectId: string;
  suggestedId: string;
  match: string;
}
interface Report {
  connected: boolean;
  company?: string;
  env?: string;
  asOf?: string;
  projects?: { id: string; name: string }[];
  invoices?: Invoice[];
}

function money(value: number | null, currency: string) {
  if (value === null) return 'Unknown';
  if (!/^[A-Z]{3}$/.test(currency))
    return value.toLocaleString() + ' (currency unknown)';
  return value.toLocaleString('en-US', { style: 'currency', currency });
}

const base = '/api/project-finance';
export function ProjectFinanceAgent() {
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const report = useQuery<Report>({
    queryKey: [base, user?.firebaseUid],
    queryFn: () => financeRequest(base),
    retry: false,
    enabled: !!user,
    staleTime: 0,
  });
  const payables = useQuery<{ pendingCount: number; unpaidCount: number }>({
    queryKey: ['/api/ap/summary', user?.firebaseUid],
    queryFn: () => financeRequest('/api/ap/summary'),
    retry: false,
    enabled: !!user,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean>>();
  const [project, setProject] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [customerScope, setCustomerScope] = useState<Record<string, boolean>>(
    {}
  );
  const data = report.data;
  const projects = data?.projects || [];
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const all = data?.invoices || [];
  const selected = all.filter((i) => !project || i.projectId === project);
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const overdue = (i: Invoice) =>
    (i.balance ?? 0) > 0 && !!i.due && i.due < today;
  const monthly = new Map<string, Map<string, number>>();
  const byCurrency = new Map<
    string,
    {
      billed: number;
      open: number;
      billedCount: number;
      balanceCount: number;
      unknown: number;
    }
  >();
  for (const row of selected) {
    const totals = byCurrency.get(row.currency) || {
      billed: 0,
      open: 0,
      billedCount: 0,
      balanceCount: 0,
      unknown: 0,
    };
    totals.billed += Math.round((row.total ?? 0) * 100);
    totals.open += Math.round((row.balance ?? 0) * 100);
    if (row.total !== null) totals.billedCount++;
    if (row.balance !== null) totals.balanceCount++;
    if (row.total === null || row.balance === null) totals.unknown++;
    byCurrency.set(row.currency, totals);
    if (
      row.total !== null &&
      row.currency &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.issued)
    ) {
      const series = monthly.get(row.currency) || new Map<string, number>();
      const month = row.issued.slice(0, 7);
      series.set(month, (series.get(month) || 0) + Math.round(row.total * 100));
      monthly.set(row.currency, series);
    }
  }
  const visible = selected.filter((i) =>
    filter === 'review'
      ? !i.projectId
      : filter === 'open'
        ? (i.balance ?? 0) > 0
        : filter === 'overdue'
          ? overdue(i)
          : true
  );
  const lastPage = Math.max(0, Math.ceil(visible.length / 25) - 1);
  const index = Math.min(page, lastPage);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    await report.refetch({ throwOnError: true });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-3xl font-semibold">Project financial agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Client invoices and outstanding draws from QuickBooks Online.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        {isAdmin && (
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await financeRequest(base + '/refresh', {});
                await reload();
              })
            }
          >
            Refresh invoices
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () =>
                setChecks(await financeRequest(base + '/connections', {}))
              )
            }
          >
            Test connections
          </Button>
        )}
        <Link className="underline" href="/financials/settings">
          QuickBooks settings
        </Link>
        <Link className="underline" href="/ap">
          Vendor invoices
        </Link>
      </div>
      {payables.data && (
        <p className="text-sm">
          Company vendor invoices · {payables.data.pendingCount} awaiting review
          · {payables.data.unpaidCount} marked unpaid
        </p>
      )}
      {payables.isError && (
        <p className="text-sm">Vendor invoice summary unavailable.</p>
      )}
      {isAdmin && checks && (
        <div className="space-y-1 rounded border bg-white p-4">
          {Object.entries(checks).map(([name, ok]) => (
            <div key={name} className="flex items-center gap-3">
              <span className="capitalize">{name}</span>
              <strong>{ok ? 'Verified' : 'Check connection'}</strong>
              {!ok && ['gmail', 'drive'].includes(name) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await financeRequest<{ url: string }>(
                        '/api/ingestionLab/oauth/' + name + '/start',
                        {}
                      );
                      window.location.assign(result.url);
                    })
                  }
                >
                  Connect
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {(error || report.isError) && (
        <p role="alert">{error || (report.error as Error)?.message}</p>
      )}
      {report.isLoading && <p>Loading project finances…</p>}
      {data && !data.connected && (
        <p>
          Connect your QuickBooks company in Financial Settings to load
          invoices.
        </p>
      )}
      {data?.connected && (
        <p className="text-sm">
          {data.env} ·{' '}
          {data.asOf
            ? 'Last completed refresh ' + new Date(data.asOf).toLocaleString()
            : 'Awaiting first refresh'}{' '}
          · Scheduled daily at 6 a.m. Mountain time
        </p>
      )}
      {data?.asOf && Date.now() - Date.parse(data.asOf) > 36 * 3600000 && (
        <p role="status">
          The latest invoice data is more than 36 hours old. Check the
          connections and refresh.
        </p>
      )}
      {data?.asOf && (
        <>
          <label className="block">
            Project{' '}
            <select
              className="ml-2 rounded border p-2"
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from(byCurrency, ([currency, sums]) => (
              <section key={currency} className="rounded border bg-white p-4">
                <h2 className="text-sm text-muted-foreground">
                  Known invoice totals · {currency || 'Unspecified currency'}
                </h2>
                <p>
                  Billed{' '}
                  <strong>
                    {currency
                      ? money(
                          sums.billedCount ? sums.billed / 100 : null,
                          currency
                        )
                      : 'Unknown currency'}
                  </strong>
                </p>
                <p>
                  Outstanding{' '}
                  <strong>
                    {currency
                      ? money(
                          sums.balanceCount ? sums.open / 100 : null,
                          currency
                        )
                      : 'Unknown currency'}
                  </strong>
                </p>
                {!!sums.unknown && (
                  <p>{sums.unknown} invoices have incomplete amounts.</p>
                )}
              </section>
            ))}
          </div>
          {Array.from(monthly, ([currency, series]) => {
            const points = Array.from(series.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(-12);
            const max = Math.max(1, ...points.map(([, v]) => Math.abs(v)));
            return (
              <section key={currency} className="rounded border bg-white p-4">
                <h2 className="mb-3 font-semibold">
                  Monthly billed · {currency}
                </h2>
                {points.map(([month, cents]) => (
                  <div
                    key={month}
                    className="grid grid-cols-[5rem_1fr_7rem] items-center gap-3 py-1 text-sm"
                  >
                    <span>{month}</span>
                    <span className="h-2 rounded bg-stone-100">
                      <span
                        className="block h-full rounded bg-stone-500"
                        style={{ width: (Math.abs(cents) / max) * 100 + '%' }}
                      />
                    </span>
                    <span className="text-right">
                      {money(cents / 100, currency)}
                    </span>
                  </div>
                ))}
              </section>
            );
          })}
          {project && (
            <Link
              className="block underline"
              href={'/projects/' + encodeURIComponent(project) + '/budget'}
            >
              Open project budget and draws
            </Link>
          )}
          <label>
            Show{' '}
            <select
              value={filter}
              className="ml-2 rounded border p-2"
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All invoices ({selected.length})</option>
              <option value="open">Open balances</option>
              <option value="overdue">
                Past due ({selected.filter(overdue).length})
              </option>
              <option value="review">
                Needs project review (
                {selected.filter((i) => !i.projectId).length})
              </option>
            </select>
          </label>
          <div className="overflow-x-auto rounded border bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    'Invoice',
                    'Customer',
                    'Issued / due',
                    'Billed',
                    'Outstanding',
                    'Project assignment',
                  ].map((h) => (
                    <th className="p-3" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.slice(index * 25, index * 25 + 25).map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="p-3">{i.number}</td>
                    <td className="p-3">{i.customer || 'Unknown'}</td>
                    <td className="p-3">
                      {i.issued || 'Unknown'} / {i.due || 'Unknown'}
                    </td>
                    <td className="p-3">{money(i.total, i.currency)}</td>
                    <td className="p-3">{money(i.balance, i.currency)}</td>
                    <td className="p-3">
                      {projectNames.get(i.projectId) || 'Needs review'}{' '}
                      <small>({i.match})</small>
                      {isAdmin && (
                        <details>
                          <summary>Review assignment</summary>
                          <select
                            aria-label={'Project for invoice ' + i.number}
                            value={draft[i.id] ?? i.suggestedId}
                            onChange={(e) =>
                              setDraft({ ...draft, [i.id]: e.target.value })
                            }
                          >
                            <option value="">Choose project</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <label className="block">
                            <input
                              type="checkbox"
                              checked={!!customerScope[i.id]}
                              onChange={(e) =>
                                setCustomerScope({
                                  ...customerScope,
                                  [i.id]: e.target.checked,
                                })
                              }
                            />{' '}
                            Use as the default for this customer’s other
                            invoices
                          </label>
                          <Button
                            variant="outline"
                            disabled={busy || !(draft[i.id] ?? i.suggestedId)}
                            onClick={() =>
                              run(async () => {
                                await financeRequest(base + '/approve', {
                                  company: data.company,
                                  invoiceId: i.id,
                                  projectId: draft[i.id] ?? i.suggestedId,
                                  scope: customerScope[i.id]
                                    ? 'customer'
                                    : 'invoice',
                                });
                                await reload();
                              })
                            }
                          >
                            Approve assignment
                          </Button>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="p-4">No invoices in this view.</p>
            )}
          </div>
          {lastPage > 0 && (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                disabled={!index}
                onClick={() => setPage(index - 1)}
              >
                Previous
              </Button>
              Page {index + 1} of {lastPage + 1}
              <Button
                variant="outline"
                disabled={index >= lastPage}
                onClick={() => setPage(index + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
