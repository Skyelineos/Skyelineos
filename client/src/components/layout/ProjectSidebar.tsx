import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  FileText,
  Hammer,
  BarChart3,
  Calendar,
  DollarSign,
  FolderOpen,
  Camera,
  ClipboardList,
  TrendingUp,
  Users,
  MessageCircle,
  ArrowLeft,
  X,
  Menu,
  Palette,
} from 'lucide-react';

interface ProjectSidebarProps {
  projectId: string;
  projectName: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

const sidebarItems = [
  {
    id: 'overview',
    label: 'Overview',
    icon: ClipboardList,
    description: 'Project summary and key information'
  },
  {
    id: 'estimates',
    label: 'Estimates',
    icon: FileText,
    description: 'Create and manage project estimates'
  },
  {
    id: 'bids',
    label: 'Bid Management',
    icon: Hammer,
    description: 'Manage subcontractor bidding process'
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: Calendar,
    description: 'Project timeline and milestones'
  },
  {
    id: 'budget',
    label: 'Budget',
    icon: DollarSign,
    description: 'Financial tracking and cost analysis'
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FolderOpen,
    description: 'Project files and documentation'
  },
  {
    id: 'photos',
    label: 'Photos',
    icon: Camera,
    description: 'Progress photos and visual documentation'
  },
  {
    id: 'design',
    label: 'Design',
    icon: Palette,
    description: 'Designer finish selections snapshot'
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: MessageCircle,
    description: 'Project communications and messages'
  }
];

export function ProjectSidebar({ projectId, projectName, isOpen = false, onToggle }: ProjectSidebarProps) {
  const [location, setLocation] = useLocation();
  
  // Extract current tab from URL
  const currentTab = location.split('/')[3] || 'overview';

  const handleBackClick = () => {
    setLocation('/projects');
  };

  return (
    <>
      {/* Sidebar - Full height from top to bottom */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 bg-slate-900 text-white transition-transform duration-300 ease-in-out lg:relative lg:top-0 lg:h-full lg:translate-x-0 lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between p-4 lg:hidden border-b border-slate-700">
          <div className="text-lg font-semibold truncate">{projectName}</div>
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
            Back to Projects
          </Button>
          
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white truncate">
              {projectName}
            </h2>
            <p className="text-sm text-slate-300">
              Project ID: PRJ-{String(projectId).padStart(4, '0')}
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
            Back to Projects
          </Button>
        </div>

      {/* Navigation Menu */}
      <nav className="flex flex-col p-4 space-y-1">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          
          return (
            <Link
              key={item.id}
              href={`/projects/${projectId}/${item.id}`}
              className={cn(
                "group flex items-center space-x-3 px-3 py-3 text-sm font-medium rounded-lg transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-semibold"
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
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {item.label}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="text-xs text-slate-400 text-center">
            <p>Project Module</p>
            <p className="mt-1">Skyeline Homes</p>
          </div>
        </div>
      </aside>
    </>
  );
}