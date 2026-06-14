import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface ErrorBlockProps {
  error: Error | null;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function ErrorBlock({ error, onRetry, isRetrying = false }: ErrorBlockProps) {
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-red-600">Failed to Load Schedule</h3>
          <p className="text-sm text-gray-600 max-w-md">
            {error?.message || 'An unexpected error occurred while loading the schedule data.'}
          </p>
        </div>
        <Button 
          onClick={onRetry} 
          disabled={isRetrying}
          className="flex items-center space-x-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>Try Again</span>
        </Button>
      </CardContent>
    </Card>
  );
}