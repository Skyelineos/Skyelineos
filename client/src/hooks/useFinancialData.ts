import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, hasFirebaseConfig } from '../firebase/config';
import { useEffect, useRef } from 'react';
import type { FirebaseFinancial } from '../../../shared/schema';

interface FinancialDataReturn {
  data: FirebaseFinancial[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * React Query hook for real-time financial data from Firestore
 * Listens to changes in the 'financials' collection filtered by projectId
 * 
 * @param projectId - The project ID to filter financial records
 * @returns Object containing data, loading state, and error information
 */
export function useFinancialData(projectId: number): FinancialDataReturn {
  const queryClient = useQueryClient();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  const queryKey = ['financials', projectId];

  // Initialize query with empty data
  const queryResult = useQuery({
    queryKey,
    queryFn: () => [], // Initial empty data - real data comes from real-time listener
    enabled: hasFirebaseConfig && !!projectId,
    staleTime: Infinity, // Never consider data stale since we use real-time updates
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    // Clean up any existing listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Skip if Firebase is not configured or projectId is not provided
    if (!hasFirebaseConfig || !db || !projectId) {
      console.warn('Firebase not configured or missing projectId for financial data');
      return;
    }

    // Set up real-time listener
    try {
      const financialsRef = collection(db, 'financials');
      const financialsQuery = query(
        financialsRef,
        where('projectId', '==', projectId),
        orderBy('dateIncurred', 'desc'), // Most recent first
        orderBy('lineItem', 'asc') // Then by line item alphabetically
      );

      unsubscribeRef.current = onSnapshot(
        financialsQuery,
        (snapshot) => {
          const financialData: FirebaseFinancial[] = [];
          
          snapshot.forEach((doc) => {
            const data = doc.data();
            
            // Validate required fields
            if (
              typeof data.projectId === 'number' &&
              typeof data.lineItem === 'string' &&
              typeof data.category === 'string' &&
              typeof data.amount === 'number' &&
              typeof data.paidToDate === 'number' &&
              typeof data.dateIncurred === 'string'
            ) {
              financialData.push({
                id: doc.id,
                projectId: data.projectId,
                lineItem: data.lineItem,
                category: data.category,
                amount: data.amount,
                paidToDate: data.paidToDate,
                dateIncurred: data.dateIncurred,
              });
            } else {
              console.warn('Invalid financial document structure:', doc.id, data);
            }
          });

          // Update React Query cache with real-time data
          queryClient.setQueryData(queryKey, financialData);
        },
        (error) => {
          console.error('Error listening to financial data:', error);
          
          // Update query with error state
          queryClient.setQueryData(queryKey, () => {
            throw error;
          });
        }
      );
    } catch (error) {
      console.error('Error setting up financial data listener:', error);
    }

    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [projectId, queryClient, queryKey]);

  // Return appropriate state based on Firebase configuration
  if (!hasFirebaseConfig) {
    return {
      data: [],
      isLoading: false,
      error: new Error('Firebase configuration not available'),
    };
  }

  return {
    data: queryResult.data,
    isLoading: queryResult.isLoading,
    error: queryResult.error as Error | null,
  };
}

/**
 * Helper function to calculate financial summaries from financial data
 * @param financials - Array of financial records
 * @returns Summary object with totals and category breakdowns
 */
export function calculateFinancialSummary(financials: FirebaseFinancial[] = []) {
  const summary = {
    totalAmount: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    categories: {} as Record<string, {
      amount: number;
      paid: number;
      outstanding: number;
      count: number;
    }>,
  };

  financials.forEach((financial) => {
    const amount = financial.amount || 0;
    const paid = financial.paidToDate || 0;
    const outstanding = amount - paid;

    // Update totals
    summary.totalAmount += amount;
    summary.totalPaid += paid;
    summary.totalOutstanding += outstanding;

    // Update category breakdown
    if (!summary.categories[financial.category]) {
      summary.categories[financial.category] = {
        amount: 0,
        paid: 0,
        outstanding: 0,
        count: 0,
      };
    }

    summary.categories[financial.category].amount += amount;
    summary.categories[financial.category].paid += paid;
    summary.categories[financial.category].outstanding += outstanding;
    summary.categories[financial.category].count += 1;
  });

  return summary;
}