import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User as FirebaseUser, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

// Backend user interface with role and permissions
interface BackendUser {
  id: number;
  email: string;
  role: string;
  name: string;
  permissions: string[];
  firebaseUid?: string;
  navDisabled?: string[]; // hrefs that admin has explicitly hidden for this user
}

// User session interface for session management
interface UserSession {
  sessionId: string;
  deviceName: string;
  ipAddress: string;
  createdAt: string;
  lastActive: string;
  isCurrent: boolean;
}

interface AuthContextType {
  // Firebase user (for authentication)
  firebaseUser: FirebaseUser | null;
  // Backend user (for authorization - roles, permissions)
  user: BackendUser | null;
  // Loading states
  loading: boolean;
  authLoading: boolean;
  // Auth methods
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<{ revokedTokens: number; revokedSessions: number }>;
  refreshUserData: () => Promise<void>;
  // Token methods (Firebase ID token only - backend uses httpOnly cookies)
  getIdToken: () => Promise<string | null>;
  // Session management
  getUserSessions: () => Promise<UserSession[]>;
  revokeSession: (sessionId: string) => Promise<boolean>;
  // Permission/role checking
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string | string[]) => boolean;
  // Auth state
  isAuthenticated: boolean;
  // Token refresh handling
  refreshTokens: () => Promise<boolean>;
}

const AuthCtx = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  loading: true,
  authLoading: true,
  logout: async () => {},
  logoutAllDevices: async () => ({ revokedTokens: 0, revokedSessions: 0 }),
  refreshUserData: async () => {},
  getIdToken: async () => null,
  getUserSessions: async () => [],
  revokeSession: async () => false,
  hasPermission: () => false,
  hasRole: () => false,
  isAuthenticated: false,
  refreshTokens: async () => false,
});

