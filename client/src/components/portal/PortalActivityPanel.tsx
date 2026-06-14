// Internal (Skyeline-team) view of how a homeowner is engaging with their
// portal. Opens from the project Overview's Client Information card. Pulls
// together: invite/account status, what they've opened, what's waiting on
// their decision, and a chronological activity feed.
import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { InviteToPortalButton } from './InviteToPortalButton';
import {
  fetchClientActivity,
  describeActivity,
  type ClientActivityEvent,
} from '@/lib/clientActivity';
import {
  Activity,
  CheckCircle2,
  Clock,
  LogIn,
  Mail,
  AlertCircle,
  FileText,
  Palette,
  CircleSlash,
} from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  contactId?: string;
  clientName?: string;
  clientEmail?: string;
}

interface Loaded {
  invitedAt?: Date | null;
  inviteStatus?: string;
  linkedUserId?: string;
  claimedAt?: Date | null;
  lastLogin?: Date | null;
  events: ClientActivityEvent[];
  pendingSelections: number;
  totalSelections: number;
  unpaidInvoices: number;
  latestInvoiceTitle?: string;
  viewedSelections: boolean;
  viewedInvoice: boolean;
}

function tsToDate(v: any): Date | null {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}
function ago(d?: Date | null): string {
  if (!d) return '—';
  const ms = Date.now() - d.getTime();
  const day = 86400000;
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  if (ms < day) return `${Math.round(ms / 3600000)}h ago`;
  if (ms < 30 * day) return `${Math.round(ms / day)}d ago`;
  return d.toLocaleDateString();
}

