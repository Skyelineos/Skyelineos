import { useState } from 'react';
import { useParams } from 'wouter';
import { FinancialDashboard } from '../components/projects/FinancialDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { Link } from 'wouter';

/**
 * Page component demonstrating the FinancialDashboard usage
 * Provides navigation and export capabilities
 */
export function ProjectFinancialsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const numericProjectId = projectId ? parseInt(projectId) : 4; // Default to project 4

  const handleExportPDF = () => {
    // Future implementation for PDF export
    // Development logging removed
  };

  const handleExportCSV = () => {
    // Future implementation for CSV export
    // Development logging removed
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      {/* Navigation Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/projects">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Projects
                </Button>
              </Link>
              <div>
                <CardTitle>Project Financial Analysis</CardTitle>
                <CardDescription>
                  Comprehensive financial dashboard for Project #{numericProjectId}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportCSV}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportPDF}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Financial Dashboard */}
      <FinancialDashboard projectId={numericProjectId} />
    </div>
  );
}