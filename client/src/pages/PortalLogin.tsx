import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { LogIn, AlertCircle } from 'lucide-react';

interface LoginResponse {
  success: boolean;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  redirectUrl: string;
}

export default function PortalLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      // Get CSRF token first
      let csrfToken = '';
      try {
        const csrfResponse = await fetch('/api/csrf-token', {
          method: 'GET',
          credentials: 'include',
        });
        if (csrfResponse.ok) {
          const csrfData = await csrfResponse.json();
          csrfToken = csrfData.csrfToken;
        }
      } catch (error) {
        console.warn('Could not get CSRF token, proceeding without it');
      }

      // Use direct fetch for portal login
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch('/api/portal-login', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(credentials),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(error.error || 'Login failed');
      }
      
      const portalResponse: LoginResponse & { tokens?: { accessToken: string; refreshToken: string } } = await response.json();
      
      // Store tokens in localStorage for authentication
      if (portalResponse.tokens) {
        localStorage.setItem('accessToken', portalResponse.tokens.accessToken);
        localStorage.setItem('refreshToken', portalResponse.tokens.refreshToken);
        console.warn('Tokens stored in localStorage for development');
      }
      
      return portalResponse;
    },
    onSuccess: (data) => {
      // Manually set the auth state since we bypassed the main auth system
      // This prevents any additional auth calls
      
      toast({
        title: "Login Successful",
        description: `Welcome ${data.user.name}! Redirecting to dashboard...`,
      });
      
      // Force reload to pick up the new authentication cookies
      setTimeout(() => {
        window.location.href = data.redirectUrl || '/dashboard';
      }, 1000);
    },
    onError: (error: any) => {
      setLoginError(error.message || 'Invalid email or password');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    if (!email || !password) {
      setLoginError('Please enter both email and password');
      return;
    }

    loginMutation.mutate({ email, password });
  };

  // Quick test login buttons for demonstration
  const quickLogin = (testEmail: string, testPassword: string) => {
    setEmail(testEmail);
    setPassword(testPassword);
    setLoginError('');
    loginMutation.mutate({ email: testEmail, password: testPassword });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Skyeline Homes Portal
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Access your client, subcontractor, or designer portal
          </p>
        </div>

        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              Portal Login
            </CardTitle>
            <CardDescription>
              Enter your portal credentials to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="mt-1"
                  required
                />
              </div>

              {loginError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full"
              >
                {loginMutation.isPending ? 'Logging in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 mb-3">
                Test portal access with these demo accounts:
              </p>
              
              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('admin@skylinehomes.com', 'AdminPass123')}
                  className="w-full text-xs"
                  disabled={loginMutation.isPending}
                >
                  Admin Portal (System Administrator)
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('pm@skylinehomes.com', 'PMPass456')}
                  className="w-full text-xs"
                  disabled={loginMutation.isPending}
                >
                  Project Manager Portal
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('mjohnson@email.com', 'ClientPass123')}
                  className="w-full text-xs"
                  disabled={loginMutation.isPending}
                >
                  Client Portal (Michael & Sarah Johnson)
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('info@eliteelectrical.com', 'SubPass456')}
                  className="w-full text-xs"
                  disabled={loginMutation.isPending}
                >
                  Subcontractor Portal (Elite Electrical)
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('sarah@austininteriors.com', 'DesignPass789')}
                  className="w-full text-xs"
                  disabled={loginMutation.isPending}
                >
                  Designer Portal (Sarah Mitchell)
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickLogin('accountant@skylinehomes.com', 'AcctPass789')}
                  className="w-full text-xs"
                  disabled={loginMutation.isPending}
                >
                  Accountant Portal
                </Button>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-800 font-medium mb-2">
                  Or try these universal demo credentials:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <strong>Email:</strong> test@test.com<br/>
                    <strong>Password:</strong> Password123
                  </div>
                  <div>
                    <strong>Email:</strong> user@example.com<br/>
                    <strong>Password:</strong> Password123
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}