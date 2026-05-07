import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const parseEstimateData = (estimateData: any) => {
  if (!estimateData || !estimateData.notes) {
    return {
      categories: [],
      markup: 0,
      contingency: 0,
      totalCost: 0,
      totalDuration: 0
    };
  }

  try {
    const parsedData = JSON.parse(estimateData.notes);
    return {
      categories: parsedData.categories || [],
      markup: parsedData.markup || 0,
      contingency: parsedData.contingency || 0,
      totalCost: parsedData.totalCost || 0,
      totalDuration: parsedData.totalDuration || 0
    };
  } catch (error) {
    return {
      categories: [],
      markup: 0,
      contingency: 0,
      totalCost: 0,
      totalDuration: 0
    };
  }
};

export const calculateItemTotal = (item: any) => {
  const baseCost = parseFloat(item.estimatedCost) || 0;
  const markup = parseFloat(item.markup) || 0;
  const contingency = parseFloat(item.contingency) || 0;
  
  const markupAmount = baseCost * (markup / 100);
  const subtotal = baseCost + markupAmount;
  const contingencyAmount = subtotal * (contingency / 100);
  
  return subtotal + contingencyAmount;
};
