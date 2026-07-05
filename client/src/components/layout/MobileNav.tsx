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
} from '@/components/ui/sheet';
import {
  LayoutDashboard,
  FolderOpen,
  Calendar,
  DollarSign,
  MessageSquare,
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
  UserCog,
} from 'lucide-react';

interface MobileNavProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const getNavigationItems = () => [
  { label: 'Dashboard',             href: '/dashboard',            icon: LayoutDashboard, roles: ['Admin', 'GC', 'ProjectManager'] as const },
  { label: 'Sales & CRM',           href: '/sales',                icon: TrendingUp,      roles: ['Admin', 'GC', 'ProjectManager'] as const },
  // /estimates RoleGuard: ['admin', 'gc'] — drop ProjectManager.
  { label: 'Estimates',             href: '/estimates',            icon: DollarSign,      roles: ['Admin', 'GC'] as const },
  { label: 'Contacts',              href: '/contacts',             icon: Users,           roles: ['Admin', 'GC', 'ProjectManager'] as const },
  { label: 'Projects',              href: '/projects',             icon: FolderOpen,      roles: ['Admin', 'GC', 'ProjectManager'] as const },
  { label: 'Schedule',              href: '/schedule',             icon: Calendar,        roles: ['Admin', 'GC', 'ProjectManager'] as const },
  { label: 'Tasks',                 href: '/tasks',                icon: ClipboardList,   roles: ['Admin', 'GC', 'ProjectManager'] as const },
  { label: 'Change Orders',         href: '/change-orders',        icon: GitPullRequest,  roles: ['Admin', 'GC', 'ProjectManager'] as const },
  // /documents RoleGuard: ['admin', 'gc', 'projectManager', 'designer', 'subcontractor', 'client'].
  { label: 'Documents',             href: '/documents',            icon: FileText,        roles: ['Admin', 'GC', 'ProjectManager', 'Designer', 'Subcontractor', 'Client'] as const },
  { label: 'Timesheet',             href: '/timesheet',            icon: Clock,           roles: ['Admin', 'GC', 'ProjectManager'] as const },
  { label: 'Safety',                href: '/safety',               icon: ShieldCheck,     roles: ['Admin', 'GC', 'ProjectManager'] as const },
  // /catalogs RoleGuard: ['admin', 'gc', 'projectManager', 'designer'].
  { label: 'Catalogs',              href: '/catalogs',             icon: BookOpen,        roles: ['Admin', 'GC', 'ProjectManager', 'Designer'] as const },
  { label: 'Tools',                 href: '/tools',                icon: Hammer,          roles: ['Admin', 'GC', 'ProjectManager'] as const },
  // /financials, /reports RoleGuard: ['admin', 'gc'] — drop PM.
  { label: 'Finance',               href: '/financials',           icon: DollarSign,      roles: ['Admin', 'GC'] as const },
  { label: 'Reports',               href: '/reports',              icon: BarChart2,       roles: ['Admin', 'GC'] as const },
  // /templates RoleGuard: ['admin', 'gc'].
  { label: 'Templates',             href: '/templates',            icon: Hammer,          roles: ['Admin', 'GC'] as const },
  { label: 'Communication Center',  href: '/communications',       icon: MessageSquare,   roles: ['Admin', 'GC', 'ProjectManager'] as const },
  // /messages RoleGuard allows every signed-in persona.
  { label: 'Messaging',             href: '/messages',             icon: MessageSquare,   roles: ['Admin', 'GC', 'ProjectManager', 'Designer', 'Subcontractor', 'Client'] as const },
  { label: 'Comms Log',             href: '/comms-log',            icon: Radio,           roles: ['Admin', 'GC', 'ProjectManager'] as const },
  // MVP AUDIT (2026-07-04): moved to future-features/.
  // { label: 'Automations',           href: '/automations',          icon: Zap,             roles: ['Admin'] as const },
  // Portal entries: gated to portal users + admin (impersonation). Hiding
  // them from GC/PM stops the bounce-to-/not-authorized loop.
  { label: 'Client Portal',         href: '/client-portal',        icon: UserCheck,       roles: ['Admin', 'Client'] as const },
  { label: 'Subcontractor Portal',  href: '/subcontractor-portal', icon: HardHat,         roles: ['Admin', 'Sub', 'Subcontractor'] as const },
  { label: 'Designer Portal',       href: '/designer-portal',      icon: Palette,         roles: ['Admin', 'Designer'] as const },
  // MVP AUDIT (2026-07-04): Design Board / Social Media / Subscriptions moved
  // to future-features/.
  // { label: 'Design Board',          href: '/design-board',         icon: Palette,         roles: ['Admin', 'GC', 'Designer'] as const },
  // { label: 'Social Media',          href: '/social-media',         icon: Share2,          roles: ['Admin', 'GC'] as const },
  // { label: 'Subscriptions',         href: '/subscriptions',        icon: Wallet,          roles: ['Admin'] as const },
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