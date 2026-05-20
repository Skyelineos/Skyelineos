import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';

import FinancialsLayout from '@/components/layout/FinancialsLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useIsMobile } from '@/hooks/use-mobile';
import { CompanyFinancialDashboard } from '@/components/accounting/CompanyFinancialDashboard';
import { ClientPaymentsTab } from '@/components/accounting/ClientPaymentsTab';
import { SubcontractorPaymentsTab } from '@/components/accounting/SubcontractorPaymentsTab';
import { CashFlowForecastTab } from '@/components/accounting/CashFlowForecastTab';
import { PerProjectAccountingTab } from '@/components/accounting/PerProjectAccountingTab';
import CostVarianceAnalysis from '@/components/financial/CostVarianceAnalysis';
import CashFlowForecasting from '@/components/financial/CashFlowForecasting';
import ThreeMonthCashFlowProjection from '@/components/financial/ThreeMonthCashFlowProjection';
import ProfitMarginAnalysis from '@/components/financial/ProfitMarginAnalysis';
import AutomatedPOSystem from '@/components/financial/AutomatedPOSystem';
import InvoiceMatchingSystem from '@/components/financial/InvoiceMatchingSystem';
import PaymentProcessingCenter from '@/components/financial/PaymentProcessingCenter';
import EnhancedFinancialDashboard from '@/components/financial/EnhancedFinancialDashboard';
import { QboConnectionCard } from '@/components/settings/QboConnectionCard';

