import { QueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';

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

export const apiRequest = async (url: string, options: RequestInit = {}) => {
  try {
    const method = options.method || 'GET';
    
    // Build headers with Firebase authentication
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache', // Force refresh
      ...(options.headers as Record<string, string> || {}),
    };

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