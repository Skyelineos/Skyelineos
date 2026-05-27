// /bid/respond/:token — public landing page for magic-link bid invitations.
// Per docs/sub-portal-design.md Slice 1.
//
// Flow:
//   - Page mounts → fetches public bid context via /api/bid-requests/by-token/:token
//   - If token invalid/expired → friendly error state
//   - If user not signed in → prompts sign-in / sign-up CTA (preserves token in ?next=)
//   - If signed in but not yet verified → shows verification-pending banner
//   - If signed in + verified → shows the bid response CTA (form lives in Slice 2)
//   - If already responded → shows submission summary
//
// Slice 1 ships this scaffold with the actual response form (general 3-tier /
// item-specific) coming in Slice 2.

import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/auth/AuthContext';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Building2, Loader2, AlertTriangle, CheckCircle2, Clock, FileText, ShieldCheck,
} from 'lucide-react';

interface BidContext {
  bidRequestId: string;
  projectId: string;
  projectName?: string;
  trade?: string;
  type: 'general' | 'item';
  stage: string;
  selectionTitle?: string;
  selectionSpecs?: string;
  tierGuidance?: { parade: string; midLuxury: string; lowLuxury: string };
  customMessage?: string;
  dueByDate: string;
  requesterName?: string;
  vendor: {
    vendorName: string;
    email?: string;
    contactId?: string;
    bidStatus: 'pending' | 'viewed' | 'submitted' | 'declined' | 'expired';
    alreadyResponded: boolean;
    bidResponseId?: string;
  };
  tokenExpired: boolean;
}

interface SubCompliance {
  w9Filed?: boolean;
  insuranceCurrent?: boolean;
  agreementSigned?: boolean;
}

