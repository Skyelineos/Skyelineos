export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  customer: string;
  issued: string;
  due: string;
  total: number | null;
  balance: number | null;
  currency: string;
}

function amount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function loadInvoices(
  query: (sql: string) => Promise<any>
): Promise<Invoice[]> {
  const invoices = new Map<string, Invoice>();
  const pageSize = 250;
  const count = async () => {
    const result = await query('SELECT COUNT(*) FROM Invoice');
    const n = result?.QueryResponse?.totalCount;
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error('Invalid invoice count');
    return n;
  };
  const expected = await count();
  for (let start = 1; start <= expected; start += pageSize) {
    const result = await query(
      'SELECT * FROM Invoice ORDERBY Id STARTPOSITION ' +
        start +
        ' MAXRESULTS ' +
        pageSize
    );
    const page = result?.QueryResponse?.Invoice;
    if (
      !Array.isArray(page) ||
      page.length !== Math.min(pageSize, expected - start + 1)
    ) {
      throw new Error('Invoice list changed during refresh');
    }
    for (const row of page) {
      if (!row.Id || invoices.has(String(row.Id)))
        throw new Error('Invalid or repeated invoice');
      invoices.set(String(row.Id), {
        id: String(row.Id),
        number: String(row.DocNumber || row.Id),
        customerId: String(row.CustomerRef?.value || ''),
        customer: String(row.CustomerRef?.name || ''),
        issued: row.TxnDate || '',
        due: row.DueDate || '',
        total: amount(row.TotalAmt),
        balance: amount(row.Balance),
        currency: row.CurrencyRef?.value || '',
      });
    }
  }
  if ((await count()) !== expected)
    throw new Error('Invoice list changed during refresh');
  return Array.from(invoices.values());
}

export interface Project {
  id: string;
  name: string;
  customerId: string;
}

export function matchInvoices(
  invoices: Invoice[],
  projects: Project[],
  approvals: Map<string, string>,
  customerLinks = new Map<string, string>()
) {
  const byCustomer = new Map<string, Project[]>();
  const byId = new Map(projects.map((p) => [p.id, p] as const));
  for (const project of projects) {
    if (!project.customerId) continue;
    const group = byCustomer.get(project.customerId) || [];
    group.push(project);
    byCustomer.set(project.customerId, group);
  }
  return invoices
    .map((invoice) => {
      const candidates = byCustomer.get(invoice.customerId) || [];
      const approved = approvals.get(invoice.id);
      const customerLink = customerLinks.get(invoice.customerId);
      const project = byId.get(approved || customerLink || '');
      const match = approved
        ? project
          ? 'Approved'
          : 'Approved project missing'
        : customerLink
          ? project
            ? 'Approved customer link'
            : 'Linked project missing'
          : candidates.length === 1
            ? 'Confirm customer link'
            : candidates.length
              ? 'Multiple projects'
              : 'No project link';
      return {
        ...invoice,
        projectId: project?.id || '',
        suggestedId:
          project?.id ||
          (!approved && !customerLink && candidates.length === 1
            ? candidates[0].id
            : ''),
        match,
      };
    })
    .sort(
      (a, b) =>
        Number((b.balance ?? 0) > 0) - Number((a.balance ?? 0) > 0) ||
        (a.due || '9999').localeCompare(b.due || '9999') ||
        a.id.localeCompare(b.id)
    );
}
