import { Link, useLocation } from 'wouter';
import { Home, FolderOpen, Users, Calendar, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMobile } from '@/hooks/use-mobile';

const navigationItems = [
  { name: 'Dashboard', path: '/dashboard', icon: Home },
  { name: 'Projects', path: '/projects', icon: FolderOpen },
  { name: 'Contacts', path: '/contacts', icon: Users },
  { name: 'Schedule', path: '/schedule', icon: Calendar },
  { name: 'Finance', path: '/financials', icon: DollarSign },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const isMobile = useMobile();
  
  if (!isMobile) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;
          
          return (
            <Link key={item.name} href={item.path}>
              <button
                className={cn(
                  'flex flex-col items-center justify-center p-2 rounded-lg transition-colors touch-target',
                  'min-w-[60px] min-h-[44px]',
                  isActive 
                    ? 'text-blue-600 bg-blue-50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                <Icon className="h-5 w-5 mb-1" />
                <span className="text-xs font-medium">
                  {item.name}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}