// Check test mode synchronously at module load
const getInitialTestModeState = (): { isTestMode: boolean; testUser: BackendUser | null } => {
  try {
    const testMode = localStorage.getItem('testMode') === 'true';
    if (testMode) {
      const testUserData = localStorage.getItem('testUser');
      if (testUserData) {
        const parsedUser = JSON.parse(testUserData);
        return {
          isTestMode: true,
          testUser: {
            id: parsedUser.id || 999,
            email: parsedUser.email || 'testuser@skyelinehomes.com',
            role: parsedUser.role || 'admin',
            name: parsedUser.name || 'Test User',
            permissions: ['all'],
          }
        };
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return { isTestMode: false, testUser: null };
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialState = getInitialTestModeState();
  
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<BackendUser | null>(initialState.testUser);
  const [loading, setLoading] = useState(!initialState.isTestMode);
  const [authLoading, setAuthLoading] = useState(!initialState.isTestMode);
  const [isTestMode, setIsTestMode] = useState(initialState.isTestMode);

  // Log test mode activation
  useEffect(() => {
    if (isTestMode) {
      console.log('🧪 Test mode activated');
    }
  }, [isTestMode]);

  // Load user profile directly from Firestore
  const loadUserProfile = useCallback(async (firebaseUser: FirebaseUser) => {
    try {
      setAuthLoading(true);
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));

      if (userDoc.exists()) {
        const data = userDoc.data();
        setUser({
          id: 0,
          email: data.email || firebaseUser.email || '',
          name: data.name || data.fullName || firebaseUser.displayName || '',
          role: data.role || 'client',
          permissions: data.permissions || [],
          firebaseUid: firebaseUser.uid,
          navDisabled: data.navDisabled || [],
        });
      } else {
        // No Firestore profile yet — create one so the user appears in the admin UI
        const newProfile = {
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || '',
          role: 'pending_gc',
          permissions: [],
          firebaseUid: firebaseUser.uid,
          provider: firebaseUser.providerData[0]?.providerId || 'unknown',
          createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
        setUser({
          id: 0,
          ...newProfile,
          role: 'pending_gc',
        });
      }
    } catch (error) {
      console.error('Error loading user profile from Firestore:', error);
      // Fallback: let the user in with basic info so they aren't stuck
      setUser({
        id: 0,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || '',
        role: 'client',
        permissions: [],
        firebaseUid: firebaseUser.uid,
      });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // Refresh user data from Firestore
  const refreshUserData = useCallback(async () => {
    if (!firebaseUser) return;
    await loadUserProfile(firebaseUser);
  }, [firebaseUser, loadUserProfile]);

  // Handle Firebase auth state changes
  useEffect(() => {
    // Skip Firebase auth listener if test mode is active
    const testMode = localStorage.getItem('testMode') === 'true';
    if (testMode) {
      console.log('🧪 Skipping Firebase auth listener (test mode active)');
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('🔥 Firebase auth state changed:', !!firebaseUser);
      setFirebaseUser(firebaseUser);
      
      if (firebaseUser) {
        // User is signed in to Firebase, load user profile
        await loadUserProfile(firebaseUser);
      } else {
        // User is signed out, clear all auth state (but not if test mode)
        if (localStorage.getItem('testMode') !== 'true') {
          setUser(null);
          setAuthLoading(false);
        }
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, [loadUserProfile]);

  // Auto-clear cached auth on app start if there are mismatches (skip if test mode)
  useEffect(() => {
    const checkAuthIntegrity = async () => {
      // Skip integrity check if test mode is active
      if (isTestMode) return;
      
      if (firebaseUser && !user && !authLoading) {
        console.log('🔍 Detected auth mismatch, clearing cache...');
        // Clear auth cache manually without calling the function
        try {
          await signOut(auth);
          // Don't use localStorage.clear() to preserve test mode settings
          sessionStorage.clear();
          setFirebaseUser(null);
          setUser(null);
          setLoading(false);
          setAuthLoading(false);
          console.log('✅ Authentication cache cleared');
        } catch (error) {
          console.error('Clear auth error:', error);
        }
      }
    };
    
    const timeoutId = setTimeout(checkAuthIntegrity, 2000);
    return () => clearTimeout(timeoutId);
  }, [firebaseUser, user, authLoading, isTestMode]);

  // Initialize auth state from Firebase auth state
  useEffect(() => {
    if (!user && firebaseUser) {
      // Try to get user data via token exchange
      refreshUserData();
    }
  }, [user, firebaseUser, refreshUserData]);

  // Add debug logging for authentication state
  useEffect(() => {
    console.log('🔍 Auth Debug:', {
      firebaseUser: !!firebaseUser,
      user: !!user,
      userRole: user?.role,
      loading,
      authLoading,
      isTestMode,
      isAuthenticated: (!!firebaseUser && !!user) || isTestMode
    });
  }, [firebaseUser, user, loading, authLoading, isTestMode]);

  // Token refresh function with rotation support
  const refreshTokens = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        console.log('✅ Tokens refreshed successfully with rotation');
        return true;
      } else {
        console.warn('⚠️ Token refresh failed, user needs to re-authenticate');
        // If refresh fails, clear auth state
        await signOut(auth);
        setFirebaseUser(null);
        setUser(null);
        return false;
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }, []);

  // Clear authentication function - force logout and clear all cache
  const clearAuth = useCallback(async () => {
    try {
      console.log('🧹 Clearing all authentication state...');
      
      // Sign out from Firebase
      await signOut(auth);
      
      // Clear local storage and session storage
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear Firebase persistence data
      if ('indexedDB' in window) {
        try {
          const dbs = await indexedDB.databases();
          await Promise.all(
            dbs.map(db => {
              if (db.name?.includes('firebase')) {
                return indexedDB.deleteDatabase(db.name);
              }
            })
          );
        } catch (e) {
          console.warn('Could not clear Firebase IndexedDB:', e);
        }
      }
      
      // Clear local auth state
      setFirebaseUser(null);
      setUser(null);
      setLoading(false);
      setAuthLoading(false);
      
      console.log('✅ Authentication state cleared');
    } catch (error) {
      console.error('Clear auth error:', error);
      // Force clear state even if errors occur
      setFirebaseUser(null);
      setUser(null);
      setLoading(false);
      setAuthLoading(false);
    }
  }, []);

  // Logout function with Firebase signout
  const logout = useCallback(async () => {
    try {
      // Clear test mode if active
      localStorage.removeItem('testMode');
      localStorage.removeItem('testUser');
      setIsTestMode(false);
      
      // Use the clear auth function for complete cleanup
      await clearAuth();
      
      // Optionally call backend logout
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
        });
        
        if (response.ok) {
          console.log('✅ Backend logout successful');
        }
      } catch (backendError) {
        console.warn('Backend logout failed:', backendError);
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Clear state even if request fails for security
      localStorage.removeItem('testMode');
      localStorage.removeItem('testUser');
      setIsTestMode(false);
      setFirebaseUser(null);
      setUser(null);
    }
  }, [clearAuth]);

  // Logout from all devices function
  const logoutAllDevices = useCallback(async (): Promise<{ revokedTokens: number; revokedSessions: number }> => {
    try {
      const response = await fetch('/api/auth/logout-all', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Logged out from all devices. Revoked ${data.revokedTokens} tokens and ${data.revokedSessions} sessions.`);
        
        // Sign out from Firebase and clear local state
        await signOut(auth);
        setFirebaseUser(null);
        setUser(null);
        
        return {
          revokedTokens: data.revokedTokens,
          revokedSessions: data.revokedSessions
        };
      } else {
        throw new Error('Failed to logout from all devices');
      }
    } catch (error) {
      console.error('Logout all devices error:', error);
      return { revokedTokens: 0, revokedSessions: 0 };
    }
  }, []);

  // Get user sessions for session management
  const getUserSessions = useCallback(async (): Promise<UserSession[]> => {
    try {
      const response = await fetch('/api/auth/sessions', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.sessions || [];
      } else {
        console.warn('Failed to get user sessions');
        return [];
      }
    } catch (error) {
      console.error('Get sessions error:', error);
      return [];
    }
  }, []);

  // Revoke specific session
  const revokeSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/auth/sessions/${sessionId}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        console.log(`✅ Session ${sessionId} revoked successfully`);
        return true;
      } else {
        console.warn(`Failed to revoke session ${sessionId}`);
        return false;
      }
    } catch (error) {
      console.error('Revoke session error:', error);
      return false;
    }
  }, []);

  // Get Firebase ID token
  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (firebaseUser) {
      try {
        return await firebaseUser.getIdToken();
      } catch (error) {
        console.error('Error getting Firebase ID token:', error);
        return null;
      }
    }
    return null;
  }, [firebaseUser]);


  // Permission checking
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission) || user.permissions.includes('all');
  }, [user]);

  // Role checking
  const hasRole = useCallback((role: string | string[]): boolean => {
    if (!user) return false;
    const userRole = user.role.toLowerCase();
    if (Array.isArray(role)) {
      return role.some(r => r.toLowerCase() === userRole);
    }
    return role.toLowerCase() === userRole;
  }, [user]);

  const isAuthenticated = Boolean((firebaseUser && user) || isTestMode);

  // Automatic token refresh on API errors (401 responses)
  useEffect(() => {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      // If we get 401 and user is authenticated, try refreshing tokens
      if (response.status === 401 && isAuthenticated && !authLoading) {
        const refreshed = await refreshTokens();
        
        if (refreshed) {
          // Retry the original request with refreshed tokens
          return await originalFetch(...args);
        }
      }
      
      return response;
    };
    
    return () => {
      window.fetch = originalFetch;
    };
  }, [isAuthenticated, authLoading, refreshTokens]);

  const value: AuthContextType = {
    firebaseUser,
    user,
    loading,
    authLoading,
    logout,
    logoutAllDevices,
    refreshUserData,
    getIdToken,
    getUserSessions,
    revokeSession,
    hasPermission,
    hasRole,
    isAuthenticated,
    refreshTokens,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);