import type { FirebaseFinancial } from '../../../shared/schema';

// Schedule task interface for forecasting
export interface ScheduleTask {
  id: number;
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  trade?: string;
  contactId?: number;
  estimatedCost?: number;
  subcontractorBillAmount?: number;
  subcontractorBillDate?: Date | string;
  status?: string;
}

// Cash flow event for forecasting calculations
export interface CashFlowEvent {
  date: string; // YYYY-MM-DD format
  amount: number;
  type: 'historical' | 'forecast';
  description: string;
  taskId?: number;
}

// Final cash flow forecast point
export interface CashFlowForecastPoint {
  date: string;
  cumulative: number;
  historical?: number; // Historical cumulative up to this point
  forecast?: number;   // Forecast cumulative from this point
}

/**
 * Forecasts future cash flow by combining historical financial data with scheduled tasks
 * 
 * @param schedule - Array of scheduled tasks with billing information
 * @param financials - Array of historical financial records
 * @returns Array of cash flow forecast points with cumulative totals
 */
export function forecastCashFlow(
  schedule: ScheduleTask[],
  financials: FirebaseFinancial[]
): CashFlowForecastPoint[] {
  const events: CashFlowEvent[] = [];

  // Convert historical financial data to cash flow events
  financials.forEach((financial) => {
    if (financial.paidToDate > 0) {
      events.push({
        date: financial.dateIncurred,
        amount: financial.paidToDate,
        type: 'historical',
        description: `Payment: ${financial.lineItem}`,
      });
    }
  });

  // Convert scheduled tasks to forecast cash flow events
  schedule.forEach((task) => {
    const taskEndDate = typeof task.endDate === 'string' 
      ? task.endDate 
      : task.endDate.toISOString().split('T')[0];

    // Use subcontractor bill date if available, otherwise use task end date
    let paymentDate = taskEndDate;
    if (task.subcontractorBillDate) {
      paymentDate = typeof task.subcontractorBillDate === 'string'
        ? task.subcontractorBillDate
        : task.subcontractorBillDate.toISOString().split('T')[0];
    }

    // Determine payment amount
    let paymentAmount = 0;
    if (task.subcontractorBillAmount && task.subcontractorBillAmount > 0) {
      paymentAmount = task.subcontractorBillAmount;
    } else if (task.estimatedCost && task.estimatedCost > 0) {
      paymentAmount = task.estimatedCost;
    }

    // Only add forecast events for future dates and positive amounts
    const today = new Date().toISOString().split('T')[0];
    if (paymentAmount > 0 && paymentDate >= today && task.status !== 'Complete') {
      events.push({
        date: paymentDate,
        amount: paymentAmount,
        type: 'forecast',
        description: `Forecast: ${task.title} (${task.trade || 'General'})`,
        taskId: task.id,
      });
    }
  });

  // Sort events by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate cumulative cash flow
  const forecastPoints: CashFlowForecastPoint[] = [];
  let cumulativeTotal = 0;
  let historicalTotal = 0;
  const today = new Date().toISOString().split('T')[0];

  // Group events by date to handle multiple events on the same day
  const eventsByDate = new Map<string, CashFlowEvent[]>();
  events.forEach((event) => {
    if (!eventsByDate.has(event.date)) {
      eventsByDate.set(event.date, []);
    }
    eventsByDate.get(event.date)!.push(event);
  });

  // Process events chronologically
  Array.from(eventsByDate.entries())
    .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
    .forEach(([date, dayEvents]) => {
      const dailyTotal = dayEvents.reduce((sum, event) => sum + event.amount, 0);
      cumulativeTotal += dailyTotal;

      const isHistorical = date <= today;
      if (isHistorical) {
        historicalTotal = cumulativeTotal;
      }

      const point: CashFlowForecastPoint = {
        date,
        cumulative: cumulativeTotal,
      };

      // Add breakdown for historical vs forecast
      if (isHistorical) {
        point.historical = cumulativeTotal;
      } else {
        point.historical = historicalTotal;
        point.forecast = cumulativeTotal;
      }

      forecastPoints.push(point);
    });

  return forecastPoints;
}

/**
 * Calculates cash flow velocity (rate of change) over time
 * 
 * @param forecastPoints - Array of cash flow forecast points
 * @param windowDays - Number of days to calculate velocity over (default: 30)
 * @returns Array of velocity points showing rate of cash flow change
 */
