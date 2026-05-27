import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useBranding } from '@/contexts/BrandingContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { getDefaultRouteForRole } from '@/utils/roleRedirects';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Menu,
  Bell,
  User,
  LogOut,
  Settings as SettingsIcon,
  Search,
  Sun,
  Moon,
} from 'lucide-react';

import { GlobalSearch } from '@/components/search/GlobalSearch';
import { UserPreferencesDialog } from '@/components/preferences/UserPreferencesDialog';
import { NotificationCenter } from '@/components/messaging/NotificationCenter';

interface TopNavbarProps {
  onMenuToggle: () => void;
  currentProject?: string;
}

export function TopNavbar({ onMenuToggle, currentProject }: TopNavbarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { logoUrl } = useBranding();
  const { darkMode, toggleDarkMode } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Role-aware home destination — admins/PMs land on /dashboard or /projects,
  // clients on /client-portal, subs on /subcontractor-portal, etc.
  // Falls back to '/' if there's no authenticated user (won't actually
  // navigate — the logo only renders inside authenticated layouts).
  const homeRoute = user?.role ? getDefaultRouteForRole(user.role) : '/';

  const getPageTitle = () => {
    // Always show company name on mobile/smaller views
    return 'Skyeline Homes';
  };

  const getDesktopPageTitle = () => {
    // Always show company name in top ribbon on desktop
    return 'Skyeline Homes';
  };



  return (
    <header className="sticky top-0 z-30 safe-top" style={{ background: 'rgba(250,250,246,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(201,169,110,0.2)' }}>
      <div className="flex h-16 md:h-20 items-center justify-between px-4 md:px-6">
        {/* Left section */}
        <div className="flex items-center">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            className="lg:hidden mr-2 text-brand-dark-gray-blue hover:bg-brand-light-gray-blue touch-target"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open navigation menu</span>
          </Button>

          {/* Desktop logo — clickable, returns to role-aware home */}
          <Link href={homeRoute} className="hidden lg:block cursor-pointer transition-opacity hover:opacity-80" aria-label="Go to dashboard">
            <img
              src="/logos/logo-transparent-cropped.png"
              alt="Skyeline Homes"
              className="w-auto object-contain"
              style={{ height: '80px', maxWidth: '360px' }}
            />
          </Link>

          {/* Mobile logo — clickable, returns to role-aware home */}
          <Link href={homeRoute} className="lg:hidden min-w-0 cursor-pointer transition-opacity hover:opacity-80" aria-label="Go to dashboard">
            <img
              src="/logos/logo-transparent-cropped.png"
              alt="Skyeline Homes"
              className="w-auto object-contain"
              style={{ height: '60px', maxWidth: '260px' }}
            />
          </Link>

          {/* Project badge (if in project context) */}
          {currentProject && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Project: {currentProject}
            </Badge>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2 md:space-x-3">
          {/* Global Search - Hidden on small mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex text-slate-700 hover:text-slate-900 hover:bg-slate-100 touch-target"
          >
            <Search className="h-5 w-5" />
            <span className="sr-only">Global search</span>
          </Button>

          {/* Dark mode toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            className="touch-target"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
          </Button>

          {/* Notifications */}
          <NotificationCenter />

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="relative h-10 w-10 rounded-full touch-target">
                <Avatar className="h-8 w-8 md:h-10 md:w-10">
                  <AvatarImage src="" alt={user?.name} />
                  <AvatarFallback className="text-sm">
                    {user?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                  <div className="pt-1">
                    <Badge variant="outline" className="text-xs">
                      {user?.role}
                    </Badge>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPreferencesOpen(true)}>
                <SettingsIcon className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Global Search Dialog */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      {/* User Preferences Dialog */}
      <UserPreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </header>
  );
}