import { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CreateProjectModal, Project, PROJECT_STAGE_CONFIG } from '@/components/projects/CreateProjectModal';
import {
  Mail, Loader2, CheckSquare, Square, X,
  User, Calendar, AlertCircle, PlusCircle, Inbox,
  FolderOpen, Search, Plus, Star, Paperclip
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnectedInbox {
  email: string;
  token: string;
}

interface GmailMessage {
  id: string;
  inboxEmail: string;
  subject: string;
  from: string;
  fromName: string;
  date: string;
  snippet: string;
  body: string;
  amounts: number[];
  detectedTrade: string;
  selected: boolean;
  hasAttachments: boolean;
  attachmentNames: string[];
}

export interface ParsedBidItem {
  trade: string;
  description: string;
  subName: string;
  subEmail: string;
  amount: number;
  notes: string;
  emailId: string;
}

// ─── Trade Detection ──────────────────────────────────────────────────────────

const TRADE_KEYWORDS: [string, string][] = [
  ['concrete', 'Concrete / Foundation'],   ['foundation', 'Concrete / Foundation'],
  ['footings', 'Concrete / Foundation'],   ['framing', 'Framing / Rough Carpentry'],
  ['lumber', 'Framing / Rough Carpentry'], ['rough carp', 'Framing / Rough Carpentry'],
  ['roof', 'Roofing'],                     ['shingle', 'Roofing'],
  ['electric', 'Electrical'],              ['wiring', 'Electrical'],
  ['panel', 'Electrical'],                 ['plumb', 'Plumbing'],
  ['hvac', 'HVAC / Mechanical'],           ['mechanical', 'HVAC / Mechanical'],
  ['heating', 'HVAC / Mechanical'],        ['cooling', 'HVAC / Mechanical'],
  ['insul', 'Insulation'],                 ['drywall', 'Drywall'],
  ['sheetrock', 'Drywall'],               ['floor', 'Flooring'],
  ['hardwood', 'Flooring'],               ['carpet', 'Flooring'],
  ['tile', 'Tile'],                        ['grout', 'Tile'],
  ['paint', 'Painting'],                   ['cabinet', 'Cabinets / Millwork'],
  ['millwork', 'Cabinets / Millwork'],     ['trim', 'Cabinets / Millwork'],
  ['counter', 'Countertops'],              ['granite', 'Countertops'],
  ['quartz', 'Countertops'],              ['window', 'Windows & Doors'],
  ['door', 'Windows & Doors'],            ['siding', 'Exterior Finishes / Siding'],
  ['exterior', 'Exterior Finishes / Siding'], ['stucco', 'Exterior Finishes / Siding'],
  ['masonry', 'Masonry / Stonework'],     ['stone', 'Masonry / Stonework'],
  ['brick', 'Masonry / Stonework'],       ['landscape', 'Landscaping / Site Work'],
  ['excavat', 'Landscaping / Site Work'], ['grading', 'Landscaping / Site Work'],
  ['clean', 'Cleaning / Final'],
];

const ALL_TRADES = [
  'Concrete / Foundation', 'Framing / Rough Carpentry', 'Roofing', 'Electrical',
  'Plumbing', 'HVAC / Mechanical', 'Insulation', 'Drywall', 'Flooring', 'Tile',
  'Painting', 'Cabinets / Millwork', 'Countertops', 'Windows & Doors',
  'Exterior Finishes / Siding', 'Masonry / Stonework', 'Landscaping / Site Work',
  'Cleaning / Final', 'other',
];

function detectTrade(text: string): string {
  const lower = text.toLowerCase();
  for (const [kw, trade] of TRADE_KEYWORDS) {
    if (lower.includes(kw)) return trade;
  }
  return 'other';
}

function extractAmounts(text: string): number[] {
  const matches = text.match(/\$\s*[\d,]+(?:\.\d{2})?/g) ?? [];
  return [...new Set(
    matches.map(m => parseFloat(m.replace(/[$,\s]/g, ''))).filter(n => n >= 500)
  )].sort((a, b) => b - a);
}

function getAttachmentParts(payload: any): any[] {
  if (!payload) return [];
  const parts: any[] = [];
  if (payload.filename && payload.body?.attachmentId) parts.push(payload);
  for (const part of payload.parts ?? []) parts.push(...getAttachmentParts(part));
  return parts;
}

function extractPdfText(base64Data: string): string {
  try {
    const binary = atob(base64Data.replace(/-/g, '+').replace(/_/g, '/'));
    const results: string[] = [];
    const re = /\(([^)\\]{2,80})\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(binary)) !== null) results.push(m[1]);
    return results.join(' ');
  } catch { return ''; }
}

