import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useAutoAdminView } from '@/hooks/useAutoAdminView';
import { cn } from '@/lib/utils';
import { getDefaultRouteForRole } from '@/utils/roleRedirects';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  FolderOpen,
  Calendar,
  DollarSign,
  MessageSquare,
  Settings,
  Users,
  UserCheck,
  HardHat,
  Palette,
  TrendingUp,
  ClipboardList,
  GitPullRequest,
  FileText,
  Clock,
  ShieldCheck,
  BookOpen,
  BarChart2,
  Hammer,
  Radio,
  Zap,
  Share2,
  UserCog,
  Wallet,
} from 'lucide-react';

interface MobileNavProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const getNavigationItems = () => [
  { label: 'Dashboard',             href: '/dashboard',            icon: LayoutDashboard, roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Sales & CRM',           href: '/sales',                icon: TrendingUp,      roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Estimates',             href: '/estimates',            icon: DollarSign,      roles: ['Admin'] as const },
  { label: 'Contacts',              href: '/contacts',             icon: Users,           roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Projects',              href: '/projects',             icon: FolderOpen,      roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Schedule',              href: '/schedule',             icon: Calendar,        roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Tasks',                 href: '/tasks',                icon: ClipboardList,   roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Change Orders',         href: '/change-orders',        icon: GitPullRequest,  roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Documents',             href: '/documents',            icon: FileText,        roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Timesheet',             href: '/timesheet',            icon: Clock,           roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Safety',                href: '/safety',               icon: ShieldCheck,     roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Catalogs',              href: '/catalogs',             icon: BookOpen,        roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Tools',                 href: '/tools',                icon: Hammer,          roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Finance',               href: '/financials',           icon: DollarSign,      roles: ['Admin'] as const },
  { label: 'Reports',               href: '/reports',              icon: BarChart2,       roles: ['Admin'] as const },
  { label: 'Templates',             href: '/templates',            icon: Hammer,          roles: ['Admin'] as const },
  { label: 'Messaging',             href: '/messages',             icon: MessageSquare,   roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Comms Log',             href: '/comms-log',            icon: Radio,           roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Automations',           href: '/automations',          icon: Zap,             roles: ['Admin'] as const },
  { label: 'Client Portal',         href: '/client-portal',        icon: UserCheck,       roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Subcontractor Portal',  href: '/subcontractor-portal', icon: HardHat,         roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Designer Portal',       href: '/designer-portal',      icon: Palette,         roles: ['Admin', 'ProjectManager', 'Designer'] as const },
  { label: 'Design Board',          href: '/design-board',         icon: Palette,         roles: ['Admin', 'ProjectManager', 'Designer'] as const },
  { label: 'Social Media',          href: '/social-media',         icon: Share2,          roles: ['Admin', 'ProjectManager'] as const },
  { label: 'Subscriptions',         href: '/subscriptions',        icon: Wallet,          roles: ['Admin'] as const },
  { label: 'Users',                 href: '/users',                icon: UserCog,         roles: ['Admin'] as const },
];

export function MobileNav({ isOpen, onOpenChange }: MobileNavProps) {
  const [location] = useLocation();
  const { user, hasRole } = useAuth();
  useAutoAdminView();

  const navigationItems = getNavigationItems();
  const filteredItems = navigationItems.filter(item =>
    item.roles.some(role => hasRole(role))
  );

  // Role-aware home destination for the brand-area logo click.
  const homeRoute = user?.role ? getDefaultRouteForRole(user.role) : '/';

  const handleLinkClick = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 p-0 border-r"
        style={{
          // Brand black via CSS var — was slate-900 (#0f172a) which
          // rendered as navy and clashed with the desktop left rail.
          backgroundColor: 'var(--color-sidebar-bg)',
          color: '#ffffff',
          borderColor: 'rgba(201,169,110,0.2)',
        }}
      >
        <SheetHeader className="px-4 py-4 border-b" style={{ borderColor: 'rgba(201,169,110,0.2)' }}>
          <SheetTitle className="text-left">
            <Link
              href={homeRoute}
              onClick={handleLinkClick}
              className="cursor-pointer transition-opacity hover:opacity-80 inline-block"
              aria-label="Go to dashboard"
            >
              <img
                src="/logos/logo-dark-cropped.png"
                alt="Skyeline Homes"
                className="w-auto object-contain"
                style={{ height: '76px', maxWidth: '240px' }}
              />
            </Link>
          </SheetTitle>
          <SheetDescription className="text-left text-xs font-medium tracking-widest uppercase" style={{ color: 'rgba(201,169,110,0.85)', letterSpacing: '0.12em' }}>
            Project Portal
          </SheetDescription>
        </SheetHeader>

        <nav className="flex-1 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          <ul className="space-y-1">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href ||
                               (item.href !== '/' && location.startsWith(item.href + '/'));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-w-0",
                    )}
                    style={isActive ? {
                      backgroundColor: '#C9A96E',
                      color: '#141414',
                    } : {
                      color: '#e2e8f0', // slate-200 — readable on dark bg
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.06)';
                        (e.currentTarget as HTMLElement).style.color = '#ffffff';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = '';
                        (e.currentTarget as HTMLElement).style.color = '#e2e8f0';
                      }
                    }}
                    onClick={handleLinkClick}
                  >
                    <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}