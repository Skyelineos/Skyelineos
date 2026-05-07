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
    <div className="flex h-screen bg-gray-50 overflow-hidden">
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
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}