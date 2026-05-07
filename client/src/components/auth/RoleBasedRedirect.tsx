import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { shouldRedirectUser } from '@/utils/roleRedirects';

/**
 * Component that handles automatic role-based redirects
 * Place this in your app to automatically redirect users to appropriate routes
 */
export function RoleBasedRedirect() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { currentRole } = useRoleAccess();

  useEffect(() => {
    // Don't redirect while loading or if not authenticated
    if (isLoading || !isAuthenticated || !user || !currentRole) {
      return;
    }

    const redirectTo = shouldRedirectUser(location, currentRole, user.id.toString());
    
    if (redirectTo && redirectTo !== location) {
      // Processing operation
      setLocation(redirectTo);
    }
  }, [location, currentRole, user, isAuthenticated, isLoading, setLocation]);

  return null; // This component doesn't render anything
}