import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, ArrowLeft, Home } from 'lucide-react';

export default function Unauthorized() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="max-w-lg w-full shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-10 h-10 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-800">Access Denied</CardTitle>
          <CardDescription className="text-gray-600">
            You don't have permission to access this page or project
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700">
            <p>This could be because:</p>
            <ul className="list-disc list-inside mt-2 text-left">
              <li>You're not assigned to this project</li>
              <li>Your role doesn't have the required permissions</li>
              <li>The project doesn't exist</li>
              <li>You need to log in with the correct account</li>
            </ul>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline" 
              onClick={() => window.history.back()}
              className="flex-1 gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
            <Button 
              onClick={() => window.location.href = '/dashboard'}
              className="flex-1 gap-2"
            >
              <Home className="w-4 h-4" />
              Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}