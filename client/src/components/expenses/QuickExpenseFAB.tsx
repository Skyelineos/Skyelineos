// QuickExpenseFAB — a floating action button that opens the QuickExpenseCapture
// modal. Only renders on mobile breakpoints (the GC + sub on-site case).
// Brand gold (#C9A96E) circle, camera icon, fixed bottom-right.
// Suppressed on public/unauthenticated routes (sign-in, portal login, marketing
// pages) so the FAB never leaks over the login card or sales copy.

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useLocation } from 'wouter';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { QuickExpenseCapture } from './QuickExpenseCapture';

// Routes where the FAB should never render. Includes auth flows, marketing
// pages, and standalone portals with their own capture UI.
const FAB_HIDDEN_PREFIXES = [
  '/sign-in',
  '/portal-login',
  '/learn-more',
  '/sms-privacy',
  '/sms-terms',
  '/giveaway',
  '/bid/respond',
  '/unauthorized',
  '/not-authorized',
];

export function QuickExpenseFAB() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  if (!isMobile) return null;
  // Hide on public/unauth pages regardless of stale test-mode flags.
  if (FAB_HIDDEN_PREFIXES.some((p) => location.startsWith(p))) return null;
  // Hide until we know the viewer — avoids a flash on the sign-in page.
  if (!user) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Capture expense"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-[#C9A96E] hover:bg-[#A8864A] text-white rounded-full w-14 h-14 shadow-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-[#C9A96E] focus:ring-offset-2"
      >
        <Camera className="w-6 h-6" />
      </button>
      <QuickExpenseCapture open={open} onOpenChange={setOpen} />
    </>
  );
}

export default QuickExpenseFAB;
