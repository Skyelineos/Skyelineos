import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  Home,
  FileText,
  Calendar,
  MessageSquare,
  CheckSquare,
  Shield,
  Palette,
  Camera,
  DollarSign,
  FileSignature,
  ArrowLeft,
  LogOut,
  X,
  Menu
} from 'lucide-react';

const sidebarItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Home,
    path: 'dashboard'
  },
  {
    id: 'contracts',
    label: 'My Contract',
    icon: FileSignature,
    path: 'contracts'
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    path: 'documents'
  },
  {
    id: 'design',
    label: 'Design',
    icon: Palette,
    path: 'design'
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: Calendar,
    path: 'schedule'
  },
  {
    id: 'estimates',
    label: 'Estimates',
    icon: DollarSign,
    path: 'estimates'
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: MessageSquare,
    path: 'messages'
  },
  {
    id: 'punch-list',
    label: 'Punch List',
    icon: CheckSquare,
    path: 'punch-list'
  },
  {
    id: 'warranty',
    label: 'Warranty',
    icon: Shield,
    path: 'warranty'
  }
];

interface ClientSidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function ClientSidebar({ isOpen = false, onToggle }: ClientSidebarProps) {
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();
  const currentTab = location.split('/')[2] || 'dashboard';

  const handleBackClick = () => {
    setLocation('/dashboard');
  };

  // Hard redirect to /sign-in after logout so any cached portal state is
  // dropped. Matches the pattern already used in SubcontractorSidebar
  // and TopNavbar's user menu.
  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/sign-in';
    } catch (e) {
      console.error('[client-sidebar] logout failed', e);
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 text-white transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between p-4 lg:hidden border-b border-slate-700">
          <div className="text-lg font-semibold">Client Portal</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-white hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Desktop header with Back Button */}
        <div className="p-4 border-b border-slate-700 hidden lg:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackClick}
            className="mb-3 w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">
              Client Portal
            </h2>
            <p className="text-sm text-slate-300">
              Jennifer Brown
            </p>
          </div>
        </div>

        {/* Mobile header with back button */}
        <div className="p-4 border-b border-slate-700 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackClick}
            className="mb-3 w-full justify-start text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col p-4 space-y-1">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.path;
            const linkPath = `/client-portal/${item.path}`;
            
            return (
              <Link
                key={item.path}
                href={linkPath}
                className={cn(
                  "group flex items-center space-x-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
                onClick={() => {
                  // Close mobile sidebar when navigating
                  if (window.innerWidth < 1024 && onToggle) {
                    onToggle();
                  }
                }}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Sign Out — visually separated from the nav by a divider so it
              reads as an account action, not another destination. Placed
              inside the scrollable nav (not the absolute footer) so it
              stays reachable on small mobile viewports where the footer
              can fall below the chrome. */}
          <div className="pt-3 mt-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="text-xs text-slate-400 text-center">
            <p>Client Portal</p>
            <p className="mt-1">Skyeline Homes</p>
          </div>
        </div>
      </aside>
    </>
  );
}