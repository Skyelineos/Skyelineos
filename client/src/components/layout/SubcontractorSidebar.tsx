import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Home,
  Hammer,
  Calendar,
  Shield,
  DollarSign,
  FileText,
  MessageSquare,
  Camera,
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

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between p-4 lg:hidden border-b border-slate-700">
          <div className="text-lg font-semibold">Subcontractor Portal</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-white hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Desktop header */}
        <div className="p-4 border-b border-slate-700 hidden lg:block">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">
              Subcontractor Portal
            </h2>
            <p className="text-sm text-slate-300">
              Lopez Premium Flooring
            </p>
          </div>
        </div>

        {/* Mobile header */}
        <div className="p-4 border-b border-slate-700 lg:hidden">
          <div className="text-lg font-semibold text-white mb-2">
            Subcontractor Portal
          </div>
          <p className="text-sm text-slate-300">
            Lopez Premium Flooring
          </p>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col p-4 space-y-1">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.path;
            const linkPath = `/subcontractor-portal/${item.path}`;
            
            return (
              <Link
                key={item.path}
                href={linkPath}
                className={cn(
                  "group flex items-center space-x-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive
                    ? "bg-blue-600 text-white"
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
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="text-xs text-slate-400 text-center">
            <p>Subcontractor Portal</p>
            <p className="mt-1">Skyeline Homes</p>
          </div>
        </div>
      </aside>
    </>
  );
}