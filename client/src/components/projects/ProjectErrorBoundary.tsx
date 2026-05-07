import { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
}

// Enhanced error boundary specifically for Projects module
export class ProjectErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('🚨 ProjectErrorBoundary caught an error:', error);
    console.error('🚨 Error message:', error.message);
    console.error('🚨 Error stack:', error.stack);
    console.error('🚨 Component stack:', errorInfo.componentStack);
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-xl font-semibold text-gray-900">
                Component Error
              </CardTitle>
              <p className="text-sm text-gray-600 mt-2">
                Failed to render bid item details.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The projects module encountered an unexpected error. This might be due to a network issue or data problem.
                </AlertDescription>
              </Alert>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 max-h-32 overflow-auto">
                  <div className="font-semibold mb-1">Error Details:</div>
                  <div>{this.state.error.message}</div>
                  {this.state.error.stack && (
                    <div className="mt-2 text-gray-600">
                      {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button onClick={this.handleReset} variant="default" className="w-full">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
                
                <Button onClick={this.handleReload} variant="outline" className="w-full">
                  Reload Page
                </Button>
                
                <Button onClick={this.handleGoHome} variant="ghost" className="w-full">
                  <Home className="mr-2 h-4 w-4" />
                  Go to Dashboard
                </Button>
              </div>

              <div className="text-center text-sm text-gray-500">
                If this problem persists, please contact support.
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}