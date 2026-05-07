import React, { useCallback, useMemo, Suspense, lazy, ComponentType } from 'react';

// Simple debounce without lodash
function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
}

// Debounced search hook
export function useDebouncedSearch(callback: (value: string) => void, delay: number = 300) {
  return useCallback(
    debounce((value: string) => {
      callback(value);
    }, delay),
    [callback, delay]
  );
}

// Memoized data filtering
export function useFilteredData<T>(
  data: T[],
  filters: Record<string, any>,
  searchTerm: string = '',
  searchFields: (keyof T)[] = []
) {
  return useMemo(() => {
    if (!data) return [];

    let filtered = data;

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        filtered = filtered.filter((item: any) => {
          const itemValue = item[key];
          return itemValue === value || (Array.isArray(itemValue) && itemValue.includes(value));
        });
      }
    });

    // Apply search
    if (searchTerm && searchFields.length > 0) {
      const lowercaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((item: any) =>
        searchFields.some(field => {
          const fieldValue = item[field];
          return fieldValue && 
                 typeof fieldValue === 'string' && 
                 fieldValue.toLowerCase().includes(lowercaseSearch);
        })
      );
    }

    return filtered;
  }, [data, filters, searchTerm, searchFields]);
}

// Performance monitoring hook
export function usePerformanceLogger(componentName: string) {
  return useCallback((action: string, startTime?: number) => {
    if (startTime) {
      const duration = performance.now() - startTime;
      if (duration > 100) { // Log if operation takes more than 100ms
        console.warn(`🐌 Slow operation in ${componentName}: ${action} took ${duration.toFixed(2)}ms`);
      }
    }
  }, [componentName]);
}

// Removed problematic lazy loading helper - use React.lazy() directly instead