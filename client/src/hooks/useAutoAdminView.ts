import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useAdminView } from '@/contexts/AdminViewContext';
import { useQuery } from '@tanstack/react-query';
import { Contact } from '@shared/types';

// Mock default users for each portal type - in production, these would come from API
const DEFAULT_PORTAL_USERS = {
  client: {
    id: '1',
    name: 'Jennifer Brown',
    email: 'jennifer.brown@email.com',
    company: 'Brown Family',
    role: 'client' as const
  },
  subcontractor: {
    id: '2', 
    name: 'Mike Thompson',
    email: 'mike@thompsonplumbing.com',
    company: 'Thompson Plumbing',
    role: 'subcontractor' as const
  },
  designer: {
    id: '3',
    name: 'Sarah Design Studio',
    email: 'sarah@designstudio.com',
    company: 'Sarah Design Studio',
    role: 'designer' as const
  }
};

export function useAutoAdminView() {
  const [location] = useLocation();
  const { user } = useAuth();
  const hasRole = (role: string) => user?.role?.toLowerCase() === role.toLowerCase();
  const { isAdminView, enterAdminView, exitAdminView } = useAdminView();

  // Get contacts for selecting default users
  const { data: contacts = [] } = useQuery({
    queryKey: ['/api/contacts'],
    enabled: hasRole('admin')
  });

  // Cast contacts to proper type
  const typedContacts = contacts as Contact[];

  useEffect(() => {
    // Debug logging
    // Development logging removed
    // Development logging removed);
    // Development logging removed
    // Development logging removed
    
    // Only activate for admin users
    if (!hasRole('admin')) {
      // Development logging removed
      return;
    }

    // Check if navigating to a portal (check for portal routes in URL)
    const isClientPortal = location.startsWith('/client-portal');
    const isSubcontractorPortal = location.startsWith('/subcontractor-portal');
    const isDesignerPortal = location.startsWith('/designer-portal');
    
    let currentPortal: 'client' | 'subcontractor' | 'designer' | null = null;
    
    if (isClientPortal) currentPortal = 'client';
    else if (isSubcontractorPortal) currentPortal = 'subcontractor';
    else if (isDesignerPortal) currentPortal = 'designer';

    if (currentPortal) {
      // Development logging removed
      // If not already in admin view for this portal, activate it
      if (!isAdminView) {
        // Development logging removed
        
        // Try to find a real contact of the appropriate role
        const roleMapping = {
          client: 'client',
          subcontractor: 'subcontractor', 
          designer: 'designer'
        };

        const contactsOfRole = typedContacts.filter((contact: any) => 
          contact.role === roleMapping[currentPortal]
        );

        // Development logging removed

        // Only activate admin view if a real contact of this role exists
        // Don't fall back to mock data — let the portal render with the real logged-in user
        if (contactsOfRole.length > 0) {
          const selectedUser = {
            id: contactsOfRole[0].id.toString(),
            name: contactsOfRole[0].name,
            email: contactsOfRole[0].email || '',
            company: contactsOfRole[0].company || '',
            role: currentPortal
          };
          enterAdminView(currentPortal, selectedUser);
        }
      }
    } else {
      // If navigating away from portals, exit admin view
      if (isAdminView) {
        // Development logging removed
        exitAdminView();
      }
    }
  }, [location, hasRole, isAdminView, enterAdminView, exitAdminView, typedContacts]);

  return { isAutoActivated: isAdminView };
}