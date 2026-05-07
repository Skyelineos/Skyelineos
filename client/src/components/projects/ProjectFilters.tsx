import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Filter, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface ProjectFiltersProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  sortBy: 'name' | 'date' | 'budget' | 'status';
  sortOrder: 'asc' | 'desc';
  updateSort: (field: 'name' | 'date' | 'budget' | 'status') => void;
  searchStats: {
    total: number;
    filtered: number;
    hasActiveSearch: boolean;
    statusCounts: Record<string, number>;
  };
  clearSearch: () => void;
}

const statusOptions = [
  { value: 'all', label: 'All Projects', color: 'secondary' },
  { value: 'planning', label: 'Planning', color: 'secondary' },
  { value: 'active', label: 'Active', color: 'default' },
  { value: 'on_hold', label: 'On Hold', color: 'destructive' },
  { value: 'completed', label: 'Completed', color: 'outline' },
];

const sortOptions = [
  { value: 'date', label: 'Start Date' },
  { value: 'name', label: 'Project Name' },
  { value: 'budget', label: 'Budget' },
  { value: 'status', label: 'Status' },
];

export function ProjectFilters({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  sortBy,
  sortOrder,
  updateSort,
  searchStats,
  clearSearch,
}: ProjectFiltersProps) {
  // Safety check for searchStats
  if (!searchStats) {
    return null;
  }
  const getSortIcon = (field: string) => {
    if (sortBy !== field) return <ArrowUpDown className="h-4 w-4" />;
    return sortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Search and Quick Filters Row */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search projects, clients, addresses, or managers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Badge variant={option.color as any} className="text-xs">
                          {option.label}
                        </Badge>
                        {option.value !== 'all' && (
                          <span className="text-gray-500 text-xs">
                            ({searchStats.statusCounts[option.value] || 0})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sort by:</span>
              {sortOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={sortBy === option.value ? 'accent' : 'outline'}
                  size="sm"
                  onClick={() => updateSort(option.value as any)}
                  className="flex items-center gap-1"
                >
                  {option.label}
                  {getSortIcon(option.value)}
                </Button>
              ))}
            </div>
          </div>

          {/* Results Summary and Clear Filters */}
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              Showing {searchStats.filtered} of {searchStats.total} projects
              {searchStats.hasActiveSearch && (
                <span className="ml-2">
                  • Filtered by: {searchTerm && `"${searchTerm}"`}
                  {searchTerm && statusFilter !== 'all' && ', '}
                  {statusFilter !== 'all' && `Status: ${statusOptions.find(s => s.value === statusFilter)?.label}`}
                </span>
              )}
            </div>
            
            {searchStats.hasActiveSearch && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSearch}
                className="text-theme-primary hover:text-theme-primary"
              >
                <X className="h-4 w-4 mr-1" />
                Clear filters
              </Button>
            )}
          </div>

          {/* Quick Status Filter Badges */}
          {!searchStats.hasActiveSearch && (
            <div className="flex flex-wrap gap-2">
              {statusOptions.slice(1).map((option) => {
                const count = searchStats.statusCounts[option.value] || 0;
                if (count === 0) return null;
                
                return (
                  <Button
                    key={option.value}
                    variant="outline"
                    size="sm"
                    onClick={() => setStatusFilter(option.value)}
                    className="flex items-center gap-1"
                  >
                    <Badge variant={option.color as any} className="text-xs">
                      {option.label}
                    </Badge>
                    <span className="text-gray-500">({count})</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}