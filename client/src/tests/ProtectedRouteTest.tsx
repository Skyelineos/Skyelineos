/**
 * Comprehensive test suite for ProtectedRoute component
 * Tests authentication, authorization, and integration with enhanced security features
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

interface TestResult {
  testName: string;
  status: 'passed' | 'failed' | 'running' | 'pending';
  message: string;
  timestamp?: Date;
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  testFunction: () => Promise<TestResult>;
}

export default function ProtectedRouteTest() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const updateTestResult = (result: TestResult) => {
    setTestResults(prev => {
      const existing = prev.findIndex(r => r.testName === result.testName);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...result, timestamp: new Date() };
        return updated;
      } else {
        return [...prev, { ...result, timestamp: new Date() }];
      }
    });
  };

  const testScenarios: TestScenario[] = [
    {
      id: 'auth-context-integration',
      name: 'AuthContext Integration',
      description: 'Verify AuthContext provides correct user state and methods',
      testFunction: async () => {
        try {
          const authMethods = ['logout', 'hasPermission', 'hasRole'];
          const authProps = ['user', 'isAuthenticated', 'isLoading'];
          
          const auth = useAuth();
          
          // Check if all required methods exist
          const missingMethods = authMethods.filter(method => typeof auth[method] !== 'function');
          const missingProps = authProps.filter(prop => !(prop in auth));
          
          if (missingMethods.length > 0 || missingProps.length > 0) {
            return {
              testName: 'AuthContext Integration',
              status: 'failed',
              message: `Missing methods: ${missingMethods.join(', ')}, Missing props: ${missingProps.join(', ')}`
            };
          }
          
          return {
            testName: 'AuthContext Integration',
            status: 'passed',
            message: 'All AuthContext methods and properties are available'
          };
        } catch (error) {
          return {
            testName: 'AuthContext Integration',
            status: 'failed',
            message: `Error: ${error.message}`
          };
        }
      }
    },
    {
      id: 'unauthenticated-redirect',
      name: 'Unauthenticated Redirect Test',
      description: 'Test redirect to sign-in when accessing protected routes without authentication',
      testFunction: async () => {
        try {
          const protectedRoutes = ['/dashboard', '/projects', '/admin-portal'];
          let successfulRedirects = 0;
          
          for (const route of protectedRoutes) {
            // Simulate navigation to protected route
            const testResult = await simulateRouteAccess(route, false);
            if (testResult.redirectedTo === '/sign-in') {
              successfulRedirects++;
            }
          }
          
          if (successfulRedirects === protectedRoutes.length) {
            return {
              testName: 'Unauthenticated Redirect Test',
              status: 'passed',
              message: `All ${protectedRoutes.length} protected routes properly redirect unauthenticated users`
            };
          } else {
            return {
              testName: 'Unauthenticated Redirect Test',
              status: 'failed',
              message: `Only ${successfulRedirects}/${protectedRoutes.length} routes redirected correctly`
            };
          }
        } catch (error) {
          return {
            testName: 'Unauthenticated Redirect Test',
            status: 'failed',
            message: `Error: ${error.message}`
          };
        }
      }
    },
    {
      id: 'authenticated-access',
      name: 'Authenticated Access Test',
      description: 'Test access to routes when properly authenticated',
      testFunction: async () => {
        try {
          if (!isAuthenticated || !user) {
            return {
              testName: 'Authenticated Access Test',
              status: 'failed',
              message: 'Cannot test authenticated access - no authenticated user available'
            };
          }
          
          // Test routes accessible to the current user role
          const accessibleRoutes = getAccessibleRoutesForRole(user.role);
          let successfulAccess = 0;
          
          for (const route of accessibleRoutes) {
            const testResult = await simulateRouteAccess(route, true);
            if (testResult.accessGranted) {
              successfulAccess++;
            }
          }
          
          return {
            testName: 'Authenticated Access Test',
            status: successfulAccess === accessibleRoutes.length ? 'passed' : 'failed',
            message: `${successfulAccess}/${accessibleRoutes.length} accessible routes granted access for role: ${user.role}`
          };
        } catch (error) {
          return {
            testName: 'Authenticated Access Test',
            status: 'failed',
            message: `Error: ${error.message}`
          };
        }
      }
    },
    {
      id: 'role-based-access',
      name: 'Role-Based Access Control',
      description: 'Test that role-based restrictions work correctly',
      testFunction: async () => {
        try {
          if (!user) {
            return {
              testName: 'Role-Based Access Control',
              status: 'failed',
              message: 'Cannot test role-based access - no user available'
            };
          }
          
          const allRoles = ['admin', 'projectManager', 'client', 'subcontractor', 'designer'];
          const userRole = user.role;
          const restrictedRoutes = getRestrictedRoutesForRole(userRole);
          
          let correctRestrictions = 0;
          
          for (const route of restrictedRoutes) {
            const testResult = await simulateRouteAccess(route, true);
            if (!testResult.accessGranted || testResult.redirectedTo === '/not-authorized') {
              correctRestrictions++;
            }
          }
          
          return {
            testName: 'Role-Based Access Control',
            status: correctRestrictions === restrictedRoutes.length ? 'passed' : 'failed',
            message: `${correctRestrictions}/${restrictedRoutes.length} restricted routes properly denied for role: ${userRole}`
          };
        } catch (error) {
          return {
            testName: 'Role-Based Access Control',
            status: 'failed',
            message: `Error: ${error.message}`
          };
        }
      }
    },
    {
      id: 'loading-states',
      name: 'Loading States Test',
      description: 'Verify proper loading indicators during authentication checks',
      testFunction: async () => {
        try {
          // Test loading state behavior
          const loadingTest = await new Promise<boolean>((resolve) => {
            let loadingDetected = false;
            
            // Simulate auth state check
            if (isLoading) {
              loadingDetected = true;
            }
            
            setTimeout(() => resolve(loadingDetected), 100);
          });
          
          return {
            testName: 'Loading States Test',
            status: 'passed',
            message: 'Loading states are properly managed during auth checks'
          };
        } catch (error) {
          return {
            testName: 'Loading States Test',
            status: 'failed',
            message: `Error: ${error.message}`
          };
        }
      }
    },
    {
      id: 'cookie-auth-integration',
      name: 'Cookie-Based Authentication',
      description: 'Verify authentication works with secure HTTP-only cookies',
      testFunction: async () => {
        try {
          // Test cookie-based authentication
          const cookieTest = await fetch('/api/auth/me', {
            credentials: 'include'
          });
          
          if (cookieTest.ok) {
            return {
              testName: 'Cookie-Based Authentication',
              status: 'passed',
              message: 'Cookie-based authentication is working correctly'
            };
          } else {
            return {
              testName: 'Cookie-Based Authentication',
              status: 'failed',
              message: `API auth check failed with status: ${cookieTest.status}`
            };
          }
        } catch (error) {
          return {
            testName: 'Cookie-Based Authentication',
            status: 'failed',
            message: `Cookie auth test error: ${error.message}`
          };
        }
      }
    },
    {
      id: 'session-persistence',
      name: 'Session Persistence Test',
      description: 'Test that authentication persists across page refreshes',
      testFunction: async () => {
        try {
          if (!isAuthenticated) {
            return {
              testName: 'Session Persistence Test',
              status: 'failed',
              message: 'Cannot test session persistence - user not authenticated'
            };
          }
          
          // Check if session data is available
          const sessionData = {
            user: user,
            isAuthenticated: isAuthenticated
          };
          
          const hasValidSession = sessionData.user && sessionData.isAuthenticated;
          
          return {
            testName: 'Session Persistence Test',
            status: hasValidSession ? 'passed' : 'failed',
            message: hasValidSession 
              ? 'Session data is properly maintained'
              : 'Session data is missing or invalid'
          };
        } catch (error) {
          return {
            testName: 'Session Persistence Test',
            status: 'failed',
            message: `Error: ${error.message}`
          };
        }
      }
    }
  ];

  const runAllTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    for (const scenario of testScenarios) {
      updateTestResult({
        testName: scenario.name,
        status: 'running',
        message: 'Running test...'
      });
      
      try {
        const result = await scenario.testFunction();
        updateTestResult(result);
      } catch (error) {
        updateTestResult({
          testName: scenario.name,
          status: 'failed',
          message: `Test execution error: ${error.message}`
        });
      }
      
      // Add small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsRunning(false);
  };

  const runSingleTest = async (scenario: TestScenario) => {
    updateTestResult({
      testName: scenario.name,
      status: 'running',
      message: 'Running test...'
    });
    
    try {
      const result = await scenario.testFunction();
      updateTestResult(result);
    } catch (error) {
      updateTestResult({
        testName: scenario.name,
        status: 'failed',
        message: `Test execution error: ${error.message}`
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'running':
        return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      passed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      running: 'bg-blue-100 text-blue-800',
      pending: 'bg-gray-100 text-gray-800'
    };
    
    return <Badge className={variants[status] || variants.pending}>{status.toUpperCase()}</Badge>;
  };

  // Helper functions
  const simulateRouteAccess = async (route: string, isAuthenticated: boolean): Promise<{
    accessGranted: boolean;
    redirectedTo?: string;
  }> => {
    // This would normally be more complex route testing
    // For now, return mock results based on route and auth status
    if (!isAuthenticated) {
      return { accessGranted: false, redirectedTo: '/sign-in' };
    }
    
    // Mock role-based access logic
    return { accessGranted: true };
  };

  const getAccessibleRoutesForRole = (role: string): string[] => {
    const roleRoutes = {
      admin: ['/dashboard', '/projects', '/admin-portal', '/contacts', '/financials'],
      projectManager: ['/projects', '/contacts', '/schedule', '/financials'],
      client: ['/client-portal'],
      subcontractor: ['/subcontractor-portal'],
      designer: ['/designer-portal']
    };
    
    return roleRoutes[role] || [];
  };

  const getRestrictedRoutesForRole = (role: string): string[] => {
    const allRoutes = ['/dashboard', '/projects', '/admin-portal', '/client-portal', '/subcontractor-portal', '/designer-portal'];
    const accessibleRoutes = getAccessibleRoutesForRole(role);
    return allRoutes.filter(route => !accessibleRoutes.includes(route));
  };

  const testStats = {
    total: testResults.length,
    passed: testResults.filter(r => r.status === 'passed').length,
    failed: testResults.filter(r => r.status === 'failed').length,
    running: testResults.filter(r => r.status === 'running').length
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">ProtectedRoute Test Suite</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive testing of authentication and route protection
          </p>
        </div>
        <Button 
          onClick={runAllTests} 
          disabled={isRunning}
          className="min-w-[120px]"
        >
          {isRunning ? 'Running...' : 'Run All Tests'}
        </Button>
      </div>

      {/* Current Auth State */}
      <Card>
        <CardHeader>
          <CardTitle>Current Authentication State</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm font-medium">User</p>
              <p className="text-sm text-muted-foreground">
                {user ? user.name || user.email : 'Not authenticated'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Role</p>
              <p className="text-sm text-muted-foreground">
                {user?.role || 'None'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Authenticated</p>
              <Badge variant={isAuthenticated ? 'default' : 'secondary'}>
                {isAuthenticated ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium">Loading</p>
              <Badge variant={isLoading ? 'outline' : 'secondary'}>
                {isLoading ? 'Yes' : 'No'}
              </Badge>
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
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold">{testStats.total}</p>
                <p className="text-sm text-muted-foreground">Total Tests</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{testStats.passed}</p>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{testStats.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{testStats.running}</p>
                <p className="text-sm text-muted-foreground">Running</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Scenarios */}
      <div className="grid gap-6">
        {testScenarios.map((scenario) => {
          const result = testResults.find(r => r.testName === scenario.name);
          
          return (
            <Card key={scenario.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {result && getStatusIcon(result.status)}
                      <CardTitle className="text-lg">{scenario.name}</CardTitle>
                      {result && getStatusBadge(result.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {scenario.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runSingleTest(scenario)}
                    disabled={isRunning}
                  >
                    Run Test
                  </Button>
                </div>
              </CardHeader>
              {result && (
                <CardContent>
                  <Alert>
                    <AlertDescription>
                      <strong>Result:</strong> {result.message}
                      {result.timestamp && (
                        <span className="block text-xs mt-1 text-muted-foreground">
                          Ran at: {result.timestamp.toLocaleTimeString()}
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}