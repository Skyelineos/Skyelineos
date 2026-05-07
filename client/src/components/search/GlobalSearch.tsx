import { useState, useEffect } from 'react';
import { Search, FileText, User, Building2, DollarSign, Calendar, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';

interface SearchResult {
  id: string;
  type: 'project' | 'contact' | 'estimate' | 'task' | 'document';
  title: string;
  subtitle?: string;
  description?: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  metadata?: Record<string, any>;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch search results
  const { data: searchResults = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ['/api/search', searchQuery],
    enabled: searchQuery.length >= 2,
    staleTime: 30000, // 30 seconds
  });

  // Reset search when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < searchResults.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : searchResults.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            onOpenChange(false);
            // Navigate to the selected result
            window.location.href = searchResults[selectedIndex].url;
          }
          break;
        case 'Escape':
          onOpenChange(false);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, searchResults, selectedIndex, onOpenChange]);

  const getTypeIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'project':
        return Building2;
      case 'contact':
        return User;
      case 'estimate':
        return DollarSign;
      case 'task':
        return Calendar;
      case 'document':
        return FileText;
      default:
        return FileText;
    }
  };

  const getTypeBadgeColor = (type: SearchResult['type']) => {
    switch (type) {
      case 'project':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'contact':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'estimate':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'task':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'document':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Global Search
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects, contacts, estimates, tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
              autoFocus
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {searchQuery.length > 0 && searchQuery.length < 2 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Type at least 2 characters to search
            </p>
          )}
        </div>

        {searchQuery.length >= 2 && (
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="px-6 py-8 text-center text-muted-foreground">
                Searching...
              </div>
            ) : searchResults.length > 0 ? (
              <div className="px-2 pb-4">
                {searchResults.map((result, index) => {
                  const IconComponent = getTypeIcon(result.type);
                  return (
                    <Link key={result.id} href={result.url}>
                      <div
                        className={`mx-2 p-3 rounded-lg cursor-pointer transition-colors ${
                          index === selectedIndex
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent/50'
                        }`}
                        onClick={() => onOpenChange(false)}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className="flex items-start gap-3">
                          <IconComponent className="h-5 w-5 mt-0.5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="text-sm font-medium truncate">
                                {result.title}
                              </h4>
                              <Badge
                                variant="secondary"
                                className={`text-xs capitalize ${getTypeBadgeColor(result.type)}`}
                              >
                                {result.type}
                              </Badge>
                            </div>
                            {result.subtitle && (
                              <p className="text-sm text-muted-foreground truncate">
                                {result.subtitle}
                              </p>
                            )}
                            {result.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {result.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-muted-foreground">
                No results found for "{searchQuery}"
              </div>
            )}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="px-6 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
            Use ↑↓ to navigate, Enter to select, Esc to close
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}