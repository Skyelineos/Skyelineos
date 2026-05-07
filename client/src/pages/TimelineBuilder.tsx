import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UltimateTimelineBuilder } from '@/components/timeline/UltimateTimelineBuilder';
import { ModernTimelineBuilder } from '@/components/timeline/ModernTimelineBuilder';
import {
  ArrowLeft,
  Calendar,
  Zap,
  Sparkles,
  Rocket,
  Target
} from 'lucide-react';

export default function TimelineBuilderPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const projectId = parseInt(params.id || '0');
  const [activeBuilder, setActiveBuilder] = useState<'modern' | 'ultimate'>('modern');

  // Fetch project data for the header
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['/api/projects'],
    select: (data: any[]) => data.find((p: any) => p.id === projectId),
    enabled: !!projectId
  });

  if (!projectId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Invalid Project</h2>
            <p className="text-gray-600 mb-4">No project ID provided for timeline builder.</p>
            <Button onClick={() => setLocation('/projects')}>
              Return to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/projects')}
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
              </Button>
              
              <div className="h-6 w-px bg-gray-300" />
              
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                  <Calendar className="w-8 h-8 text-blue-600" />
                  Timeline Builder
                </h1>
                {project && (
                  <div className="flex items-center gap-3 mt-2">
                    <p className="text-lg text-gray-600">{project.name}</p>
                    <Badge variant="outline" className="text-xs">
                      {project.status}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Builder Type Toggle */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <Button
                  variant={activeBuilder === 'modern' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveBuilder('modern')}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Modern
                </Button>
                <Button
                  variant={activeBuilder === 'ultimate' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveBuilder('ultimate')}
                  className="flex items-center gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  Ultimate
                </Button>
              </div>
              
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                AI-Enhanced
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                Smart Scheduling
              </Badge>
            </div>
          </div>
          
          {projectLoading && (
            <div className="mt-4">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
          )}
        </div>

        {/* Timeline Builder Component */}
        {activeBuilder === 'modern' ? (
          <ModernTimelineBuilder projectId={projectId} />
        ) : (
          <UltimateTimelineBuilder projectId={projectId} />
        )}
      </div>
    </div>
  );
}