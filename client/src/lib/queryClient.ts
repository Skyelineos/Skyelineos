import { QueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';

// ── Auth-ready gate ──────────────────────────────────────────────────────────
// Firebase Auth restores the persisted user from IndexedDB/localStorage
// ASYNCHRONOUSLY on page load. React Query kicks off queries the moment a
// component mounts, which used to race and fire requests with no Bearer
// token → 401 → dashboard errors + E2E flake.
//
// waitForAuth() resolves on the first onAuthStateChanged tick (fires with
// either a user or null). The promise is memoized so every fetch after the
// first paints is essentially a no-op await.
let authReadyPromise: Promise<void> | null = null;
function waitForAuth(): Promise<void> {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged(() => {
        unsubscribe();
        resolve();
      });
    });
  }
  return authReadyPromise;
}

// Detect Firebase production environment
const isFirebaseProduction = () => {
  return window.location.hostname.includes('.web.app') || 
         window.location.hostname.includes('.firebaseapp.com') ||
         window.location.hostname.includes('firebase') ||
         import.meta.env.PROD;
};

// Detect local development environment
const isLocalDevelopment = () => {
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname.includes('replit.dev');
};

// Firebase token-based fetcher
const defaultFetcher = async (url: string) => {
  try {
    // Set up headers with Firebase authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Wait for Firebase Auth to hydrate from persistence before deciding
    // whether to attach a Bearer token. Prevents the initial-paint race
    // where auth.currentUser is still null even though the user is signed in.
    await waitForAuth();

    // Get Firebase ID token and add to Authorization header
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
    } catch (tokenError) {
      console.warn('Failed to get Firebase token:', tokenError);
      // Continue without token - some endpoints may not require auth
    }

    const response = await fetch(url, {
      headers,
    });

    if (!response.ok) {
      console.warn(`API request failed: ${response.status} for ${url}`);
      
      // Never use mock data in Firebase production
      if (isFirebaseProduction()) {
        throw new Error(`Firebase API request failed: ${response.status} for ${url}`);
      }
      
      // Only use mock data in local development as fallback
      if (isLocalDevelopment()) {
        console.warn('Falling back to mock data in development');
        return getMockData(url);
      }
      
      throw new Error(`API request failed: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    console.warn(`API request error for ${url}:`, (error as Error).message);
    
    // Never use mock data in Firebase production - always fail fast
    if (isFirebaseProduction()) {
      console.error('Firebase production API error - no fallback available');
      throw error;
    }
    
    // Only use mock data in local development
    if (isLocalDevelopment()) {
      console.warn('Using mock data fallback in development');
      return getMockData(url);
    }
    
    throw error;
  }
};

// Mock data for construction management demo
function getMockData(url: string) {
  if (url.includes('/api/projects')) {
    return [
      {
        id: 1,
        name: 'Modern Lakehouse',
        status: 'in_progress',
        progress: 65,
        client: 'Johnson Family',
        startDate: '2024-01-15',
        endDate: '2024-08-30'
      },
      {
        id: 2,
        name: 'Suburban Estate',
        status: 'planning',
        progress: 25,
        client: 'Smith Builders',
        startDate: '2024-03-01',
        endDate: '2024-12-15'
      }
    ];
  }

  if (url.includes('/api/dashboard')) {
    return {
      totalProjects: 8,
      activeProjects: 5,
      completedProjects: 3,
      totalRevenue: 2450000,
      avgProjectDuration: 6.5
    };
  }

  if (url.includes('/api/contacts')) {
    return [
      {
        id: '1',
        name: 'John Smith',
        email: 'john.smith@email.com',
        phone: '(555) 123-4567',
        role: 'project_manager',
        company: 'Skyeline Homes',
        isActive: true
      },
      {
        id: '2',
        name: 'Sarah Johnson',
        email: 'sarah.johnson@client.com',
        phone: '(555) 987-6543',
        role: 'client',
        company: 'Johnson Family',
        isActive: true
      }
    ];
  }

  if (url.includes('/api/notifications')) {
    return [];
  }

  if (url.includes('/api/schedule')) {
    return [
      {
        id: 1,
        title: 'Foundation Inspection',
        project: 'Modern Lakehouse',
        date: '2025-01-22',
        status: 'scheduled'
      },
      {
        id: 2,
        title: 'Material Delivery',
        project: 'Suburban Estate',
        date: '2025-01-24',
        status: 'confirmed'
      }
    ];
  }

  return [];
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        return defaultFetcher(queryKey[0] as string);
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Dual-signature apiRequest:
//   Modern: apiRequest(url, options?)                  — fetch-style
//   Legacy: apiRequest(method, url, body?)             — axios-style used across older components
// Both are supported so we don't have to rewrite ~90 callsites in one pass.
export const apiRequest = async (
  arg1: string,
  arg2: RequestInit | string = {},
  arg3?: unknown,
) => {
  let url: string;
  let options: RequestInit = {};

  const LEGACY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  if (typeof arg2 === 'string' && LEGACY_METHODS.has(arg1.toUpperCase())) {
    // Legacy 3-arg form
    const method = arg1.toUpperCase();
    url = arg2;
    options = {
      method,
      ...(arg3 !== undefined && method !== 'GET'
        ? { body: typeof arg3 === 'string' ? arg3 : JSON.stringify(arg3) }
        : {}),
    };
  } else {
    url = arg1;
    options = (typeof arg2 === 'object' && arg2 !== null ? arg2 : {}) as RequestInit;
  }

  try {
    const method = options.method || 'GET';
    
    // Build headers with Firebase authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache', // Force refresh
      ...(options.headers as Record<string, string> || {}),
    };

    // Wait for Firebase Auth to hydrate before reading currentUser.
    await waitForAuth();

    // Get Firebase ID token and add to Authorization header
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
    } catch (tokenError) {
      console.warn('Failed to get Firebase token:', tokenError);
      // Continue without token for endpoints that may not require auth
    }

    // Firebase API requests with token authentication
    const response = await fetch(url, {
      method,
      headers,
      ...options,
    });

    if (!response.ok) {
      console.warn(`API ${options.method || 'GET'} request failed: ${response.status} for ${url}`);
      
      // Never fall back to mock data in Firebase production
      if (isFirebaseProduction()) {
        console.error('Firebase production API failure - no fallback');
        throw new Error(`Firebase API request failed: ${response.status} for ${url}`);
      }
      
      // Only use mock data in local development
      if (isLocalDevelopment()) {
        console.warn('Development API failed, using mock data');
        return getMockData(url);
      }
      
      throw new Error(`API request failed: ${response.status} for ${url}`);
    }
    
    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    } else {
      // Handle non-JSON responses
      const text = await response.text();
      console.warn(`Non-JSON response from ${url}:`, text.substring(0, 200));
      
      // In Firebase production, this is an error
      if (isFirebaseProduction()) {
        throw new Error(`Firebase API returned non-JSON: ${contentType}`);
      }
      
      throw new Error(`Expected JSON response but got: ${contentType}`);
    }
  } catch (error) {
    console.warn(`API ${options.method || 'GET'} request error for ${url}:`, (error as Error).message);
    
    // Never use mock data in Firebase production
    if (isFirebaseProduction()) {
      console.error('Firebase production error - failing fast');
      throw error;
    }
    
    // Only use mock data in local development
    if (isLocalDevelopment() && error instanceof Error && error.message.includes('JSON')) {
      console.warn('JSON parsing error in development - using mock data');
      return getMockData(url);
    }
    
    throw error;
  }
};