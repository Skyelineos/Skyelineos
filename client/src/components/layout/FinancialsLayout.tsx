import { useState } from 'react';
import FinancialsSidebar from './FinancialsSidebar';
import { TopNavbar } from './TopNavbar';

interface FinancialsLayoutProps {
  children: React.ReactNode;
}

export default function FinancialsLayout({ children }: FinancialsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <FinancialsSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar onMenuToggle={toggleSidebar} />
        <div className="flex-1 overflow-auto min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}