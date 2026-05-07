import { useState } from 'react';
import { FinancialDataView } from './FinancialDataView';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Building2, AlertTriangle } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  status: string;
}

interface FinancialDashboardProps {
  projects?: Project[];
  defaultProjectId?: number;
}

/**
 * Financial Dashboard component that demonstrates the usage of the useFinancialData hook
 * Provides project selection and real-time financial data display
 */
export function FinancialDashboard({ 
  projects = [], 
  defaultProjectId 
}: FinancialDashboardProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    defaultProjectId || (projects.length > 0 ? projects[0].id : null)
  );

  // Sample projects if none provided (for demonstration)
  const sampleProjects: Project[] = projects.length > 0 ? projects : [
    { id: 4, name: "Daniel's Addition", status: 'active' },
    { id: 455, name: 'Park Home', status: 'active' },
    { id: 457, name: 'Adamson Home', status: 'active' },
    { id: 459, name: 'Christenson Home', status: 'planning' },
  ];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'success';
      case 'planning': return 'warning';
      case 'completed': return 'secondary';
      case 'on_hold': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Project Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Project Financial Dashboard
          </CardTitle>
          <CardDescription>
            Select a project to view real-time financial data from Firestore
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select
              value={selectedProjectId?.toString() || ''}
              onValueChange={(value) => setSelectedProjectId(parseInt(value))}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {sampleProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    <div className="flex items-center gap-2">
                      <span>{project.name}</span>
                      <Badge variant={getStatusColor(project.status) as any}>
                        {project.status}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedProjectId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                <span>Real-time data from Firebase</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Financial Data Display */}
      {selectedProjectId ? (
        <FinancialDataView projectId={selectedProjectId} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              Select a project to view financial data
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}