export default function Financials() {
  const [selectedProjectId, setSelectedProjectId] = useState<number>(0); // 0 = company-wide
  const [location] = useLocation();
  const [, params] = useRoute('/financials/:tab?');
  const currentTab = params?.tab || '';
  const isMobile = useIsMobile();

  // Debug logging for navigation
  // Development logging removed
  // Development logging removed
  // Development logging removed

  // Fetch projects for selector
  const { data: projects = [] } = useQuery<any[]>({ queryKey: ['/api/projects'] });

  // Function to render content based on current tab
  const renderTabContent = () => {
    try {
      switch (currentTab) {
        case '':
          return renderOverviewTab();
        case 'cash-flow':
          // Development logging removed
          return renderCashFlowTab();
        case 'budget-analysis':
          // Development logging removed
          return renderBudgetAnalysisTab();
        case 'invoices':
          // Development logging removed
          return renderInvoicesTab();
        case 'payments':
          // Development logging removed
          return renderPaymentsTab();
        case 'purchase-orders':
          // Development logging removed
          return renderPurchaseOrdersTab();
        case 'cost-tracking':
          // Development logging removed
          return renderCostTrackingTab();
        case 'reports':
          // Development logging removed
          return renderReportsTab();
        case 'settings':
          // Development logging removed
          return renderSettingsTab();
        default:
          // Development logging removed
          return renderOverviewTab();
      }
    } catch (error) {
      console.error('Error rendering tab content:', error);
      return (
        <div className="p-6">
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle>Navigation Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p>There was an error loading this financial section. Please try refreshing the page or selecting a different tab.</p>
              <p className="text-sm text-gray-500 mt-2">Current tab: {currentTab}</p>
            </CardContent>
          </Card>
        </div>
      );
    }
  };

  // Overview Tab (Dashboard)
  const renderOverviewTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900">Financial Overview</h1>
          <p className="text-gray-600">
            Comprehensive financial dashboard and key metrics
          </p>
        </div>
        
        {/* Project Selector */}
        <Card className="bg-gray-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Financial View</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Select Project:</label>
              <Select value={selectedProjectId.toString()} onValueChange={(value) => setSelectedProjectId(parseInt(value))}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Company-Wide Overview</SelectItem>
                  {projects.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-sm text-gray-500">
                {selectedProjectId === 0 ? 'Viewing all projects' : `Viewing project: ${projects.find((p: any) => p.id === selectedProjectId)?.name || 'Unknown'}`}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <EnhancedFinancialDashboard projectId={selectedProjectId === 0 ? undefined : selectedProjectId} />
    </div>
  );

  // Cash Flow Tab
  const renderCashFlowTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Cash Flow Analysis</h1>
        <p className="text-gray-600">
          Income vs expenses and cash flow projections
        </p>
      </div>
      
      {/* Company-wide Cash Flow */}
      <CashFlowForecastTab />
      
      {/* Project-specific Cash Flow (only when a specific project is selected) */}
      {selectedProjectId > 0 && (
        <>
          <ThreeMonthCashFlowProjection projectId={selectedProjectId} />
          <CashFlowForecasting projectId={selectedProjectId} />
        </>
      )}
      
      {/* Company-wide message when no specific project selected */}
      {selectedProjectId === 0 && (
        <Card className="bg-gray-50">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Company-Wide Cash Flow Analysis
            </h3>
            <p className="text-gray-600">
              Select a specific project above to view detailed cash flow projections and forecasting tools.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Budget Analysis Tab
  const renderBudgetAnalysisTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Budget Analysis</h1>
        <p className="text-gray-600">
          Project budget tracking and variance analysis
        </p>
      </div>
      {selectedProjectId > 0 ? (
        <>
          <CostVarianceAnalysis projectId={selectedProjectId} />
          <ProfitMarginAnalysis projectId={selectedProjectId} />
        </>
      ) : (
        <Card className="bg-gray-50">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Company-Wide Budget Analysis
            </h3>
            <p className="text-gray-600">
              Select a specific project above to view detailed budget analysis and profit margin tracking.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Invoices Tab
  const renderInvoicesTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Invoice Management</h1>
        <p className="text-gray-600">
          Create, track, and manage project invoices
        </p>
      </div>
      {selectedProjectId > 0 ? (
        <InvoiceMatchingSystem projectId={selectedProjectId} />
      ) : (
        <Card className="bg-gray-50">
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Company-Wide Invoice Management
            </h3>
            <p className="text-gray-600">
              Select a specific project above to view project-specific invoice management tools.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Payments Tab
  const renderPaymentsTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Payment Processing</h1>
        <p className="text-gray-600">
          Client and subcontractor payment management
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Client Payments</h2>
          <ClientPaymentsTab />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-4">Subcontractor Payments</h2>
          <SubcontractorPaymentsTab />
        </div>
      </div>
      {/* Conditional loading of PaymentProcessingCenter to prevent Stripe errors */}
      {import.meta.env.VITE_STRIPE_PUBLIC_KEY ? (
        <PaymentProcessingCenter projectId={selectedProjectId} />
      ) : (
        <Card className="bg-yellow-50 border-yellow-200 mt-6">
          <CardContent className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Advanced Payment Processing Available
            </h3>
            <p className="text-gray-600 mb-4">
              Advanced payment processing features are available but require Stripe configuration. 
              Contact your administrator to enable online payment processing.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Purchase Orders Tab
  const renderPurchaseOrdersTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Purchase Orders</h1>
        <p className="text-gray-600">
          PO tracking, automation, and management
        </p>
      </div>
      <AutomatedPOSystem projectId={selectedProjectId} />
    </div>
  );

  // Cost Tracking Tab
  const renderCostTrackingTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Cost Tracking</h1>
        <p className="text-gray-600">
          Project cost analysis and per-project accounting
        </p>
      </div>
      <PerProjectAccountingTab />
    </div>
  );

  // Reports Tab
  const renderReportsTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Financial Reports</h1>
        <p className="text-gray-600">
          Generate and export financial reports
        </p>
      </div>
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Available Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Financial reporting features coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );

  // Settings Tab
  const renderSettingsTab = () => (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">Financial Settings</h1>
        <p className="text-gray-600">
          Connect accounting tools and configure financial preferences
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Integrations</h2>
        <QboConnectionCard />
      </div>
    </div>
  );

  // Use mobile layout for mobile devices, desktop layout for desktop
  const content = renderTabContent();
  
  return (
    <FinancialsLayout>
      {content}
    </FinancialsLayout>
  );
}