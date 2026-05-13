import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/use-auth';
import { FastScheduleCard, FastUrgentCard, FastProjectsCard } from '@/components/dashboard/FastDashboardCards';
import { CashFlowForecastCard } from '@/components/dashboard/CashFlowForecastCard';
import { FinancialPositionCard } from '@/components/dashboard/FinancialPositionCard';
import WeatherForecast from '@/components/dashboard/WeatherForecast';
import { GCTodayFeed } from '@/components/today/GCTodayFeed';
import { MissingTradeAlertCard } from '@/components/dashboard/MissingTradeAlertCard';
import { MissingTradeScopesCard } from '@/components/dashboard/MissingTradeScopesCard';
import { RemindersCard } from '@/components/dashboard/RemindersCard';
import { PendingReviewsCard } from '@/components/dashboard/PendingReviewsCard';
import { MissingTasksAlertCard } from '@/components/dashboard/MissingTasksAlertCard';
import { UnsignedSchedulesCard } from '@/components/dashboard/UnsignedSchedulesCard';
import { TeamAccessRequestsCard } from '@/components/dashboard/TeamAccessRequestsCard';

// Simplified Dashboard Data
const upcomingSchedule = [
  { task: 'Foundation Inspection', project: 'Modern Lakehouse', date: 'Jan 16', time: '9:00 AM', status: 'scheduled' },
  { task: 'Electrical Rough-in', project: 'Suburban Estate', date: 'Jan 14', time: '8:00 AM', status: 'overdue' },
  { task: 'Material Delivery', project: 'Downtown Loft', date: 'Jan 18', time: '1:00 PM', status: 'confirmed' },
  { task: 'Final Walkthrough', project: 'Custom Farmhouse', date: 'Jan 22', time: '10:00 AM', status: 'scheduled' },
  { task: 'Permit Inspection', project: 'Modern Lakehouse', date: 'Jan 20', time: '2:00 PM', status: 'pending' }
];

const alertsAndDecisions = [
  { type: 'decision', message: 'Material substitution needed for Downtown Loft - Steel beam shortage', priority: 'high', daysOpen: 2 },
  { type: 'delay', message: 'Custom Farmhouse roofing delayed 3 days due to weather', priority: 'medium', daysOpen: 1 },
  { type: 'alert', message: 'Foundation inspection failed - Modern Lakehouse requires rework', priority: 'critical', daysOpen: 0 },
  { type: 'decision', message: 'Change order approval needed - Suburban Estate kitchen upgrade', priority: 'medium', daysOpen: 5 },
  { type: 'delay', message: 'Electrical permit delayed for Downtown Loft', priority: 'high', daysOpen: 3 }
];

// Removed mock data - now using real data from ActiveProjectsCard component



const financialSummary = {
  cashOnHand: 485000,
  projectedAP: { month1: 125000, month2: 180000, month3: 95000 },
  projectedAR: { month1: 220000, month2: 315000, month3: 185000 }
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Show branded welcome for non-admin portal users
  const isPortalUser = user?.role && ['client', 'sub', 'designer'].includes(user.role);



  // Real-time event subscriptions removed - using modern messaging system instead

  const navigateToAccounting = () => setLocation('/accounting');
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

          {/* 6. Weather Forecast - Full width on mobile */}
          <div className="md:col-span-2">
            <WeatherForecast />
          </div>



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