export function PortalActivityPanel({ open, onClose, projectId, contactId, clientName, clientEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const out: Loaded = {
        events: [],
        pendingSelections: 0,
        totalSelections: 0,
        unpaidInvoices: 0,
        viewedSelections: false,
        viewedInvoice: false,
      };
      try {
        // Contact → linked account + claim/login timestamps.
        if (contactId) {
          const cSnap = await getDoc(doc(db, 'contacts', contactId));
          if (cSnap.exists()) {
            const c = cSnap.data() as any;
            out.linkedUserId = c.linkedUserId || undefined;
            out.claimedAt = tsToDate(c.linkedAt);
            out.lastLogin = tsToDate(c.lastPortalLogin);
          }
          // Most recent portal invite for this contact.
          try {
            const iSnap = await getDocs(
              query(
                collection(db, 'portalInvites'),
                where('contactId', '==', contactId),
                orderBy('createdAt', 'desc'),
                limit(1),
              ),
            );
            if (!iSnap.empty) {
              const inv = iSnap.docs[0].data() as any;
              out.invitedAt = tsToDate(inv.createdAt);
              out.inviteStatus = inv.status || 'pending';
            }
          } catch { /* index may be missing; non-fatal */ }
        }

        // Activity feed (by the client's auth uid).
        if (out.linkedUserId) {
          out.events = await fetchClientActivity(out.linkedUserId, 60);
          for (const e of out.events) {
            if (e.type === 'login' && !out.lastLogin) out.lastLogin = tsToDate(e.createdAt);
            if (e.type === 'view_selections' || (e.type === 'view_tab' && /selection/i.test(e.label || '')))
              out.viewedSelections = true;
            if (e.type === 'view_invoice' || (e.type === 'view_tab' && /financ|invoice|draw/i.test(e.label || '')))
              out.viewedInvoice = true;
          }
          if (!out.lastLogin && out.events.find((e) => e.type === 'login'))
            out.lastLogin = tsToDate(out.events.find((e) => e.type === 'login')!.createdAt);
        }

        // Selections awaiting the client's decision.
        try {
          const selSnap = await getDocs(collection(db, 'projects', projectId, 'selections'));
          out.totalSelections = selSnap.size;
          out.pendingSelections = selSnap.docs.filter(
            (d) => (d.data() as any).clientApprovalStatus !== 'Approved',
          ).length;
        } catch { /* none */ }

        // Unpaid draws/invoices.
        try {
          const drawSnap = await getDocs(collection(db, 'projects', projectId, 'draws'));
          const unpaid = drawSnap.docs.filter((d) => (d.data() as any).status !== 'paid');
          out.unpaidInvoices = unpaid.length;
          const latest = drawSnap.docs
            .map((d) => d.data() as any)
            .sort((a, b) => (b.number || 0) - (a.number || 0))[0];
          if (latest) out.latestInvoiceTitle = latest.title || `Draw ${latest.number ?? ''}`.trim();
        } catch { /* none */ }
      } finally {
        if (!cancelled) {
          setData(out);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, projectId, contactId]);

  const accountState: { label: string; tone: string; icon: any } = (() => {
    if (data?.linkedUserId) return { label: 'Active — signed in', tone: 'bg-green-100 text-green-800', icon: CheckCircle2 };
    if (data?.invitedAt) return { label: 'Invited — not signed in yet', tone: 'bg-amber-100 text-amber-800', icon: Clock };
    return { label: 'Not invited yet', tone: 'bg-gray-100 text-gray-600', icon: CircleSlash };
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#C9A96E]" />
            Portal Activity
          </DialogTitle>
          <DialogDescription>
            {clientName ? `How ${clientName} is engaging with their portal.` : 'Client portal engagement.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading activity…</div>
        ) : !data ? (
          <div className="py-10 text-center text-sm text-gray-500">No data.</div>
        ) : (
          <div className="space-y-5">
            {/* Account status */}
            <section className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <accountState.icon className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-800">Account</span>
                </div>
                <Badge className={accountState.tone}>{accountState.label}</Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  Invited: {data.invitedAt ? data.invitedAt.toLocaleDateString() : 'never'}
                </div>
                <div className="flex items-center gap-2">
                  <LogIn className="h-3.5 w-3.5 text-gray-400" />
                  Last signed in: {ago(data.lastLogin)}
                </div>
              </div>
              <div className="mt-3">
                <InviteToPortalButton
                  email={clientEmail}
                  firstName={clientName?.split(' ')[0]}
                  contactId={contactId}
                  resend={!!data.invitedAt && !data.linkedUserId}
                  label={data.linkedUserId ? 'Re-send portal link' : undefined}
                />
              </div>
            </section>

            {/* Engagement */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Engagement</h4>
              <div className="grid grid-cols-2 gap-2">
                <EngagementChip icon={Palette} label="Opened selections" yes={data.viewedSelections} />
                <EngagementChip icon={FileText} label="Viewed an invoice" yes={data.viewedInvoice} />
              </div>
            </section>

            {/* Pending on the client */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Waiting on the client</h4>
              <div className="space-y-2">
                <PendingRow
                  icon={Palette}
                  label="Selections needing a decision"
                  count={data.pendingSelections}
                  total={data.totalSelections}
                />
                <PendingRow icon={FileText} label="Unpaid invoices" count={data.unpaidInvoices} />
              </div>
            </section>

            {/* Activity feed */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent activity</h4>
              {data.events.length === 0 ? (
                <p className="rounded-md bg-gray-50 px-3 py-3 text-sm text-gray-500">
                  No portal activity recorded yet
                  {!data.linkedUserId && ' — they haven’t signed in.'}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.events.slice(0, 25).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-gray-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#C9A96E]" />
                        {describeActivity(e)}
                      </span>
                      <span className="shrink-0 text-xs text-gray-400">{ago(tsToDate(e.createdAt))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EngagementChip({ icon: Icon, label, yes }: { icon: any; label: string; yes: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
      yes ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-200 bg-gray-50 text-gray-500'
    }`}>
      {yes ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

function PendingRow({ icon: Icon, label, count, total }: { icon: any; label: string; count: number; total?: number }) {
  const clear = count === 0;
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
      <span className="flex items-center gap-2 text-gray-700">
        <Icon className="h-4 w-4 text-gray-400" />
        {label}
      </span>
      {clear ? (
        <Badge className="bg-green-100 text-green-800">All clear</Badge>
      ) : (
        <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {count}{typeof total === 'number' ? ` of ${total}` : ''}
        </Badge>
      )}
    </div>
  );
}
