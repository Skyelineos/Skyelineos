import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildProjectCode } from '@/lib/projectUtils';
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
  CheckSquare,
  GitPullRequest,
  ClipboardCheck,
  Receipt,
  Ruler,
} from 'lucide-react';

interface ProjectSidebarProps {
  projectId: string;
  projectName: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

const sidebarItems = [
  { id: 'overview',      label: 'Overview',      icon: ClipboardList },
  { id: 'tasks',         label: 'Tasks',         icon: CheckSquare },
  { id: 'schedule',      label: 'Schedule',      icon: Calendar },
  { id: 'estimates',     label: 'Estimates',     icon: FileText },
  { id: 'takeoff',       label: 'Takeoff',       icon: Ruler },
  { id: 'bids',          label: 'Bids',          icon: Hammer },
  { id: 'budget',        label: 'Budget',        icon: DollarSign },
  { id: 'bills',         label: 'Bills',         icon: Receipt },
  { id: 'change-orders', label: 'Change Orders', icon: GitPullRequest },
  { id: 'site-log',      label: 'Site Log',      icon: ClipboardCheck },
  { id: 'walkthroughs',  label: 'Walkthroughs',  icon: Users },
  { id: 'documents',     label: 'Documents',     icon: FolderOpen },
  { id: 'photos',        label: 'Photos',        icon: Camera },
  { id: 'design',        label: 'Design',        icon: Palette },
];

export function ProjectSidebar({ projectId, projectName, isOpen = false, onToggle }: ProjectSidebarProps) {
  const [location, setLocation] = useLocation();

  // Extract current tab from URL
  const currentTab = location.split('/')[3] || 'overview';

  // Resolve the friendly project code (LastName + MMDDYYYY). Reads from cache
  // first thanks to persistent Firestore offline cache.
  const [projectCode, setProjectCode] = useState('');
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (cancelled) return;
        if (snap.exists()) {
          const data = snap.data() as any;
          const code = data.projectCode
            || buildProjectCode(data.clientName, data.createdAt);
          setProjectCode(code);
        }
      } catch {
        // Best-effort; fall back to empty.
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

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
              Project ID: {projectCode || '…'}
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