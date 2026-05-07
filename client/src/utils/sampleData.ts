import type { ScheduleTask } from './forecast';
import type { FirebaseFinancial } from '../../../shared/schema';

/**
 * Sample data for testing and demonstration of cash flow forecasting
 */

export const sampleFinancialData: FirebaseFinancial[] = [
  {
    id: 'fin-001',
    projectId: 4,
    lineItem: 'Site Preparation',
    category: 'Labor',
    amount: 8500,
    paidToDate: 8500,
    dateIncurred: '2025-01-15'
  },
  {
    id: 'fin-002',
    projectId: 4,
    lineItem: 'Permits and Inspections',
    category: 'Permits',
    amount: 2500,
    paidToDate: 2500,
    dateIncurred: '2025-01-10'
  },
  {
    id: 'fin-003',
    projectId: 4,
    lineItem: 'Concrete Materials',
    category: 'Materials',
    amount: 12000,
    paidToDate: 6000,
    dateIncurred: '2025-01-20'
  },
  {
    id: 'fin-004',
    projectId: 4,
    lineItem: 'Lumber Package',
    category: 'Materials',
    amount: 35000,
    paidToDate: 0,
    dateIncurred: '2025-01-25'
  }
];

export const sampleScheduleData: ScheduleTask[] = [
  {
    id: 1,
    title: 'Foundation Pour',
    startDate: '2025-02-01',
    endDate: '2025-02-10',
    trade: 'Concrete',
    contactId: 123,
    estimatedCost: 22000,
    subcontractorBillAmount: 21500,
    subcontractorBillDate: '2025-02-15',
    status: 'Scheduled'
  },
  {
    id: 2,
    title: 'Foundation Walls',
    startDate: '2025-02-11',
    endDate: '2025-02-20',
    trade: 'Concrete',
    contactId: 123,
    estimatedCost: 18000,
    subcontractorBillAmount: 17800,
    subcontractorBillDate: '2025-02-25',
    status: 'Scheduled'
  },
  {
    id: 3,
    title: 'Floor System',
    startDate: '2025-02-21',
    endDate: '2025-03-05',
    trade: 'Framing',
    contactId: 124,
    estimatedCost: 25000,
    subcontractorBillAmount: 24200,
    subcontractorBillDate: '2025-03-10',
    status: 'Scheduled'
  },
  {
    id: 4,
    title: 'Wall Framing',
    startDate: '2025-03-06',
    endDate: '2025-03-20',
    trade: 'Framing',
    contactId: 124,
    estimatedCost: 32000,
    subcontractorBillAmount: 31500,
    subcontractorBillDate: '2025-03-25',
    status: 'Scheduled'
  },
  {
    id: 5,
    title: 'Roof Framing',
    startDate: '2025-03-21',
    endDate: '2025-04-05',
    trade: 'Framing',
    contactId: 124,
    estimatedCost: 28000,
    subcontractorBillAmount: 27300,
    subcontractorBillDate: '2025-04-10',
    status: 'Scheduled'
  },
  {
    id: 6,
    title: 'Electrical Rough-In',
    startDate: '2025-04-06',
    endDate: '2025-04-18',
    trade: 'Electrical',
    contactId: 125,
    estimatedCost: 18500,
    subcontractorBillAmount: 18000,
    subcontractorBillDate: '2025-04-23',
    status: 'Scheduled'
  },
  {
    id: 7,
    title: 'Plumbing Rough-In',
    startDate: '2025-04-06',
    endDate: '2025-04-16',
    trade: 'Plumbing',
    contactId: 126,
    estimatedCost: 15500,
    subcontractorBillAmount: 15200,
    subcontractorBillDate: '2025-04-21',
    status: 'Scheduled'
  },
  {
    id: 8,
    title: 'HVAC Installation',
    startDate: '2025-04-19',
    endDate: '2025-05-10',
    trade: 'HVAC',
    contactId: 127,
    estimatedCost: 35000,
    subcontractorBillAmount: 34200,
    subcontractorBillDate: '2025-05-15',
    status: 'Scheduled'
  },
  {
    id: 9,
    title: 'Insulation',
    startDate: '2025-05-11',
    endDate: '2025-05-18',
    trade: 'Insulation',
    contactId: 128,
    estimatedCost: 12000,
    subcontractorBillAmount: 11800,
    subcontractorBillDate: '2025-05-23',
    status: 'Scheduled'
  },
  {
    id: 10,
    title: 'Drywall Installation',
    startDate: '2025-05-19',
    endDate: '2025-06-05',
    trade: 'Drywall',
    contactId: 129,
    estimatedCost: 22000,
    subcontractorBillAmount: 21500,
    subcontractorBillDate: '2025-06-10',
    status: 'Scheduled'
  }
];

/**
 * Function to generate realistic schedule variations for testing
 */
export function generateScheduleVariations(baseSchedule: ScheduleTask[], variations: {
  delayDays?: number;
  costVariation?: number; // percentage
  paymentDelayDays?: number;
}): ScheduleTask[] {
  const { delayDays = 0, costVariation = 0, paymentDelayDays = 0 } = variations;
  
  return baseSchedule.map(task => {
    const delayedStartDate = new Date(task.startDate);
    delayedStartDate.setDate(delayedStartDate.getDate() + delayDays);
    
    const delayedEndDate = new Date(task.endDate);
    delayedEndDate.setDate(delayedEndDate.getDate() + delayDays);
    
    const delayedPaymentDate = task.subcontractorBillDate 
      ? new Date(task.subcontractorBillDate)
      : new Date(delayedEndDate);
    delayedPaymentDate.setDate(delayedPaymentDate.getDate() + paymentDelayDays);
    
    const costMultiplier = 1 + (costVariation / 100);
    
    return {
      ...task,
      startDate: delayedStartDate.toISOString().split('T')[0],
      endDate: delayedEndDate.toISOString().split('T')[0],
      estimatedCost: task.estimatedCost ? Math.round(task.estimatedCost * costMultiplier) : undefined,
      subcontractorBillAmount: task.subcontractorBillAmount ? Math.round(task.subcontractorBillAmount * costMultiplier) : undefined,
      subcontractorBillDate: delayedPaymentDate.toISOString().split('T')[0]
    };
  });
}

/**
 * Generate forecast scenarios for stress testing
 */
export function generateForecastScenarios() {
  return {
    bestCase: generateScheduleVariations(sampleScheduleData, {
      delayDays: 0,
      costVariation: -5, // 5% cost savings
      paymentDelayDays: -2 // Pay 2 days early
    }),
    
    realistic: generateScheduleVariations(sampleScheduleData, {
      delayDays: 3,
      costVariation: 2, // 2% cost overrun
      paymentDelayDays: 1 // Pay 1 day late
    }),
    
    worstCase: generateScheduleVariations(sampleScheduleData, {
      delayDays: 14,
      costVariation: 15, // 15% cost overrun
      paymentDelayDays: 7 // Pay 7 days late
    })
  };
}