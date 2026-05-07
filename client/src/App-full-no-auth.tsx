import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
// import { TooltipProvider } from "@/components/ui/tooltip"; // Temporarily disabled due to React hook error
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";
import { AdminViewProvider } from "@/contexts/AdminViewContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { MinimalSpinner } from "@/components/layout/MinimalSpinner";
import { ScrollToTop } from "@/components/common/ScrollToTop";
import { useState, Suspense, lazy, createContext, useContext, ReactNode } from "react";

// Lazy imports for optimal bundle splitting
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Projects = lazy(() => import("@/pages/Projects"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const ProjectOverview = lazy(() => import("@/pages/ProjectOverview"));
const ProjectEstimates = lazy(() => import("@/pages/ProjectEstimates"));
const ProjectBids = lazy(() => import("@/pages/ProjectBids"));
const ProjectSchedule = lazy(() => import("@/pages/ProjectSchedule"));
const ProjectBudget = lazy(() => import("@/pages/ProjectBudget"));
const ProjectDocuments = lazy(() => import("@/pages/ProjectDocuments"));
const ProjectPhotos = lazy(() => import("@/pages/ProjectPhotos"));
const ProjectMessages = lazy(() => import("@/pages/ProjectMessages"));
const Schedule = lazy(() => import("@/pages/Schedule"));
const GlobalSchedule = lazy(() => import("@/pages/GlobalSchedule"));
const Financials = lazy(() => import("@/pages/Financials"));
const Messages = lazy(() => import("@/pages/Messages"));
const Settings = lazy(() => import("@/pages/Settings"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const AdminPortal = lazy(() => import("@/pages/AdminPortal"));
const SubcontractorPortal = lazy(() => import("@/pages/SubcontractorPortal"));
const DesignerPortal = lazy(() => import("@/pages/DesignerPortal"));
const GanttBuilderDemo = lazy(() => import("@/pages/GanttBuilderDemo"));
const WbsDemo = lazy(() => import("@/pages/WbsDemo"));
const GanttDayPilotDemo = lazy(() => import("@/pages/GanttDayPilotDemo"));
const StandaloneDayPilotDemo = lazy(() => import("@/pages/StandaloneDayPilotDemo"));
const BuildTrackerDemo = lazy(() => import("@/pages/BuildTrackerDemo"));
const BuildTrackerPro = lazy(() => import("@/pages/BuildTrackerPro"));
const NotFound = lazy(() => import("@/pages/not-found"));
const SignIn = lazy(() => import("@/pages/SignIn"));

// Import Firebase auth context
import { useAuth } from "@/auth/AuthContext";
import ProtectedRoute from "@/auth/ProtectedRoute";

// Create a mock user adapter for Firebase auth compatibility
const createMockUserFromFirebaseUser = (firebaseUser: any) => ({
  id: firebaseUser?.uid || 1,
  email: firebaseUser?.email || 'admin@skylinehomes.com',
  role: 'admin', // You can implement role claims in Firebase later
  name: firebaseUser?.displayName || 'Admin User',
  firstName: firebaseUser?.displayName?.split(' ')[0] || 'Admin',
  lastName: firebaseUser?.displayName?.split(' ').slice(1).join(' ') || 'User',
  permissions: ['all']
});

// Create compatibility hooks for existing components
export const useAuthCompat = () => {
  const { user: firebaseUser, loading } = useAuth();
  const mockUser = createMockUserFromFirebaseUser(firebaseUser);
  
  return {
    user: firebaseUser ? mockUser : null,
    login: async () => true,
    logout: () => {},
    isAuthenticated: !!firebaseUser,
    isLoading: loading,
    hasPermission: () => true,
    hasRole: () => true,
  };
};

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      
      <Route path="/sign-in">
        <Suspense fallback={<MinimalSpinner title="Loading Sign In" />}>
          <SignIn />
        </Suspense>
      </Route>
      
      <Route path="/dashboard">
        <Suspense fallback={<MinimalSpinner title="Loading Dashboard" />}>
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        </Suspense>
      </Route>
      
      <Route path="/projects">
        <Suspense fallback={<MinimalSpinner title="Loading Projects" />}>
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        </Suspense>
      </Route>
      
      <Route path="/projects/:id">
        <Suspense fallback={<MinimalSpinner title="Loading Project" />}>
          <ProjectDetail />
        </Suspense>
      </Route>

      <Route path="/projects/:id/overview">
        <Suspense fallback={<MinimalSpinner title="Loading Project Overview" />}>
          <ProjectOverview />
        </Suspense>
      </Route>

      <Route path="/projects/:id/estimates">
        <Suspense fallback={<MinimalSpinner title="Loading Estimates" />}>
          <ProjectEstimates />
        </Suspense>
      </Route>

      <Route path="/projects/:id/bids">
        <Suspense fallback={<MinimalSpinner title="Loading Bids" />}>
          <ProjectBids />
        </Suspense>
      </Route>

      <Route path="/projects/:id/schedule">
        <Suspense fallback={<MinimalSpinner title="Loading Project Schedule" />}>
          <ProjectSchedule />
        </Suspense>
      </Route>

      <Route path="/projects/:id/budget">
        <Suspense fallback={<MinimalSpinner title="Loading Budget" />}>
          <ProjectBudget />
        </Suspense>
      </Route>

      <Route path="/projects/:id/documents">
        <Suspense fallback={<MinimalSpinner title="Loading Documents" />}>
          <ProjectDocuments />
        </Suspense>
      </Route>

      <Route path="/projects/:id/photos">
        <Suspense fallback={<MinimalSpinner title="Loading Photos" />}>
          <ProjectPhotos />
        </Suspense>
      </Route>

      <Route path="/projects/:id/messages">
        <Suspense fallback={<MinimalSpinner title="Loading Messages" />}>
          <ProjectMessages />
        </Suspense>
      </Route>
      
      <Route path="/schedule">
        <Suspense fallback={<MinimalSpinner title="Loading Schedule" />}>
          <Schedule />
        </Suspense>
      </Route>

      <Route path="/global-schedule">
        <Suspense fallback={<MinimalSpinner title="Loading Global Schedule" />}>
          <GlobalSchedule />
        </Suspense>
      </Route>
      
      <Route path="/financials">
        <Suspense fallback={<MinimalSpinner title="Loading Financials" />}>
          <ProtectedRoute>
            <Financials />
          </ProtectedRoute>
        </Suspense>
      </Route>
      
      <Route path="/messages">
        <Suspense fallback={<MinimalSpinner title="Loading Messages" />}>
          <ProtectedRoute>
            <Messages />
          </ProtectedRoute>
        </Suspense>
      </Route>
      
      <Route path="/contacts">
        <Suspense fallback={<MinimalSpinner title="Loading Contacts" />}>
          <ProtectedRoute>
            <Contacts />
          </ProtectedRoute>
        </Suspense>
      </Route>
      
      <Route path="/settings">
        <Suspense fallback={<MinimalSpinner title="Loading Settings" />}>
          <Settings />
        </Suspense>
      </Route>

      <Route path="/admin-portal">
        <Suspense fallback={<MinimalSpinner title="Loading Admin Portal" />}>
          <AdminPortal />
        </Suspense>
      </Route>

      <Route path="/subcontractor-portal">
        <Suspense fallback={<MinimalSpinner title="Loading Subcontractor Portal" />}>
          <SubcontractorPortal />
        </Suspense>
      </Route>

      <Route path="/designer-portal">
        <Suspense fallback={<MinimalSpinner title="Loading Designer Portal" />}>
          <DesignerPortal />
        </Suspense>
      </Route>

      <Route path="/gantt-demo">
        <Suspense fallback={<MinimalSpinner title="Loading Gantt Demo" />}>
          <GanttBuilderDemo />
        </Suspense>
      </Route>
      
      <Route path="/wbs-demo">
        <Suspense fallback={<MinimalSpinner title="Loading WBS Demo" />}>
          <WbsDemo />
        </Suspense>
      </Route>
      
      <Route path="/daypilot-demo">
        <Suspense fallback={<MinimalSpinner title="Loading DayPilot Demo" />}>
          <GanttDayPilotDemo />
        </Suspense>
      </Route>
      
      <Route path="/standalone-demo">
        <Suspense fallback={<MinimalSpinner title="Loading Standalone Demo" />}>
          <StandaloneDayPilotDemo />
        </Suspense>
      </Route>
      
      <Route path="/buildtracker-demo">
        <Suspense fallback={<MinimalSpinner title="Loading BuildTracker Pro Demo" />}>
          <BuildTrackerDemo />
        </Suspense>
      </Route>
      
      <Route path="/buildtracker">
        <Suspense fallback={<MinimalSpinner title="Loading BuildTracker Pro" />}>
          <BuildTrackerPro />
        </Suspense>
      </Route>
      
      <Route>
        <Suspense fallback={<MinimalSpinner title="Loading" />}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
    </>
  );
}

// Export the useAuth compatibility hook for existing components
export { useAuthCompat as useAuth };

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UserPreferencesProvider>
          <AdminViewProvider>
            <BrandingProvider>
              <Router />
              <Toaster />
            </BrandingProvider>
          </AdminViewProvider>
        </UserPreferencesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}