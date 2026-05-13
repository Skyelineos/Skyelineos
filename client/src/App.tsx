import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
// import { TooltipProvider } from "@/components/ui/tooltip"; // Temporarily disabled due to React hook error
import { useAuth } from "@/auth/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserPreferencesProvider } from "@/contexts/UserPreferencesContext";
import { AdminViewProvider } from "@/contexts/AdminViewContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
// Firebase sign-in page imported below
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import ProtectedRoute from "@/auth/ProtectedRoute";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { RoleBasedRedirect } from "@/components/auth/RoleBasedRedirect";
import { NavigationHandler } from "@/components/navigation/NavigationHandler";
import { MinimalSpinner } from "@/components/layout/MinimalSpinner";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { AppLayout } from "@/components/layout/AppLayout";
import { useState, Suspense, useEffect, lazy } from "react";
import { usePerformanceOptimizations } from "@/hooks/usePerformanceOptimizations";

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
const Schedule = lazy(() => import("@/pages/Schedule"));
const GlobalSchedule = lazy(() => import("@/pages/GlobalSchedule"));
const FullscreenTimeline = lazy(() => import("@/pages/FullscreenTimeline"));
const Financials = lazy(() => import("@/pages/Financials"));
const Messages = lazy(() => import("@/pages/Messages"));
const Settings = lazy(() => import("@/pages/Settings"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Contracts = lazy(() => import("@/pages/Contracts"));
const AdminPortal = lazy(() => import("@/pages/AdminPortal"));
const OdysseyClientPortal = lazy(() => import("@/pages/OdysseyClientPortal"));
const SubcontractorPortal = lazy(() => import("@/pages/SubcontractorPortal"));
const DesignerPortal = lazy(() => import("@/pages/DesignerPortal"));
const PortalLogin = lazy(() => import("@/pages/PortalLogin"));
const SignIn = lazy(() => import("@/pages/SignIn"));
const NotFound = lazy(() => import("@/pages/not-found"));
const NotAuthorized = lazy(() => import("@/pages/NotAuthorized"));
const Unauthorized = lazy(() => import("@/pages/Unauthorized"));
const AuthTestPage = lazy(() => import("@/tests/AuthTestPage"));
const QuickAuthTests = lazy(() => import("@/tests/QuickAuthTests"));
const Sales = lazy(() => import("@/pages/Sales"));
const EstimateBuilder = lazy(() => import("@/pages/EstimateBuilder"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const ProjectDesign = lazy(() => import("@/pages/ProjectDesign"));
const ProjectTakeoff = lazy(() => import("@/pages/ProjectTakeoff"));
const Subscriptions = lazy(() => import("@/pages/Subscriptions"));
const Bills = lazy(() => import("@/pages/Bills"));
const ContentStudio = lazy(() => import("@/pages/ContentStudio"));
const SiteLog = lazy(() => import("@/pages/SiteLog"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const ChangeOrders = lazy(() => import("@/pages/ChangeOrders"));
const Timesheet = lazy(() => import("@/pages/Timesheet"));
const Safety = lazy(() => import("@/pages/Safety"));
const GlobalDocuments = lazy(() => import("@/pages/GlobalDocuments"));
const Catalogs = lazy(() => import("@/pages/Catalogs"));
const Finance = lazy(() => import("@/pages/Finance"));
const Reports = lazy(() => import("@/pages/Reports"));
const CommsLog = lazy(() => import("@/pages/CommsLog"));
const DesignBoard = lazy(() => import("@/pages/DesignBoard"));
const Templates = lazy(() => import("@/pages/Templates"));
const Playbook = lazy(() => import("@/pages/Playbook"));
const SocialMedia = lazy(() => import("@/pages/SocialMedia"));
const Automations = lazy(() => import("@/pages/Automations"));
const ImportCenter = lazy(() => import("@/pages/ImportCenter"));
const ProjectTasks = lazy(() => import("@/pages/ProjectTasks"));
const ProjectChangeOrders = lazy(() => import("@/pages/ProjectChangeOrders"));
const ProjectSiteLog = lazy(() => import("@/pages/ProjectSiteLog"));
const ProjectBills = lazy(() => import("@/pages/ProjectBills"));
const ProjectWalkthroughs = lazy(() => import("@/pages/ProjectWalkthroughs"));
const ProjectMoveInBinder = lazy(() => import("@/pages/ProjectMoveInBinder"));

function Router() {
  // Initialize performance optimizations for faster loading
  usePerformanceOptimizations();

  return (
    <Switch>
      <Route path="/">
        <ProtectedRoute>
          <RoleBasedRedirect />
        </ProtectedRoute>
      </Route>
      
      <Route path="/sign-in">
        <Suspense fallback={<MinimalSpinner title="Loading Sign In" />}>
          <SignIn />
        </Suspense>
      </Route>
      
      <Route path="/dashboard">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Dashboard" />}>
              <Dashboard />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Projects" />}>
              <Projects />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Project" />}>
              <ProjectDetail />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id/overview">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Overview" />}>
              <ErrorBoundary>
                <ProjectOverview />
              </ErrorBoundary>
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id/estimates">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Estimates" />}>
              <ProjectEstimates />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/takeoff">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager', 'designer']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Takeoff" />}>
              <ProjectTakeoff />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/subscriptions">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Subscriptions" />}>
              <Subscriptions />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/bills">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Bills" />}>
              <Bills />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/content-studio">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Content Studio" />}>
              <ContentStudio />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id/bids">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Bids" />}>
              <ProjectBids />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id/schedule">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Schedule" />}>
              <ProjectSchedule />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id/budget">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Budget" />}>
              <ProjectBudget />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id/documents">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Documents" />}>
              <ProjectDocuments />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/projects/:id/photos">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Photos" />}>
              <ProjectPhotos />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/design">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Design Snapshot" />}>
              <ProjectDesign />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/tasks">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Tasks" />}>
              <ProjectTasks />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/change-orders">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Change Orders" />}>
              <ProjectChangeOrders />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/site-log">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Site Log" />}>
              <ProjectSiteLog />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/bills">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Bills" />}>
              <ProjectBills />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/walkthroughs">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Walkthroughs" />}>
              <ProjectWalkthroughs />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/projects/:id/move-in-binder">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Move-in Binder" />}>
              <ProjectMoveInBinder />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/schedule">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Schedule" />}>
              <Schedule />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/global-schedule">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Global Schedule" />}>
              <GlobalSchedule />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/timeline">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Timeline" />}>
              <FullscreenTimeline />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/financials">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Financials" />}>
              <Financials />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/estimates">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Estimates" />}>
              <EstimateBuilder />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/users">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Users" />}>
              <UserManagement />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/messages">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Messages" />}>
              <Messages />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/settings">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Settings" />}>
              <Settings />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/contacts">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Contacts" />}>
              <Contacts />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/contracts">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Contracts" />}>
              <Contracts />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin-portal">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Admin Portal" />}>
              <AdminPortal />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/client-portal">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'client']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Client Portal" />}>
              <OdysseyClientPortal />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      <Route path="/client-portal/:tab*">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'client']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Client Portal" />}>
              <OdysseyClientPortal />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/subcontractor-portal">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'sub', 'subcontractor']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Subcontractor Portal" />}>
              <SubcontractorPortal />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      <Route path="/subcontractor-portal/:tab*">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'sub', 'subcontractor']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Subcontractor Portal" />}>
              <SubcontractorPortal />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/designer-portal/:tab*">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'designer']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Designer Portal" />}>
              <DesignerPortal />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>
      
      <Route path="/portal-login">
        <Suspense fallback={<MinimalSpinner title="Loading Portal Login" />}>
          <PortalLogin />
        </Suspense>
      </Route>
      
      <Route path="/auth-test">
        <Suspense fallback={<MinimalSpinner title="Loading Auth Tests" />}>
          <AuthTestPage />
        </Suspense>
      </Route>
      
      <Route path="/quick-tests">
        <Suspense fallback={<MinimalSpinner title="Loading Quick Tests" />}>
          <QuickAuthTests />
        </Suspense>
      </Route>
      
      
      <Route path="/unauthorized">
        <Suspense fallback={<MinimalSpinner title="Loading" />}>
          <Unauthorized />
        </Suspense>
      </Route>

      <Route path="/not-authorized">
        <Suspense fallback={<MinimalSpinner title="Loading" />}>
          <NotAuthorized />
        </Suspense>
      </Route>

      <Route path="/sales">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Sales" />}>
              <Sales />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/site-log">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Site Log" />}>
              <SiteLog />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/tasks">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Tasks" />}>
              <Tasks />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/change-orders">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Change Orders" />}>
              <ChangeOrders />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/documents">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Documents" />}>
              <GlobalDocuments />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/timesheet">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Timesheet" />}>
              <Timesheet />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/safety">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Safety" />}>
              <Safety />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/catalogs">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager', 'designer']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Catalogs" />}>
              <Catalogs />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      {/* /finance redirects to canonical /financials — old duplicate page. */}
      <Route path="/finance">
        <Redirect to="/financials" />
      </Route>

      <Route path="/reports">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Reports" />}>
              <Reports />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/comms-log">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'projectManager']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Comms Log" />}>
              <CommsLog />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/design-board">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc', 'designer']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Design Board" />}>
              <DesignBoard />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/templates">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Templates" />}>
              <Templates />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/social-media">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Social Media" />}>
              <SocialMedia />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/automations">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Automations" />}>
              <Automations />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/playbook">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Playbook" />}>
              <Playbook />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route path="/import-center">
        <ProtectedRoute>
          <RoleGuard allowedRoles={['admin', 'gc']} showNotAuthorized>
            <Suspense fallback={<MinimalSpinner title="Loading Import Center" />}>
              <ImportCenter />
            </Suspense>
          </RoleGuard>
        </ProtectedRoute>
      </Route>

      <Route>
        <Suspense fallback={<MinimalSpinner title="Loading" />}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <MinimalSpinner title="Loading..." />;
  }
  
  return (
    <>
      <NavigationHandler />
      <Router />
      <NotificationCenter />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <UserPreferencesProvider>
          <BrandingProvider>
            <AdminViewProvider>
              <AppContent />
              <Toaster />
            </AdminViewProvider>
          </BrandingProvider>
        </UserPreferencesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}