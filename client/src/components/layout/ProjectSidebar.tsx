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
  Calendar,
  DollarSign,
  FolderOpen,
  Camera,
  ClipboardList,
  Users,
  MessageCircle,
  ArrowLeft,
  X,
  Palette,
  CheckSquare,
  GitPullRequest,
  ClipboardCheck,
  Receipt,
  Ruler,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ListChecks,
  GraduationCap,
} from 'lucide-react';

interface ProjectSidebarProps {
  projectId: string;
  projectName: string;
  isOpen?: boolean;
  onToggle?: () => void;
}

// Single always-visible entry, then collapsible groups that follow the build
// lifecycle (mind-map clusters). Groups keep the 16-item list from being a wall
// of links — only the section you're working in stays expanded.
const overviewItem = { id: 'overview', label: 'Overview', icon: ClipboardList };

const navGroups = [
  {
    id: 'estimating',
    label: 'Estimating & Bids',
    items: [
      { id: 'estimates', label: 'Estimates', icon: FileText },
      { id: 'takeoff', label: 'Takeoff', icon: Ruler },
      { id: 'bids', label: 'Bids', icon: Hammer },
    ],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    items: [
      { id: 'schedule', label: 'Schedule', icon: Calendar },
      { id: 'tasks', label: 'Tasks', icon: CheckSquare },
      { id: 'build-plan', label: 'Build Plan', icon: ListChecks },
    ],
  },
  {
    id: 'field',
    label: 'Field',
    items: [
      { id: 'communications', label: 'Communication', icon: MessageCircle },
      { id: 'site-log', label: 'Site Log', icon: ClipboardCheck },
      { id: 'photos', label: 'Photos', icon: Camera },
      { id: 'rfis', label: 'RFIs', icon: HelpCircle },
      { id: 'walkthroughs', label: 'Walkthroughs', icon: Users },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { id: 'budget', label: 'Budget', icon: DollarSign },
      { id: 'bills', label: 'Bills', icon: Receipt },
      { id: 'change-orders', label: 'Change Orders', icon: GitPullRequest },
    ],
  },
  {
    id: 'docs',
    label: 'Design & Documents',
    items: [
      { id: 'design', label: 'Design', icon: Palette },
      { id: 'documents', label: 'Documents', icon: FolderOpen },
      { id: 'move-in-binder', label: 'Move-in Binder', icon: ClipboardCheck },
    ],
  },
  {
    id: 'closeout',
    label: 'Closeout',
    items: [{ id: 'closeout', label: 'Lessons Learned', icon: GraduationCap }],
  },
];

export function ProjectSidebar({
  projectId,
  projectName,
  isOpen = false,
  onToggle,
}: ProjectSidebarProps) {
  const [location, setLocation] = useLocation();

  // Extract current tab from URL
  const currentTab = location.split('/')[3] || 'overview';

  // Collapsible groups. A group is open if the user explicitly toggled it open,
  // otherwise it defaults to open when it contains the active page — so the
  // section you're in is always expanded without burying the others.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isGroupOpen = (group: (typeof navGroups)[number]) =>
    expanded[group.id] ?? group.items.some((i) => i.id === currentTab);
  const toggleGroup = (group: (typeof navGroups)[number]) =>
    setExpanded((prev) => ({ ...prev, [group.id]: !isGroupOpen(group) }));

  const closeMobile = () => {
    if (window.innerWidth < 1024 && onToggle) onToggle();
  };

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
          const code =
            data.projectCode ||
            buildProjectCode(data.clientName, data.createdAt);
          setProjectCode(code);
        }
      } catch {
        // Best-effort; fall back to empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleBackClick = () => {
    setLocation('/projects');
  };

  return (
    <>
      {/* Sidebar - Full height from top to bottom */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 text-white transition-transform duration-300 ease-in-out lg:relative lg:top-0 lg:h-full lg:translate-x-0 lg:z-auto',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between p-4 lg:hidden border-b border-white/10">
          <div className="text-lg font-semibold truncate">{projectName}</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-white hover:bg-white/5"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Desktop header with Back Button */}
        <div className="p-4 border-b border-white/10 hidden lg:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackClick}
            className="mb-3 w-full justify-start text-white/70 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white truncate">
              {projectName}
            </h2>
            <p className="text-sm text-white/70">
              Project ID: {projectCode || '…'}
            </p>
          </div>
        </div>

        {/* Mobile header with back button */}
        <div className="p-4 border-b border-white/10 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackClick}
            className="mb-3 w-full justify-start text-white/70 hover:text-white hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </div>

        {/* Navigation Menu — Overview, then collapsible lifecycle groups */}
        <nav
          className="flex flex-col p-3 space-y-1 overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 220px)' }}
        >
          {/* Overview — always visible, no group */}
          {(() => {
            const Icon = overviewItem.icon;
            const isActive = currentTab === overviewItem.id;
            return (
              <Link
                href={`/projects/${projectId}/${overviewItem.id}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'text-[#C9A96E] bg-[#C9A96E]/15 border-l-2 border-[#C9A96E] font-semibold'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                )}
                onClick={closeMobile}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  {overviewItem.label}
                </span>
              </Link>
            );
          })()}

          {navGroups.map((group) => {
            const open = isGroupOpen(group);
            const hasActive = group.items.some((i) => i.id === currentTab);
            return (
              <div key={group.id} className="pt-1">
                {/* Group header — click to expand/collapse */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide rounded-md transition-colors',
                    hasActive
                      ? 'text-[#C9A96E]'
                      : 'text-white/50 hover:text-white/90'
                  )}
                >
                  <span>{group.label}</span>
                  {open ? (
                    <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                </button>

                {/* Group items */}
                {open && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.id;
                      return (
                        <Link
                          key={item.id}
                          href={`/projects/${projectId}/${item.id}`}
                          className={cn(
                            'flex items-center gap-3 pl-5 pr-3 py-2 text-sm rounded-lg transition-colors',
                            isActive
                              ? 'text-[#C9A96E] bg-[#C9A96E]/15 border-l-2 border-[#C9A96E] font-semibold'
                              : 'text-white/60 hover:bg-white/5 hover:text-white'
                          )}
                          onClick={closeMobile}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="flex-1 min-w-0 truncate">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <div className="text-xs text-white/50 text-center">
            <p>Project Module</p>
            <p className="mt-1">Skyeline Homes</p>
          </div>
        </div>
      </aside>
    </>
  );
}
