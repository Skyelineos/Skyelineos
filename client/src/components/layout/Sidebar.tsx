import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useAutoAdminView } from '@/hooks/useAutoAdminView';

import {
  LayoutDashboard,
  FolderOpen,
  Calendar,
  DollarSign,
  MessageSquare,
  Users,
  X,
  UserCheck,
  HardHat,
  Palette,
  ClipboardList,
  Clock,
  ShieldCheck,
  FileText,
  GitPullRequest,
  BookOpen,
  BarChart2,
  Zap,
  Radio,
  Share2,
  TrendingUp,
  Hammer,
  UserCog,
  Home,
  Briefcase,
  ClipboardCheck,
  FileSpreadsheet,
  Wallet,
  Receipt,
  Lightbulb,
  Sparkles,
  FileSignature,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Full sidebar for admin / gc / project_manager
const TEAM_NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Sales & Estimating',
    items: [
      { label: 'Sales & CRM', href: '/sales',      icon: TrendingUp },
      { label: 'Estimates',   href: '/estimates',  icon: DollarSign },
      { label: 'Contracts',   href: '/contracts',  icon: FileSignature },
      { label: 'Contacts',    href: '/contacts',   icon: Users },
    ],
  },
  {
    label: 'Projects',
    items: [
      { label: 'Projects',      href: '/projects',      icon: FolderOpen },
      { label: 'Schedule',      href: '/schedule',      icon: Calendar },
      { label: 'Tasks',         href: '/tasks',         icon: ClipboardList },
      { label: 'Change Orders', href: '/change-orders', icon: GitPullRequest },
      { label: 'Documents',     href: '/documents',     icon: FileText },
    ],
  },
  {
    label: 'Field',
    items: [
      { label: 'Site Log',  href: '/site-log',  icon: ClipboardCheck },
      { label: 'Timesheet', href: '/timesheet', icon: Clock },
      { label: 'Safety',    href: '/safety',    icon: ShieldCheck },
      { label: 'Catalogs',  href: '/catalogs',  icon: BookOpen },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Finance', href: '/financials',  icon: DollarSign },
      { label: 'Bills (AI)', href: '/bills',  icon: Receipt },
      { label: 'Reports', href: '/reports',  icon: BarChart2 },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Messaging', href: '/messages',  icon: MessageSquare },
      { label: 'Comms Log', href: '/comms-log', icon: Radio },
    ],
  },
  {
    label: 'Portals',
    items: [
      { label: 'Client Portal',        href: '/client-portal',        icon: UserCheck },
      { label: 'Subcontractor Portal', href: '/subcontractor-portal', icon: HardHat },
      { label: 'Designer Portal',      href: '/designer-portal',      icon: Palette },
    ],
  },
  {
    label: 'Creative',
    items: [
      { label: 'Design Board', href: '/design-board', icon: Palette },
      { label: 'Content Studio', href: '/content-studio', icon: Sparkles },
      { label: 'Social Media', href: '/social-media', icon: Share2 },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Users',          href: '/users',          icon: UserCog },
      { label: 'Templates',      href: '/templates',      icon: Hammer },
      { label: 'Playbook',       href: '/playbook',       icon: Lightbulb },
      { label: 'Import Center',  href: '/import-center',  icon: FileSpreadsheet },
      { label: 'Automations',    href: '/automations',    icon: Zap },
      { label: 'Subscriptions',  href: '/subscriptions',  icon: Wallet },
    ],
  },
];

// Management section only for admins
const MANAGEMENT_HREFS = ['/users', '/templates', '/playbook', '/automations', '/import-center', '/subscriptions'];

// Designer sidebar — focused on their work
const DESIGNER_NAV: NavGroup[] = [
  {
    label: 'My Work',
    items: [
      { label: 'My Projects',  href: '/designer-portal', icon: Palette },
    ],
  },
  {
    label: 'Resources',
    items: [
      { label: 'Catalogs',     href: '/catalogs',   icon: BookOpen },
      { label: 'Documents',    href: '/documents',  icon: FileText },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Messaging',    href: '/messages',   icon: MessageSquare },
    ],
  },
];

