import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  Briefcase,
  Palette,
  Camera,
  MessageSquare,
  Calendar,
  FileText,
  Home,
  X,
  Menu
} from 'lucide-react';

const sidebarItems = [
  {
    id: 'projects',
    label: 'Projects',
    icon: Briefcase,
    path: 'projects'
  },
  {
    id: 'selections',
    label: 'Design Selections',
    icon: Palette,
    path: 'selections'
  },
  {
    id: 'gallery',
    label: 'Design Gallery',
    icon: Camera,
    path: 'gallery'
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: Calendar,
    path: 'schedule'
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    path: 'documents'
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: MessageSquare,
    path: 'messages'
  }
];

interface DesignerSidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function DesignerSidebar({ isOpen = false, onToggle }: DesignerSidebarProps) {
  const [location, setLocation] = useLocation();
  const currentTab = location.split('/')[2] || 'projects';
  const { user } = useAuth();
  const designerName = user?.name || 'Designer';



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
          <div className="text-lg font-semibold">Designer Portal</div>
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
              Designer Portal
            </h2>
            <p className="text-sm text-slate-300">
              {designerName}
            </p>
          </div>
        </div>

        {/* Mobile header */}
        <div className="p-4 border-b border-slate-700 lg:hidden">
          <div className="text-lg font-semibold text-white mb-2">
            Designer Portal
          </div>
          <p className="text-sm text-slate-300">
            Creative Design Studios
          </p>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col p-4 space-y-1">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.path;
            const linkPath = `/designer-portal/${item.path}`;
            
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
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <div className="text-xs text-slate-400 text-center">
            <p>Designer Portal</p>
            <p className="mt-1">Skyeline Homes</p>
          </div>
        </div>
      </aside>
    </>
  );
}