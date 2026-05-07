import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';

export default function NotAuthorized() {
  const { user } = useAuth();

  const handleGoBack = () => {
    window.history.back();
  };

  const handleGoHome = () => {
    // Redirect based on user role
    if (user?.role === 'admin' || user?.role === 'project_manager') {
      window.location.href = '/dashboard';
    } else if (user?.role === 'client') {
      window.location.href = `/portal/client/${user.id}`;
    } else if (user?.role === 'subcontractor') {
      window.location.href = `/portal/subcontractor/${user.id}`;
    } else if (user?.role === 'designer') {
      window.location.href = `/portal/designer/${user.id}`;
    } else {
      window.location.href = '/login';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">
            You don't have permission to access this page. Please contact your administrator if you believe this is an error.
          </p>
          
          {user && (
            <div className="bg-gray-100 rounded-lg p-3 text-sm">
              <p className="text-gray-700">
                <strong>Current Role:</strong> {user.role}
              </p>
              <p className="text-gray-700">
                <strong>User:</strong> {user.name} ({user.email})
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleGoBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
            <Button
              onClick={handleGoHome}
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}