// Subcontractor sidebar
const SUB_NAV: NavGroup[] = [
  {
    label: 'My Work',
    items: [
      { label: 'My Jobs',      href: '/subcontractor-portal', icon: Briefcase },
      { label: 'Schedule',     href: '/schedule',             icon: Calendar },
    ],
  },
  {
    label: 'Field',
    items: [
      { label: 'Timesheet',    href: '/timesheet',  icon: Clock },
      { label: 'Safety',       href: '/safety',     icon: ShieldCheck },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Messaging',    href: '/messages',   icon: MessageSquare },
      { label: 'Documents',    href: '/documents',  icon: FileText },
    ],
  },
];

// Client sidebar
const CLIENT_NAV: NavGroup[] = [
  {
    label: 'My Home',
    items: [
      { label: 'My Project',   href: '/client-portal', icon: Home },
    ],
  },
  {
    label: 'Communication',
    items: [
      { label: 'Messaging',    href: '/messages',  icon: MessageSquare },
      { label: 'Documents',    href: '/documents', icon: FileText },
    ],
  },
];

function getNavForRole(role: string, navDisabled: string[]): NavGroup[] {
  let base: NavGroup[];

  if (role === 'designer') {
    base = DESIGNER_NAV;
  } else if (role === 'sub' || role === 'subcontractor') {
    base = SUB_NAV;
  } else if (role === 'client') {
    base = CLIENT_NAV;
  } else {
    // admin, gc, project_manager — full nav, restricted by navDisabled
    base = TEAM_NAV;
    // Non-admin team members don't see Management
    if (role !== 'admin') {
      base = base.filter(g => !g.items.every(i => MANAGEMENT_HREFS.includes(i.href)));
    }
  }

  // Apply navDisabled overrides
  if (navDisabled.length === 0) return base;

  return base
    .map(g => ({
      ...g,
      items: g.items.filter(i => !navDisabled.includes(i.href)),
    }))
    .filter(g => g.items.length > 0);
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  useAutoAdminView();

  const role = user?.role || 'client';
  const navDisabled = user?.navDisabled ?? [];
  const navGroups = getNavForRole(role, navDisabled);

  return (
    <aside className="flex flex-col h-full w-64 overflow-y-auto" style={{ backgroundColor: '#141414' }}>
      {/* Brand header */}
      <div className="flex items-center justify-between px-5 py-5 flex-shrink-0" style={{ borderBottom: '1px solid rgba(201,169,110,0.2)' }}>
        <div>
          <span className="text-xl font-heading font-semibold text-white" style={{ letterSpacing: '0.04em' }}>Skyeline Homes</span>
          <p className="text-xs mt-0.5 font-sans font-light tracking-widest uppercase" style={{ color: '#C9A96E', letterSpacing: '0.15em' }}>
            {role === 'designer' ? 'Design Portal' : role === 'client' ? 'Owner Portal' : role === 'sub' ? 'Sub Portal' : 'Project Portal'}
          </p>
        </div>
        <button
          onClick={onToggle}
          className="lg:hidden p-1 transition-colors"
          style={{ color: '#C9A96E' }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-5 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-xs font-sans font-medium uppercase tracking-widest" style={{ color: 'rgba(201,169,110,0.5)', letterSpacing: '0.12em' }}>
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location === item.href ||
                  (item.href !== '/' && location.startsWith(item.href + '/'));

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-sans font-medium transition-all duration-150',
                        isActive
                          ? 'text-white'
                          : 'hover:text-white'
                      )}
                      style={isActive
                        ? { backgroundColor: 'rgba(201,169,110,0.15)', color: '#C9A96E', borderLeft: '2px solid #C9A96E' }
                        : { color: 'rgba(255,255,255,0.55)' }
                      }
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom brand mark */}
      <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(201,169,110,0.15)' }}>
        <p className="text-xs font-sans text-center" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em' }}>
          © {new Date().getFullYear()} Skyeline Homes
        </p>
      </div>
    </aside>
  );
}

// Export nav config so UserManagement can use it for the permissions UI
export { TEAM_NAV };
