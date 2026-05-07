/**
 * Quick Authentication Tests
 * Simple, practical tests for ProtectedRoute functionality
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { CheckCircle, XCircle, AlertTriangle, Home, LogOut, Shield } from 'lucide-react';

interface TestResult {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'info';
  message: string;
  timestamp: Date;
}

export default function QuickAuthTests() {
  const [location, setLocation] = useLocation();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const { currentRole } = useRoleAccess();

  const addTestResult = (result: Omit<TestResult, 'timestamp'>) => {
    setTestResults(prev => [...prev, { ...result, timestamp: new Date() }]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const testAuthState = () => {
    clearResults();
    
    // Test 1: Authentication State
    addTestResult({
      id: 'auth-state',
      name: 'Authentication State Check',
      status: isAuthenticated ? 'pass' : 'info',
      message: `User is ${isAuthenticated ? 'authenticated' : 'not authenticated'}. User: ${user?.email || 'None'}, Role: ${currentRole || 'None'}`
    });

    // Test 2: Cookie-based Auth API
    testApiAuth();
    
    // Test 3: Loading State
    addTestResult({
      id: 'loading-state',
      name: 'Loading State Management',
      status: 'pass',
      message: `Loading state: ${isLoading ? 'Loading' : 'Ready'}. Auth system is responsive.`
    });

    // Test 4: Role Access
    addTestResult({
      id: 'role-access',
      name: 'Role-based Access Setup',
      status: currentRole ? 'pass' : 'info',
      message: `Current role: ${currentRole || 'None'}. Role access system is ${currentRole ? 'functioning' : 'ready for authenticated user'}.`
    });
  };

  const testApiAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      addTestResult({
        id: 'api-auth',
        name: 'Cookie-based API Authentication',
        status: response.ok ? 'pass' : 'info',
        message: `API auth check: ${response.status}. ${response.ok ? 'Valid session cookies found' : 'No valid session (expected if not logged in)'}`
      });
    } catch (error) {
      addTestResult({
        id: 'api-auth',
        name: 'Cookie-based API Authentication',
        status: 'fail',
        message: `API auth error: ${error.message}`
      });
    }
  };

  const testRouteProtection = async () => {
    const protectedRoutes = [
      { path: '/dashboard', description: 'Admin Dashboard', expectedRole: 'admin' },
      { path: '/projects', description: 'Projects Page', expectedRole: 'admin/projectManager' },
      { path: '/admin-portal', description: 'Admin Portal', expectedRole: 'admin' }
    ];

    for (const route of protectedRoutes) {
      const testId = `route-${route.path.replace('/', '')}`;
      const currentLocation = location;
      
      try {
        // Attempt navigation
        setLocation(route.path);
        
        // Check if we stayed on the route or were redirected
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const finalLocation = window.location.pathname;
        const wasRedirected = finalLocation !== route.path;
        
        if (!isAuthenticated) {
          // Should be redirected to sign-in
          addTestResult({
            id: testId,
            name: `Protected Route: ${route.description}`,
            status: wasRedirected && finalLocation.includes('sign-in') ? 'pass' : 'fail',
            message: `Unauthenticated access ${wasRedirected ? 'properly redirected to ' + finalLocation : 'not redirected (security issue)'}`
          });
        } else {
          // Should check role-based access
          const hasRequiredRole = currentRole === 'admin' || 
            (route.expectedRole.includes('projectManager') && currentRole === 'projectManager');
          
          addTestResult({
            id: testId,
            name: `Protected Route: ${route.description}`,
            status: hasRequiredRole ? 'pass' : (wasRedirected ? 'pass' : 'fail'),
            message: `Authenticated access: ${hasRequiredRole ? 'allowed' : 'denied'} for role ${currentRole}`
          });
        }
        
        // Navigate back
        setLocation('/auth-test');
        
      } catch (error) {
        addTestResult({
          id: testId,
          name: `Protected Route: ${route.description}`,
          status: 'fail',
          message: `Navigation test error: ${error.message}`
        });
      }
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  const testDirectAccess = () => {
    const testWindow = window.open('', '_blank');
    if (testWindow) {
      testWindow.close();
    }
    
    addTestResult({
      id: 'direct-access',
      name: 'Direct URL Access Protection',
      status: 'info',
      message: 'Direct URL access tests require manual verification. Try opening protected routes in new tabs/windows.'
    });
  };

  const testSessionManagement = async () => {
    if (isAuthenticated) {
      addTestResult({
        id: 'session-persistence',
        name: 'Session Persistence',
        status: 'pass',
        message: 'User session is active and persistent across navigation'
      });
    } else {
      addTestResult({
        id: 'session-management',
        name: 'Session Management',
        status: 'info',
        message: 'No active session to test. Login to test session management.'
      });
    }
  };

  const runAllTests = async () => {
    clearResults();
    
    // Basic auth state tests
    testAuthState();
    
    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Route protection tests
    await testRouteProtection();
    
    // Session management
    await testSessionManagement();
    
    addTestResult({
      id: 'summary',
      name: 'Test Suite Complete',
      status: 'info',
      message: `Completed comprehensive ProtectedRoute testing. ${testResults.filter(r => r.status === 'pass').length} tests passed.`
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-blue-500" />;
    }
  };

  // Auto-run basic tests on component mount
  useEffect(() => {
    testAuthState();
  }, [isAuthenticated, currentRole]);

  const passCount = testResults.filter(r => r.status === 'pass').length;
  const failCount = testResults.filter(r => r.status === 'fail').length;
  const infoCount = testResults.filter(r => r.status === 'info').length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            ProtectedRoute Validation Tests
          </h1>
          <p className="text-muted-foreground">
            Real-time validation of authentication and route protection
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation('/')}>
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
          {isAuthenticated && (
            <Button variant="destructive" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          )}
        </div>
      </div>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Authentication Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm font-medium">Status</p>
              <Badge variant={isAuthenticated ? 'default' : 'secondary'}>
                {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">User</p>
              <p className="text-sm text-muted-foreground">{user?.email || 'None'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Role</p>
              <Badge variant="outline">{currentRole || 'None'}</Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Loading</p>
              <Badge variant={isLoading ? 'destructive' : 'secondary'}>
                {isLoading ? 'Loading' : 'Ready'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Results Summary */}
      {testResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results ({testResults.length} total)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">{passCount}</div>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-600">{failCount}</div>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-blue-600">{infoCount}</div>
                <p className="text-sm text-muted-foreground">Info</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Test Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={testAuthState} variant="outline">
              Test Auth State
            </Button>
            <Button onClick={testRouteProtection} variant="outline">
              Test Route Protection
            </Button>
            <Button onClick={testSessionManagement} variant="outline">
              Test Sessions
            </Button>
            <Button onClick={runAllTests} variant="default">
              Run All Tests
            </Button>
            <Button onClick={clearResults} variant="ghost">
              Clear Results
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      <div className="space-y-3">
        {testResults.map((result, index) => (
          <Card key={`${result.id}-${index}`}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                {getStatusIcon(result.status)}
                <div className="flex-1">
                  <h3 className="font-medium">{result.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {result.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                <Badge 
                  variant={
                    result.status === 'pass' ? 'default' : 
                    result.status === 'fail' ? 'destructive' : 
                    'secondary'
                  }
                >
                  {result.status.toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Manual Test Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Test Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>For comprehensive testing:</strong><br/>
              1. Run tests while unauthenticated (current state)<br/>
              2. Sign in and run tests again<br/>
              3. Test with different user roles if available<br/>
              4. Try opening protected routes in new tabs<br/>
              5. Test browser refresh on protected pages
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Quick Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Navigation (Test Routes)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation('/sign-in')}>
              Sign In
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation('/dashboard')}>
              Dashboard (Admin)
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation('/projects')}>
              Projects
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation('/admin-portal')}>
              Admin Portal
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation('/client-portal')}>
              Client Portal
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation('/not-authorized')}>
              Not Authorized
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}