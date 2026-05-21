import { useState, useRef, useEffect } from 'react';
import { collection, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Upload, Download, CheckCircle2, AlertCircle, FileSpreadsheet,
  Users, FolderOpen, Calendar, Package, Building2, DollarSign,
  FileText, Wrench, ChevronDown, ChevronRight, X, Link as LinkIcon,
  Coins, ListChecks, Replace, Palette, ClipboardList, Receipt,
  Award, Map, ScrollText, HardHat,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { SKYELINE_SUBCONTRACTOR_COUNT } from '@/lib/skyelineSubcontractors';

// ─── Google Sheets URL → CSV helper ─────────────────────────────────────────
// Accepts the standard /edit URL or share link. Extracts file ID + sheet gid.
// Requires the sheet to be shared "Anyone with the link can view" — otherwise the
// fetch will return an HTML auth page instead of CSV.
function buildSheetCsvUrl(url: string): string | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;
  const fileId = idMatch[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${gid}`;
}

async function fetchSheetAsCsv(url: string): Promise<string> {
  const csvUrl = buildSheetCsvUrl(url);
  if (!csvUrl) throw new Error('Not a valid Google Sheets URL.');
  const res = await fetch(csvUrl, { credentials: 'omit' });
  if (!res.ok) throw new Error(`Sheet fetch failed (${res.status}). Make sure the sheet is shared "Anyone with the link can view".`);
  const text = await res.text();
  // Google returns an HTML login page on auth failure. CSV starts with a header row.
  if (text.trimStart().startsWith('<')) {
    throw new Error('The sheet is private. Open it → Share → "Anyone with the link can view", then retry.');
  }
  return text;
}

// ─── CSV parser ─────────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cells.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = parseRow(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

// fuzzy column pick — first header that matches any alias
function col(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    const key = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_-]/g, '') === alias.toLowerCase().replace(/[\s_-]/g, ''));
    if (key && row[key]) return row[key];
  }
  return '';
}

// ─── Canonical Sales pipeline stages ────────────────────────────────────────
// MUST stay in sync with DEFAULT_STAGES in Sales.tsx. Anything not in this
// list is invisible on the pipeline board, so the importer normalises every
// stage value down to one of these before writing.
export const CANONICAL_STAGES = [
  'new_lead', 'meeting_booked', 'design_phase', 'in_estimating',
  'close_to_sign', 'won', 'lost',
] as const;
export type CanonicalStage = typeof CANONICAL_STAGES[number];

// Friendly values importers / users commonly type, mapped to canonical keys.
// Anything not in this map AND not already canonical triggers the
// StageMappingDialog so the user can decide explicitly.
const STAGE_AUTO_MAP: Record<string, CanonicalStage> = {
  // ImportCenter README defaults — what Tyler's CSV exports tend to use
  lead: 'new_lead',
  'new lead': 'new_lead',
  new_lead: 'new_lead',
  proposal: 'close_to_sign',
  active: 'won',
  completed: 'won',
  complete: 'won',
  // Sales.tsx legacy values (kept in sync with its STAGE_MAP)
  meeting_booked: 'meeting_booked',
  'meeting booked': 'meeting_booked',
  design_phase: 'design_phase',
  'design phase': 'design_phase',
  in_estimating: 'in_estimating',
  'in estimating': 'in_estimating',
  estimating: 'in_estimating',
  close_to_sign: 'close_to_sign',
  'close to sign': 'close_to_sign',
  close_to_signing: 'close_to_sign',
  'close to signing': 'close_to_sign',
  contract: 'close_to_sign',
  pre_construction: 'won',
  preconstruction: 'won',
  active_build: 'won',
  final_passed: 'won',
  completed_build: 'won',
  in_punchlist: 'won',
  warranty: 'won',
  won: 'won',
  lost: 'lost',
};

/**
 * normalizeStage — best-effort map from a raw user-typed stage string to a
 * canonical pipeline key. Returns null when no auto-mapping exists so the
 * caller can decide whether to prompt the user.
 */
export function normalizeStage(raw: string): CanonicalStage | null {
  if (!raw) return null;
  const lower = raw.toString().toLowerCase().trim();
  if (!lower) return null;
  const collapsed = lower.replace(/\s+/g, '_');
  return STAGE_AUTO_MAP[collapsed] ?? STAGE_AUTO_MAP[lower] ?? null;
}

// ─── Template definitions ────────────────────────────────────────────────────
interface ImportTemplate {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
  collection: string;
  columns: { name: string; aliases: string[]; required: boolean; notes?: string }[];
  sampleRows: Record<string, string>[];
  transform: (row: Record<string, string>) => Record<string, any>;
  why: string; // for the "what else" section
}

const TEMPLATES: ImportTemplate[] = [
  {
    id: 'clients',
    label: 'Clients / Leads',
    icon: Users,
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    description: 'Import your existing client list and CRM leads into the Sales pipeline.',
    collection: 'clients',
    why: 'Populate your CRM pipeline with past clients and active leads immediately.',
    columns: [
      { name: 'name',        aliases: ['name','clientname','fullname','contact'],          required: true },
      { name: 'email',       aliases: ['email','emailaddress'],                            required: false },
      { name: 'phone',       aliases: ['phone','phonenumber','cell','mobile'],             required: false },
      { name: 'address',     aliases: ['address','homeaddress','projectaddress'],          required: false },
      { name: 'city',        aliases: ['city'],                                            required: false },
      { name: 'state',       aliases: ['state','st'],                                      required: false },
      { name: 'zip',         aliases: ['zip','zipcode','postal'],                          required: false },
      { name: 'stage',       aliases: ['stage','status','pipeline','leadstage'],           required: false, notes: 'Sales pipeline key. Canonical: new_lead, meeting_booked, design_phase, in_estimating, close_to_sign, won, lost. Friendly aliases (Lead, Proposal, Active, Completed, etc.) are auto-mapped — unrecognised values prompt for clarification before import.' },
      { name: 'budget',      aliases: ['budget','estimatedbudget','projectbudget'],        required: false },
      { name: 'source',      aliases: ['source','leadsource','referral'],                  required: false },
      { name: 'notes',       aliases: ['notes','comments','description'],                  required: false },
    ],
    sampleRows: [
      { name: 'John & Sarah Miller', email: 'sarah@millers.com', phone: '(512) 555-0101', address: '445 Bluebell Dr', city: 'Austin', state: 'TX', zip: '78701', stage: 'won',       budget: '850000', source: 'Referral', notes: 'Custom ranch-style home' },
      { name: 'Robert Chen',         email: 'rchen@email.com',   phone: '(512) 555-0192', address: '210 Elm St',       city: 'Round Rock', state: 'TX', zip: '78664', stage: 'new_lead',  budget: '1200000', source: 'Website', notes: 'Modern farmhouse, 5BR' },
    ],
    transform: (row) => ({
      name: col(row,'name','clientname','fullname','contact'),
      email: col(row,'email','emailaddress'),
      phone: col(row,'phone','phonenumber','cell','mobile'),
      address: col(row,'address','homeaddress','projectaddress'),
      city: col(row,'city'),
      state: col(row,'state','st'),
      zip: col(row,'zip','zipcode','postal'),
      stage: normalizeStage(col(row,'stage','status','pipeline','leadstage')) || 'new_lead',
      budget: parseFloat(col(row,'budget','estimatedbudget','projectbudget').replace(/[^0-9.]/g,'')) || 0,
      source: col(row,'source','leadsource','referral'),
      notes: col(row,'notes','comments','description'),
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'contacts',
    label: 'Subcontractors & Vendors',
    icon: Wrench,
    color: 'bg-orange-50 border-orange-200 text-orange-700',
    description: 'Import your sub and vendor list — trades, contact info, company name.',
    collection: 'contacts',
    why: 'Get your full vendor/sub rolodex in so you can assign them to bids and jobs right away.',
    columns: [
      { name: 'name',     aliases: ['name','contactname','fullname'],          required: true },
      { name: 'company',  aliases: ['company','companyname','businessname'],   required: false },
      { name: 'email',    aliases: ['email','emailaddress'],                   required: false },
      { name: 'phone',    aliases: ['phone','phonenumber','cell'],              required: false },
      { name: 'role',     aliases: ['role','type','contacttype'],               required: false, notes: 'sub, vendor, employee, supplier' },
      { name: 'trade',    aliases: ['trade','specialty','skill'],               required: false, notes: 'e.g. Framing, Electrical, Plumbing' },
      { name: 'address',  aliases: ['address'],                                 required: false },
      { name: 'notes',    aliases: ['notes','comments'],                        required: false },
    ],
    sampleRows: [
      { name: 'Carlos Vega',  company: 'Vega Electrical',    email: 'carlos@vegaelectric.com', phone: '(512) 555-0201', role: 'sub',    trade: 'Electrical', address: '88 Commerce Blvd, Austin TX', notes: 'Licensed master electrician' },
      { name: 'Pam Nguyen',   company: 'Nguyen Tile Works',  email: 'pam@nguyentile.com',       phone: '(512) 555-0242', role: 'sub',    trade: 'Tile',       address: '',                          notes: '' },
      { name: 'BuildRight LLC', company: 'BuildRight LLC',   email: 'orders@buildright.com',    phone: '(800) 555-0399', role: 'vendor', trade: '',           address: '100 Supply St, Dallas TX',  notes: 'Lumber & framing materials' },
    ],
    transform: (row) => ({
      name: col(row,'name','contactname','fullname'),
      company: col(row,'company','companyname','businessname'),
      email: col(row,'email','emailaddress'),
      phone: col(row,'phone','phonenumber','cell'),
      role: col(row,'role','type','contacttype') || 'sub',
      trade: col(row,'trade','specialty','skill'),
      address: col(row,'address'),
      notes: col(row,'notes','comments'),
      isActive: true,
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'projects',
    label: 'Project History',
    icon: FolderOpen,
    color: 'bg-green-50 border-green-200 text-green-700',
    description: 'Import your current or past projects with status, budget, and key dates.',
    collection: 'projects',
    why: 'Bring in your active job list so scheduling, budgets, and team assignments have context.',
    columns: [
      { name: 'name',                aliases: ['name','projectname','jobname'],                  required: true },
      { name: 'clientName',          aliases: ['clientname','client','homeowner'],               required: false },
      { name: 'address',             aliases: ['address','jobaddress','siteaddress','location'],  required: false },
      { name: 'status',              aliases: ['status','phase','stage'],                         required: false, notes: 'active, planning, on-hold, completed' },
      { name: 'contractAmount',      aliases: ['contractamount','contractvalue','budget','price'], required: false },
      { name: 'startDate',           aliases: ['startdate','start','kickoff'],                    required: false },
      { name: 'estimatedCompletion', aliases: ['estimatedcompletion','enddate','completion','finish','duedate'], required: false },
      { name: 'currentPhase',        aliases: ['currentphase','phase','milestone'],               required: false },
      { name: 'notes',               aliases: ['notes','description','comments'],                 required: false },
    ],
    sampleRows: [
      { name: 'Miller Ranch Home', clientName: 'John & Sarah Miller', address: '445 Bluebell Dr, Austin TX 78701', status: 'active', contractAmount: '850000', startDate: '2025-09-01', estimatedCompletion: '2026-06-30', currentPhase: 'Framing', notes: '' },
      { name: 'Chen Modern Farmhouse', clientName: 'Robert Chen', address: '210 Elm St, Round Rock TX 78664', status: 'planning', contractAmount: '1200000', startDate: '2026-01-15', estimatedCompletion: '2026-12-31', currentPhase: 'Design', notes: '5BR 4BA' },
    ],
    transform: (row) => ({
      name: col(row,'name','projectname','jobname'),
      clientName: col(row,'clientname','client','homeowner'),
      address: col(row,'address','jobaddress','siteaddress','location'),
      status: col(row,'status','phase','stage') || 'active',
      contractAmount: parseFloat(col(row,'contractamount','contractvalue','budget','price').replace(/[^0-9.]/g,'')) || 0,
      startDate: col(row,'startdate','start','kickoff'),
      estimatedCompletion: col(row,'estimatedcompletion','enddate','completion','finish','duedate'),
      currentPhase: col(row,'currentphase','phase','milestone'),
      notes: col(row,'notes','description','comments'),
      assignedUserIds: [],
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'schedule',
    label: 'Gantt / Schedule',
    icon: Calendar,
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    description: 'Import your current Gantt chart. Works with exports from Excel, Smartsheet, MS Project, or Buildertrend.',
    collection: 'tasks',
    why: 'Migrate your live schedule immediately — all tasks, assignments, and dates land in the Tasks board.',
    columns: [
      { name: 'name',        aliases: ['name','taskname','task','activity','description'], required: true },
      { name: 'projectName', aliases: ['projectname','project','job','jobname'],           required: false, notes: 'Used to look up project ID' },
      { name: 'startDate',   aliases: ['startdate','start','begindate'],                   required: false },
      { name: 'dueDate',     aliases: ['duedate','enddate','finishdate','finish','end','deadline'], required: false },
      { name: 'duration',    aliases: ['duration','days','lengthdays'],                    required: false, notes: 'Days (used if no end date)' },
      { name: 'assignedTo',  aliases: ['assignedto','resource','owner','assignee','responsible'], required: false },
      { name: 'status',      aliases: ['status','state','complete','percentcomplete'],     required: false, notes: 'todo, in_progress, done, blocked' },
      { name: 'priority',    aliases: ['priority','importance'],                            required: false, notes: 'low, medium, high' },
      { name: 'phase',       aliases: ['phase','category','wbscode','milestone'],           required: false },
      { name: 'notes',       aliases: ['notes','comments','description'],                   required: false },
    ],
    sampleRows: [
      { name: 'Pour Foundation',     projectName: 'Miller Ranch Home', startDate: '2025-09-15', dueDate: '2025-09-22', duration: '7', assignedTo: 'ABC Concrete', status: 'done',        priority: 'high',   phase: 'Foundation', notes: '' },
      { name: 'Frame Walls',         projectName: 'Miller Ranch Home', startDate: '2025-09-23', dueDate: '2025-10-10', duration: '17', assignedTo: 'Lopez Framing', status: 'in_progress', priority: 'high',   phase: 'Framing',    notes: '' },
      { name: 'Electrical Rough-in', projectName: 'Miller Ranch Home', startDate: '2025-10-11', dueDate: '2025-10-20', duration: '9', assignedTo: 'Vega Electrical', status: 'todo',      priority: 'medium', phase: 'MEP',        notes: 'Coordinate with HVAC' },
      { name: 'HVAC Rough-in',       projectName: 'Miller Ranch Home', startDate: '2025-10-11', dueDate: '2025-10-18', duration: '7', assignedTo: 'CoolAir HVAC',   status: 'todo',      priority: 'medium', phase: 'MEP',        notes: '' },
    ],
    transform: (row) => {
      const rawStatus = col(row,'status','state','complete','percentcomplete').toLowerCase();
      let status = 'todo';
      if (rawStatus.includes('complete') || rawStatus === 'done' || rawStatus === '100') status = 'done';
      else if (rawStatus.includes('progress') || rawStatus.includes('active') || (parseFloat(rawStatus) > 0 && parseFloat(rawStatus) < 100)) status = 'in_progress';
      else if (rawStatus.includes('block') || rawStatus.includes('hold')) status = 'blocked';
      return {
        name: col(row,'name','taskname','task','activity','description'),
        projectName: col(row,'projectname','project','job','jobname'),
        startDate: col(row,'startdate','start','begindate'),
        dueDate: col(row,'duedate','enddate','finishdate','finish','end','deadline'),
        assignedTo: col(row,'assignedto','resource','owner','assignee','responsible'),
        status,
        priority: col(row,'priority','importance') || 'medium',
        phase: col(row,'phase','category','wbscode','milestone'),
        notes: col(row,'notes','comments','description'),
        createdAt: serverTimestamp(),
      };
    },
  },

  {
    id: 'catalogs',
    label: 'Material Catalog',
    icon: Package,
    color: 'bg-amber-50 border-amber-200 text-amber-700',
    description: 'Import your materials, fixtures, and finishes price list into the Catalog.',
    collection: 'catalogs',
    why: 'Pre-load your standard material pricing so estimates auto-fill costs from the catalog.',
    columns: [
      { name: 'name',        aliases: ['name','productname','item','material'],          required: true },
      { name: 'category',    aliases: ['category','type','producttype'],                  required: false, notes: 'flooring, tile, cabinets, countertops, fixtures, hardware, paint, lumber, roofing, windows, other' },
      { name: 'unit',        aliases: ['unit','uom','unitofmeasure'],                    required: false, notes: 'sqft, lf, ea, cy, ton, etc.' },
      { name: 'unitCost',    aliases: ['unitcost','cost','price','unitprice'],            required: true },
      { name: 'supplier',    aliases: ['supplier','vendor','manufacturer','brand'],       required: false },
      { name: 'sku',         aliases: ['sku','partnumber','itemcode','productcode'],      required: false },
      { name: 'description', aliases: ['description','notes','spec','specification'],     required: false },
    ],
    sampleRows: [
      { name: 'White Oak Hardwood 5"',    category: 'flooring',     unit: 'sqft', unitCost: '12.50', supplier: 'Lumber Liquidators', sku: 'WO5-WH',   description: 'Prefinished, wire-brushed' },
      { name: 'Zellige White 3x6 Tile',   category: 'tile',         unit: 'sqft', unitCost: '18.00', supplier: 'Tile Bar',           sku: 'ZEL-WH36', description: 'Handmade ceramic' },
      { name: 'Shaker Cabinet Door 12x30',category: 'cabinets',     unit: 'ea',   unitCost: '145.00',supplier: 'CliqStudios',        sku: 'SHK-1230', description: 'White painted MDF' },
      { name: 'Quartz Countertop',        category: 'countertops',  unit: 'sqft', unitCost: '85.00', supplier: 'MSI Surfaces',      sku: 'QTZ-WH',   description: 'Calacatta gold' },
    ],
    transform: (row) => ({
      name: col(row,'name','productname','item','material'),
      category: col(row,'category','type','producttype') || 'other',
      unit: col(row,'unit','uom','unitofmeasure') || 'ea',
      unitCost: parseFloat(col(row,'unitcost','cost','price','unitprice').replace(/[^0-9.]/g,'')) || 0,
      supplier: col(row,'supplier','vendor','manufacturer','brand'),
      sku: col(row,'sku','partnumber','itemcode','productcode'),
      description: col(row,'description','notes','spec','specification'),
      isActive: true,
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'employees',
    label: 'Employees / Team',
    icon: Building2,
    color: 'bg-teal-50 border-teal-200 text-teal-700',
    description: 'Import your in-house team members — project managers, supers, office staff.',
    collection: 'contacts',
    why: 'Get your team in the system so you can assign tasks, timesheets, and safety forms.',
    columns: [
      { name: 'name',      aliases: ['name','fullname','employeename'],    required: true },
      { name: 'email',     aliases: ['email','workemail','emailaddress'],   required: false },
      { name: 'phone',     aliases: ['phone','cell','mobile'],              required: false },
      { name: 'title',     aliases: ['title','jobtitle','position','role'], required: false, notes: 'e.g. Project Manager, Superintendent' },
      { name: 'startDate', aliases: ['startdate','hiredate','starteddate'], required: false },
      { name: 'notes',     aliases: ['notes','comments'],                   required: false },
    ],
    sampleRows: [
      { name: 'Jake Morrison',    email: 'jake@skyelinehomes.com',  phone: '(512) 555-0301', title: 'Project Manager',    startDate: '2022-03-15', notes: '' },
      { name: 'Lisa Contreras',   email: 'lisa@skyelinehomes.com',  phone: '(512) 555-0302', title: 'Superintendent',     startDate: '2021-06-01', notes: '' },
    ],
    transform: (row) => ({
      name: col(row,'name','fullname','employeename'),
      email: col(row,'email','workemail','emailaddress'),
      phone: col(row,'phone','cell','mobile'),
      title: col(row,'title','jobtitle','position','role'),
      startDate: col(row,'startdate','hiredate','starteddate'),
      notes: col(row,'notes','comments'),
      role: 'employee',
      isActive: true,
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'cost-breakdown',
    label: 'Cost Breakdown',
    icon: Coins,
    color: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    description: 'Import a project cost breakdown — categories, line items, qty/rate/amount. Each row becomes a budget line item under the named project.',
    collection: 'budgetItems',
    why: 'Lift your spreadsheet cost breakdowns straight into Skyline so Budget vs. Actual works on day one.',
    columns: [
      { name: 'projectName',  aliases: ['projectname','project','job','jobname'],          required: true,  notes: 'Used to look up project ID' },
      { name: 'category',     aliases: ['category','phase','trade','costcategory','section'], required: false, notes: 'e.g. Site Work, Framing, Plumbing' },
      { name: 'description',  aliases: ['description','item','lineitem','desc','scope'],   required: true },
      { name: 'qty',          aliases: ['qty','quantity'],                                 required: false },
      { name: 'unit',         aliases: ['unit','uom','unitofmeasure'],                     required: false },
      { name: 'unitCost',     aliases: ['unitcost','rate','unitprice','price'],            required: false },
      { name: 'amount',       aliases: ['amount','total','linetotal','extendedprice'],     required: false, notes: 'Falls back to qty × unitCost if blank' },
      { name: 'subId',        aliases: ['subid','subcontractor','vendor','assignedto'],    required: false },
      { name: 'notes',        aliases: ['notes','comments'],                                required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', category: 'Site Work',  description: 'Excavation & grading',  qty: '1',   unit: 'ls',   unitCost: '8500',  amount: '8500',  subId: 'JT Digs',         notes: '' },
      { projectName: 'Miller Ranch Home', category: 'Foundation', description: 'Footings + stem walls', qty: '320', unit: 'lf',   unitCost: '11.00', amount: '3520',  subId: 'Jeff Dumas',       notes: '4ft walls' },
      { projectName: 'Miller Ranch Home', category: 'Framing',    description: 'Wall framing labor',    qty: '4250',unit: 'sqft', unitCost: '4.25',  amount: '18062.50', subId: 'Lopez Framing', notes: '' },
    ],
    transform: (row) => {
      const qty = parseFloat(col(row,'qty','quantity').replace(/[^0-9.]/g,'')) || 0;
      const unitCost = parseFloat(col(row,'unitcost','rate','unitprice','price').replace(/[^0-9.]/g,'')) || 0;
      const amountRaw = parseFloat(col(row,'amount','total','linetotal','extendedprice').replace(/[^0-9.]/g,''));
      const amount = !Number.isNaN(amountRaw) && amountRaw > 0 ? amountRaw : qty * unitCost;
      return {
        projectName: col(row,'projectname','project','job','jobname'),
        category: col(row,'category','phase','trade','costcategory','section') || 'Other',
        description: col(row,'description','item','lineitem','desc','scope'),
        qty,
        unit: col(row,'unit','uom','unitofmeasure') || 'ea',
        unitCost,
        amount,
        actual: 0,
        subId: col(row,'subid','subcontractor','vendor','assignedto'),
        notes: col(row,'notes','comments'),
        createdAt: serverTimestamp(),
      };
    },
  },

  {
    id: 'draw-schedule',
    label: 'Draw Schedule',
    icon: DollarSign,
    color: 'bg-green-50 border-green-200 text-green-700',
    description: 'Import a milestone-based draw schedule — % complete, amount, due date per draw.',
    collection: 'draws',
    why: 'Get every project\'s draw plan in so the Finance page tracks releases and the client portal shows what\'s next.',
    columns: [
      { name: 'projectName', aliases: ['projectname','project','job','jobname'],            required: true, notes: 'Used to look up project ID' },
      { name: 'drawNumber',  aliases: ['drawnumber','draw','drawno','number','sequence'],   required: false },
      { name: 'milestone',   aliases: ['milestone','phase','description','event','stage'],  required: true,  notes: 'e.g. Foundation complete, Framing complete' },
      { name: 'percent',     aliases: ['percent','%','percentage','percentcomplete'],        required: false },
      { name: 'amount',      aliases: ['amount','drawamount','total','value'],               required: true },
      { name: 'dueDate',     aliases: ['duedate','expecteddate','targetdate','releasedate'], required: false },
      { name: 'status',      aliases: ['status','state','paymentstatus'],                    required: false, notes: 'pending, requested, approved, paid' },
      { name: 'notes',       aliases: ['notes','comments'],                                  required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', drawNumber: '1', milestone: 'Foundation complete',  percent: '15', amount: '127500', dueDate: '2025-10-15', status: 'paid',     notes: '' },
      { projectName: 'Miller Ranch Home', drawNumber: '2', milestone: 'Framing & dry-in',     percent: '30', amount: '255000', dueDate: '2025-12-15', status: 'pending',  notes: '' },
      { projectName: 'Miller Ranch Home', drawNumber: '3', milestone: 'Mechanicals roughed',  percent: '20', amount: '170000', dueDate: '2026-02-01', status: 'pending',  notes: '' },
    ],
    transform: (row) => ({
      projectName: col(row,'projectname','project','job','jobname'),
      drawNumber: parseInt(col(row,'drawnumber','draw','drawno','number','sequence')) || null,
      milestone: col(row,'milestone','phase','description','event','stage'),
      percent: parseFloat(col(row,'percent','%','percentage','percentcomplete').replace(/[^0-9.]/g,'')) || 0,
      amount: parseFloat(col(row,'amount','drawamount','total','value').replace(/[^0-9.]/g,'')) || 0,
      dueDate: col(row,'duedate','expecteddate','targetdate','releasedate'),
      status: col(row,'status','state','paymentstatus') || 'pending',
      notes: col(row,'notes','comments'),
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'punchlist',
    label: 'Punch List',
    icon: ListChecks,
    color: 'bg-pink-50 border-pink-200 text-pink-700',
    description: 'Import punch list / blue-tape items — room/area, issue, sub assignment, status.',
    collection: 'tasks',
    why: 'Drop your existing punch list spreadsheets in and assign them to subs without re-typing.',
    columns: [
      { name: 'projectName', aliases: ['projectname','project','job','jobname'],          required: true,  notes: 'Used to look up project ID' },
      { name: 'room',        aliases: ['room','area','location','space'],                  required: false },
      { name: 'description', aliases: ['description','issue','item','task','note'],        required: true },
      { name: 'assignedTo',  aliases: ['assignedto','sub','subcontractor','responsible'],  required: false, notes: 'Sub name or trade' },
      { name: 'priority',    aliases: ['priority','urgency'],                              required: false, notes: 'low, medium, high' },
      { name: 'status',      aliases: ['status','state','complete','done'],                required: false, notes: 'open, in_progress, done' },
      { name: 'dueDate',     aliases: ['duedate','due','deadline','targetdate'],           required: false },
      { name: 'notes',       aliases: ['notes','comments'],                                required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', room: 'Kitchen',         description: 'Touch up paint above stove hood',     assignedTo: 'Painter',    priority: 'medium', status: 'open',        dueDate: '2026-06-10', notes: '' },
      { projectName: 'Miller Ranch Home', room: 'Master Bath',     description: 'Re-caulk tub surround',                assignedTo: 'Tile Sub',  priority: 'low',    status: 'open',        dueDate: '2026-06-12', notes: '' },
      { projectName: 'Miller Ranch Home', room: 'Front Entry',     description: 'Adjust door — sticking on threshold',  assignedTo: 'Carpenter', priority: 'high',   status: 'in_progress', dueDate: '2026-06-08', notes: '' },
    ],
    transform: (row) => {
      const rawStatus = col(row,'status','state','complete','done').toLowerCase();
      let status = 'todo';
      if (rawStatus.includes('done') || rawStatus.includes('complete') || rawStatus === 'closed') status = 'done';
      else if (rawStatus.includes('progress') || rawStatus.includes('active')) status = 'in_progress';
      const room = col(row,'room','area','location','space');
      const desc = col(row,'description','issue','item','task','note');
      return {
        name: room ? `[${room}] ${desc}` : desc,
        projectName: col(row,'projectname','project','job','jobname'),
        room,
        description: desc,
        assignedTo: col(row,'assignedto','sub','subcontractor','responsible'),
        priority: col(row,'priority','urgency') || 'medium',
        status,
        dueDate: col(row,'duedate','due','deadline','targetdate'),
        category: 'punchlist',
        notes: col(row,'notes','comments'),
        createdAt: serverTimestamp(),
      };
    },
  },

  {
    id: 'change-orders',
    label: 'Change Orders',
    icon: Replace,
    color: 'bg-orange-50 border-orange-200 text-orange-700',
    description: 'Import historical change orders — scope, cost delta, status, client approval.',
    collection: 'changeOrders',
    why: 'Bring past change orders in so reports reflect every approved CO and your A/R history is correct.',
    columns: [
      { name: 'projectName', aliases: ['projectname','project','job','jobname'],         required: true, notes: 'Used to look up project ID' },
      { name: 'coNumber',    aliases: ['conumber','co#','number','ordernumber'],          required: false },
      { name: 'description', aliases: ['description','scope','reason','title'],           required: true },
      { name: 'amount',      aliases: ['amount','total','cost','delta','price'],          required: true, notes: 'Negative for credits' },
      { name: 'status',      aliases: ['status','state','approvalstatus'],                required: false, notes: 'pending, approved, rejected, completed' },
      { name: 'requestedBy', aliases: ['requestedby','requester','origin'],               required: false, notes: 'client, gc, designer' },
      { name: 'submittedDate', aliases: ['submitteddate','date','requestdate','created'], required: false },
      { name: 'approvedDate',aliases: ['approveddate','signedoff','approveddate'],        required: false },
      { name: 'notes',       aliases: ['notes','comments','justification'],               required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', coNumber: 'CO-001', description: 'Add wine cellar in basement', amount: '18500', status: 'approved', requestedBy: 'client', submittedDate: '2025-11-12', approvedDate: '2025-11-18', notes: '' },
      { projectName: 'Miller Ranch Home', coNumber: 'CO-002', description: 'Upgrade kitchen appliances to Sub-Zero',  amount: '12200', status: 'pending',  requestedBy: 'client', submittedDate: '2026-01-04', approvedDate: '', notes: '' },
    ],
    transform: (row) => ({
      projectName: col(row,'projectname','project','job','jobname'),
      coNumber: col(row,'conumber','co#','number','ordernumber'),
      description: col(row,'description','scope','reason','title'),
      amount: parseFloat(col(row,'amount','total','cost','delta','price').replace(/[^0-9.\-]/g,'')) || 0,
      status: col(row,'status','state','approvalstatus') || 'pending',
      requestedBy: col(row,'requestedby','requester','origin') || 'gc',
      submittedDate: col(row,'submitteddate','date','requestdate','created'),
      approvedDate: col(row,'approveddate','signedoff','approveddate'),
      notes: col(row,'notes','comments','justification'),
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'design-selections',
    label: 'Design Selections',
    icon: Palette,
    color: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
    description: 'Import a selections sheet — room, category, item, supplier, cost, allowance, status.',
    collection: 'designSelections',
    why: 'Bring historical selections in so the Designer Portal sees every spec choice without re-typing.',
    columns: [
      { name: 'projectName', aliases: ['projectname','project','job','jobname'],         required: true,  notes: 'Used to look up project ID' },
      { name: 'room',        aliases: ['room','space','area','location'],                 required: false, notes: 'kitchen, bathroom, etc.' },
      { name: 'category',    aliases: ['category','type','selectiontype'],                required: false, notes: 'tile, flooring, fixtures, cabinets' },
      { name: 'item',        aliases: ['item','description','selection','name','product'],required: true },
      { name: 'supplier',    aliases: ['supplier','vendor','brand','manufacturer'],       required: false },
      { name: 'sku',         aliases: ['sku','partnumber','model'],                       required: false },
      { name: 'cost',        aliases: ['cost','price','total','amount'],                   required: false },
      { name: 'allowance',   aliases: ['allowance','budget','allotment'],                  required: false },
      { name: 'status',      aliases: ['status','approvalstatus','clientapproval'],        required: false, notes: 'proposed, submitted, approved, revision' },
      { name: 'notes',       aliases: ['notes','comments','spec'],                         required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', room: 'Kitchen',     category: 'tile',        item: 'Zellige White 3x6 Backsplash', supplier: 'Tile Bar', sku: 'ZEL-WH36', cost: '2160',  allowance: '2500', status: 'approved', notes: '120 sqft' },
      { projectName: 'Miller Ranch Home', room: 'Master Bath', category: 'fixtures',    item: 'Brizo Litze Tub Faucet',       supplier: 'Brizo',    sku: 'T67435-PG', cost: '1450',  allowance: '1200', status: 'submitted', notes: 'Polished gold' },
      { projectName: 'Miller Ranch Home', room: 'Living Room', category: 'flooring',    item: 'White Oak 5" Wide Plank',      supplier: 'LL Flooring', sku: 'WO5-WH', cost: '12500', allowance: '12000', status: 'approved', notes: '' },
    ],
    transform: (row) => ({
      projectName: col(row,'projectname','project','job','jobname'),
      room: col(row,'room','space','area','location'),
      category: col(row,'category','type','selectiontype') || 'other',
      item: col(row,'item','description','selection','name','product'),
      supplier: col(row,'supplier','vendor','brand','manufacturer'),
      sku: col(row,'sku','partnumber','model'),
      cost: parseFloat(col(row,'cost','price','total','amount').replace(/[^0-9.]/g,'')) || 0,
      allowance: parseFloat(col(row,'allowance','budget','allotment').replace(/[^0-9.]/g,'')) || 0,
      clientApprovalStatus: col(row,'status','approvalstatus','clientapproval') || 'proposed',
      notes: col(row,'notes','comments','spec'),
      locked: false,
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'jobsite-checklist',
    label: 'Jobsite Inspection',
    icon: ClipboardList,
    color: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    description: 'Import jobsite inspection checklists — daily walks, supervisor logs, safety checks.',
    collection: 'safetyForms',
    why: 'Bring historical site inspections in so your safety record is complete and reportable.',
    columns: [
      { name: 'projectName',  aliases: ['projectname','project','job','jobname'],          required: true },
      { name: 'date',         aliases: ['date','inspectiondate','day'],                    required: false },
      { name: 'inspectedBy',  aliases: ['inspectedby','supervisor','superintendent','by'], required: false },
      { name: 'item',         aliases: ['item','check','description','task'],              required: true,  notes: 'The thing being checked' },
      { name: 'status',       aliases: ['status','result','passed','complete'],            required: false, notes: 'pass, fail, n/a' },
      { name: 'notes',        aliases: ['notes','comments','observation','details'],       required: false },
      { name: 'photoUrl',     aliases: ['photo','image','photourl','imageurl'],            required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', date: '2025-11-04', inspectedBy: 'Lisa Contreras', item: 'PPE — hard hats worn',     status: 'pass', notes: '',                    photoUrl: '' },
      { projectName: 'Miller Ranch Home', date: '2025-11-04', inspectedBy: 'Lisa Contreras', item: 'Site fencing intact',       status: 'fail', notes: 'NW corner damaged', photoUrl: '' },
      { projectName: 'Miller Ranch Home', date: '2025-11-04', inspectedBy: 'Lisa Contreras', item: 'Fire extinguisher present', status: 'pass', notes: '',                    photoUrl: '' },
    ],
    transform: (row) => {
      const rawStatus = col(row,'status','result','passed','complete').toLowerCase();
      let status = 'open';
      if (rawStatus === 'pass' || rawStatus === 'passed' || rawStatus === 'ok' || rawStatus === 'complete' || rawStatus === 'completed') status = 'completed';
      else if (rawStatus === 'fail' || rawStatus === 'failed' || rawStatus === 'requires_action' || rawStatus === 'action') status = 'requires_action';
      return {
        projectName: col(row,'projectname','project','job','jobname'),
        formType: 'daily_inspection',
        date: col(row,'date','inspectiondate','day'),
        inspectedBy: col(row,'inspectedby','supervisor','superintendent','by'),
        item: col(row,'item','check','description','task'),
        status,
        notes: col(row,'notes','comments','observation','details'),
        photoUrl: col(row,'photo','image','photourl','imageurl'),
        createdAt: serverTimestamp(),
      };
    },
  },

  {
    id: 'bid-history',
    label: 'Bid History',
    icon: Award,
    color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    description: 'Import historical sub bids — trade, vendor, amount, status — for benchmarking.',
    collection: 'bids',
    why: 'Bring in past bids so you can compare new quotes to historical pricing per trade.',
    columns: [
      { name: 'projectName', aliases: ['projectname','project','job','jobname'],         required: false },
      { name: 'trade',       aliases: ['trade','tradetype','category','scope'],           required: true, notes: 'Framing, Plumbing, Electrical, etc.' },
      { name: 'vendor',      aliases: ['vendor','sub','subcontractor','company','bidder'],required: true },
      { name: 'contactName', aliases: ['contactname','contact','rep','salesperson'],      required: false },
      { name: 'amount',      aliases: ['amount','price','total','bid','quote'],           required: true },
      { name: 'status',      aliases: ['status','state','outcome'],                       required: false, notes: 'received, awarded, declined, expired' },
      { name: 'submittedDate', aliases: ['submitteddate','date','received','quotedate'],  required: false },
      { name: 'expiresDate', aliases: ['expiresdate','expiration','validuntil'],          required: false },
      { name: 'notes',       aliases: ['notes','comments','scope','inclusions'],          required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', trade: 'Framing',    vendor: 'Lopez Framing',    contactName: 'Mike Lopez',  amount: '85000',  status: 'awarded',  submittedDate: '2025-08-22', expiresDate: '2025-09-22', notes: 'Full frame package' },
      { projectName: 'Miller Ranch Home', trade: 'Framing',    vendor: 'Hernandez Framing', contactName: 'Joe Hernandez', amount: '92000', status: 'declined', submittedDate: '2025-08-25', expiresDate: '2025-09-25', notes: '' },
      { projectName: 'Miller Ranch Home', trade: 'Plumbing',   vendor: 'AquaPro',          contactName: 'Karen R.',     amount: '38000',  status: 'received', submittedDate: '2025-09-02', expiresDate: '2025-10-02', notes: '' },
    ],
    transform: (row) => ({
      projectName: col(row,'projectname','project','job','jobname'),
      trade: col(row,'trade','tradetype','category','scope'),
      vendor: col(row,'vendor','sub','subcontractor','company','bidder'),
      contactName: col(row,'contactname','contact','rep','salesperson'),
      amount: parseFloat(col(row,'amount','price','total','bid','quote').replace(/[^0-9.]/g,'')) || 0,
      status: col(row,'status','state','outcome') || 'received',
      submittedDate: col(row,'submitteddate','date','received','quotedate'),
      expiresDate: col(row,'expiresdate','expiration','validuntil'),
      notes: col(row,'notes','comments','scope','inclusions'),
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'expenses',
    label: 'Expenses / Bills',
    icon: Receipt,
    color: 'bg-red-50 border-red-200 text-red-700',
    description: 'Import payable bills and expenses — vendor, amount, due date, project allocation.',
    collection: 'financials',
    why: 'Bring historical A/P in so the Financials page shows accurate cash position and outstanding bills.',
    columns: [
      { name: 'projectName',  aliases: ['projectname','project','job','jobname'],          required: false },
      { name: 'vendor',       aliases: ['vendor','supplier','payee','company','billto'],   required: true },
      { name: 'description',  aliases: ['description','memo','for','reason','item'],       required: false },
      { name: 'category',     aliases: ['category','expensetype','accounttype','glcode'],  required: false, notes: 'materials, labor, equipment, fees' },
      { name: 'amount',       aliases: ['amount','total','billamount','cost'],             required: true },
      { name: 'invoiceNumber',aliases: ['invoicenumber','billnumber','number','referenceid'], required: false },
      { name: 'billDate',     aliases: ['billdate','date','invoicedate','received'],       required: false },
      { name: 'dueDate',      aliases: ['duedate','due','paymentdue'],                      required: false },
      { name: 'status',       aliases: ['status','paymentstatus','paid'],                   required: false, notes: 'unpaid, pending, paid' },
      { name: 'notes',        aliases: ['notes','comments'],                                required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', vendor: 'BuildRight LLC',   description: 'Lumber package — framing',     category: 'materials', amount: '34200', invoiceNumber: 'BR-44521', billDate: '2025-09-23', dueDate: '2025-10-23', status: 'paid', notes: '' },
      { projectName: 'Miller Ranch Home', vendor: 'Vega Electrical',  description: 'Rough-in electrical',           category: 'labor',     amount: '18500', invoiceNumber: 'VE-1102',  billDate: '2025-10-18', dueDate: '2025-11-18', status: 'unpaid', notes: '' },
      { projectName: 'Miller Ranch Home', vendor: 'City of Austin',   description: 'Building permit fees',          category: 'fees',      amount: '4250',  invoiceNumber: '',         billDate: '2025-08-15', dueDate: '2025-08-15', status: 'paid', notes: '' },
    ],
    transform: (row) => ({
      projectName: col(row,'projectname','project','job','jobname'),
      type: 'bill',
      vendor: col(row,'vendor','supplier','payee','company','billto'),
      description: col(row,'description','memo','for','reason','item'),
      category: col(row,'category','expensetype','accounttype','glcode') || 'materials',
      amount: parseFloat(col(row,'amount','total','billamount','cost').replace(/[^0-9.]/g,'')) || 0,
      invoiceNumber: col(row,'invoicenumber','billnumber','number','referenceid'),
      billDate: col(row,'billdate','date','invoicedate','received'),
      dueDate: col(row,'duedate','due','paymentdue'),
      status: col(row,'status','paymentstatus','paid') || 'unpaid',
      notes: col(row,'notes','comments'),
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'permits',
    label: 'Permits & Inspections',
    icon: ScrollText,
    color: 'bg-slate-50 border-slate-200 text-slate-700',
    description: 'Import permit log — type, number, jurisdiction, dates, inspector, status.',
    collection: 'permits',
    why: 'Centralize permit tracking so nothing falls through the cracks at inspection time.',
    columns: [
      { name: 'projectName',  aliases: ['projectname','project','job','jobname'],         required: true },
      { name: 'permitType',   aliases: ['permittype','type','category','permitcategory'], required: true,  notes: 'Building, Electrical, Plumbing, Mechanical' },
      { name: 'permitNumber', aliases: ['permitnumber','number','permit#','permitid'],    required: false },
      { name: 'jurisdiction', aliases: ['jurisdiction','city','county','authority'],      required: false },
      { name: 'inspector',    aliases: ['inspector','inspectorname','inspectorcontact'],  required: false },
      { name: 'submittedDate',aliases: ['submitteddate','submitted','applieddate'],       required: false },
      { name: 'approvedDate', aliases: ['approveddate','approved','issued','issueddate'], required: false },
      { name: 'inspectionDate', aliases: ['inspectiondate','scheduleddate','inspectiondate'], required: false },
      { name: 'status',       aliases: ['status','state'],                                 required: false, notes: 'submitted, approved, denied, scheduled, passed, failed' },
      { name: 'notes',        aliases: ['notes','comments'],                               required: false },
    ],
    sampleRows: [
      { projectName: 'Miller Ranch Home', permitType: 'Building',    permitNumber: 'BLD-2025-1183', jurisdiction: 'City of Austin',    inspector: '',           submittedDate: '2025-08-01', approvedDate: '2025-08-22', inspectionDate: '', status: 'approved', notes: '' },
      { projectName: 'Miller Ranch Home', permitType: 'Electrical',  permitNumber: 'ELC-2025-0942', jurisdiction: 'City of Austin',    inspector: 'Mark Reyes', submittedDate: '2025-09-10', approvedDate: '2025-09-12', inspectionDate: '2025-10-22', status: 'passed',   notes: 'Rough-in inspection' },
      { projectName: 'Miller Ranch Home', permitType: 'Plumbing',    permitNumber: 'PLM-2025-0512', jurisdiction: 'City of Austin',    inspector: '',           submittedDate: '2025-09-10', approvedDate: '2025-09-13', inspectionDate: '', status: 'scheduled', notes: 'Awaiting rough-in' },
    ],
    transform: (row) => ({
      projectName: col(row,'projectname','project','job','jobname'),
      permitType: col(row,'permittype','type','category','permitcategory'),
      permitNumber: col(row,'permitnumber','number','permit#','permitid'),
      jurisdiction: col(row,'jurisdiction','city','county','authority'),
      inspector: col(row,'inspector','inspectorname','inspectorcontact'),
      submittedDate: col(row,'submitteddate','submitted','applieddate'),
      approvedDate: col(row,'approveddate','approved','issued','issueddate'),
      inspectionDate: col(row,'inspectiondate','scheduleddate','inspectiondate'),
      status: col(row,'status','state') || 'submitted',
      notes: col(row,'notes','comments'),
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'lots',
    label: 'Lot / Land Inventory',
    icon: Map,
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    description: 'Import available lots — address, purchase price, utilities, assigned project.',
    collection: 'lots',
    why: 'Track land inventory and utility status separately from active jobs.',
    columns: [
      { name: 'name',          aliases: ['name','lotname','identifier'],                    required: true,  notes: 'e.g. "Lot 12 — Mountain View Subdivision"' },
      { name: 'address',       aliases: ['address','location','siteaddress'],               required: false },
      { name: 'city',          aliases: ['city'],                                            required: false },
      { name: 'state',         aliases: ['state','st'],                                      required: false },
      { name: 'zip',           aliases: ['zip','zipcode','postal'],                          required: false },
      { name: 'parcelNumber',  aliases: ['parcelnumber','parcel','apn'],                     required: false },
      { name: 'sizeAcres',     aliases: ['sizeacres','acres','lotsize'],                     required: false },
      { name: 'purchasePrice', aliases: ['purchaseprice','price','cost','acquisition'],      required: false },
      { name: 'utilities',     aliases: ['utilities','utility'],                              required: false, notes: 'Free-text — water, sewer, gas, electric status' },
      { name: 'status',        aliases: ['status','state'],                                   required: false, notes: 'available, under-contract, sold, building' },
      { name: 'assignedProject', aliases: ['assignedproject','project','job'],                required: false },
      { name: 'notes',         aliases: ['notes','comments'],                                 required: false },
    ],
    sampleRows: [
      { name: 'Lot 12 — Mountain View',    address: '123 Mountain View Dr', city: 'American Fork', state: 'UT', zip: '84003', parcelNumber: '12-345-0012', sizeAcres: '0.34', purchasePrice: '210000', utilities: 'Water + sewer at street; power 50 ft',  status: 'available',   assignedProject: '',           notes: '' },
      { name: 'Lot 18 — Mountain View',    address: '188 Mountain View Dr', city: 'American Fork', state: 'UT', zip: '84003', parcelNumber: '12-345-0018', sizeAcres: '0.41', purchasePrice: '235000', utilities: 'Stubbed: water/sewer/gas',           status: 'building',    assignedProject: 'Miller Ranch Home', notes: '' },
    ],
    transform: (row) => ({
      name: col(row,'name','lotname','identifier'),
      address: col(row,'address','location','siteaddress'),
      city: col(row,'city'),
      state: col(row,'state','st'),
      zip: col(row,'zip','zipcode','postal'),
      parcelNumber: col(row,'parcelnumber','parcel','apn'),
      sizeAcres: parseFloat(col(row,'sizeacres','acres','lotsize').replace(/[^0-9.]/g,'')) || 0,
      purchasePrice: parseFloat(col(row,'purchaseprice','price','cost','acquisition').replace(/[^0-9.]/g,'')) || 0,
      utilities: col(row,'utilities','utility'),
      status: col(row,'status','state') || 'available',
      assignedProject: col(row,'assignedproject','project','job'),
      notes: col(row,'notes','comments'),
      createdAt: serverTimestamp(),
    }),
  },

  {
    id: 'invoices',
    label: 'Invoice History',
    icon: DollarSign,
    color: 'bg-rose-50 border-rose-200 text-rose-700',
    description: 'Import past invoices to seed your financial history.',
    collection: 'invoices',
    why: 'Bring in historical A/R so reports reflect your real collected and outstanding totals.',
    columns: [
      { name: 'invoiceNumber', aliases: ['invoicenumber','invoiceno','invoice#','number'],    required: false },
      { name: 'clientName',    aliases: ['clientname','client','billto','customer'],          required: false },
      { name: 'projectName',   aliases: ['projectname','project','job'],                      required: false },
      { name: 'amount',        aliases: ['amount','total','invoiceamount','balance'],          required: true },
      { name: 'status',        aliases: ['status','paymentstatus'],                            required: false, notes: 'draft, sent, paid, overdue' },
      { name: 'issueDate',     aliases: ['issuedate','invoicedate','date'],                   required: false },
      { name: 'dueDate',       aliases: ['duedate','paymentdue','due'],                       required: false },
      { name: 'description',   aliases: ['description','memo','notes'],                       required: false },
    ],
    sampleRows: [
      { invoiceNumber: 'INV-001', clientName: 'John & Sarah Miller', projectName: 'Miller Ranch Home', amount: '125000', status: 'paid',    issueDate: '2025-10-01', dueDate: '2025-10-15', description: 'Draw 1 — Foundation complete' },
      { invoiceNumber: 'INV-002', clientName: 'John & Sarah Miller', projectName: 'Miller Ranch Home', amount: '200000', status: 'sent',    issueDate: '2025-12-01', dueDate: '2025-12-15', description: 'Draw 2 — Framing complete' },
    ],
    transform: (row) => ({
      invoiceNumber: col(row,'invoicenumber','invoiceno','invoice#','number'),
      clientName: col(row,'clientname','client','billto','customer'),
      projectName: col(row,'projectname','project','job'),
      amount: parseFloat(col(row,'amount','total','invoiceamount','balance').replace(/[^0-9.]/g,'')) || 0,
      status: col(row,'status','paymentstatus') || 'sent',
      issueDate: col(row,'issuedate','invoicedate','date'),
      dueDate: col(row,'duedate','paymentdue','due'),
      description: col(row,'description','memo','notes'),
      createdAt: serverTimestamp(),
    }),
  },
];

// ─── Other import suggestions (not yet implemented) ──────────────────────────
const FUTURE_IMPORTS = [
  { icon: FileText,  label: 'Scope of Work Templates',  notes: 'Pre-fill your scopes for foundation, framing, MEP, finishes, etc. into the Templates library.' },
  { icon: Package,   label: 'Material Take-offs',        notes: 'Quantity surveys per project — separate from cost breakdowns.' },
  { icon: Wrench,    label: 'Tool / Equipment Log',      notes: 'Track on-site equipment, owner, and rental return dates.' },
  { icon: Users,     label: 'Warranty Claims',           notes: 'Post-completion warranty issues — sub assignment, resolution, cost.' },
];

// ─── Download sample CSV ─────────────────────────────────────────────────────
function downloadCSV(template: ImportTemplate) {
  const headers = template.columns.map(c => c.name).join(',');
  const rows = template.sampleRows.map(r => template.columns.map(c => `"${r[c.name] ?? ''}"`).join(','));
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `skyeline-${template.id}-template.csv`;
  a.click();
}

// ─── StageMappingDialog ──────────────────────────────────────────────────────
// Shown when a CSV being imported into /clients contains stage values that
// don't map cleanly to a canonical pipeline key. Forces the user to pick a
// canonical key for each unknown value before the import is allowed to run.
function StageMappingDialog({
  open,
  unknownStages,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  unknownStages: { value: string; count: number }[];
  onCancel: () => void;
  onConfirm: (mapping: Record<string, CanonicalStage>) => void;
}) {
  // Default each unknown to 'new_lead' so the user can one-click confirm if
  // that's what they want. They still have to actively choose to proceed.
  const [mapping, setMapping] = useState<Record<string, CanonicalStage>>({});
  const allMapped = unknownStages.every(s => !!mapping[s.value]);

  // Reset mapping when the dialog opens with a fresh set of unknowns.
  useEffect(() => {
    if (open) {
      const init: Record<string, CanonicalStage> = {};
      unknownStages.forEach(s => { init[s.value] = 'new_lead'; });
      setMapping(init);
    }
  }, [open, unknownStages]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Map unknown stage values</DialogTitle>
          <DialogDescription>
            Your CSV contains stage values that don't match a Sales pipeline column.
            Choose where each one should land — otherwise those rows would be
            invisible on the board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {unknownStages.map(s => (
            <div key={s.value} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm text-gray-800 truncate">{s.value || '(blank)'}</div>
                <div className="text-xs text-gray-400">{s.count} row{s.count === 1 ? '' : 's'}</div>
              </div>
              <Select
                value={mapping[s.value] ?? 'new_lead'}
                onValueChange={(v: CanonicalStage) => setMapping(m => ({ ...m, [s.value]: v }))}
              >
                <SelectTrigger className="w-52 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANONICAL_STAGES.map(k => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel import</Button>
          <Button
            disabled={!allMapped}
            onClick={() => onConfirm(mapping)}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
          >
            Apply mapping &amp; import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ImportCard ──────────────────────────────────────────────────────────────
function ImportCard({ template }: { template: ImportTemplate }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [fetchingSheet, setFetchingSheet] = useState(false);
  // Stage-mapping prompt state — used only when template has a stage column
  // (currently the 'clients' template) and the CSV contains values that
  // don't auto-map to a canonical pipeline key.
  const [stagePrompt, setStagePrompt] = useState<{ value: string; count: number }[] | null>(null);
  const Icon = template.icon;

  // Helper — find the actual CSV column header that maps to "stage" given
  // the template's alias list. Returns null if no stage column is present.
  const stageColumnKey = (rows: Record<string, string>[]): string | null => {
    if (rows.length === 0) return null;
    const stageCol = template.columns.find(c => c.name === 'stage');
    if (!stageCol) return null;
    const aliases = stageCol.aliases.map(a => a.toLowerCase().replace(/[\s_-]/g, ''));
    return Object.keys(rows[0]).find(h => aliases.includes(h.toLowerCase().replace(/[\s_-]/g, ''))) ?? null;
  };

  // Returns the list of distinct stage values in the preview that don't
  // map to a canonical pipeline key. Empty values are ignored — those
  // fall back to 'new_lead' in the transform.
  const collectUnknownStages = (rows: Record<string, string>[]): { value: string; count: number }[] => {
    const key = stageColumnKey(rows);
    if (!key) return [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const raw = (row[key] ?? '').toString().trim();
      if (!raw) continue;
      if (normalizeStage(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const parsed = parseCSV(ev.target?.result as string);
      if (parsed.rows.length === 0) {
        toast({ title: 'No data found in file', variant: 'destructive' });
        return;
      }
      setPreview(parsed);
      setDone(0);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSheetFetch = async () => {
    if (!sheetUrl.trim()) {
      toast({ title: 'Paste a Google Sheets URL first', variant: 'destructive' });
      return;
    }
    setFetchingSheet(true);
    try {
      const csv = await fetchSheetAsCsv(sheetUrl.trim());
      const parsed = parseCSV(csv);
      if (parsed.rows.length === 0) {
        toast({ title: 'No data rows found in sheet', variant: 'destructive' });
        return;
      }
      setPreview(parsed);
      setDone(0);
      toast({ title: `Loaded ${parsed.rows.length} rows from sheet` });
    } catch (err: any) {
      toast({ title: 'Sheet fetch failed', description: err.message, variant: 'destructive' });
    } finally {
      setFetchingSheet(false);
    }
  };

  // Runs the actual Firestore batch writes. Optionally applies a
  // stage-value override map (raw CSV value → canonical pipeline key)
  // by rewriting the stage column on each row before transform.
  const runImport = async (stageOverrides?: Record<string, CanonicalStage>) => {
    if (!preview) return;
    setImporting(true);
    try {
      const stageKey = stageOverrides ? stageColumnKey(preview.rows) : null;
      const BATCH_SIZE = 450;
      let count = 0;
      for (let i = 0; i < preview.rows.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        preview.rows.slice(i, i + BATCH_SIZE).forEach(row => {
          // Apply any user-supplied stage override into the raw row before
          // transform so the canonical key is what gets persisted.
          if (stageOverrides && stageKey) {
            const raw = (row[stageKey] ?? '').toString().trim();
            if (raw && stageOverrides[raw]) {
              row = { ...row, [stageKey]: stageOverrides[raw] };
            }
          }
          const data = template.transform(row);
          const ref = doc(collection(db, template.collection));
          batch.set(ref, data);
        });
        await batch.commit();
        count += Math.min(BATCH_SIZE, preview.rows.length - i);
        setDone(count);
      }
      toast({ title: `Imported ${count} ${template.label} records` });
      setPreview(null);
    } catch (err: any) {
      toast({ title: `Import failed: ${err.message}`, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    // For templates that carry a stage column, check the CSV for values
    // that don't map cleanly to a canonical pipeline key. If any exist,
    // prompt the user before writing — otherwise rows would be invisible
    // on the pipeline board.
    const unknown = collectUnknownStages(preview.rows);
    if (unknown.length > 0) {
      setStagePrompt(unknown);
      return;
    }
    await runImport();
  };

  return (
    <Card className={`border-2 ${template.color.split(' ')[1]} transition-shadow hover:shadow-md`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${template.color.split(' ')[0]}`}>
              <Icon className={`w-5 h-5 ${template.color.split(' ')[2]}`} />
            </div>
            <div>
              <CardTitle className="text-base">{template.label}</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">→ Firestore <code className="text-xs bg-gray-100 px-1 rounded">/{template.collection}</code></p>
            </div>
          </div>
          {done > 0 && (
            <Badge className="bg-green-100 text-green-700 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {done} imported
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">{template.description}</p>

        {/* Column reference — collapsible */}
        <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600" onClick={() => setExpanded(e => !e)}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Expected columns
        </button>
        {expanded && (
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
            {template.columns.map(c => (
              <div key={c.name} className="flex items-start gap-2">
                <code className={`font-mono px-1.5 py-0.5 rounded ${c.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{c.name}</code>
                {c.notes && <span className="text-gray-400 mt-0.5">{c.notes}</span>}
                {c.required && <span className="text-red-400 mt-0.5">required</span>}
              </div>
            ))}
            <p className="text-gray-400 mt-2">Column names are case-insensitive; spaces/dashes/underscores ignored.</p>
          </div>
        )}

        {/* Preview table */}
        {preview && (
          <div className="border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between bg-amber-50 px-3 py-2 border-b">
              <span className="text-xs font-medium text-amber-800">{preview.rows.length} rows ready to import</span>
              <button onClick={() => setPreview(null)}><X className="w-4 h-4 text-amber-500" /></button>
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="text-xs w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>{preview.headers.map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t">
                      {preview.headers.map(h => (
                        <td key={h} className="px-2 py-1.5 text-gray-700 whitespace-nowrap max-w-[160px] truncate">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                  {preview.rows.length > 5 && (
                    <tr className="border-t bg-gray-50">
                      <td colSpan={preview.headers.length} className="px-2 py-1.5 text-center text-gray-400">+{preview.rows.length - 5} more rows</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Google Sheets URL paste */}
        {!preview && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                placeholder="Paste Google Sheets URL…"
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                className="h-8 pl-8 text-xs"
                onKeyDown={e => { if (e.key === 'Enter') handleSheetFetch(); }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={handleSheetFetch}
              disabled={fetchingSheet || !sheetUrl.trim()}
            >
              {fetchingSheet ? 'Loading…' : 'Load Sheet'}
            </Button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => downloadCSV(template)}>
            <Download className="w-3.5 h-3.5" /> Sample CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          {!preview ? (
            <Button size="sm" className="gap-1.5 text-xs text-white" style={{ backgroundColor: '#C9A96E' }} onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" /> Upload CSV
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5 text-xs text-white" style={{ backgroundColor: '#22c55e' }} onClick={handleImport} disabled={importing}>
              {importing ? `Importing… (${done})` : `Import ${preview.rows.length} rows`}
            </Button>
          )}
        </div>
      </CardContent>

      {/* Stage-mapping prompt — only fires when CSV has unmapped stages */}
      <StageMappingDialog
        open={!!stagePrompt}
        unknownStages={stagePrompt ?? []}
        onCancel={() => setStagePrompt(null)}
        onConfirm={async (mapping) => {
          setStagePrompt(null);
          await runImport(mapping);
        }}
      />
    </Card>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ImportCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);

  // Access gate — importing client/lead records modifies CRM data that
  // other roles depend on. Only admin and gc users can use this page.
  // The Firestore rules already enforce this server-side (allow create
  // on /clients gated by isGC()), this UI-level gate just gives a clean
  // message instead of letting writes silently fail at commit time.
  const role = (user?.role ?? '').toLowerCase();
  const canImport = role === 'admin' || role === 'gc';
  if (!canImport) {
    return (
      <AppLayout>
        <div className="p-6 max-w-2xl mx-auto">
          <Card className="border-2 border-amber-200 bg-amber-50/40">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600" />
                <CardTitle className="text-base">Admin or staff access required</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-amber-900">
              <p>
                The Import Center can create, update, and delete client and lead
                records. To use it your account needs the <strong>admin</strong> or
                <strong> gc</strong> role.
              </p>
              <p className="text-amber-800">
                Your current role: <code className="bg-amber-100 px-1 rounded">{user?.role || 'none'}</code>.
                Ask an admin in your organization to upgrade your role from User
                Management, then reload this page.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const importSkyelineSubs = async () => {
    if (!confirm('Import the full Skyeline subcontractor list into Contacts? Duplicates by company name are skipped.')) return;
    setSeeding(true);
    try {
      const { seedSkyelineSubcontractors } = await import('@/lib/skyelineSubcontractors');
      const result = await seedSkyelineSubcontractors(user?.email || '');
      toast({
        title: 'Skyeline subs imported',
        description: `${result.added} added · ${result.skipped} unchanged · ${result.mergedTrades} extra trades merged · ${result.tradesAdded} new trades · ${result.errors} errors`,
      });
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  // Jack pipeline import — pulls Tyler's pre-migration leads, contacts,
  // and estimates straight in. Idempotent (matches by name/email).
  const [importingJack, setImportingJack] = useState(false);
  const importJack = async () => {
    if (!confirm('Import Tyler\'s Jack pipeline (12 contacts, 6 leads, 2 estimates)? Idempotent — re-running is safe.')) return;
    setImportingJack(true);
    try {
      const { importJackPipeline } = await import('@/lib/jackPipeline/seed');
      const r = await importJackPipeline(user?.email || 'unknown');
      toast({
        title: 'Jack pipeline imported',
        description:
          `Contacts: +${r.contacts.added} (${r.contacts.skipped} skipped) · ` +
          `Leads: +${r.leads.added} (${r.leads.skipped} skipped) · ` +
          `Estimates: +${r.estimates.added} (${r.estimates.skipped} skipped)`,
      });
    } catch (e: any) {
      toast({ title: 'Jack import failed', description: e?.message || 'Unknown', variant: 'destructive' });
    } finally {
      setImportingJack(false);
    }
  };

  // Backfill: touch every contact so the ensureContactAuthAccount
  // Firestore trigger runs, creating Auth accounts for the ones that
  // don't have one yet. Idempotent — already-linked contacts get an
  // updatedAt bump and otherwise no-op.
  const [linking, setLinking] = useState(false);
  const linkAllContacts = async () => {
    if (!confirm('Create Firebase Auth accounts for every contact in the database that has an email but no login? Existing accounts are left alone. ~one quick write per contact.')) return;
    setLinking(true);
    try {
      const { collection, getDocs, query, writeBatch, doc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const snap = await getDocs(query(collection(db, 'contacts')));
      const toTouch = snap.docs.filter(d => {
        const data = d.data() as any;
        return typeof data.email === 'string' && data.email.trim() && !data.linkedUserId && data.isActive !== false;
      });
      if (toTouch.length === 0) {
        toast({ title: 'Nothing to do', description: 'All contacts with emails already have logins.' });
        return;
      }
      // Batched writes: Firestore allows 500 ops per batch.
      let written = 0;
      for (let i = 0; i < toTouch.length; i += 400) {
        const slice = toTouch.slice(i, i + 400);
        const batch = writeBatch(db);
        slice.forEach(d => batch.update(doc(db, 'contacts', d.id), {
          updatedAt: serverTimestamp(),
          touchedForAuthSync: serverTimestamp(),
        }));
        await batch.commit();
        written += slice.length;
      }
      toast({
        title: 'Auth backfill queued',
        description: `${written} contact${written === 1 ? '' : 's'} touched. The server is creating Auth accounts now (usually finishes in 1–2 minutes).`,
      });
    } catch (e: any) {
      toast({ title: 'Backfill failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setLinking(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <FileSpreadsheet className="w-7 h-7 text-[#C9A96E]" />
            <h1 className="text-2xl font-bold text-gray-900">Import Center</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Paste a <strong>Google Sheets URL</strong> (shared "Anyone with the link") or upload a CSV from Excel, Buildertrend, Smartsheet, or any other tool.
            Columns are matched by name automatically — download a sample to see the expected format.
          </p>
        </div>

        {/* Pre-packaged Skyeline data — one-click seeds with no CSV needed. */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Pre-packaged Skyeline Data</h2>
          <p className="text-sm text-gray-400 mb-4">Built-in data sets hand-curated from Tyler's office docs. One click — no file required.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-2 border-orange-200 bg-orange-50/30">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HardHat className="w-5 h-5 text-orange-600" />
                    <CardTitle className="text-base">Skyeline Subcontractor List</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">~{SKYELINE_SUBCONTRACTOR_COUNT} contacts</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-600">
                  Hand-extracted from the office Subcontractor List PDF. Subs and vendors across every trade with company, contact, email, phone, and address where known. Compliance fields (W9, license, insurance) are not included.
                </p>
                <p className="text-xs text-gray-500">
                  Also populates the <strong>Trades</strong> list with every trade in the PDF (Appliances, Brick, Cabinets…). Idempotent — existing contacts and trades are skipped, so it's safe to re-run.
                </p>
                <Button
                  onClick={importSkyelineSubs}
                  disabled={seeding}
                  className="w-full"
                  style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                >
                  <HardHat className="w-4 h-4 mr-2" />
                  {seeding ? 'Importing…' : 'Import Skyeline Subs'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-violet-200 bg-violet-50/30">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-violet-600" />
                    <CardTitle className="text-base">Migrate from Jack</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">12 + 6 + 2</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-600">
                  Pulls your Jack pipeline directly into Skyeline OS — 12 client contacts, 6 leads in their CRM stages (~$6.9M pipeline), and 2 estimates in Pending.
                </p>
                <p className="text-xs text-gray-500">
                  Hand-extracted from the Jack screenshots taken May 12. Idempotent — re-running skips anything already in the database.
                </p>
                <Button
                  onClick={importJack}
                  disabled={importingJack}
                  className="w-full"
                  style={{ backgroundColor: '#7c3aed', color: 'white' }}
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  {importingJack ? 'Importing…' : 'Import Jack Pipeline'}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-base">Create logins for all contacts</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-gray-600">
                  Creates a Firebase Auth account for every contact in the database that has an email but no login yet. Once an account exists, that contact can use the <strong>Forgot password</strong> link on the sign-in page to set their initial password.
                </p>
                <p className="text-xs text-gray-500">
                  Idempotent — contacts already linked to a user are skipped. Backed by a Firestore trigger so the actual Auth + user-doc creation happens server-side.
                </p>
                <Button
                  onClick={linkAllContacts}
                  disabled={linking}
                  className="w-full"
                  variant="outline"
                >
                  <Users className="w-4 h-4 mr-2" />
                  {linking ? 'Backfilling…' : 'Create logins for all contacts'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Import templates grid */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">CSV / Google Sheets Imports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TEMPLATES.map(t => <ImportCard key={t.id} template={t} />)}
          </div>
        </div>

        {/* What else you can import */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Suggested Imports for Custom Home Builders</h2>
          <p className="text-sm text-gray-400 mb-4">These data types are common in custom home building operations. Request an import template for any of them.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FUTURE_IMPORTS.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <p className="text-sm font-medium text-gray-700">{f.label}</p>
                  </div>
                  <p className="text-xs text-gray-400 leading-snug">{f.notes}</p>
                  <Badge variant="outline" className="text-xs text-gray-400">Coming soon</Badge>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5 text-sm text-amber-800">
              <p className="font-semibold">Import tips</p>
              <ul className="space-y-1 text-amber-700 list-disc list-inside">
                <li>Column headers are matched case-insensitively — <code className="bg-amber-100 px-1 rounded text-xs">Task Name</code>, <code className="bg-amber-100 px-1 rounded text-xs">task_name</code>, and <code className="bg-amber-100 px-1 rounded text-xs">TASKNAME</code> all work.</li>
                <li>Dates can be any standard format: <code className="bg-amber-100 px-1 rounded text-xs">MM/DD/YYYY</code>, <code className="bg-amber-100 px-1 rounded text-xs">YYYY-MM-DD</code>, or plain text like <code className="bg-amber-100 px-1 rounded text-xs">Sep 15 2025</code>.</li>
                <li>Dollar amounts can include <code className="bg-amber-100 px-1 rounded text-xs">$</code> and commas — they are stripped automatically.</li>
                <li>Imports are additive — they never overwrite existing records. Run the same file twice and you'll get duplicates, so import once.</li>
                <li>For Gantt imports from <strong>Smartsheet</strong> or <strong>MS Project</strong>: export as CSV and use the Task Name, Start, Finish, % Complete, and Assigned To columns.</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
