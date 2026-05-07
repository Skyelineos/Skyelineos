import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Calendar, MapPin, DollarSign, Users, ChevronRight } from 'lucide-react';
import { useMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface MobileProjectCardProps {
  project: {
    id: number;
    name: string;
    status: string;
    progress: number;
    budget: number;
    spent: number;
    location: string;
    dueDate: string;
    teamSize: number;
  };
  onSelect?: (projectId: number) => void;
  className?: string;
}

const statusColors = {
  'planning': 'bg-yellow-500',
  'in_progress': 'bg-blue-500',
  'completed': 'bg-green-500',
  'on_hold': 'bg-gray-500',
  'cancelled': 'bg-red-500'
};

export function MobileProjectCard({ project, onSelect, className }: MobileProjectCardProps) {
  const isMobile = useMobile();
  
  const handleSelect = () => {
    onSelect?.(project.id);
  };

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Card 
      className={cn(
        'transition-all duration-200 cursor-pointer',
        isMobile ? [
          'active:scale-98 active:shadow-lg',
          'border-l-4 border-l-blue-500',
          'shadow-sm hover:shadow-md'
        ] : [
          'hover:shadow-lg hover:scale-[1.02]'
        ],
        className
      )}
      onClick={handleSelect}
    >
      <CardHeader className={cn(
        'pb-3',
        isMobile ? 'p-4' : 'p-6'
      )}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              'font-semibold text-foreground truncate',
              isMobile ? 'text-base' : 'text-lg'
            )}>
              {project.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge 
                variant="secondary" 
                className={cn(
                  'text-white',
                  statusColors[project.status as keyof typeof statusColors] || 'bg-gray-500'
                )}
              >
                {project.status.replace('_', ' ').toUpperCase()}
              </Badge>
              <span className={cn(
                'text-muted-foreground',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                ID: {project.id}
              </span>
            </div>
          </div>
          <ChevronRight className={cn(
            'text-muted-foreground shrink-0',
            isMobile ? 'h-4 w-4' : 'h-5 w-5'
          )} />
        </div>
      </CardHeader>

      <CardContent className={cn(
        'space-y-4',
        isMobile ? 'p-4 pt-0' : 'p-6 pt-0'
      )}>
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className={cn(
              'font-medium',
              isMobile ? 'text-sm' : 'text-base'
            )}>
              Progress
            </span>
            <span className={cn(
              'text-muted-foreground font-medium',
              isMobile ? 'text-sm' : 'text-base'
            )}>
              {project.progress}%
            </span>
          </div>
          <Progress 
            value={project.progress} 
            className={isMobile ? 'h-2' : 'h-3'} 
          />
        </div>

        {/* Project Details Grid */}
        <div className={cn(
          'grid gap-3',
          isMobile ? 'grid-cols-1' : 'grid-cols-2'
        )}>
          {/* Budget */}
          <div className="flex items-center gap-2">
            <DollarSign className={cn(
              'text-green-600',
              isMobile ? 'h-4 w-4' : 'h-4 w-4'
            )} />
            <div className="min-w-0">
              <div className={cn(
                'font-medium',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                {formatCurrency(project.spent)} / {formatCurrency(project.budget)}
              </div>
              <div className={cn(
                'text-muted-foreground',
                isMobile ? 'text-xs' : 'text-xs'
              )}>
                Budget
              </div>
            </div>
          </div>

          {/* Due Date */}
          <div className="flex items-center gap-2">
            <Calendar className={cn(
              'text-blue-600',
              isMobile ? 'h-4 w-4' : 'h-4 w-4'
            )} />
            <div className="min-w-0">
              <div className={cn(
                'font-medium',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                {formatDate(project.dueDate)}
              </div>
              <div className={cn(
                'text-muted-foreground',
                isMobile ? 'text-xs' : 'text-xs'
              )}>
                Due Date
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-2">
            <MapPin className={cn(
              'text-purple-600',
              isMobile ? 'h-4 w-4' : 'h-4 w-4'
            )} />
            <div className="min-w-0">
              <div className={cn(
                'font-medium truncate',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                {project.location}
              </div>
              <div className={cn(
                'text-muted-foreground',
                isMobile ? 'text-xs' : 'text-xs'
              )}>
                Location
              </div>
            </div>
          </div>

          {/* Team Size */}
          <div className="flex items-center gap-2">
            <Users className={cn(
              'text-orange-600',
              isMobile ? 'h-4 w-4' : 'h-4 w-4'
            )} />
            <div className="min-w-0">
              <div className={cn(
                'font-medium',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                {project.teamSize} members
              </div>
              <div className={cn(
                'text-muted-foreground',
                isMobile ? 'text-xs' : 'text-xs'
              )}>
                Team
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Action Button */}
        {isMobile && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-3"
            onClick={(e) => {
              e.stopPropagation();
              handleSelect();
            }}
          >
            View Details
          </Button>
        )}
      </CardContent>
    </Card>
  );
}