export function calculateCashFlowVelocity(
  forecastPoints: CashFlowForecastPoint[],
  windowDays: number = 30
): Array<{ date: string; velocity: number }> {
  if (forecastPoints.length < 2) return [];

  const velocityPoints: Array<{ date: string; velocity: number }> = [];
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  for (let i = 1; i < forecastPoints.length; i++) {
    const currentPoint = forecastPoints[i];
    const currentDate = new Date(currentPoint.date);
    
    // Find the point approximately windowDays ago
    let previousIndex = i - 1;
    while (previousIndex >= 0) {
      const previousDate = new Date(forecastPoints[previousIndex].date);
      const timeDiff = currentDate.getTime() - previousDate.getTime();
      
      if (timeDiff >= windowMs) break;
      previousIndex--;
    }

    if (previousIndex >= 0) {
      const previousPoint = forecastPoints[previousIndex];
      const previousDate = new Date(previousPoint.date);
      const timeDiffDays = (currentDate.getTime() - previousDate.getTime()) / (24 * 60 * 60 * 1000);
      const cashFlowChange = currentPoint.cumulative - previousPoint.cumulative;
      const velocity = timeDiffDays > 0 ? cashFlowChange / timeDiffDays : 0;

      velocityPoints.push({
        date: currentPoint.date,
        velocity: velocity,
      });
    }
  }

  return velocityPoints;
}

/**
 * Identifies potential cash flow issues and bottlenecks
 * 
 * @param forecastPoints - Array of cash flow forecast points
 * @param thresholds - Configuration for issue detection
 * @returns Array of identified cash flow issues
 */
export function identifyCashFlowIssues(
  forecastPoints: CashFlowForecastPoint[],
  thresholds: {
    negativeFlowDays?: number;
    lowCashBuffer?: number;
    rapidSpendingThreshold?: number;
  } = {}
): Array<{
  type: 'negative_flow' | 'low_buffer' | 'rapid_spending';
  date: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  amount?: number;
}> {
  const {
    negativeFlowDays = 7,
    lowCashBuffer = 10000,
    rapidSpendingThreshold = 20000,
  } = thresholds;

  const issues: Array<{
    type: 'negative_flow' | 'low_buffer' | 'rapid_spending';
    date: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    amount?: number;
  }> = [];

  const today = new Date().toISOString().split('T')[0];

  // Check for negative cash flow periods
  let negativeFlowStart: string | null = null;
  let consecutiveNegativeDays = 0;

  forecastPoints.forEach((point, index) => {
    const isNegative = point.cumulative < 0;
    
    if (isNegative && point.date >= today) {
      if (!negativeFlowStart) {
        negativeFlowStart = point.date;
        consecutiveNegativeDays = 1;
      } else {
        consecutiveNegativeDays++;
      }
    } else {
      if (negativeFlowStart && consecutiveNegativeDays >= negativeFlowDays) {
        issues.push({
          type: 'negative_flow',
          date: negativeFlowStart,
          severity: consecutiveNegativeDays > 14 ? 'high' : 'medium',
          description: `Negative cash flow for ${consecutiveNegativeDays} days`,
          amount: Math.abs(point.cumulative),
        });
      }
      negativeFlowStart = null;
      consecutiveNegativeDays = 0;
    }

    // Check for low cash buffer
    if (point.cumulative > 0 && point.cumulative < lowCashBuffer && point.date >= today) {
      issues.push({
        type: 'low_buffer',
        date: point.date,
        severity: point.cumulative < lowCashBuffer / 2 ? 'high' : 'medium',
        description: `Low cash buffer: $${point.cumulative.toLocaleString()}`,
        amount: point.cumulative,
      });
    }

    // Check for rapid spending (large negative changes)
    if (index > 0) {
      const previousPoint = forecastPoints[index - 1];
      const dailyChange = point.cumulative - previousPoint.cumulative;
      
      if (dailyChange < -rapidSpendingThreshold && point.date >= today) {
        issues.push({
          type: 'rapid_spending',
          date: point.date,
          severity: Math.abs(dailyChange) > rapidSpendingThreshold * 2 ? 'high' : 'medium',
          description: `Large expense: $${Math.abs(dailyChange).toLocaleString()}`,
          amount: Math.abs(dailyChange),
        });
      }
    }
  });

  return issues;
}