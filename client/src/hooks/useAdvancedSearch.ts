import { useState, useMemo } from 'react';
import { TransformedProject } from '@/lib/projectUtils';

interface AdvancedSearchOptions {
  searchFields: (keyof TransformedProject)[];
  enableFuzzySearch: boolean;
  minSearchLength: number;
}

interface SearchResult {
  filteredProjects: TransformedProject[];
  searchStats: {
    totalResults: number;
    searchTerm: string;
    appliedFilters: string[];
    resultsByStatus: Record<string, number>;
  };
  suggestions: string[];
}

// Advanced search hook with fuzzy matching and intelligent suggestions
export function useAdvancedSearch(
  projects: TransformedProject[],
  options: AdvancedSearchOptions = {
    searchFields: ['name', 'client', 'address', 'description', 'projectManager'],
    enableFuzzySearch: true,
    minSearchLength: 2,
  }
) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [managerFilter, setManagerFilter] = useState<string>('all');
  const [budgetRange, setBudgetRange] = useState<[number, number]>([0, 10000000]);

  // Fuzzy search function
  const fuzzyMatch = (text: string, pattern: string): boolean => {
    if (!options.enableFuzzySearch) {
      return text.toLowerCase().includes(pattern.toLowerCase());
    }

    const textLower = text.toLowerCase();
    const patternLower = pattern.toLowerCase();
    
    // Exact match gets highest priority
    if (textLower.includes(patternLower)) return true;
    
    // Character-by-character fuzzy matching for typos
    let patternIndex = 0;
    for (let i = 0; i < textLower.length && patternIndex < patternLower.length; i++) {
      if (textLower[i] === patternLower[patternIndex]) {
        patternIndex++;
      }
    }
    return patternIndex === patternLower.length;
  };

  // Generate intelligent search suggestions
  const generateSearchSuggestions = (allProjects: TransformedProject[], term: string): string[] => {
    if (!term || term.length < 2) return [];

    const suggestions = new Set<string>();
    const termLower = term.toLowerCase();

    // Extract unique project names, clients, and addresses that contain the search term
    allProjects.forEach(project => {
      // Project names
      if (project.name && project.name.toLowerCase().includes(termLower)) {
        suggestions.add(project.name);
      }
      
      // Client names
      if (project.client && project.client.toLowerCase().includes(termLower)) {
        suggestions.add(project.client);
      }
      
      // Addresses
      if (project.address && project.address.toLowerCase().includes(termLower)) {
        suggestions.add(project.address);
      }
      
      // Project managers
      if (project.projectManager && project.projectManager.toLowerCase().includes(termLower)) {
        suggestions.add(project.projectManager);
      }
    });

    return Array.from(suggestions).slice(0, 5);
  };

  // Search and filter logic
  const searchResult: SearchResult = useMemo(() => {
    let filtered = [...projects];

    // Apply search term filtering
    if (searchTerm && searchTerm.length >= options.minSearchLength) {
      filtered = filtered.filter(project => {
        return options.searchFields.some(field => {
          const value = project[field];
          if (typeof value === 'string') {
            return fuzzyMatch(value, searchTerm);
          }
          if (typeof value === 'number') {
            return value.toString().includes(searchTerm);
          }
          return false;
        });
      });
    }

    // Apply status filtering
    if (statusFilter !== 'all') {
      filtered = filtered.filter(project => project.status === statusFilter);
    }

    // Apply project manager filtering
    if (managerFilter !== 'all') {
      filtered = filtered.filter(project => project.projectManager === managerFilter);
    }

    // Apply budget range filtering
    filtered = filtered.filter(project => 
      project.budget >= budgetRange[0] && project.budget <= budgetRange[1]
    );

    // Calculate search statistics
    const resultsByStatus = filtered.reduce((acc, project) => {
      acc[project.status] = (acc[project.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const appliedFilters = [];
    if (statusFilter !== 'all') appliedFilters.push(`Status: ${statusFilter}`);
    if (managerFilter !== 'all') appliedFilters.push(`Manager: ${managerFilter}`);
    if (budgetRange[0] > 0 || budgetRange[1] < 10000000) {
      appliedFilters.push(`Budget: $${(budgetRange[0] / 1000).toFixed(0)}k - $${(budgetRange[1] / 1000).toFixed(0)}k`);
    }

    // Generate search suggestions
    const suggestions = generateSearchSuggestions(projects, searchTerm);

    return {
      filteredProjects: filtered,
      searchStats: {
        totalResults: filtered.length,
        searchTerm,
        appliedFilters,
        resultsByStatus,
      },
      suggestions,
    };
  }, [projects, searchTerm, statusFilter, managerFilter, budgetRange, options]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setManagerFilter('all');
    setBudgetRange([0, 10000000]);
  };

  // Get unique project managers for filter dropdown
  const availableManagers = useMemo(() => {
    const managers = new Set(projects.map(p => p.projectManager));
    return Array.from(managers).filter(Boolean).sort();
  }, [projects]);

  // Get project statistics for insights
  const searchInsights = useMemo(() => {
    const total = searchResult.filteredProjects.length;
    const avgBudget = total > 0 
      ? searchResult.filteredProjects.reduce((sum, p) => sum + p.budget, 0) / total 
      : 0;
    
    const statusDistribution = Object.entries(searchResult.searchStats.resultsByStatus)
      .map(([status, count]) => ({
        status,
        count,
        percentage: (count / total) * 100,
      }));

    return {
      totalProjects: total,
      averageBudget: avgBudget,
      statusDistribution,
      hasActiveSearch: searchTerm.length >= options.minSearchLength || statusFilter !== 'all' || managerFilter !== 'all',
    };
  }, [searchResult, searchTerm, statusFilter, managerFilter, options.minSearchLength]);

  return {
    // Search state
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    managerFilter,
    setManagerFilter,
    budgetRange,
    setBudgetRange,
    
    // Results
    ...searchResult,
    
    // Utilities
    clearAllFilters,
    availableManagers,
    searchInsights,
  };
}