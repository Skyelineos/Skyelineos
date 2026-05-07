// Business day utility functions for calendar and timeline synchronization

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date);
}

export function addBusinessDays(startDate: Date, businessDays: number): Date {
  if (businessDays <= 0) return new Date(startDate);
  
  let currentDate = new Date(startDate);
  let daysAdded = 0;
  
  while (daysAdded < businessDays) {
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    if (isBusinessDay(currentDate)) {
      daysAdded++;
    }
  }
  
  return currentDate;
}

export function getNextBusinessDay(date: Date): Date {
  let nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  while (isWeekend(nextDate)) {
    nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
  }
  return nextDate;
}

export function getPreviousBusinessDay(date: Date): Date {
  let prevDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  while (isWeekend(prevDate)) {
    prevDate = new Date(prevDate.getTime() - 24 * 60 * 60 * 1000);
  }
  return prevDate;
}

export function calculateBusinessDaysBetween(startDate: Date, endDate: Date): number {
  if (startDate >= endDate) return 0;
  
  let businessDays = 0;
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    if (isBusinessDay(currentDate)) {
      businessDays++;
    }
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  return businessDays;
}

export function getBusinessDaysInRange(startDate: Date, endDate: Date): Date[] {
  const businessDays: Date[] = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    if (isBusinessDay(currentDate)) {
      businessDays.push(new Date(currentDate));
    }
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  return businessDays;
}

// Calculate the actual end date for a task given a start date and business day duration
export function calculateTaskEndDate(startDate: Date, businessDayDuration: number): Date {
  if (businessDayDuration <= 1) {
    return new Date(startDate);
  }
  
  return addBusinessDays(startDate, businessDayDuration - 1);
}

// Check if a task is active on a specific date (only on business days)
export function isTaskActiveOnDate(taskStartDate: Date, taskEndDate: Date, checkDate: Date, businessDaysOnly: boolean = true): boolean {
  // Basic date range check
  const dateInRange = checkDate >= taskStartDate && checkDate <= taskEndDate;
  
  if (!dateInRange) return false;
  
  // If business days only, exclude weekends
  if (businessDaysOnly && isWeekend(checkDate)) {
    return false;
  }
  
  return true;
}