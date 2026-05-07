import { useState, useMemo, useCallback } from 'react';
import { sanitizeSearchQuery } from '@/lib/validation';
import { TransformedProject } from '@/lib/projectUtils';

// Advanced search and filtering capabilities
export function useProjectSearch(projects: TransformedProject[]) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'budget' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Sanitized search term
  const sanitizedSearchTerm = useMemo(() => 
    sanitizeSearchQuery(searchTerm), [searchTerm]
  );

  // Advanced filtering with multiple criteria
  const filteredProjects = useMemo(() => {
    let filtered = projects.filter(project => {
      // Text search across multiple fields
      const searchMatch = !sanitizedSearchTerm || [
        project.name,
        project.client,
        project.address,
        project.projectManager,
        project.description,
      ].some(field => 
        field?.toLowerCase().includes(sanitizedSearchTerm.toLowerCase())
      );

      // Status filter
      const statusMatch = statusFilter === 'all' || project.status === statusFilter;

      return searchMatch && statusMatch;
    });

    // Advanced sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
          break;
        case 'budget':
          comparison = (a.budget || 0) - (b.budget || 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison = parseInt(b.id) - parseInt(a.id); // Default by ID
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [projects, sanitizedSearchTerm, statusFilter, sortBy, sortOrder]);

  // Search statistics
  const searchStats = useMemo(() => ({
    total: projects.length,
    filtered: filteredProjects.length,
    hasActiveSearch: sanitizedSearchTerm.length > 0 || statusFilter !== 'all',
    statusCounts: projects.reduce((acc, project) => {
      acc[project.status] = (acc[project.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  }), [projects, filteredProjects, sanitizedSearchTerm, statusFilter]);

  // Search actions
  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
  }, []);

  const updateSort = useCallback((field: typeof sortBy) => {
    if (field === sortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }, [sortBy]);

  return {
    // State
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    sortBy,
    sortOrder,
    
    // Computed values
    filteredProjects,
    searchStats,
    
    // Actions
    clearSearch,
    updateSort,
  };
}