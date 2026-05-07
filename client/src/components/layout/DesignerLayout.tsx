import { ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import DesignerSidebar from './DesignerSidebar';

interface DesignerLayoutProps {
  children: ReactNode;
}

export function DesignerLayout({ children }: DesignerLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      <DesignerSidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col h-screen lg:ml-0">
        {/* Mobile header with hamburger menu */}
        <div className="bg-white border-b border-gray-200 lg:hidden flex-shrink-0">
          <div className="flex items-center justify-between h-16 px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="text-gray-600"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <div className="text-lg font-semibold text-gray-900">
              Designer Portal
            </div>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </div>
      
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
    </div>
  );
}