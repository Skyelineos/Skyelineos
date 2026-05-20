import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, ArrowRight, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

/**
 * When a bid-request email link includes a `?email=X` query param, that's
 * the **intended recipient** of the invite. If the signed-in user's email
 * doesn't match X, surface a banner so they know they're looking at the
 * wrong account — common when the GC (admin) clicks a sub's emailed link
 * and lands in admin view of the sub portal.
 *
 * The banner offers two actions:
 *  - Sign in as X (signs out current user, redirects to /sign-in with email prefilled)
 *  - Continue as me (dismisses the banner for this session)
 */
export function RecipientMismatchBanner() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [intendedEmail, setIntendedEmail] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const e = (params.get('email') || '').trim();
    setIntendedEmail(e);
    // Reset dismissal whenever the link changes.
    setDismissed(false);
  }, [location]);

  if (!intendedEmail || dismissed) return null;
  const current = (user?.email || '').toLowerCase().trim();
  const intended = intendedEmail.toLowerCase().trim();
  if (!current || current === intended) return null;

  const handleSwitch = async () => {
    try {
      await logout();
    } catch { /* best-effort */ }
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    const emailParam = encodeURIComponent(intendedEmail);
    window.location.href = `/sign-in?email=${emailParam}&next=${next}`;
  };

  return (
    <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          This bid invite was sent to <span className="font-mono">{intendedEmail}</span>
        </p>
        <p className="text-xs text-amber-800 mt-0.5">
          You're signed in as <span className="font-mono">{user?.email}</span>. Sign in as the invited sub to view and submit on their behalf.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDismissed(true)}
          className="text-amber-800 border-amber-300 hover:bg-amber-100"
        >
          Continue as me
        </Button>
        <Button
          size="sm"
          onClick={handleSwitch}
          className="gap-1.5 text-white"
          style={{ backgroundColor: '#C9A96E' }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign in as {intendedEmail.split('@')[0]}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
