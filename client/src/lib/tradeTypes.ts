// Shared trade types management utility

const TRADE_TYPES_KEY = 'buildflow_trade_types';

const DEFAULT_TRADES = [
  'Foundation', 'Framing', 'Roofing', 'Electrical', 'Plumbing', 'HVAC', 
  'Drywall', 'Flooring', 'Painting', 'Cabinetry', 'Landscaping', 'Concrete',
  'Insulation', 'Windows & Doors', 'Siding', 'Tile Work', 'Countertops', 'Other'
];

// Get saved trade types from localStorage or use defaults
export const getStoredTrades = (): string[] => {
  try {
    const stored = localStorage.getItem(TRADE_TYPES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('Failed to load stored trade types:', error);
  }
  return DEFAULT_TRADES;
};

// Save trade types to localStorage
export const saveTradeTypes = (trades: string[]): void => {
  try {
    localStorage.setItem(TRADE_TYPES_KEY, JSON.stringify(trades));
  } catch (error) {
    console.warn('Failed to save trade types:', error);
  }
};

// Add a new trade type
export const addTradeType = (newTrade: string): string[] => {
  const currentTrades = getStoredTrades();
  const trimmedTrade = newTrade.trim();
  
  if (trimmedTrade && !currentTrades.includes(trimmedTrade)) {
    const updatedTrades = [...currentTrades, trimmedTrade].sort();
    saveTradeTypes(updatedTrades);
    return updatedTrades;
  }
  
  return currentTrades;
};

// Remove a trade type (prevent removing 'Other')
export const removeTradeType = (tradeToRemove: string): string[] => {
  if (tradeToRemove === 'Other') {
    return getStoredTrades(); // Don't allow removing 'Other'
  }
  
  const currentTrades = getStoredTrades();
  const updatedTrades = currentTrades.filter(trade => trade !== tradeToRemove);
  saveTradeTypes(updatedTrades);
  return updatedTrades;
};