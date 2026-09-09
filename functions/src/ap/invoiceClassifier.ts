// invoiceClassifier.ts — Zero-token deterministic invoice classification.
//
// Classifies vendor invoices by trade and job using keyword/domain rules.
// No AI calls. No tokens. Runs locally in the Cloud Function.
//
// Exported function:
//   classifyInvoice(input) → Classification

export interface ClassificationInput {
  fromName: string;
  fromEmail: string;
  subject: string;
  bodySnippet: string;
  attachmentFilenames: string[];
  pdfText: string;          // raw text from PDF (empty string if unavailable)
  knownProjects: string[];  // live project names from Firestore
}

export interface Classification {
  vendor: string;
  trade: string;
  jobName: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

// ── Trade keyword rules ───────────────────────────────────────────────────────
// Checked against: vendor name, email domain, subject, body, PDF text.
// First match wins. Order matters — more specific rules go first.

const TRADE_RULES: Array<{ trade: string; keywords: string[] }> = [
  { trade: 'Electrical',         keywords: ['electric','electrical','electrician','wiring','panel','breaker','lighting','solar','generator','er electric','ryan electric','jones electric'] },
  { trade: 'Plumbing',           keywords: ['plumb','plumbing','plumber','pipe','drain','sewer','septic','water heater','told plumbing','abc plumbing'] },
  { trade: 'HVAC',               keywords: ['hvac','heating','cooling','air condition','furnace','duct','ventilat','heat pump','first choice heat','comfort air','mountain air'] },
  { trade: 'Framing',            keywords: ['fram','lumber','stud','truss','joist','rafter','beam','timber','wood frame'] },
  { trade: 'Concrete',           keywords: ['concrete','cement','pour','flatwork','foundation pour','slab','rebar','ready mix','batch plant'] },
  { trade: 'Roofing',            keywords: ['roof','roofing','shingle','flashing','gutter','downspout','fascia','soffit'] },
  { trade: 'Drywall',            keywords: ['drywall','sheetrock','gypsum','mud','tape','texture','finish right','finish carpenter','interior finish'] },
  { trade: 'Flooring',           keywords: ['floor','flooring','carpet','hardwood','laminate','vinyl','tile floor','lvp','lvt'] },
  { trade: 'Painting',           keywords: ['paint','painting','painter','stain','finish coat','primer','spray'] },
  { trade: 'Cabinets',           keywords: ['cabinet','cabinetry','millwork','five star custom carpentry','five star carpentry','carpentry','custom carpentry'] },
  { trade: 'Countertops',        keywords: ['countertop','counter top','granite','quartz','marble','stone slab','luxcore','silestone','cambria'] },
  { trade: 'Windows',            keywords: ['window','glazing','glass','pane','outlaw glass','summit glass','door glass'] },
  { trade: 'Doors',              keywords: ['door','entry door','garage door','sliding door','interior door','exterior door'] },
  { trade: 'Tile',               keywords: ['tile','tiling','ceramic','porcelain','mosaic','grout','backsplash','shower tile'] },
  { trade: 'Insulation',         keywords: ['insulation','insulate','spray foam','batt','fiberglass','blow in','rockwool'] },
  { trade: 'Excavation',         keywords: ['excavat','grading','grade','dirt work','earthwork','excavator','demo','demolition'] },
  { trade: 'Foundation',         keywords: ['foundation','footings','footing','basement','crawl space','stem wall'] },
  { trade: 'Masonry',            keywords: ['mason','masonry','brick','block','stone','mortar','fireplace','chimney'] },
  { trade: 'Landscaping',        keywords: ['landscap','landscape','sod','lawn','irrigation','sprinkler','tree','shrub','plant'] },
  { trade: 'Hardware',           keywords: ['hardware','fastener','bolt','screw','nail','anchor','summit fastener','home depot','lowes','menards','84 lumber'] },
  { trade: 'Subcontractor',      keywords: ['subcontract','sub contract','contractor','construction llc','construction inc','construction co','builders','coyote construction','wolfman','wolf man'] },
  { trade: 'Professional Services', keywords: ['engineer','engineering','architect','architecture','survey','surveying','design','permit','inspection','legal','attorney','accounting','redwood eng'] },
  { trade: 'Materials',          keywords: ['supply','supplies','material','lumber yard','building supply','wholesale'] },
];

// ── Email provider domains that tell us nothing about trade ──────────────────
const GENERIC_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'me.com','aol.com','protonmail.com','live.com',
  // Invoicing SaaS platforms — use vendor name instead
  'quickbooks.com','notification.intuit.com','freshbooks.com','fb02.freshbooks.com',
  'wave.com','invoiceninja.com','billdu.com','jobber.com','msg.getjobber.com',
  'housecallpro.com','servicetitan.com','xero.com','stripe.com',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function haystack(input: ClassificationInput): string {
  return normalize([
    input.fromName,
    // Only include domain when it's not a generic/SaaS domain
    (() => {
      const domain = (input.fromEmail.split('@')[1] || '').replace(/^www\./, '');
      return GENERIC_DOMAINS.has(domain) ? '' : domain;
    })(),
    input.subject,
    input.bodySnippet.slice(0, 500),
    input.pdfText.slice(0, 1000),
    input.attachmentFilenames.join(' '),
  ].join(' '));
}

function detectTrade(hay: string): { trade: string; confidence: 'high' | 'medium' | 'low' } {
  for (const rule of TRADE_RULES) {
    for (const kw of rule.keywords) {
      if (hay.includes(kw)) {
        // Confidence: high if keyword in vendor name/domain, medium if in subject/body
        const inVendor = hay.slice(0, 80).includes(kw);
        return { trade: rule.trade, confidence: inVendor ? 'high' : 'medium' };
      }
    }
  }
  return { trade: 'Other', confidence: 'low' };
}

/**
 * Fuzzy job name matching. Tries:
 * 1. Exact match in combined text
 * 2. Every word of the project name appears in text (e.g. "Maple Lakes" → finds "maple" AND "lakes")
 * 3. First word of project name appears (e.g. "Rosecroft" → "rosecroft")
 */
function detectJob(hay: string, projects: string[]): string | null {
  for (const project of projects) {
    const normProject = normalize(project);
    // Exact
    if (hay.includes(normProject)) return project;
  }
  for (const project of projects) {
    const words = normalize(project).split(' ').filter(w => w.length > 3);
    if (words.length > 0 && words.every(w => hay.includes(w))) return project;
  }
  for (const project of projects) {
    const firstWord = normalize(project).split(' ')[0];
    if (firstWord.length > 4 && hay.includes(firstWord)) return project;
  }
  return null;
}

function cleanVendorName(input: ClassificationInput): string {
  // Prefer the name in the from field; strip common suffixes
  const raw = input.fromName || input.fromEmail.split('@')[0];
  return raw
    .replace(/\s+via\s+.+$/i, '')   // "Company via FreshBooks" → "Company"
    .replace(/\s+noreply.*/i, '')
    .trim()
    || input.fromEmail;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function classifyInvoice(input: ClassificationInput): Classification {
  const hay = haystack(input);
  const vendor = cleanVendorName(input);
  const { trade, confidence: tradeConf } = detectTrade(hay);
  const jobName = detectJob(hay, input.knownProjects);

  // Overall confidence
  let confidence: 'high' | 'medium' | 'low';
  if (tradeConf === 'high' && jobName) {
    confidence = 'high';
  } else if (tradeConf === 'high' || (tradeConf === 'medium' && jobName)) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const notes = [
    `Trade "${trade}" matched from ${tradeConf === 'high' ? 'vendor name' : 'email body/subject'}.`,
    jobName ? `Job matched: "${jobName}".` : 'No job match found — needs manual assignment.',
  ].join(' ');

  return { vendor, trade, jobName, confidence, notes };
}
