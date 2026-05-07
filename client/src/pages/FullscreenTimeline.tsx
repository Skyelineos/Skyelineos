import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { AdvancedTimelineBuilder } from '@/components/timeline/AdvancedTimelineBuilder';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function FullscreenTimeline() {
  const [location, setLocation] = useLocation();
  const { projectId } = useParams<{ projectId: string }>();

  const handleExitFullscreen = () => {
    // Navigate back to the project schedule tab
    setLocation(`/project/${projectId}#schedule`);
  };

  return (
    <div className="h-screen bg-white overflow-hidden">
      <AdvancedTimelineBuilder
        projectId={parseInt(projectId!)}
        fullscreen={true}
        onFullscreenToggle={handleExitFullscreen}
      />
    </div>
  );
}