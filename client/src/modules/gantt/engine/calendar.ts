// Calendar & Working Days Engine
import { addDays, format, isWeekend, differenceInDays, parseISO } from 'date-fns';

export const isWorking = (date: Date, holidays: Set<string>): boolean => {
  const dateStr = format(date, 'yyyy-MM-dd');
  return !isWeekend(date) && !holidays.has(dateStr);
};

export const addWorkingDays = (startDate: Date, days: number, holidays: Set<string>): Date => {
  let result = startDate;
  let remaining = Math.abs(days);
  const direction = days >= 0 ? 1 : -1;
  
  while (remaining > 0) {
    result = addDays(result, direction);
    if (isWorking(result, holidays)) {
      remaining--;
    }
  }
  
  return result;
};

export const workingDiff = (startDate: Date, endDate: Date, holidays: Set<string>): number => {
  let current = startDate;
  let count = 0;
  
  while (current <= endDate) {
    if (isWorking(current, holidays)) {
      count++;
    }
    current = addDays(current, 1);
  }
  
  return count;
};

export const getWorkingDaysInRange = (start: string, end: string, holidays: string[]): number => {
  const holidaySet = new Set(holidays);
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  return workingDiff(startDate, endDate, holidaySet);
};