import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';

import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyFinancialDashboard } from '@/components/accounting/CompanyFinancialDashboard';
import { ClientPaymentsTab } from '@/components/accounting/ClientPaymentsTab';
import { SubcontractorPaymentsTab } from '@/components/accounting/SubcontractorPaymentsTab';
import { CashFlowForecastTab } from '@/components/accounting/CashFlowForecastTab';
import { PerProjectAccountingTab } from '@/components/accounting/PerProjectAccountingTab';
import CostVarianceAnalysis from '@/components/financial/CostVarianceAnalysis';
import CashFlowForecasting from '@/components/financial/CashFlowForecasting';
import ProfitMarginAnalysis from '@/components/financial/ProfitMarginAnalysis';
import AutomatedPOSystem from '@/components/financial/AutomatedPOSystem';
import InvoiceMatchingSystem from '@/components/financial/InvoiceMatchingSystem';
import PaymentProcessingCenter from '@/components/financial/PaymentProcessingCenter';
import AutomatedInvoiceManagement from '@/components/invoices/AutomatedInvoiceManagement';

export default function Financials() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const isMobile = useIsMobile();

  const financialsContent = (
    <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900">Financials</h1>
          <p className="text-gray-600">
            Comprehensive financial management and accounting for construction projects
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="projects">Per-Project</TabsTrigger>
            <TabsTrigger value="client-payments">Client Payments</TabsTrigger>
            <TabsTrigger value="subcontractor-payments">Subcontractor Payments</TabsTrigger>
            <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
            <TabsTrigger value="cost-variance">Cost Variance</TabsTrigger>
            <TabsTrigger value="profit-analysis">Profit Analysis</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <CompanyFinancialDashboard />
          </TabsContent>

          <TabsContent value="projects" className="space-y-6">
            <PerProjectAccountingTab />
          </TabsContent>

          <TabsContent value="client-payments" className="space-y-6">
            <ClientPaymentsTab />
          </TabsContent>

          <TabsContent value="subcontractor-payments" className="space-y-6">
            <SubcontractorPaymentsTab />
          </TabsContent>

          <TabsContent value="cash-flow" className="space-y-6">
            <CashFlowForecastTab />
            <CashFlowForecasting projectId={0} />
          </TabsContent>

          <TabsContent value="cost-variance" className="space-y-6">
            <CostVarianceAnalysis projectId={0} />
          </TabsContent>

          <TabsContent value="profit-analysis" className="space-y-6">
            <ProfitMarginAnalysis projectId={0} />
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <AutomatedPOSystem projectId={0} />
            <InvoiceMatchingSystem projectId={0} />
            <PaymentProcessingCenter projectId={0} />
            <AutomatedInvoiceManagement projectId={1} />
          </TabsContent>
        </Tabs>
      </div>
  );

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold font-heading text-brand-black">Financials</h1>
        <p className="text-brand-dark-gray-blue">Comprehensive financial management and accounting</p>
      </div>
      {financialsContent}
    </AppLayout>
  );
}