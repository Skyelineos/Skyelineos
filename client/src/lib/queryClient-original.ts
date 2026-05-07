import { QueryClient } from '@tanstack/react-query';
import { getAuthHeaders } from './firebase-auth';

const defaultFetcher = async (url: string) => {
  try {
    // Detect environment - properly detect Firebase hosting vs development
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname.includes('replit.dev') ||
                         (window.location.port && window.location.port !== '80' && window.location.port !== '443');
    const baseUrl = isDevelopment 
      ? 'https://62b3dbea-6650-41a4-a44a-9141d866f727-00-30e1w9e3j6dcq.riker.replit.dev' // Replit dev server
      : ''; // Use relative URLs in production to let Firebase hosting route to functions
    
    const fullUrl = isDevelopment ? `${baseUrl}${url}` : `${baseUrl}${url}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Only add auth headers in production with Firebase
    if (!isDevelopment) {
      const authHeaders = await getAuthHeaders();
      Object.assign(headers, authHeaders);
    }
    
    const response = await fetch(fullUrl, {
      credentials: isDevelopment ? 'include' : 'omit',
      headers,
    });

    if (!response.ok) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error);
    throw error;
  }
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        return defaultFetcher(queryKey[0] as string);
      },
      // Aggressive caching for fast performance
      staleTime: 30 * 1000, // 30 seconds - data is considered fresh
      gcTime: 5 * 60 * 1000, // 5 minutes - keep in cache for fast navigation
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
      refetchOnReconnect: false, // Prevent automatic refetches
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error?.message?.startsWith('4')) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Ensure mutations invalidate related cache
      onSuccess: () => {
        // This will be handled by individual mutations
      },
    },
  },
});

export const apiRequest = async (method: string, url: string, data?: any) => {
  try {
    // Detect environment - properly detect Firebase hosting vs development
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname.includes('replit.dev') ||
                         (window.location.port && window.location.port !== '80' && window.location.port !== '443');
    const baseUrl = isDevelopment 
      ? 'https://62b3dbea-6650-41a4-a44a-9141d866f727-00-30e1w9e3j6dcq.riker.replit.dev' // Replit dev server
      : ''; // Use relative URLs in production to let Firebase hosting route to functions
    
    const fullUrl = isDevelopment ? `${baseUrl}${url}` : `${baseUrl}${url}`;
    
    const options: RequestInit = {
      method: method,
      credentials: isDevelopment ? 'include' : 'omit',
    };

    const headers: Record<string, string> = {};
    
    // Only add auth headers in production with Firebase
    if (!isDevelopment) {
      const authHeaders = await getAuthHeaders();
      Object.assign(headers, authHeaders);
    }

    // Don't set Content-Type for FormData - let browser set it with boundary
    if (data instanceof FormData) {
      options.body = data;
      options.headers = headers; // Only auth headers for FormData
    } else {
      // Set JSON content type for non-FormData requests
      options.headers = {
        "Content-Type": "application/json",
        ...headers
      };
      
      if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
      }
    }

    const response = await fetch(fullUrl, options);
    
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`${response.status}: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`API request error for ${url}:`, error);
    throw error;
  }
};