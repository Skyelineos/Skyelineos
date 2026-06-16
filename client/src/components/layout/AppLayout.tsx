import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { TopNavbar } from './TopNavbar';
import { useMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useUserPreferences } from '@/contexts/UserPreferencesContext';

interface AppLayoutProps {
  children: React.ReactNode;
  currentProject?: string;
}

export function AppLayout({ children, currentProject }: AppLayoutProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isMobile = useMobile();

  return (
    // Mobile Audit Batch 1 — app shell uses h-screen + min-h-[100dvh] so the
    // outer flex still owns the viewport on desktop (sidebar stays fixed
    // height) while iOS Safari's collapsible URL bar doesn't clip the right-
    // side scroll container. overflow-hidden is intentional on the OUTER
    // shell — the inner <main> is the scroll surface.
    <div className="flex h-screen min-h-[100dvh] bg-gray-50 overflow-hidden">
      {/* Persistent left sidebar — always visible on desktop */}
      {!isMobile && (
        <div className="flex-shrink-0 w-64">
          <Sidebar isOpen={true} onToggle={() => {}} />
        </div>
      )}

      {/* Mobile slide-in nav */}
      {isMobile && (
        <MobileNav isOpen={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      )}

      {/* Right side: topbar + content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNavbar
          onMenuToggle={() => setMobileNavOpen(o => !o)}
          currentProject={currentProject}
        />
        {/* Mobile Audit Batch 1 — vertical padding scales with breakpoint so
            phones get focused breathing room (py-6) without burning a quarter
            of the viewport. Bottom pad anchors to safe-area-inset-bottom +
            1.5rem so primary CTAs never hide under the iOS home indicator. */}
        <main
          className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 sm:py-8 md:py-12"
          style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
        >
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}