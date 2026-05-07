import { useState } from 'react';
import { Link, useRoute, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';

import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  BarChart3,
  DollarSign,
  Receipt,
  CreditCard,
  TrendingUp,
  PieChart,
  Calculator,
  FileText,
  Settings,
  X,
  Menu
} from 'lucide-react';

const financialTabs = [
  { 
    label: 'Overview', 
    path: '', 
    icon: BarChart3,
    description: 'Financial dashboard & summary'
  },
  { 
    label: 'Cash Flow', 
    path: 'cash-flow', 
    icon: TrendingUp,
    description: 'Income vs expenses analysis'
  },
  { 
    label: 'Budget Analysis', 
    path: 'budget-analysis', 
    icon: PieChart,
    description: 'Project budget tracking'
  },
  { 
    label: 'Invoices', 
    path: 'invoices', 
    icon: Receipt,
    description: 'Invoice management'
  },
  { 
    label: 'Payments', 
    path: 'payments', 
    icon: CreditCard,
    description: 'Payment processing'
  },
  { 
    label: 'Purchase Orders', 
    path: 'purchase-orders', 
    icon: FileText,
    description: 'PO tracking & management'
  },
  { 
    label: 'Cost Tracking', 
    path: 'cost-tracking', 
    icon: Calculator,
    description: 'Project cost analysis'
  },
  { 
    label: 'Reports', 
    path: 'reports', 
    icon: FileText,
    description: 'Financial reports & exports'
  },
  { 
    label: 'Settings', 
    path: 'settings', 
    icon: Settings,
    description: 'Financial preferences'
  }
];

interface FinancialsSidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function FinancialsSidebar({ isOpen = false, onToggle }: FinancialsSidebarProps) {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute('/financials/:tab?');
  const currentTab = params?.tab || '';
  const { accentColor } = useTheme();

  const handleBackClick = () => {
    setLocation('/dashboard');
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
        style={{ backgroundColor: '#1b1b1b' }}
      >
      {/* Mobile close button */}
      <div className="flex items-center justify-between p-4 lg:hidden border-b border-gray-600">
        <div className="text-lg font-semibold">Financial Management</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="text-white hover:bg-gray-700"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Header with Back Button */}
      <div className="p-4 border-b border-gray-600 hidden lg:block">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackClick}
          className="mb-3 w-full justify-start text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
        
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">
            Financial Management
          </h2>
          <p className="text-sm text-gray-300">
            Company Financial Overview
          </p>
        </div>
      </div>

      {/* Mobile header with back button */}
      <div className="p-4 border-b border-gray-600 lg:hidden">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackClick}
          className="mb-3 w-full justify-start text-gray-300 hover:text-white hover:bg-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      {/* Navigation Menu */}
      <nav className="flex flex-col p-4 space-y-1">
        {financialTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.path;
          const linkPath = `/financials${tab.path ? `/${tab.path}` : ''}`;
          
          return (
            <Link
              key={tab.path || 'overview'}
              href={linkPath}
              className={cn(
                "group flex items-center space-x-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors",
                isActive
                  ? "text-white"
                  : "text-gray-300 hover:bg-gray-700 hover:text-white"
              )}
              style={isActive ? { 
                backgroundColor: 'var(--accent-color)'
              } : {}}
              onClick={() => {
                // Close mobile sidebar when navigating
                if (window.innerWidth < 1024 && onToggle) {
                  onToggle();
                }
              }}
            >
              <Icon className="w-5 h-5" />
              
              <div className="flex-1 min-w-0">
                <span className="truncate">{tab.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      </aside>
    </>
  );
}