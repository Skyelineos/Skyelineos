import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Home, FolderOpen, Users, Calendar, DollarSign, MessageSquare, Settings, Menu } from 'lucide-react';

const navigationItems = [
  { name: 'Dashboard', path: '/dashboard', icon: Home },
  { name: 'Projects', path: '/projects', icon: FolderOpen },
  { name: 'Contacts', path: '/contacts', icon: Users },
  { name: 'Schedule', path: '/schedule', icon: Calendar },
  { name: 'Financials', path: '/financials', icon: DollarSign },
  { name: 'Messages', path: '/messaging', icon: MessageSquare },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <nav className="grid gap-2 text-lg font-medium">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <span className="text-primary">skyelineos</span>
          </div>
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Link key={item.name} href={item.path}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2 h-12"
                  onClick={() => setOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Button>
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}