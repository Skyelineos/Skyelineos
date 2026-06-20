import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  KeyRound, Search, ShieldCheck, Database, Bot, Image as ImageIcon,
  Mail, MessageSquare, Share2, Calculator, Cloud, Link2, ExternalLink, MapPin,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// API Storage — a catalog of every external integration wired into SkyelineOS.
//
// IMPORTANT: this page intentionally shows NO secret values. Every key lives in
// Google Secret Manager (bound to the `api` Cloud Function) or, for the Firebase
// web config, in the client build — the browser never receives server secrets.
// This is a reference for *what* each integration is and *what it does for the
// app*, plus the Secret Manager variable name to look up if you need to rotate
// a key. Source of truth: the `api` function's `secrets:` array in
// functions/src/index.ts and the per-feature usage in functions/src.
// ─────────────────────────────────────────────────────────────────────────────

type Status = 'active' | 'optional' | 'scaffold' | 'placeholder' | 'config';

interface Integration {
  name: string;
  vendor: string;
  category: string;
  icon: React.ElementType;
  description: string;       // what it does FOR the app
  usedIn: string[];          // app features that touch it
  secrets: string[];         // Secret Manager / env var NAMES (not values)
  status: Status;
  manageUrl?: string;        // where to view/rotate the key
}

const STATUS_META: Record<Status, { label: string; className: string }> = {
  active:      { label: 'Active',          className: 'bg-green-100 text-green-800 border-green-200' },
  optional:    { label: 'Optional',        className: 'bg-blue-100 text-blue-800 border-blue-200' },
  scaffold:    { label: 'Scaffold / OAuth', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  placeholder: { label: 'Placeholder',     className: 'bg-orange-100 text-orange-800 border-orange-200' },
  config:      { label: 'Config',          className: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const INTEGRATIONS: Integration[] = [
  {
    name: 'Firebase',
    vendor: 'Google',
    category: 'Core Platform',
    icon: Cloud,
    description:
      'The backend everything runs on — Authentication (logins/roles), Firestore (all app data), Cloud Functions (the `api` server), Hosting (the SPA), Storage (photos/files), and Cloud Messaging (web push notifications).',
    usedIn: ['Auth & roles', 'All data', 'api function', 'Web push', 'File uploads'],
    secrets: ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_*', 'project: skyelineos'],
    status: 'active',
    manageUrl: 'https://console.firebase.google.com/project/skyelineos',
  },
  {
    name: 'Anthropic — Claude',
    vendor: 'Anthropic',
    category: 'AI',
    icon: Bot,
    description:
      'Claude AI. Reads vendor bills via vision OCR, analyzes uploaded media/content, and runs the Ingestion Lab extraction "brain pass" that turns raw email/Drive content into structured records.',
    usedIn: ['Bills (AI)', 'Content analysis', 'Ingestion Lab'],
    secrets: ['ANTHROPIC_API_KEY'],
    status: 'active',
    manageUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    name: 'OpenAI — DALL·E',
    vendor: 'OpenAI',
    category: 'AI',
    icon: ImageIcon,
    description:
      'Image generation for the AI Rendering Studio — turns a project’s selections into photo-real interior renderings (the "dalle" provider on POST /api/ai/render).',
    usedIn: ['AI Rendering Studio', 'Design Board'],
    secrets: ['OPENAI_API_KEY'],
    status: 'optional',
    manageUrl: 'https://platform.openai.com/api-keys',
  },
  {
    name: 'Replicate — FLUX',
    vendor: 'Replicate',
    category: 'AI',
    icon: ImageIcon,
    description:
      'Alternative AI image provider (Black Forest Labs FLUX 1.1 Pro) for interior renderings — the "flux" provider on POST /api/ai/render.',
    usedIn: ['AI Rendering Studio'],
    secrets: ['REPLICATE_API_TOKEN'],
    status: 'optional',
    manageUrl: 'https://replicate.com/account/api-tokens',
  },
  {
    name: 'SendGrid',
    vendor: 'Twilio',
    category: 'Messaging',
    icon: Mail,
    description:
      'Transactional email. Sends notification emails, bid-request invitations to vendors, and the daily due-date reminder sweep.',
    usedIn: ['Notifications', 'Bid requests', 'Due-date sweep'],
    secrets: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
    status: 'active',
    manageUrl: 'https://app.sendgrid.com/settings/api_keys',
  },
  {
    name: 'Twilio',
    vendor: 'Twilio',
    category: 'Messaging',
    icon: MessageSquare,
    description:
      'SMS delivery. Texts notifications and magic-link bid requests to subcontractors and clients.',
    usedIn: ['Notifications', 'Bid requests'],
    secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    status: 'active',
    manageUrl: 'https://console.twilio.com',
  },
  {
    name: 'Meta — Instagram Graph',
    vendor: 'Meta',
    category: 'Social',
    icon: Share2,
    description:
      'Publishes photos, reels, and carousels directly to the Skyeline Instagram business account from Content Studio / Social Media.',
    usedIn: ['Social Media', 'Content Studio'],
    secrets: ['META_APP_ID', 'META_APP_SECRET', 'META_PAGE_ID', 'META_IG_BUSINESS_ID', 'META_PAGE_ACCESS_TOKEN'],
    status: 'active',
    manageUrl: 'https://developers.facebook.com/apps',
  },
  {
    name: 'QuickBooks Online',
    vendor: 'Intuit',
    category: 'Accounting',
    icon: Calculator,
    description:
      'Accounting integration over OAuth — connects Skyeline financials to QuickBooks (customers, invoices, etc.). Scaffolded; QBO_ENV toggles sandbox vs production.',
    usedIn: ['Finance', 'QBO OAuth'],
    secrets: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_ENV'],
    status: 'scaffold',
    manageUrl: 'https://developer.intuit.com/app/developer/dashboard',
  },
  {
    name: 'Google OAuth — Gmail + Drive',
    vendor: 'Google',
    category: 'AI Ingestion',
    icon: Link2,
    description:
      'One OAuth client for the Ingestion Lab — read-only access to a labeled Gmail inbox and two Drive folders, which feed the AI extraction pipeline. Currently set to placeholder values to allow the api function to deploy; swap in real OAuth credentials to activate ingestion.',
    usedIn: ['Ingestion Lab (admin)'],
    secrets: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    status: 'placeholder',
    manageUrl: 'https://console.cloud.google.com/apis/credentials?project=skyelineos',
  },
  {
    name: 'Google Maps — Places (New)',
    vendor: 'Google',
    category: 'Maps',
    icon: MapPin,
    description:
      'Address autocomplete + forward geocoding for the jobsite "Set pin" flow. Proxied server-side (POST /api/places/autocomplete + /api/places/details) so the key never reaches the browser; uses session tokens for cheap billing. Powers the address typeahead in BuildLocation, MapPinPicker, and the lead/project address fields. If unset, the UI falls back to saved-address suggestions.',
    usedIn: ['Jobsite location', 'Lead/project address entry', 'Portal Directions'],
    secrets: ['GOOGLE_MAPS_API_KEY'],
    status: 'active',
    manageUrl: 'https://console.cloud.google.com/apis/credentials?project=skyelineos',
  },
  {
    name: 'Lead Intake (internal)',
    vendor: 'SkyelineOS',
    category: 'CRM',
    icon: ShieldCheck,
    description:
      'Shared secret that protects the public POST /api/leads/intake endpoint. The Crestview Solace QR Google Form posts new leads through it, which land in Sales/CRM as clients.',
    usedIn: ['Sales / CRM', 'Crestview QR form'],
    secrets: ['LEAD_INTAKE_SECRET'],
    status: 'active',
    manageUrl: 'https://console.cloud.google.com/security/secret-manager?project=skyelineos',
  },
  {
    name: 'AI Inbox Ingest (n8n)',
    vendor: 'SkyelineOS',
    category: 'AI / Automation',
    icon: ShieldCheck,
    description:
      'Shared secret that protects the public POST /api/ai-inbox/ingest endpoint. The n8n Gmail workflow presents it in the X-N8N-Secret header to push invoices/receipts/bank alerts/sub+client email into the AI Inbox, where Claude extracts + project-matches them and an admin approves before anything syncs to QuickBooks. n8n can\'t carry a Firebase token, so this secret is the gate.',
    usedIn: ['AI Inbox', 'n8n Gmail workflow'],
    secrets: ['N8N_INGEST_SECRET'],
    status: 'active',
    manageUrl: 'https://console.cloud.google.com/security/secret-manager?project=skyelineos',
  },
  {
    name: 'App Base URL',
    vendor: 'SkyelineOS',
    category: 'Config',
    icon: Database,
    description:
      'Base URL used to build absolute links in outbound email/SMS (e.g. magic-link bid responses). A configuration value, not an external API.',
    usedIn: ['Email/SMS links'],
    secrets: ['APP_BASE_URL'],
    status: 'config',
  },
];

function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return <Badge variant="outline" className={`text-[11px] ${m.className}`}>{m.label}</Badge>;
}

export default function ApiStorage() {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return INTEGRATIONS;
    return INTEGRATIONS.filter(i =>
      [i.name, i.vendor, i.category, i.description, ...i.usedIn, ...i.secrets]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [q]);

  const groups = useMemo(() => {
    const map = new Map<string, Integration[]>();
    for (const i of filtered) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: '#C9A96E22' }}>
            <KeyRound className="w-6 h-6" style={{ color: '#C9A96E' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Storage</h1>
            <p className="text-sm text-gray-500">
              Every external service wired into SkyelineOS — what it is and what it does for the app.
            </p>
          </div>
        </div>

        {/* Security note */}
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 flex gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            <strong>No secret values are shown here.</strong> Keys live in Google
            Secret Manager (server-side, bound to the <code>api</code> function)
            and never reach the browser. Each card lists the <em>variable name</em>{' '}
            to look up if you need to rotate a key — not the value itself. For
            cost/billing tracking, see the <strong>Subscriptions</strong> page.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search integrations, descriptions, or key names…"
            className="pl-9"
          />
        </div>

        {/* Grouped catalog */}
        {groups.map(([category, items]) => (
          <div key={category} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{category}</h2>
              <Badge variant="secondary" className="text-[10px] h-4">{items.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map(i => {
                const Icon = i.icon;
                return (
                  <Card key={i.name} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <span>{i.name}</span>
                        </CardTitle>
                        <StatusBadge status={i.status} />
                      </div>
                      <p className="text-[11px] text-gray-400">{i.vendor}</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-gray-700 leading-relaxed">{i.description}</p>

                      <div className="flex flex-wrap gap-1">
                        {i.usedIn.map(u => (
                          <Badge key={u} variant="outline" className="text-[10px] text-gray-600">{u}</Badge>
                        ))}
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Secret Manager keys</p>
                        <div className="flex flex-wrap gap-1.5">
                          {i.secrets.map(s => (
                            <code
                              key={s}
                              className="text-[11px] font-mono bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 border border-gray-200"
                            >
                              {s}
                            </code>
                          ))}
                        </div>
                      </div>

                      {i.manageUrl && (
                        <a
                          href={i.manageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-[#C9A96E] hover:underline"
                        >
                          Manage / rotate key <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No integrations match “{q}”.</p>
        )}

        <p className="text-[11px] text-gray-400 pt-2">
          Source of truth: the <code>api</code> function’s <code>secrets</code> array in{' '}
          <code>functions/src/index.ts</code>. Update this page when you add or remove an integration.
        </p>
      </div>
    </AppLayout>
  );
}
