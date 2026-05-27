import { Link, useRoute, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  BarChart3,
  Receipt,
  CreditCard,
  TrendingUp,
  PieChart,
  Calculator,
  FileText,
  Settings,
  X,
} from 'lucide-react';

const financialTabs = [
  { label: 'Overview',         path: '',                icon: BarChart3 },
  { label: 'Cash Flow',        path: 'cash-flow',       icon: TrendingUp },
  { label: 'Budget Analysis',  path: 'budget-analysis', icon: PieChart },
  { label: 'Invoices',         path: 'invoices',        icon: Receipt },
  { label: 'Payments',         path: 'payments',        icon: CreditCard },
  { label: 'Purchase Orders',  path: 'purchase-orders', icon: FileText },
  { label: 'Cost Tracking',    path: 'cost-tracking',   icon: Calculator },
  { label: 'Reports',          path: 'reports',         icon: FileText },
  { label: 'Settings',         path: 'settings',        icon: Settings },
];

interface FinancialsSidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function FinancialsSidebar({ isOpen = false, onToggle }: FinancialsSidebarProps) {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/financials/:tab?');
  const currentTab = params?.tab || '';

  const handleBackClick = () => setLocation('/dashboard');

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar — matches the global GC sidebar's brand-black + gold accent
          language. Same typography weights, same gold hairline dividers,
          same active-item treatment (gold left border + tinted bg + gold
          text). One visual shell across every nested module. */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        {/* Mobile close button row */}
        <div
          className="flex items-center justify-between px-5 py-4 lg:hidden flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(201,169,110,0.2)' }}
        >
          <div className="space-y-0.5">
            <h2 className="text-base font-heading font-semibold text-white" style={{ letterSpacing: '0.04em' }}>
              Finance
            </h2>
            <p
              className="text-xs font-sans tracking-widest uppercase"
              style={{ color: '#C9A96E', letterSpacing: '0.15em' }}
            >
              Company Financial Overview
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
          <button
            type="button"
            onClick={handleBackClick}
            className="flex items-center gap-2 mb-3 text-sm font-sans transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h2 className="text-xl font-heading font-semibold text-white" style={{ letterSpacing: '0.04em' }}>
            Finance
          </h2>
          <p
            className="text-xs mt-0.5 font-sans font-light tracking-widest uppercase"
            style={{ color: '#C9A96E', letterSpacing: '0.15em' }}
          >
            Company Financial Overview
          </p>
        </div>

        {/* Mobile back button (below header) */}
        <div
          className="px-5 py-3 lg:hidden flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(201,169,110,0.15)' }}
        >
          <button
            type="button"
            onClick={handleBackClick}
            className="flex items-center gap-2 text-sm font-sans transition-colors hover:text-white"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
          {financialTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.path;
            const linkPath = `/financials${tab.path ? `/${tab.path}` : ''}`;

            return (
              <Link
                key={tab.path || 'overview'}
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
                  if (window.innerWidth < 1024 && onToggle) onToggle();
                }}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer brand mark */}
        <div
          className="px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(201,169,110,0.15)' }}
        >
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
