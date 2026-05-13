import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, getDocs, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Wallet, Plus, Edit, Trash2, ExternalLink, Eye, EyeOff, Copy,
  Sparkles, Cloud, Mail, MessageSquare, Image as ImageIcon, Database,
  CreditCard, AlertTriangle, CheckCircle2, Pause,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'active' | 'trial' | 'paused' | 'cancelled';
type Category = 'AI' | 'Infrastructure' | 'Email' | 'SMS' | 'Storage' | 'Tools' | 'Other';

interface Subscription {
  id: string;
  name: string;
  vendor: string;
  category: Category;
  status: Status;
  pricingModel: string;       // "Pay-as-you-go", "Flat $X/mo", "Per-seat"
  monthlyEstimate: number;     // projected
  lastMonthActual: number;     // last month's invoice
  apiKey?: string;             // stored only if user chooses to record here (admin-only access)
  notes?: string;
  signupUrl?: string;
  dashboardUrl?: string;
  startedAt?: string;          // ISO
  updatedAt?: any;
}

const CATEGORY_META: Record<Category, { color: string; icon: any }> = {
  AI:             { color: 'bg-purple-50 text-purple-700 border-purple-200',  icon: Sparkles },
  Infrastructure: { color: 'bg-blue-50 text-blue-700 border-blue-200',         icon: Cloud },
  Email:          { color: 'bg-green-50 text-green-700 border-green-200',      icon: Mail },
  SMS:            { color: 'bg-orange-50 text-orange-700 border-orange-200',   icon: MessageSquare },
  Storage:        { color: 'bg-amber-50 text-amber-700 border-amber-200',      icon: Database },
  Tools:          { color: 'bg-teal-50 text-teal-700 border-teal-200',         icon: ImageIcon },
  Other:          { color: 'bg-gray-50 text-gray-700 border-gray-200',         icon: CreditCard },
};

const STATUS_META: Record<Status, { color: string; icon: any; label: string }> = {
  active:    { color: 'bg-green-100 text-green-700',     icon: CheckCircle2,    label: 'Active' },
  trial:     { color: 'bg-blue-100 text-blue-700',       icon: Sparkles,        label: 'Trial' },
  paused:    { color: 'bg-amber-100 text-amber-700',     icon: Pause,           label: 'Paused' },
  cancelled: { color: 'bg-gray-100 text-gray-500',       icon: AlertTriangle,   label: 'Cancelled' },
};

const CATEGORIES: Category[] = ['AI', 'Infrastructure', 'Email', 'SMS', 'Storage', 'Tools', 'Other'];

// ─── Pre-seed list — runs once if collection is empty ────────────────────────

