import { ReactNode, useState } from 'react';
import { TopNavbar } from './TopNavbar';
import { ProjectSidebar } from './ProjectSidebar';

interface ProjectLayoutProps {
  children: ReactNode;
  projectId: string;
  projectName: string;
}

export function ProjectLayout({ children, projectId, projectName }: ProjectLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* Full-height Project Sidebar */}
      <div className="relative z-40">
        <ProjectSidebar 
          projectId={projectId} 
          projectName={projectName} 
          isOpen={sidebarOpen} 
          onToggle={toggleSidebar} 
        />
      </div>
      
      {/* Main content area positioned to the right of sidebar */}
      <div className="flex-1 flex flex-col ml-0 lg:ml-0">
        {/* Top ribbon */}
        <TopNavbar onMenuToggle={toggleSidebar} currentProject={projectName} />
        
        {/* Page content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile overlay when sidebar is open */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
    </div>
  );
}