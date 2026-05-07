import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  isApiError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isApiError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's an API-related error
    const isApiError = error.message?.includes('fetch') || 
                      error.message?.includes('Server unavailable') ||
                      error.message?.includes('API Error') ||
                      error.message?.includes('Network');

    return {
      hasError: true,
      error,
      isApiError
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application error:', error, errorInfo);
    
    // You could send error to monitoring service here
    if (import.meta.env.VITE_SENTRY_DSN) {
      // Sentry error reporting would go here
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, isApiError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <AlertTriangle className="h-12 w-12 text-red-500" />
              </div>
              <CardTitle className="text-xl text-gray-900">
                {this.state.isApiError ? 'Service Unavailable' : 'Something went wrong'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-gray-600">
                {this.state.isApiError 
                  ? 'The server is temporarily unavailable. Please try again in a moment.'
                  : 'An unexpected error occurred. Please try refreshing the page.'
                }
              </p>
              
              {import.meta.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-left text-sm bg-gray-100 p-3 rounded">
                  <summary className="font-medium cursor-pointer">Error Details</summary>
                  <pre className="mt-2 text-xs overflow-auto">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              
              <Button 
                onClick={this.handleRetry}
                className="w-full"
                variant="accent"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}