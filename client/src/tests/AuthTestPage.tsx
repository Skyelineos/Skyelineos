/**
 * Practical Authentication Testing Page
 * Tests actual navigation and route protection behavior
 */

import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, User, Shield, Settings } from 'lucide-react';

interface RouteTestResult {
  route: string;
  expectedBehavior: string;
  actualBehavior: string;
  status: 'pass' | 'fail' | 'testing';
  timestamp: Date;
}

export default function AuthTestPage() {
  const [location, setLocation] = useLocation();
  const [testResults, setTestResults] = useState<RouteTestResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const roleAccess = useRoleAccess();

  // Define comprehensive test routes with expected behaviors
  const testRoutes = [
    // Admin-only routes
    { 
      route: '/dashboard', 
      expectedAuth: true, 
      allowedRoles: ['admin'], 
      description: 'Admin Dashboard'
    },
    { 
      route: '/admin-portal', 
      expectedAuth: true, 
      allowedRoles: ['admin'], 
      description: 'Admin Portal'
    },
    
    // Project Manager + Admin routes
    { 
      route: '/projects', 
      expectedAuth: true, 
      allowedRoles: ['admin', 'projectManager'], 
      description: 'Projects List'
    },
    { 
      route: '/contacts', 
      expectedAuth: true, 
      allowedRoles: ['admin', 'projectManager'], 
      description: 'Contacts Management'
    },
    { 
      route: '/financials', 
      expectedAuth: true, 
      allowedRoles: ['admin', 'projectManager'], 
      description: 'Financial Dashboard'
    },
    
    // Portal routes
    { 
      route: '/client-portal', 
      expectedAuth: true, 
      allowedRoles: ['admin', 'client'], 
      description: 'Client Portal'
    },
    { 
      route: '/subcontractor-portal', 
      expectedAuth: true, 
      allowedRoles: ['admin', 'subcontractor'], 
      description: 'Subcontractor Portal'
    },
    { 
      route: '/designer-portal', 
      expectedAuth: true, 
      allowedRoles: ['admin', 'designer'], 
      description: 'Designer Portal'
    },
  ];

  const runNavigationTest = async (testRoute: any) => {
    const currentTime = new Date();
    const testId = `${testRoute.route}-${currentTime.getTime()}`;
    
    setTestResults(prev => [...prev, {
      route: testRoute.route,
      expectedBehavior: getExpectedBehavior(testRoute),
      actualBehavior: 'Testing...',
      status: 'testing',
      timestamp: currentTime
    }]);

    // Simulate navigation attempt
    try {
      const originalLocation = location;
      
      // Navigate to the test route
      setLocation(testRoute.route);
      
      // Give time for routing to settle
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check the current location after routing
      const newLocation = window.location.pathname;
      const actualBehavior = determineActualBehavior(testRoute, newLocation, originalLocation);
      const status = evaluateTestResult(testRoute, actualBehavior);
      
      setTestResults(prev => 
        prev.map(result => 
          result.route === testRoute.route && result.timestamp.getTime() === currentTime.getTime()
            ? { ...result, actualBehavior, status }
            : result
        )
      );
      
      // Navigate back to test page
      await new Promise(resolve => setTimeout(resolve, 500));
      setLocation('/auth-test');
      
    } catch (error) {
      setTestResults(prev => 
        prev.map(result => 
          result.route === testRoute.route && result.timestamp.getTime() === currentTime.getTime()
            ? { 
                ...result, 
                actualBehavior: `Error: ${error.message}`,
                status: 'fail' as const
              }
            : result
        )
      );
    }
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setTestResults([]);

    for (const testRoute of testRoutes) {
      await runNavigationTest(testRoute);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsRunningTests(false);
  };

  const getExpectedBehavior = (testRoute: any): string => {
    if (!isAuthenticated) {
      return 'Redirect to /sign-in';
    }
    
    if (!user) {
      return 'Redirect to /sign-in';
    }

    const userRole = roleAccess.currentRole;
    const hasAccess = testRoute.allowedRoles.includes(userRole);
    
    if (hasAccess) {
      return `Access granted (role: ${userRole})`;
    } else {
      return `Redirect to /not-authorized (role: ${userRole} not in [${testRoute.allowedRoles.join(', ')}])`;
    }
  };

  const determineActualBehavior = (testRoute: any, newLocation: string, originalLocation: string): string => {
    if (newLocation === '/sign-in') {
      return 'Redirected to /sign-in';
    } else if (newLocation === '/not-authorized') {
      return 'Redirected to /not-authorized';
    } else if (newLocation === testRoute.route) {
      return `Access granted to ${testRoute.route}`;
    } else if (newLocation !== originalLocation) {
      return `Redirected to ${newLocation}`;
    } else {
      return `Remained at ${originalLocation}`;
    }
  };

  const evaluateTestResult = (testRoute: any, actualBehavior: string): 'pass' | 'fail' => {
    const expected = getExpectedBehavior(testRoute);
    
    // Simplified matching logic
    if (expected.includes('Redirect to /sign-in') && actualBehavior.includes('/sign-in')) {
      return 'pass';
    }
    if (expected.includes('Redirect to /not-authorized') && actualBehavior.includes('/not-authorized')) {
      return 'pass';
    }
    if (expected.includes('Access granted') && actualBehavior.includes('Access granted')) {
      return 'pass';
    }
    
    return 'fail';
  };

  const testAuthenticationFlow = async () => {
    try {
      // Test authentication API endpoint
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      
      const authResult = {
        route: 'API Auth Check',
        expectedBehavior: isAuthenticated ? 'Valid user data returned' : 'Unauthorized response',
        actualBehavior: response.ok 
          ? `API responded with ${response.status} - Valid session`
          : `API responded with ${response.status} - Invalid session`,
        status: (response.ok === isAuthenticated) ? 'pass' as const : 'fail' as const,
        timestamp: new Date()
      };
      
      setTestResults(prev => [...prev, authResult]);
    } catch (error) {
      const errorResult = {
        route: 'API Auth Check',
        expectedBehavior: 'Valid API response',
        actualBehavior: `Error: ${error.message}`,
        status: 'fail' as const,
        timestamp: new Date()
      };
      
      setTestResults(prev => [...prev, errorResult]);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const testStats = testResults.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Authentication & Route Protection Tests
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-world testing of ProtectedRoute component and authentication system
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearResults}>
            Clear Results
          </Button>
          <Button onClick={runAllTests} disabled={isRunningTests}>
            {isRunningTests ? 'Running Tests...' : 'Run All Tests'}
          </Button>
        </div>
      </div>

      {/* Authentication Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Current Authentication Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">User</p>
              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <Badge variant="default">Authenticated</Badge>
                ) : (
                  <Badge variant="secondary">Not Authenticated</Badge>
                )}
                <span className="text-sm">{user?.name || user?.email || 'None'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Role</p>
              <Badge variant="outline">{roleAccess.currentRole || 'None'}</Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Loading State</p>
              <Badge variant={isLoading ? 'destructive' : 'secondary'}>
                {isLoading ? 'Loading' : 'Ready'}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Auth API</p>
              <Button size="sm" variant="outline" onClick={testAuthenticationFlow}>
                Test API
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Results Summary */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {testStats.pass || 0}
                </div>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {testStats.fail || 0}
                </div>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {testStats.testing || 0}
                </div>
                <p className="text-sm text-muted-foreground">Testing</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Individual Test Routes */}
      <div className="grid gap-4">
        <h2 className="text-xl font-semibold">Route Protection Tests</h2>
        {testRoutes.map((testRoute, index) => {
          const latestResult = testResults
            .filter(result => result.route === testRoute.route)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

          return (
            <Card key={`${testRoute.route}-${index}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {latestResult?.status === 'pass' && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {latestResult?.status === 'fail' && <XCircle className="h-5 w-5 text-red-500" />}
                      {latestResult?.status === 'testing' && <AlertTriangle className="h-5 w-5 text-blue-500 animate-pulse" />}
                      
                      <CardTitle className="text-lg">{testRoute.description}</CardTitle>
                      {latestResult && (
                        <Badge 
                          variant={
                            latestResult.status === 'pass' ? 'default' : 
                            latestResult.status === 'fail' ? 'destructive' : 
                            'secondary'
                          }
                        >
                          {latestResult.status.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Route: <code className="bg-muted px-1 rounded">{testRoute.route}</code>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Allowed Roles: {testRoute.allowedRoles.join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runNavigationTest(testRoute)}
                      disabled={isRunningTests}
                    >
                      Test Route
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLocation(testRoute.route)}
                      disabled={isRunningTests}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {latestResult && (
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">Expected Behavior:</p>
                      <p className="text-sm text-muted-foreground">{latestResult.expectedBehavior}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Actual Behavior:</p>
                      <p className="text-sm text-muted-foreground">{latestResult.actualBehavior}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Tested at: {latestResult.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Manual Test Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manual Test Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setLocation('/sign-in')}
            >
              Go to Sign In
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/dashboard')}
            >
              Test Admin Dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/projects')}
            >
              Test Projects Page
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/not-authorized')}
            >
              View Not Authorized
            </Button>
            {isAuthenticated && (
              <Button
                variant="destructive"
                onClick={logout}
              >
                Logout (Test Auth Loss)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}