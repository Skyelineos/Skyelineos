import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAdminView, AdminViewUser } from '@/contexts/AdminViewContext';
import { useLocation } from 'wouter';
import { Eye, Users, Settings, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Contact {
  id: number;
  name: string;
  email?: string;
  company?: string;
  role: string;
}

export const AdminPortalControls = () => {
  const { user } = useAuth();
  const hasRole = (role: string) => user?.role?.toLowerCase() === role.toLowerCase();
  const [location, setLocation] = useLocation();
  const { isAdminView, viewedUser, portalType, enterAdminView, exitAdminView } = useAdminView();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // Only show for admin users
  if (!hasRole('admin')) {
    return null;
  }

  // Fetch contacts for user selection
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
  });

  // Determine current portal from URL
  const getCurrentPortalType = (): 'client' | 'subcontractor' | 'designer' | null => {
    if (location.startsWith('/client-portal')) return 'client';
    if (location.startsWith('/subcontractor-portal')) return 'subcontractor';
    if (location.startsWith('/designer-portal')) return 'designer';
    return null;
  };

  const currentPortalType = getCurrentPortalType();

  // Filter users based on current portal type
  const getFilteredUsers = () => {
    if (!contacts || !currentPortalType) return [];
    
    // Debug all contact roles to see what we have
    const roleStats = contacts.reduce((acc, contact) => {
      acc[contact.role] = (acc[contact.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Development logging removed
    // Development logging removed
    
    const filtered = contacts.filter(contact => {
      // Handle role mapping - sometimes stored as different values
      const contactRole = contact.role?.toLowerCase();
      const targetRole = currentPortalType?.toLowerCase();
      
      switch (targetRole) {
        case 'client':
          return contactRole === 'client' || contactRole === 'homeowner';
        case 'subcontractor':
          return contactRole === 'subcontractor' || contactRole === 'contractor';
        case 'designer':
          return contactRole === 'designer' || contactRole === 'architect';
        default:
          return false;
      }
    });
    
    // Development logging removed
    // Development logging removed
    // Development logging removed
    // Development logging removed.map(c => ({ role: c.role, name: c.name })));
    
    return filtered;
  };

  const filteredUsers = getFilteredUsers();

  const handleUserChange = (userId: string) => {
    const selectedContact = filteredUsers.find(contact => contact.id.toString() === userId);
    
    if (selectedContact && currentPortalType) {
      const adminViewUser: AdminViewUser = {
        id: selectedContact.id.toString(),
        name: selectedContact.name,
        email: selectedContact.email,
        company: selectedContact.company,
        role: currentPortalType,
      };

      enterAdminView(currentPortalType, adminViewUser);
      
      toast({
        title: 'Admin View Updated',
        description: `Now viewing as ${selectedContact.name}`,
      });
    }
  };

  const handleExitAdminView = () => {
    exitAdminView();
    // Navigate to main dashboard
    window.location.href = '/dashboard';
    
    toast({
      title: 'Admin View Exited',
      description: 'Returned to admin dashboard',
    });
  };

  // Don't show controls if not in a portal
  if (!currentPortalType) {
    return null;
  }

  const getPortalDisplayName = (type: string) => {
    switch (type) {
      case 'client':
        return 'Client Portal';
      case 'subcontractor':
        return 'Subcontractor Portal';
      case 'designer':
        return 'Designer Portal';
      default:
        return 'Portal';
    }
  };

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">
              Admin Viewing: {getPortalDisplayName(currentPortalType)}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-[200px] h-8 justify-between text-sm"
                  disabled={isLoading}
                >
                  {viewedUser ? viewedUser.name : (isLoading ? "Loading..." : "Select user...")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Search users..." 
                    value={searchValue}
                    onValueChange={setSearchValue}
                  />
                  <CommandEmpty>No user found.</CommandEmpty>
                  <CommandGroup>
                    {filteredUsers
                      .filter(contact => {
                        if (!searchValue) return true;
                        const searchLower = searchValue.toLowerCase();
                        return contact.name.toLowerCase().includes(searchLower) ||
                               (contact.company && contact.company.toLowerCase().includes(searchLower)) ||
                               (contact.email && contact.email.toLowerCase().includes(searchLower));
                      })
                      .map((contact) => (
                        <CommandItem
                          key={contact.id}
                          value={`${contact.name} ${contact.company || ''}`}
                          onSelect={() => {
                            handleUserChange(contact.id.toString());
                            setOpen(false);
                            setSearchValue('');
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              viewedUser?.id === contact.id.toString() ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{contact.name}</span>
                            {contact.company && (
                              <span className="text-xs text-gray-500">{contact.company}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExitAdminView}
          className="text-theme-primary border-theme-accent/30 hover:bg-theme-accent/10"
        >
          <Settings className="h-4 w-4 mr-2" />
          Exit Admin View
        </Button>
      </div>
      
      {viewedUser && (
        <div className="mt-2 text-xs text-theme-primary">
          Currently viewing as: <strong>{viewedUser.name}</strong>
          {viewedUser.company && ` (${viewedUser.company})`}
          {viewedUser.email && ` - ${viewedUser.email}`}
        </div>
      )}
    </div>
  );
};