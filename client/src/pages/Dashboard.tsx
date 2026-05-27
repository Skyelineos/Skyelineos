import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { FastScheduleCard, FastUrgentCard, FastProjectsCard } from '@/components/dashboard/FastDashboardCards';
import { CashFlowForecastCard } from '@/components/dashboard/CashFlowForecastCard';
import { FinancialPositionCard } from '@/components/dashboard/FinancialPositionCard';
import { GCTodayFeed } from '@/components/today/GCTodayFeed';
import { MissingTradeAlertCard } from '@/components/dashboard/MissingTradeAlertCard';
import { MissingTradeScopesCard } from '@/components/dashboard/MissingTradeScopesCard';
import { RemindersCard } from '@/components/dashboard/RemindersCard';
import { PendingReviewsCard } from '@/components/dashboard/PendingReviewsCard';
import { MissingTasksAlertCard } from '@/components/dashboard/MissingTasksAlertCard';
import { UnsignedSchedulesCard } from '@/components/dashboard/UnsignedSchedulesCard';
import { TeamAccessRequestsCard } from '@/components/dashboard/TeamAccessRequestsCard';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Show branded welcome for non-admin portal users
  const isPortalUser = user?.role && ['client', 'sub', 'designer'].includes(user.role);



  // Real-time event subscriptions removed - using modern messaging system instead

  // Removed: navigateToAccounting → /accounting was a phantom route. Canonical
  // financial page is /financials. Use setLocation('/financials') if needed.
  const navigateToProjects = () => setLocation('/projects');
  const navigateToSchedule = () => setLocation('/schedule');
  // Remove navigateToProject function - now handled by ActiveProjectsCard component

  // Remove getStatusColor function - now handled by ActiveProjectsCard component

  const dashboardContent = (
    <div className="space-y-4 md:space-y-6">
        {/* Branded welcome header for portal users */}
        {isPortalUser ? (
          <div className="flex flex-col items-center justify-center py-6 mb-2">
            <img
              src="/logos/logo-transparent-cropped.png"
              alt="Skyeline Homes"
              className="w-auto object-contain mb-3"
              style={{ height: 'clamp(200px, 30vw, 320px)', opacity: 0.92 }}
            />
            <p className="font-sans text-sm tracking-widest uppercase" style={{ color: '#C9A96E', letterSpacing: '0.2em' }}>
              Welcome,&nbsp;{user?.name?.split(' ')[0]}
            </p>
          </div>
        ) : (
          /* GC / admin: Today feed first — what matters today */
          <>
            <TeamAccessRequestsCard />
            <RemindersCard />
            <PendingReviewsCard />
            <UnsignedSchedulesCard />
            <MissingTasksAlertCard />
            <MissingTradeAlertCard />
            <MissingTradeScopesCard />
            <GCTodayFeed />
          </>
        )}

        {/* Main Dashboard Grid - Mobile First */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          
          {/* 1. Schedule - Fast Weekly Calendar View */}
          <FastScheduleCard />

          {/* 2. Live Urgent Card */}
          <FastUrgentCard />

          {/* 3. Active Projects - Fast Loading */}
          <FastProjectsCard />

          {/* 4. Financial Position */}
          <FinancialPositionCard />

          {/* 5. Cash Flow Forecast */}
          <CashFlowForecastCard />

          {/* Weather card removed pending real API wire-up (was hardcoded mock data) */}

        </div>

        {/* Mobile quick actions */}
        <div className="block md:hidden mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
          <p className="text-sm text-blue-700 text-center text-wrap">
            Tap cards for details, or use the menu to navigate between sections.
          </p>
        </div>
      </div>
  );

  return <AppLayout>{dashboardContent}</AppLayout>;
}