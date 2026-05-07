import { useState, useEffect, createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface User {
  id: number;
  email: string;
  role: string;
  name: string;
  firstName?: string;
  lastName?: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string | string[]) => boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

// Store access token in memory
let accessToken: string | null = null;
let refreshAttemptInProgress = false;

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Custom fetch that automatically attaches Bearer token and handles refresh
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const makeRequest = async (token: string | null) => {
    const headers = new Headers(options.headers);
    // Try localStorage token first, then memory token
    const authToken = token || localStorage.getItem('accessToken');
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    
    // Add CSRF token for unsafe methods if cookies are present
    const method = (options.method || 'GET').toUpperCase();
    const unsafeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    
    if (unsafeMethods.includes(method)) {
      // Get CSRF token from cookie
      const csrfToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('csrfToken='))
        ?.split('=')[1];
        
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
    }
    
    return fetch(url, {
      ...options,
      headers,
      credentials: 'include' // Always include cookies
    });
  };

  let response = await makeRequest(accessToken || localStorage.getItem('accessToken'));
  
  // If 401 and we have a token, try to refresh once
  if (response.status === 401 && (accessToken || localStorage.getItem('accessToken')) && !refreshAttemptInProgress) {
    refreshAttemptInProgress = true;
    try {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include' // Include httpOnly cookies
      });
      
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        accessToken = data.accessToken;
        // Retry original request with new token
        response = await makeRequest(accessToken);
      } else {
        // Refresh failed, clear token
        accessToken = null;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      accessToken = null;
    } finally {
      refreshAttemptInProgress = false;
    }
  }
  
  return response;
}

export function useAuthProvider(): AuthContextType {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const checkAuth = async () => {
    try {
      // Development auto-login: bypass authentication in development mode
      if (import.meta.env.MODE === 'development' && import.meta.env.VITE_AUTO_LOGIN !== 'false') {
        const mockUser: User = {
          id: 1,
          email: 'admin@skylinehomes.com',
          role: 'admin',
          name: 'Admin User',
          firstName: 'Admin',
          lastName: 'User',
          permissions: ['all']
        };
        setUser(mockUser);
        setIsLoading(false);
        return;
      }
      
      // In production Firebase environment, check if we have a valid token first
      if (import.meta.env.MODE === 'production' && !accessToken) {
        // No token available, user needs to log in
        setUser(null);
        setIsLoading(false);
        return;
      }
      
      const response = await authenticatedFetch('/api/auth/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        // Handle 401 gracefully - user is simply not authenticated
        setUser(null);
        accessToken = null;
      }
    } catch (error) {
      // Suppress auth errors for production - they're expected when user isn't logged in
      if (import.meta.env.MODE === 'development') {
        console.error('Auth check failed:', error);
      }
      setUser(null);
      accessToken = null;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Include cookies for refresh token
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        accessToken = data.accessToken;
        setUser(data.user);
        return true;
      } else {
        const error = await response.json();
        console.error('Login failed:', error);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    accessToken = null;
    setUser(null);
    queryClient.clear();
  };

  const hasPermission = (permission: string) => {
    return user?.permissions?.includes(permission) || false;
  };

  const hasRole = (role: string | string[]) => {
    if (!user) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.some(r => {
      if (r === 'Admin') return user.role === 'admin';
      if (r === 'ProjectManager') return ['admin', 'project_manager'].includes(user.role);
      return user.role === r;
    });
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    isLoading,
    hasPermission,
    hasRole,
  };
}