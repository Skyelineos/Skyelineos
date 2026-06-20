// Extraction prompt + tool definition for the AI Inbox brain.
//
// Finance-focused evolution of the Ingestion Lab prompt. Pulls structured data
// out of one email/receipt/alert: category, vendor, amount, dates, a QuickBooks
// expense-account suggestion, a recommended Gmail label, and a project match
// against the live projects index.

import { AI_INBOX_CATEGORIES } from './types';

const CATEGORIES_LIST = AI_INBOX_CATEGORIES.join(', ');

export const SYSTEM_PROMPT = `You are the intake brain for Skyeline Homes, a custom home builder in Mapleton UT. You read one incoming item (an email, a receipt, a bank alert, or a forwarded document) and extract structured data so an accountant can file it in QuickBooks and a project manager can attach it to the right job.

Your job for each item:
1. Pick the single best category: ${CATEGORIES_LIST}.
   - vendor_invoice: a bill that Skyeline owes and will PAY LATER (has an invoice #, due date, "amount due").
   - receipt / home_depot_receipt: proof of a purchase ALREADY PAID. Use home_depot_receipt when the merchant is The Home Depot.
   - bank_alert: a bank or credit-card transaction notice or statement.
   - subcontractor_email / client_email: correspondence (scheduling, questions, docs) from a sub or a homeowner — not itself a bill.
   - general: anything else.
2. Extract the money fields if present: vendorName, amountUsd (number, no currency symbol), invoiceNumber, documentDate and dueDate (ISO yyyy-mm-dd).
3. Suggest the QuickBooks expense account this should book to (qboAccountSuggestion) — a plain account name like "Materials", "Subcontractors", "Job Supplies", "Lumber", "Fuel". Use construction-cost-accounting conventions. Null if not a financial item.
4. Recommend a Gmail label to file the thread under (gmailLabelRecommendation) — e.g. "Invoices/Unpaid", "Receipts/Home Depot", "Bank", or "Project/<short name>". Keep it short and reusable.
5. Match the item to a project from the KNOWN PROJECTS list using sender, client name, address, or explicit project name. Return the project's id (exact string from the list) and its name. If you cannot tell, set projectId and projectName to null. Do NOT guess.
6. Score confidence (0..1) in your classification + project match, and explain it in one sentence.
7. If a human must answer something before this can be filed, set needsClarification=true and ask one specific question.

Rules:
- amountUsd must be a number (e.g. 4820.55) or null. Never a string.
- Financial items (invoices, receipts, bank alerts) are ALWAYS reviewed by a human before anything is written to QuickBooks — extract carefully but you are not authorizing a payment.
- Prefer an exact project id from the list. Never invent an id.
- Always call the extract_inbox_item tool. Do not return prose.`;

export const EXTRACTION_TOOL = {
  name: 'extract_inbox_item',
  description:
    'Extract structured finance/intake data from one incoming item. Always invoke this tool — never return prose.',
  input_schema: {
    type: 'object',
    required: [
      'category',
      'projectId',
      'amountUsd',
      'summary',
      'confidence',
      'confidenceReason',
      'needsClarification',
    ],
    properties: {
      category: { type: 'string', enum: [...AI_INBOX_CATEGORIES] },
      vendorName: { type: ['string', 'null'] },
      amountUsd: { type: ['number', 'null'], description: 'Total amount in USD as a number, or null.' },
      currency: { type: ['string', 'null'], description: 'ISO currency code; default USD.' },
      documentDate: { type: ['string', 'null'], description: 'ISO yyyy-mm-dd of the document, or null.' },
      dueDate: { type: ['string', 'null'], description: 'ISO yyyy-mm-dd due date for invoices, or null.' },
      invoiceNumber: { type: ['string', 'null'] },
      qboAccountSuggestion: { type: ['string', 'null'], description: 'Suggested QBO expense account name.' },
      gmailLabelRecommendation: { type: ['string', 'null'], description: 'Recommended Gmail label.' },
      projectId: { type: ['string', 'null'], description: 'Exact project id from KNOWN PROJECTS, or null.' },
      projectName: { type: ['string', 'null'] },
      summary: { type: 'string', description: 'One-line human summary of the item.' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      confidenceReason: { type: 'string' },
      needsClarification: { type: 'boolean' },
      clarificationQuestion: { type: ['string', 'null'] },
    },
  },
};

export function buildMessages(args: {
  knownProjectsBlock: string;
  source: string;
  metadata: any;
  content: string;
}): any[] {
  return [{ role: 'user', content: renderItem(args) }];
}

function renderItem(args: {
  knownProjectsBlock: string;
  source: string;
  metadata: any;
  content: string;
}): string {
  const meta = args.metadata || {};
  const lines: string[] = [];
  lines.push(args.knownProjectsBlock);
  lines.push('');
  lines.push(`SOURCE: ${args.source || 'gmail'}`);
  if (meta.fromEmail) lines.push(`FROM: ${meta.fromEmail}${meta.fromName ? ' (' + meta.fromName + ')' : ''}`);
  else if (meta.fromName) lines.push(`FROM: ${meta.fromName}`);
  if (meta.subject) lines.push(`SUBJECT: ${meta.subject}`);
  if (Array.isArray(meta.gmailLabels) && meta.gmailLabels.length) {
    lines.push(`EXISTING GMAIL LABELS: ${meta.gmailLabels.join(', ')}`);
  }
  if (Array.isArray(meta.attachments) && meta.attachments.length) {
    lines.push(`ATTACHMENTS: ${meta.attachments.map((a: any) => a.filename || a).join(', ')}`);
  }
  if (meta.date) lines.push(`DATE: ${meta.date}`);
  lines.push('');
  lines.push('CONTENT:');
  lines.push(truncate(args.content || '', 30000));
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + `\n\n[content truncated — original length ${s.length} chars]`;
}