async function fetchAttachmentText(token: string, messageId: string, part: any): Promise<string> {
  try {
    const res = await fetch(
      `${GMAIL_API}/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return part.filename ?? '';
    const data = await res.json();
    const raw: string = data.data ?? '';
    const mime: string = part.mimeType ?? '';
    const fname: string = part.filename ?? '';
    if (mime.includes('text') || fname.endsWith('.csv') || fname.endsWith('.txt')) {
      return decodeBase64(raw);
    }
    if (mime.includes('pdf') || fname.endsWith('.pdf')) {
      return extractPdfText(raw);
    }
    return fname;
  } catch { return part.filename ?? ''; }
}

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^(.*?)\s*<(.+?)>$/);
  if (m) return { name: m[1].replace(/['"]/g, '').trim(), email: m[2].trim() };
  return { name: from, email: from };
}

function decodeBase64(str: string): string {
  try {
    return decodeURIComponent(
      atob(str.replace(/-/g, '+').replace(/_/g, '/'))
        .split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
  } catch { return ''; }
}

function extractBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data);
    }
    for (const part of payload.parts) { const n = extractBody(part); if (n) return n; }
  }
  return '';
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_API   = 'https://gmail.googleapis.com/gmail/v1';

function loadGIS(): Promise<void> {
  return new Promise(resolve => {
    if ((window as any).google?.accounts) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

async function getInboxEmail(token: string): Promise<string> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.email ?? 'unknown';
  } catch { return 'unknown'; }
}

// ─── Inbox badge ──────────────────────────────────────────────────────────────

const INBOX_COLORS = ['#C9A96E', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'];

function InboxBadge({ email, inboxes }: { email: string; inboxes: ConnectedInbox[] }) {
  const idx = inboxes.findIndex(i => i.email === email);
  const color = INBOX_COLORS[idx % INBOX_COLORS.length];
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: `${color}20`, color }}>
      <Inbox className="h-3 w-3" />{email}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface GmailBidImporterProps {
  open: boolean;
  onClose: () => void;
  onImport: (items: ParsedBidItem[]) => void;
}

export function GmailBidImporter({ open, onClose, onImport }: GmailBidImporterProps) {
  const { toast } = useToast();
  const [inboxes, setInboxes]       = useState<ConnectedInbox[]>([]);
  const [messages, setMessages]     = useState<GmailMessage[]>([]);
  const [loadingInbox, setLoadingInbox] = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');
  const [showError, setShowError]   = useState(false);
  const [atAssign, setAtAssign]     = useState(false);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [bidsInboxEmails, setBidsInboxEmails] = useState<Set<string>>(new Set());
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const step = !atAssign
    ? (inboxes.length === 0 ? 'connect' : loadingInbox ? 'loading' : 'review')
    : 'assign';

  useEffect(() => {
    if (open) {
      setInboxes([]); setMessages([]); setLoadingInbox(null);
      setShowError(false); setAtAssign(false); setSelectedProject(null);
      setBidsInboxEmails(new Set());
    }
  }, [open]);

  // Load projects for assignment step
  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project))));
  }, []);

  // ── OAuth: connect one inbox ───────────────────────────────────────────────
  const connectInbox = useCallback(async () => {
    if (!clientId) { setErrorMsg('VITE_GOOGLE_CLIENT_ID not configured.'); setShowError(true); return; }
    try {
      await loadGIS();
      const g = (window as any).google;
      g.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPE,
        callback: async (resp: any) => {
          if (resp.error) { setErrorMsg(resp.error); setShowError(true); return; }
          const email = await getInboxEmail(resp.access_token);
          // Skip if already connected
          if (inboxes.some(i => i.email === email)) {
            toast({ title: `${email} already connected` });
            return;
          }
          const newInbox: ConnectedInbox = { email, token: resp.access_token };
          setInboxes(prev => [...prev, newInbox]);
          setLoadingInbox(email);
          await fetchFromInbox(newInbox, messages);
          setLoadingInbox(null);
        },
      }).requestAccessToken({ prompt: 'select_account' });
    } catch (e: any) {
      setErrorMsg(e.message ?? 'OAuth failed');
      setShowError(true);
    }
  }, [clientId, inboxes, messages]);

  // ── Fetch emails from one inbox, merge into existing list ─────────────────
  const fetchFromInbox = async (inbox: ConnectedInbox, existing: GmailMessage[], isBidsInbox = false) => {
    try {
      const queryStr = isBidsInbox
        ? 'has:attachment'
        : 'subject:bid OR subject:estimate OR subject:quote OR subject:proposal';
      const q = encodeURIComponent(queryStr);
      const maxResults = isBidsInbox ? 50 : 30;
      const listRes = await fetch(`${GMAIL_API}/users/me/messages?q=${q}&maxResults=${maxResults}`, {
        headers: { Authorization: `Bearer ${inbox.token}` },
      });
      if (!listRes.ok) throw new Error(`Gmail API error: ${listRes.status}`);
      const listData = await listRes.json();
      const msgList: { id: string }[] = listData.messages ?? [];

      if (msgList.length === 0) {
        toast({ title: `No emails found in ${inbox.email}` });
        return;
      }

      const existingIds = new Set(existing.map(m => m.id));
      const fetched: GmailMessage[] = [];
      const limit = isBidsInbox ? 40 : 20;

      for (const { id } of msgList.slice(0, limit)) {
        if (existingIds.has(id)) continue;
        const msgRes = await fetch(`${GMAIL_API}/users/me/messages/${id}?format=full`, {
          headers: { Authorization: `Bearer ${inbox.token}` },
        });
        if (!msgRes.ok) continue;
        const msg = await msgRes.json();

        const hdrs: Record<string, string> = {};
        (msg.payload?.headers ?? []).forEach((h: any) => { hdrs[h.name.toLowerCase()] = h.value; });

        const subject = hdrs['subject'] ?? '(no subject)';
        const from    = hdrs['from'] ?? '';
        const date    = hdrs['date'] ?? '';
        const { name: fromName, email: fromEmail } = parseFrom(from);
        const body    = extractBody(msg.payload);

        // Fetch attachment content for richer extraction
        const attachmentParts = getAttachmentParts(msg.payload);
        const attachmentNames = attachmentParts.map((p: any) => p.filename).filter(Boolean) as string[];
        let attachmentText = '';
        for (const part of attachmentParts.slice(0, 3)) {
          attachmentText += ' ' + await fetchAttachmentText(inbox.token, id, part);
        }

        const text = `${subject} ${body} ${attachmentText}`;

        fetched.push({
          id,
          inboxEmail: inbox.email,
          subject,
          from: fromEmail,
          fromName,
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          snippet: msg.snippet ?? '',
          body,
          amounts: extractAmounts(text),
          detectedTrade: detectTrade(text),
          selected: extractAmounts(text).length > 0,
          hasAttachments: attachmentParts.length > 0,
          attachmentNames,
        });
      }

      setMessages(prev => [...prev, ...fetched]);
      toast({ title: `${fetched.length} emails loaded from ${inbox.email}` });
    } catch (e: any) {
      toast({ title: `Error reading ${inbox.email}`, description: e.message, variant: 'destructive' });
    }
  };

  // ── Toggle bids inbox mode (re-fetches with has:attachment query) ──────────
  const toggleBidsInbox = async (inbox: ConnectedInbox) => {
    const isNowBids = !bidsInboxEmails.has(inbox.email);
    setBidsInboxEmails(prev => {
      const next = new Set(prev);
      isNowBids ? next.add(inbox.email) : next.delete(inbox.email);
      return next;
    });
    if (isNowBids) {
      const remaining = messages.filter(m => m.inboxEmail !== inbox.email);
      setMessages(remaining);
      setLoadingInbox(inbox.email);
      await fetchFromInbox(inbox, remaining, true);
      setLoadingInbox(null);
      toast({ title: `${inbox.email} set as bids inbox`, description: 'Re-fetched emails with attachments.' });
    }
  };

  const toggleSelect = (id: string) =>
    setMessages(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));

  const updateAmount = (id: string, amount: number) =>
    setMessages(prev => prev.map(m => m.id === id ? { ...m, amounts: [amount, ...m.amounts.slice(1)] } : m));

  const updateTrade = (id: string, trade: string) =>
    setMessages(prev => prev.map(m => m.id === id ? { ...m, detectedTrade: trade } : m));

  const handleProceedToAssign = () => setAtAssign(true);

  const handleImport = () => {
    const items: ParsedBidItem[] = messages
      .filter(m => m.selected && m.amounts[0])
      .map(m => ({
        trade: m.detectedTrade,
        description: m.subject,
        subName: m.fromName,
        subEmail: m.from,
        amount: m.amounts[0],
        notes: m.snippet,
        emailId: m.id,
        projectId: selectedProject?.id,
        projectName: selectedProject?.name,
      }));
    onImport(items);
    onClose();
    toast({ title: `${items.length} bid${items.length !== 1 ? 's' : ''} imported${selectedProject ? ` to ${selectedProject.name}` : ''}` });
  };

  const filteredProjects = projects.filter(p => {
    const s = projectSearch.toLowerCase();
    return !s || [p.name, p.clientName, p.address, p.city].filter(Boolean)
      .some(v => v!.toLowerCase().includes(s));
  });

  const selectedCount = messages.filter(m => m.selected && m.amounts[0]).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl">
            <Mail className="h-5 w-5" style={{ color: '#C9A96E' }} />
            Import Bids from Gmail
          </DialogTitle>
        </DialogHeader>

        {/* ── Error banner ──────────────────────────────────────────────── */}
        {showError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-red-700">{errorMsg}</div>
            <button onClick={() => setShowError(false)}><X className="h-4 w-4 text-red-400" /></button>
          </div>
        )}

        {/* ── Connect step ──────────────────────────────────────────────── */}
        {step === 'connect' && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <Mail className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">Connect your Gmail inboxes</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                Connect each inbox that receives bids — <strong>bids@skyelinehomes.com</strong>, <strong>tyler@skyelinehomes.com</strong>, or any others.
              </p>
            </div>
            <Button onClick={connectInbox} style={{ backgroundColor: '#C9A96E', color: '#141414' }} className="px-8">
              <Mail className="h-4 w-4 mr-2" />Connect Gmail Inbox
            </Button>
          </div>
        )}

        {/* ── Loading step ──────────────────────────────────────────────── */}
        {step === 'loading' && (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto" style={{ color: '#C9A96E' }} />
            <p className="text-sm text-gray-500">Reading bid emails from <strong>{loadingInbox}</strong>...</p>
          </div>
        )}

        {/* ── Review step ───────────────────────────────────────────────── */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Connected inboxes + add another */}
            <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <span className="text-xs text-gray-500 font-medium">Connected:</span>
              {inboxes.map(inbox => {
                const isBids = bidsInboxEmails.has(inbox.email);
                return (
                  <div key={inbox.email} className="flex items-center gap-0.5">
                    <InboxBadge email={inbox.email} inboxes={inboxes} />
                    <button
                      onClick={() => toggleBidsInbox(inbox)}
                      title={isBids ? 'Bids inbox mode ON — click to disable' : 'Mark as bids inbox (searches all emails with attachments)'}
                      className={`p-1 rounded transition-colors ${isBids ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}
                    >
                      <Star className="h-3.5 w-3.5" fill={isBids ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs ml-auto"
                onClick={connectInbox}
              >
                <PlusCircle className="h-3.5 w-3.5 mr-1" />Add inbox
              </Button>
            </div>
            {bidsInboxEmails.size > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Star className="h-3 w-3 inline mr-1" fill="currentColor" />
                <strong>Bids inbox mode:</strong> showing all emails with attachments — PDFs and spreadsheets are automatically analyzed for amounts.
              </p>
            )}

            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{messages.length} emails · {selectedCount} selected</span>
              <button
                className="text-xs underline text-gray-400 hover:text-gray-600"
                onClick={() => setMessages(p => p.map(m => ({ ...m, selected: m.amounts.length > 0 })))}
              >
                Select all with amounts
              </button>
            </div>

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`border rounded-xl p-4 transition-colors cursor-pointer ${msg.selected ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}
                onClick={() => toggleSelect(msg.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {msg.selected
                      ? <CheckSquare className="h-5 w-5" style={{ color: '#C9A96E' }} />
                      : <Square className="h-5 w-5 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <p className="font-medium text-sm text-gray-900 truncate">{msg.subject}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <User className="h-3 w-3" />{msg.fromName || msg.from}
                          <span className="text-gray-300 mx-1">·</span>
                          <Calendar className="h-3 w-3" />{msg.date}
                        </p>
                        <InboxBadge email={msg.inboxEmail} inboxes={inboxes} />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">{msg.snippet}</p>
                    {msg.hasAttachments && (
                      <div className="flex flex-wrap gap-1">
                        {msg.attachmentNames.map((name, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                            <Paperclip className="h-3 w-3" />{name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                      <select
                        value={msg.detectedTrade}
                        onChange={e => updateTrade(msg.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                      >
                        {ALL_TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>

                      {msg.amounts.length > 0 ? (
                        <div className="flex flex-wrap gap-1 items-center">
                          {msg.amounts.slice(0, 4).map((amt, i) => (
                            <button
                              key={i}
                              onClick={() => updateAmount(msg.id, amt)}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${i === 0 ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                              style={i === 0 ? { backgroundColor: '#C9A96E' } : {}}
                            >
                              ${amt.toLocaleString()}
                            </button>
                          ))}
                          <span className="text-xs text-gray-400">← tap correct amount</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">Enter amount:</span>
                          <input
                            type="number" placeholder="0"
                            className="w-24 text-xs border border-gray-200 rounded px-2 py-1"
                            onChange={e => updateAmount(msg.id, parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">No bid emails found across connected inboxes.</div>
            )}
          </div>
        )}

        {step === 'review' && (
          <DialogFooter className="gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleProceedToAssign}
              disabled={selectedCount === 0}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            >
              Next — Assign to Project ({selectedCount} bid{selectedCount !== 1 ? 's' : ''})
            </Button>
          </DialogFooter>
        )}

        {/* ── Assign to project step ────────────────────────────────────── */}
        {step === 'assign' && (
          <>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setAtAssign(false)} className="text-sm text-blue-600 hover:underline">← Back</button>
                <p className="text-sm text-gray-500 ml-1">Assign {selectedCount} bids to a project</p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input className="pl-9" placeholder="Search projects..." value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)} />
              </div>

              {/* Create new project */}
              <button
                onClick={() => setCreateProjectOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Plus className="h-5 w-5" style={{ color: '#C9A96E' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Create New Project</p>
                  <p className="text-xs text-gray-500">Link to a client and set the pipeline stage</p>
                </div>
              </button>

              {/* Existing projects */}
              {filteredProjects.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {filteredProjects.map(p => {
                    const stageCfg = PROJECT_STAGE_CONFIG[p.stage] ?? { label: p.stage, color: '#6b7280' };
                    const isSelected = selectedProject?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProject(isSelected ? null : p)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${isSelected ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                      >
                        <FolderOpen className="h-5 w-5 flex-shrink-0 text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {p.clientName ?? 'No client'}{p.city ? ` · ${p.city}` : ''}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          style={{ backgroundColor: `${stageCfg.color}20`, color: stageCfg.color }}>
                          {stageCfg.label}
                        </span>
                        {isSelected && <CheckSquare className="h-4 w-4 flex-shrink-0" style={{ color: '#C9A96E' }} />}
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredProjects.length === 0 && !projectSearch && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No projects yet — create one above to get started.
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                variant="outline"
                onClick={handleImport}
                className="text-gray-600"
              >
                Import without project
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedProject}
                style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              >
                Import to {selectedProject?.name ?? '…'}
              </Button>
            </DialogFooter>
          </>
        )}

        <CreateProjectModal
          open={createProjectOpen}
          onClose={() => setCreateProjectOpen(false)}
          defaultStage="estimating"
          onCreated={project => { setSelectedProject(project); setCreateProjectOpen(false); }}
        />
      </DialogContent>
    </Dialog>
  );
}
