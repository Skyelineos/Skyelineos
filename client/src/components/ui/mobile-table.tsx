import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useIsMobile } from '@/hooks/use-mobile';

interface MobileTableColumn {
  key: string;
  label: string;
  className?: string;
  render?: (value: any, row: any) => React.ReactNode;
  priority?: 'high' | 'medium' | 'low'; // for responsive hiding
}

interface MobileTableProps {
  data: any[];
  columns: MobileTableColumn[];
  className?: string;
  cardClassName?: string;
  onRowClick?: (row: any) => void;
}

export function MobileTable({ 
  data, 
  columns, 
  className, 
  cardClassName,
  onRowClick 
}: MobileTableProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    // Mobile: Stacked card view
    return (
      <div className={cn('space-y-3', className)}>
        {data.map((row, index) => (
          <Card 
            key={index} 
            className={cn(
              'rounded-xl border border-gray-200 shadow-sm',
              onRowClick && 'cursor-pointer hover:shadow-md transition-shadow touch-target',
              cardClassName
            )}
            onClick={() => onRowClick?.(row)}
          >
            <CardContent className="p-4">
              <div className="space-y-2">
                {columns.map((column) => {
                  const value = row[column.key];
                  const displayValue = column.render ? column.render(value, row) : value;
                  
                  return (
                    <div key={column.key} className="flex justify-between items-center gap-2 min-w-0">
                      <span className="text-sm text-gray-600 text-wrap flex-shrink-0">
                        {column.label}:
                      </span>
                      <div className="text-sm font-medium text-wrap min-w-0 text-right">
                        {displayValue}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Desktop: Traditional table with responsive column hiding
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className={cn('min-w-full divide-y divide-gray-200', className)}>
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
                  column.priority === 'low' && 'hidden lg:table-cell',
                  column.priority === 'medium' && 'hidden md:table-cell',
                  column.className
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, index) => (
            <tr
              key={index}
              className={cn(
                onRowClick && 'cursor-pointer hover:bg-gray-50 transition-colors'
              )}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((column) => {
                const value = row[column.key];
                const displayValue = column.render ? column.render(value, row) : value;
                
                return (
                  <td
                    key={column.key}
                    className={cn(
                      'px-6 py-4 whitespace-nowrap text-sm text-gray-900',
                      column.priority === 'low' && 'hidden lg:table-cell',
                      column.priority === 'medium' && 'hidden md:table-cell',
                      column.className
                    )}
                  >
                    {displayValue}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Utility component for status badges
export function StatusBadge({ status }: { status: string }) {
  const getVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'in progress':
      case 'completed':
        return 'default';
      case 'pending':
      case 'review':
        return 'secondary';
      case 'urgent':
      case 'overdue':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Badge variant={getVariant(status)} className="text-xs">
      {status}
    </Badge>
  );
}