import { ReactNode, useState } from 'react';
import { useLocation } from 'wouter';
import { TopNavbar } from './TopNavbar';
import { ProjectSidebar } from './ProjectSidebar';
import { StageTrackerByProjectId } from '@/components/projects/StageTrackerByProjectId';

interface ProjectLayoutProps {
  children: ReactNode;
  projectId: string;
  projectName: string;
}

export function ProjectLayout({ children, projectId, projectName }: ProjectLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Overview page renders its own (larger) stage tracker; the compact one in
  // the layout would duplicate it there. Suppress the layout's tracker on
  // Overview so it shows exactly once on any project page.
  const hideCompactTracker = /\/projects\/[^/]+\/overview\b/.test(location);

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
        
        {/* Page content. Compact stage tracker shows on every project sub-page
            EXCEPT Overview (Overview renders its own larger tracker — duplicating
            here is what Tyler hit). One tracker, exactly once, anywhere. */}
        <main className="flex-1 overflow-auto bg-gray-50">
          {!hideCompactTracker && (
            <div className="px-4 pt-3">
              <StageTrackerByProjectId projectId={projectId} compact />
            </div>
          )}
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