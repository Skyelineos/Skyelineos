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
    <div className="flex h-screen bg-gray-50">
      <FinancialsSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col">
        <TopNavbar onMenuToggle={toggleSidebar} />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}