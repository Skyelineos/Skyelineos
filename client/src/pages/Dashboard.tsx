import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { FastScheduleCard, FastUrgentCard, FastProjectsCard } from '@/components/dashboard/FastDashboardCards';
import { CashFlowForecastCard } from '@/components/dashboard/CashFlowForecastCard';
import { FinancialPositionCard } from '@/components/dashboard/FinancialPositionCard';
import { ArApRollupCard } from '@/components/dashboard/ArApRollupCard';
import { BidFollowUpCard } from '@/components/dashboard/BidFollowUpCard';
import { ScheduleSlipAlarmCard } from '@/components/dashboard/ScheduleSlipAlarmCard';
import { GCTodayFeed } from '@/components/today/GCTodayFeed';
import { MissingTradeAlertCard } from '@/components/dashboard/MissingTradeAlertCard';
import { MissingTradeScopesCard } from '@/components/dashboard/MissingTradeScopesCard';
import { RemindersCard } from '@/components/dashboard/RemindersCard';
import { PendingReviewsCard } from '@/components/dashboard/PendingReviewsCard';
import { SignoffQueueCard } from '@/components/dashboard/SignoffQueueCard';
import { MissingTasksAlertCard } from '@/components/dashboard/MissingTasksAlertCard';
import { UnsignedSchedulesCard } from '@/components/dashboard/UnsignedSchedulesCard';
import { TeamAccessRequestsCard } from '@/components/dashboard/TeamAccessRequestsCard';
import { QaTestPanel } from '@/components/dashboard/QaTestPanel';

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  // PMs are blocked from financial reads — hide Financial Position +
  // Cash Flow Forecast cards. Firestore rules block underlying reads,
  // but skipping render saves wasted queries + permission-denied noise.
  const { canAccessFinancials } = useRoleAccess();
  const showFinancials = canAccessFinancials();

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
            {user?.role === 'admin' && <QaTestPanel />}
            <TeamAccessRequestsCard />
            <RemindersCard />
            <PendingReviewsCard />
            <SignoffQueueCard />
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

          {/* 4. Financial Position — GC/admin only. */}
          {showFinancials && <FinancialPositionCard />}

          {/* 5. Cash Flow Forecast — GC/admin only. */}
          {showFinancials && <CashFlowForecastCard />}

          {/* 6. AR/AP Rollup — GC/admin only (Stream 5). */}
          {showFinancials && <ArApRollupCard />}

          {/* 7. Bid Follow-Up Needed — operational, all team members (Stream 5). */}
          <BidFollowUpCard />

          {/* 8. Schedule-Slip Alarm — operational, all team members (Stream 5). */}
          <ScheduleSlipAlarmCard />

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