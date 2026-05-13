import { ReactNode, useEffect, useState } from 'react';
import { Redirect } from "wouter";
import { useAuth } from "./AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  requireAuth?: boolean;
  fallbackComponent?: ReactNode;
}

export default function ProtectedRoute({ 
  children, 
  allowedRoles = [],
  requireAuth = true,
  fallbackComponent
}: ProtectedRouteProps) {
  const { user, loading, isAuthenticated, hasRole } = useAuth();

  // Check for test mode directly from localStorage (synchronous check)
  const isTestMode = typeof window !== 'undefined' && localStorage.getItem('testMode') === 'true';

  // Safety net: if auth hasn't resolved after 8 seconds, treat it as a stuck
  // load and force a re-flow. Common cause: stale Firebase cache from a
  // previous build. The "Reset" button wipes site data + reloads.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  // Show loading state while checking auth (skip if test mode)
  if (loading && !isTestMode) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div className="text-sm text-muted-foreground">Verifying authentication...</div>
          {stuck && (
            <div className="text-center max-w-sm pt-4 space-y-3">
              <p className="text-xs text-amber-700">
                Auth is taking unusually long. Something may be cached. Try a reset:
              </p>
              <button
                type="button"
                className="px-3 py-1.5 rounded border border-amber-400 bg-amber-50 text-amber-900 text-sm hover:bg-amber-100"
                onClick={async () => {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                    // Best-effort IndexedDB wipe for Firebase persistent caches.
                    const dbs = (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
                    for (const d of dbs) {
                      if (d?.name) indexedDB.deleteDatabase(d.name);
                    }
                  } catch {}
                  window.location.href = '/sign-in';
                }}
              >
                Reset and go to sign-in
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If authentication is required but no user (and not in test mode), redirect to sign-in.
  // Preserve the originally requested URL as a `?next=` query param so the
  // sign-in page can bounce the user back here after authenticating
  // (used by emailed deep links into the sub portal).
  if (requireAuth && !isAuthenticated && !isTestMode) {
    console.debug('ProtectedRoute: Redirecting unauthenticated user to /sign-in');
    if (typeof window !== 'undefined') {
      const intended = window.location.pathname + window.location.search;
      if (intended && intended !== '/sign-in' && !intended.startsWith('/sign-in?')) {
        const target = `/sign-in?next=${encodeURIComponent(intended)}`;
        return <Redirect to={target} />;
      }
    }
    return <Redirect to="/sign-in" />;
  }

  // Block pending team members until an admin approves them
  if (user?.role === 'pending_gc' && !isTestMode) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center space-y-4">
          <div className="text-4xl">⏳</div>
          <h2 className="text-xl font-semibold text-gray-800">Access Pending Approval</h2>
          <p className="text-gray-500 text-sm">
            Your Skyeline Team Member account is awaiting admin review. You'll receive access once a team admin approves your request.
          </p>
          <p className="text-gray-400 text-xs">Signed in as {user.email}</p>
        </div>
      </div>
    );
  }

  // If specific roles are required, check user role
  if (allowedRoles.length > 0 && user) {
    const hasPermission = allowedRoles.some(role => hasRole(role));
    
    if (!hasPermission) {
      console.debug(`ProtectedRoute: User role '${user.role}' not in allowed roles [${allowedRoles.join(', ')}]`);
      return fallbackComponent || <Redirect to="/not-authorized" />;
    }
  }

  // All checks passed, render children
  console.debug('ProtectedRoute: Auth checks passed, rendering children');
  return <>{children}</>;
}