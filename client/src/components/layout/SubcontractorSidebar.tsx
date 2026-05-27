import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  Home,
  Hammer,
  Calendar,
  Shield,
  DollarSign,
  FileText,
  FileSignature,
  MessageSquare,
  Camera,
  X,
  Menu,
  LogOut,
} from 'lucide-react';

const sidebarItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    path: 'dashboard'
  },
  {
    id: 'bid-requests',
    label: 'Bid Requests',
    icon: Hammer,
    path: 'bid-requests'
  },
  {
    id: 'bids',
    label: 'My Bids',
    icon: Hammer,
    path: 'bids'
  },
  {
    id: 'contracts',
    label: 'My Contracts',
    icon: FileSignature,
    path: 'contracts'
  },
  {
    id: 'schedule',
    label: 'Job Schedule',
    icon: Calendar,
    path: 'schedule'
  },
  {
    id: 'compliance',
    label: 'Compliance',
    icon: Shield,
    path: 'compliance'
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: DollarSign,
    path: 'invoices'
  },
  {
    id: 'purchase-orders',
    label: 'Purchase Orders',
    icon: FileText,
    path: 'purchase-orders'
  },
  {
    id: 'progress-photos',
    label: 'Progress Photos',
    icon: Camera,
    path: 'progress-photos'
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: MessageSquare,
    path: 'messages'
  }
];

interface SubcontractorSidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function SubcontractorSidebar({ isOpen = false, onToggle }: SubcontractorSidebarProps) {
  const { user, logout } = useAuth();
  const displayCompany = (user as any)?.company || user?.name || 'Subcontractor';

  const handleLogout = async () => {
    try {
      await logout();
      // AuthContext clears state; Wouter will route to /sign-in via ProtectedRoute.
      window.location.href = '/sign-in';
    } catch (e) {
      console.error('[sub-sidebar] logout failed', e);
    }
  };
  const [location, setLocation] = useLocation();
  // Extract the tab from URL like /subcontractor-portal/dashboard
  const pathParts = location.split('/').filter(Boolean);
  let currentTab = pathParts[pathParts.length - 1] || 'dashboard';
  

  
  // Handle base subcontractor-portal URL (redirect to dashboard)
  if (location === '/subcontractor-portal' || currentTab === 'subcontractor-portal') {
    currentTab = 'dashboard';
    // Redirect to dashboard if we're on the base URL
    if (location === '/subcontractor-portal') {
      setLocation('/subcontractor-portal/dashboard');
    }
  }



  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar — matches the GC sidebar's brand-black background, gold
          accents, and Inter typography for one consistent shell across every
          portal. */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        {/* Mobile close button */}
        <div
          className="flex items-center justify-between px-5 py-4 lg:hidden flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(201,169,110,0.2)' }}
        >
          <div className="space-y-0.5">
            <h2 className="text-base font-heading font-semibold text-white" style={{ letterSpacing: '0.04em' }}>
              Subcontractor Portal
            </h2>
            <p
              className="text-xs font-sans tracking-widest uppercase"
              style={{ color: '#C9A96E', letterSpacing: '0.15em' }}
            >
              {displayCompany}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-white hover:bg-white/5"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Desktop header */}
        <div
          className="px-5 py-5 hidden lg:block flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(201,169,110,0.2)' }}
        >
          <h2 className="text-xl font-heading font-semibold text-white" style={{ letterSpacing: '0.04em' }}>
            Skyeline Homes
          </h2>
          <p
            className="text-xs mt-0.5 font-sans font-light tracking-widest uppercase"
            style={{ color: '#C9A96E', letterSpacing: '0.15em' }}
          >
            Subcontractor Portal
          </p>
          <p className="text-sm font-sans mt-2 text-white/70 truncate">
            {displayCompany}
          </p>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.path;
            const linkPath = `/subcontractor-portal/${item.path}`;

            return (
              <Link
                key={item.path}
                href={linkPath}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-sans font-medium transition-all duration-150',
                  isActive ? 'text-white' : 'hover:text-white',
                )}
                style={
                  isActive
                    ? { backgroundColor: 'rgba(201,169,110,0.15)', color: '#C9A96E', borderLeft: '2px solid #C9A96E' }
                    : { color: 'rgba(255,255,255,0.55)' }
                }
                onClick={() => {
                  // Close mobile sidebar when navigating
                  if (window.innerWidth < 1024 && onToggle) {
                    onToggle();
                  }
                }}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Sign Out — also placed inline at the end of the scrollable
              nav (in addition to the footer button below) so the action
              is always reachable on small mobile viewports where the
              fixed-footer logout can fall below the iOS chrome / home
              indicator. Divider + dimmer color keep it visually distinct
              from the destination nav items above. */}
          <div className="pt-3 mt-3" style={{ borderTop: '1px solid rgba(201,169,110,0.15)' }}>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-sans font-medium transition-colors hover:text-white"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>

        {/* Footer (desktop primarily — mobile users get the inline button
            inside <nav> above, which won't be clipped by iOS chrome). */}
        <div
          className="px-5 py-4 flex-shrink-0 space-y-3"
          style={{ borderTop: '1px solid rgba(201,169,110,0.15)' }}
        >
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-sans font-medium transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
          <p
            className="text-xs font-sans text-center"
            style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em' }}
          >
            © {new Date().getFullYear()} Skyeline Homes
          </p>
        </div>
      </aside>
    </>
  );
}