const SEED_SUBSCRIPTIONS: Omit<Subscription, 'id'>[] = [
  {
    name: 'Firebase (Blaze plan)',
    vendor: 'Google',
    category: 'Infrastructure',
    status: 'active',
    pricingModel: 'Pay-as-you-go',
    monthlyEstimate: 15,
    lastMonthActual: 0,
    notes: 'Firestore + Auth + Hosting + Storage + Cloud Functions + Cloud Scheduler. Free tier covers most usage.',
    signupUrl: 'https://firebase.google.com/pricing',
    dashboardUrl: 'https://console.firebase.google.com/project/skyelineos/usage/details',
  },
  {
    name: 'Anthropic Claude API',
    vendor: 'Anthropic',
    category: 'AI',
    status: 'trial',
    pricingModel: 'Pay-as-you-go',
    monthlyEstimate: 30,
    lastMonthActual: 0,
    notes: 'Powers AI Bill OCR + AI Estimate Drafter. Sonnet 4.6 is primary model.',
    signupUrl: 'https://console.anthropic.com/',
    dashboardUrl: 'https://console.anthropic.com/settings/usage',
  },
  {
    name: 'OpenAI API',
    vendor: 'OpenAI',
    category: 'AI',
    status: 'trial',
    pricingModel: 'Pay-as-you-go',
    monthlyEstimate: 40,
    lastMonthActual: 0,
    notes: 'Powers AI Rendering Studio (DALL-E 3 / gpt-image-1) + Whisper voice-to-text.',
    signupUrl: 'https://platform.openai.com/',
    dashboardUrl: 'https://platform.openai.com/usage',
  },
  {
    name: 'SendGrid',
    vendor: 'Twilio',
    category: 'Email',
    status: 'trial',
    pricingModel: 'Free up to 100/day, then $19.95/mo',
    monthlyEstimate: 0,
    lastMonthActual: 0,
    notes: 'Transactional email — notifications, invoices, estimates. Free tier likely sufficient for now.',
    signupUrl: 'https://signup.sendgrid.com/',
    dashboardUrl: 'https://app.sendgrid.com/',
  },
  {
    name: 'Twilio (SMS)',
    vendor: 'Twilio',
    category: 'SMS',
    status: 'trial',
    pricingModel: '$0.0079/SMS + $1/mo number',
    monthlyEstimate: 10,
    lastMonthActual: 0,
    notes: 'SMS to subs/clients. Includes A2P 10DLC brand registration ($4-15/mo).',
    signupUrl: 'https://www.twilio.com/try-twilio',
    dashboardUrl: 'https://console.twilio.com/',
  },
  {
    name: 'Reimagine Home',
    vendor: 'Reimagine Home AI',
    category: 'Tools',
    status: 'paused',
    pricingModel: '$20/mo (100 credits)',
    monthlyEstimate: 0,
    lastMonthActual: 0,
    notes: 'Optional — interior-specific renderings using actual room photos as base. Skip until DALL-E quality is evaluated.',
    signupUrl: 'https://www.reimaginehome.ai/',
  },
  {
    name: 'Domain (skylineos.app or custom)',
    vendor: 'Domain Registrar',
    category: 'Other',
    status: 'paused',
    pricingModel: '$15-50/yr',
    monthlyEstimate: 1.5,
    lastMonthActual: 0,
    notes: 'Custom domain instead of skyelineos.web.app. Optional but professional.',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••••';
  return `${key.slice(0, 6)}${'•'.repeat(20)}${key.slice(-4)}`;
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

// ─── Edit modal ──────────────────────────────────────────────────────────────

function EditModal({
  open, sub, onClose,
}: {
  open: boolean;
  sub: Subscription | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Partial<Subscription>>({});
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setDraft(sub ? { ...sub } : { status: 'trial', category: 'Tools', monthlyEstimate: 0, lastMonthActual: 0 });
    setShowKey(false);
  }, [sub, open]);

  const update = (patch: Partial<Subscription>) => setDraft(d => ({ ...d, ...patch }));

  const save = async () => {
    if (!draft.name || !draft.vendor) {
      toast({ title: 'Name and vendor required', variant: 'destructive' });
      return;
    }
    try {
      const payload = {
        ...draft,
        monthlyEstimate: Number(draft.monthlyEstimate) || 0,
        lastMonthActual: Number(draft.lastMonthActual) || 0,
        updatedAt: serverTimestamp(),
      };
      if (sub) {
        await updateDoc(doc(db, 'subscriptions', sub.id), payload as any);
      } else {
        await addDoc(collection(db, 'subscriptions'), { ...payload, createdAt: serverTimestamp() });
      }
      toast({ title: sub ? 'Subscription updated' : 'Subscription added' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sub ? 'Edit Subscription' : 'Add Subscription'}</DialogTitle>
          <DialogDescription>
            Track services, costs, and API keys.
            {' '}
            <strong>Heads up:</strong> the API key field is admin-read-only — but for max security, store production keys in Firebase Secret Manager.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sub-name">Service Name *</Label>
              <Input id="sub-name" value={draft.name || ''} onChange={e => update({ name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="sub-vendor">Vendor *</Label>
              <Input id="sub-vendor" value={draft.vendor || ''} onChange={e => update({ vendor: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={draft.category || 'Tools'} onValueChange={v => update({ category: v as Category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={draft.status || 'trial'} onValueChange={v => update({ status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="sub-pricing">Pricing Model</Label>
            <Input
              id="sub-pricing"
              value={draft.pricingModel || ''}
              onChange={e => update({ pricingModel: e.target.value })}
              placeholder="Pay-as-you-go · Flat $20/mo · Per-seat $X/user"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sub-est">Projected $ / mo</Label>
              <Input
                id="sub-est"
                type="number"
                step="0.01"
                value={draft.monthlyEstimate ?? 0}
                onChange={e => update({ monthlyEstimate: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="sub-actual">Last Month Actual $</Label>
              <Input
                id="sub-actual"
                type="number"
                step="0.01"
                value={draft.lastMonthActual ?? 0}
                onChange={e => update({ lastMonthActual: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="sub-key">API Key (optional, admin-only)</Label>
            <div className="relative">
              <Input
                id="sub-key"
                type={showKey ? 'text' : 'password'}
                value={draft.apiKey || ''}
                onChange={e => update({ apiKey: e.target.value })}
                placeholder="sk-... (leave blank if managed via Secret Manager)"
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Stored encrypted in Firestore with admin-only read access. For best practice, production keys belong in Firebase Secret Manager.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sub-signup">Signup URL</Label>
              <Input id="sub-signup" value={draft.signupUrl || ''} onChange={e => update({ signupUrl: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="sub-dash">Dashboard URL</Label>
              <Input id="sub-dash" value={draft.dashboardUrl || ''} onChange={e => update({ dashboardUrl: e.target.value })} />
            </div>
          </div>

          <div>
            <Label htmlFor="sub-notes">Notes</Label>
            <Textarea
              id="sub-notes"
              rows={2}
              value={draft.notes || ''}
              onChange={e => update({ notes: e.target.value })}
              placeholder="What this powers, gotchas, contract end date, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
            {sub ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Subscription[]>([]);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [revealedKeyIds, setRevealedKeyIds] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);

  // Live subscription
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'subscriptions'), orderBy('category'), orderBy('name')),
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Subscription))),
      () => {},
    );
    return () => unsub();
  }, []);

  // Auto-seed if empty (admin only)
  useEffect(() => {
    if (seeded) return;
    if (user?.role !== 'admin') return;
    (async () => {
      const snap = await getDocs(collection(db, 'subscriptions'));
      if (snap.empty) {
        const batch = writeBatch(db);
        const col = collection(db, 'subscriptions');
        for (const s of SEED_SUBSCRIPTIONS) {
          const ref = doc(col);
          batch.set(ref, { ...s, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        await batch.commit();
        toast({ title: 'Subscriptions seeded with current services' });
      }
      setSeeded(true);
    })();
  }, [user, seeded, toast]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from subscriptions?`)) return;
    try {
      await deleteDoc(doc(db, 'subscriptions', id));
      toast({ title: 'Removed' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const toggleReveal = (id: string) => {
    const next = new Set(revealedKeyIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setRevealedKeyIds(next);
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({ title: 'Copied to clipboard' });
  };

  // Totals (active + trial only — paused/cancelled don't count toward run-rate)
  const activeItems = items.filter(s => s.status === 'active' || s.status === 'trial');
  const totalProjected = activeItems.reduce((sum, s) => sum + (s.monthlyEstimate || 0), 0);
  const totalLastMonth = items.reduce((sum, s) => sum + (s.lastMonthActual || 0), 0);

  // Group by category
  const grouped = items.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<Category, Subscription[]>);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Wallet className="w-7 h-7 text-[#C9A96E]" />
              <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
            </div>
            <p className="text-gray-500 text-sm">
              Every paid service powering Skyeline OS — costs, dashboards, and API keys in one place.
            </p>
          </div>
          <Button
            onClick={() => { setEditing(null); setShowModal(true); }}
            className="gap-2 text-white"
            style={{ backgroundColor: '#22c55e' }}
          >
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Projected this month</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatMoney(totalProjected)}</p>
              <p className="text-xs text-gray-400 mt-1">{activeItems.length} active services</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Last month actual</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatMoney(totalLastMonth)}</p>
              <p className="text-xs text-gray-400 mt-1">Based on what you've recorded</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Variance</p>
              <p className={`text-2xl font-bold mt-1 ${totalProjected - totalLastMonth >= 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {totalProjected - totalLastMonth >= 0 ? '+' : ''}{formatMoney(totalProjected - totalLastMonth)}
              </p>
              <p className="text-xs text-gray-400 mt-1">Projected − last actual</p>
            </CardContent>
          </Card>
        </div>

        {/* Tables grouped by category */}
        {CATEGORIES.filter(c => grouped[c]?.length).map(category => {
          const Icon = CATEGORY_META[category].icon;
          const subTotal = grouped[category].reduce((s, x) => s + (x.monthlyEstimate || 0), 0);
          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-[#C9A96E]" />
                    <span>{category}</span>
                    <Badge variant="outline" className="text-xs">{grouped[category].length}</Badge>
                  </div>
                  <span className="text-sm font-normal text-gray-500">
                    Subtotal: <span className="font-bold text-gray-900">{formatMoney(subTotal)}</span>/mo
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-y text-xs text-gray-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium">Service / Vendor</th>
                        <th className="px-4 py-2.5 text-left font-medium">Status</th>
                        <th className="px-4 py-2.5 text-left font-medium">Pricing</th>
                        <th className="px-4 py-2.5 text-right font-medium">Projected</th>
                        <th className="px-4 py-2.5 text-right font-medium">Last Mo.</th>
                        <th className="px-4 py-2.5 text-left font-medium">API Key</th>
                        <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[category].map(s => {
                        const StatusIcon = STATUS_META[s.status].icon;
                        const isRevealed = revealedKeyIds.has(s.id);
                        return (
                          <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-gray-900">{s.name}</div>
                              <div className="text-xs text-gray-500">{s.vendor}</div>
                              <div className="flex items-center gap-2 mt-1">
                                {s.dashboardUrl && (
                                  <a
                                    href={s.dashboardUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] uppercase text-[#C9A96E] hover:underline flex items-center gap-0.5"
                                  >
                                    Dashboard <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                                {s.signupUrl && !s.dashboardUrl && (
                                  <a
                                    href={s.signupUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] uppercase text-[#C9A96E] hover:underline flex items-center gap-0.5"
                                  >
                                    Signup <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <Badge className={`${STATUS_META[s.status].color} gap-1`}>
                                <StatusIcon className="w-3 h-3" /> {STATUS_META[s.status].label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-gray-600">{s.pricingModel || '—'}</td>
                            <td className="px-4 py-3 align-top text-right font-mono text-gray-900">
                              {formatMoney(s.monthlyEstimate || 0)}
                            </td>
                            <td className="px-4 py-3 align-top text-right font-mono text-gray-500">
                              {formatMoney(s.lastMonthActual || 0)}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {s.apiKey ? (
                                <div className="flex items-center gap-1">
                                  <code className="text-[11px] font-mono text-gray-700">
                                    {isRevealed ? s.apiKey : maskKey(s.apiKey)}
                                  </code>
                                  <button
                                    onClick={() => toggleReveal(s.id)}
                                    className="text-gray-300 hover:text-gray-700"
                                    title={isRevealed ? 'Hide' : 'Reveal'}
                                  >
                                    {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => copyKey(s.apiKey || '')}
                                    className="text-gray-300 hover:text-gray-700"
                                    title="Copy key"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">— not stored —</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setEditing(s); setShowModal(true); }}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(s.id, s.name)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {items.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <Wallet className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="font-medium">No subscriptions tracked yet</p>
              <p className="text-xs mt-1">Click + Add to start tracking your services.</p>
            </CardContent>
          </Card>
        )}

        {/* Footer total */}
        {items.length > 0 && (
          <Card className="bg-gradient-to-r from-[#C9A96E] to-[#a98a4f] text-white">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide opacity-80">Total monthly run-rate</p>
                <p className="text-3xl font-bold mt-1">{formatMoney(totalProjected)}</p>
              </div>
              <div className="text-right text-sm">
                <p className="opacity-80">vs JACK App: $299/mo</p>
                <p className="opacity-80">vs BuilderTrend: $199 + $99/seat</p>
                <p className="font-semibold mt-1">
                  {totalProjected < 299 ? `Saving $${(299 - totalProjected).toFixed(0)}/mo vs JACK` : 'Above JACK floor'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <EditModal
        open={showModal}
        sub={editing}
        onClose={() => { setShowModal(false); setEditing(null); }}
      />
    </AppLayout>
  );
}