export default function BidRespond() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [ctx, setCtx] = useState<BidContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<SubCompliance>({});

  // Fetch bid context on mount
  useEffect(() => {
    if (!token) {
      setError('Missing token in URL');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/bid-requests/by-token/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error || `Could not load bid request (status ${res.status})`);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as BidContext;
        setCtx(data);
      } catch (e: any) {
        setError(e?.message || 'Network error loading bid request');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Load compliance flags if signed-in sub
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const uid = (user as any).firebaseUid || (user as any).id?.toString();
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const d = snap.data() as any;
          setCompliance({
            w9Filed: !!d.w9Filed,
            insuranceCurrent: !!d.insuranceCurrent,
            agreementSigned: !!d.agreementSigned,
          });
        }
      } catch {
        /* best effort */
      }
    })();
  }, [isAuthenticated, user]);

  // ── States ────────────────────────────────────────────────────────────────

  if (loading || authLoading) {
    return <PageFrame><Centered><Loader2 className="h-8 w-8 animate-spin" /></Centered></PageFrame>;
  }

  if (error || !ctx) {
    return (
      <PageFrame>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              <CardTitle>Bid request unavailable</CardTitle>
            </div>
            <CardDescription>{error || 'Unknown error'}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If you believe this link should still be valid, contact the Skyeline Homes team directly.
            </p>
          </CardContent>
        </Card>
      </PageFrame>
    );
  }

  if (ctx.tokenExpired) {
    return (
      <PageFrame>
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-muted-foreground" />
              <CardTitle>This bid invitation has expired</CardTitle>
            </div>
            <CardDescription>
              The window to respond to this bid request has closed. If you'd still like to submit a bid,
              reply to the original email or text and we'll re-open the request.
            </CardDescription>
          </CardHeader>
        </Card>
      </PageFrame>
    );
  }

  const dueDate = new Date(ctx.dueByDate);
  const dueDateLabel = dueDate.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Header: project + scope ──────────────────────────────────────────────

  const header = (
    <Card className="max-w-3xl mx-auto mb-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">
              {ctx.type === 'general' ? 'Bid request' : (ctx.stage === 'final' ? 'Updated bid request' : 'Bid request')}
            </CardTitle>
            <CardDescription className="mt-1 text-base">
              Hi {ctx.vendor.vendorName} — Skyeline Homes
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-base whitespace-nowrap">
            Due {dueDate.toLocaleDateString()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
          {ctx.projectName && (
            <div>
              <div className="text-muted-foreground">Project</div>
              <div className="font-medium">{ctx.projectName}</div>
            </div>
          )}
          {ctx.trade && (
            <div>
              <div className="text-muted-foreground">Trade</div>
              <div className="font-medium">{ctx.trade}</div>
            </div>
          )}
          <div>
            <div className="text-muted-foreground">Response needed by</div>
            <div className="font-medium">{dueDateLabel}</div>
          </div>
        </div>

        {ctx.type === 'item' && ctx.selectionTitle && (
          <div className="pt-3 border-t">
            <div className="text-sm text-muted-foreground">Item</div>
            <div className="font-medium text-base">{ctx.selectionTitle}</div>
            {ctx.selectionSpecs && (
              <pre className="mt-2 text-sm whitespace-pre-wrap font-sans text-muted-foreground">
                {ctx.selectionSpecs}
              </pre>
            )}
          </div>
        )}

        {ctx.type === 'general' && ctx.tierGuidance && (
          <div className="pt-3 border-t space-y-3">
            <div className="text-sm text-muted-foreground">
              Skyeline builds a step above standard builder grade. We bid at three tiers:
            </div>
            <TierRow label="Parade Home Level" description={ctx.tierGuidance.parade} />
            <TierRow label="Mid Luxury Level" description={ctx.tierGuidance.midLuxury} />
            <TierRow label="Low Luxury Level" description={ctx.tierGuidance.lowLuxury} />
          </div>
        )}

        {ctx.customMessage && (
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>{ctx.customMessage}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );

  // ── CTA varies by signed-in / verified / responded state ────────────────

  // Already responded
  if (ctx.vendor.alreadyResponded) {
    return (
      <PageFrame>
        {header}
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <CardTitle>Bid submitted</CardTitle>
            </div>
            <CardDescription>
              We received your bid for this request. The Skyeline team will review and follow up.
            </CardDescription>
          </CardHeader>
          {isAuthenticated && (
            <CardContent>
              <Button onClick={() => setLocation('/sub')}>Go to your portal</Button>
            </CardContent>
          )}
        </Card>
      </PageFrame>
    );
  }

  // Not signed in: prompt sign-in / sign-up, preserving the token in ?next=
  if (!isAuthenticated) {
    const next = encodeURIComponent(`/bid/respond/${token}`);
    const email = ctx.vendor.email ? `&email=${encodeURIComponent(ctx.vendor.email)}` : '';
    const signInUrl = `/sign-in?next=${next}${email}&bidToken=${encodeURIComponent(token!)}`;
    return (
      <PageFrame>
        {header}
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle>Submit through your Skyeline Subcontractor Portal</CardTitle>
            <CardDescription>
              Sign in if you already have a portal account, or create one — it's quick.
              Once you're in, you'll be able to submit bids, view awarded contracts, and receive
              project updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="lg" className="w-full" onClick={() => setLocation(signInUrl)}>
              Sign in or create account
            </Button>
            <p className="text-xs text-muted-foreground">
              First-time subs will be guided through a brief sign-up + document upload
              (W-9, Certificate of Insurance, Subcontractor Agreement) before submitting bids.
            </p>
          </CardContent>
        </Card>
      </PageFrame>
    );
  }

  // Signed in — check verification status
  const verified = !!(compliance.w9Filed && compliance.insuranceCurrent && compliance.agreementSigned);
  if (!verified) {
    return (
      <PageFrame>
        {header}
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-amber-600" />
              <CardTitle>Verification required before submitting</CardTitle>
            </div>
            <CardDescription>
              To submit bids, we need three things on file:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <ChecklistRow done={!!compliance.w9Filed} label="W-9 tax form" />
            <ChecklistRow done={!!compliance.insuranceCurrent} label="Certificate of Insurance (general liability + workers' comp)" />
            <ChecklistRow done={!!compliance.agreementSigned} label="Signed Subcontractor Agreement" />
            <div className="pt-3">
              <Button onClick={() => setLocation('/sub/onboarding')}>
                Complete verification
              </Button>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Skyeline typically reviews new submissions within 1 business day. We'll notify you
              when you're cleared to bid.
            </p>
          </CardContent>
        </Card>
      </PageFrame>
    );
  }

  // Verified + signed-in + not yet responded → ready to submit
  // The actual response form is built in Slice 2. For Slice 1 we direct them
  // to the existing sub portal where bid requests appear.
  return (
    <PageFrame>
      {header}
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle>You're ready to submit</CardTitle>
          </div>
          <CardDescription>
            Open your portal to enter your bid amount{ctx.type === 'general' ? ', tier breakdown, ' : ' '}
            and lead time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            size="lg"
            className="w-full"
            onClick={() => setLocation(`/sub`)}
          >
            Open my portal & submit bid
          </Button>
        </CardContent>
      </Card>
    </PageFrame>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Building2 className="h-6 w-6" />
          <span className="font-semibold text-lg">Skyeline Homes — Subcontractor Portal</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center min-h-[40vh]">{children}</div>;
}

function TierRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex gap-3">
      <Badge variant="secondary" className="shrink-0 mt-0.5">{label}</Badge>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
      )}
      <span className={done ? 'text-muted-foreground line-through' : ''}>{label}</span>
    </div>
  );
}
