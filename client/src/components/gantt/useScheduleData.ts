import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trade, Milestone } from '@/types/gantt';
import { generateMilestones, recalculateMilestones } from './milestones';
import { sampleTrades, sampleMilestones } from './sampleData';

interface UseScheduleDataOptions {
  projectId?: string;
  useFirestore?: boolean;
}

interface UseScheduleDataReturn {
  trades: Trade[];
  milestones: Milestone[];
  isLoading: boolean;
  error: Error | null;
  createTrade: (trade: Omit<Trade, 'id'>) => Promise<void>;
  updateTrade: (id: string, updates: Partial<Trade>) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  reorderTrades: (tradeIds: string[]) => Promise<void>;
  recalculateMilestones: () => Promise<void>;
}

/**
 * Hook for Firestore CRUD operations for trades & milestones
 * Provides batched writes, optimistic UI, and error handling
 */
export function useScheduleData({ 
  projectId, 
  useFirestore = false 
}: UseScheduleDataOptions = {}): UseScheduleDataReturn {
  const queryClient = useQueryClient();
  const [optimisticTrades, setOptimisticTrades] = useState<Trade[]>([]);
  const [optimisticMilestones, setOptimisticMilestones] = useState<Milestone[]>([]);

  // Determine data source
  const dataSource = useFirestore && projectId ? 'firestore' : 'sample';
  
  // Fetch trades data
  const { 
    data: trades = [], 
    isLoading: tradesLoading, 
    error: tradesError 
  } = useQuery({
    queryKey: ['trades', projectId, dataSource],
    queryFn: async (): Promise<Trade[]> => {
      if (dataSource === 'firestore') {
        // TODO: Implement Firestore integration
        // const firebase = await import('firebase/firestore');
        // const tradesSnapshot = await firebase.getDocs(
        //   firebase.collection(db, `projects/${projectId}/schedule/trades`)
        // );
        // return tradesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
        return sampleTrades; // Fallback to sample data for now
      }
      return sampleTrades;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: true
  });

  // Fetch milestones data
  const { 
    data: milestones = [], 
    isLoading: milestonesLoading, 
    error: milestonesError 
  } = useQuery({
    queryKey: ['milestones', projectId, dataSource],
    queryFn: async (): Promise<Milestone[]> => {
      if (dataSource === 'firestore') {
        // TODO: Implement Firestore integration
        // const firebase = await import('firebase/firestore');
        // const milestonesSnapshot = await firebase.getDocs(
        //   firebase.collection(db, `projects/${projectId}/milestones`)
        // );
        // return milestonesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Milestone));
        return generateMilestones(trades);
      }
      return generateMilestones(trades);
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: trades.length > 0
  });

  // Create trade mutation
  const createTradeMutation = useMutation({
    mutationFn: async (newTrade: Omit<Trade, 'id'>): Promise<Trade> => {
      const trade: Trade = {
        ...newTrade,
        id: generateTradeId()
      };

      if (dataSource === 'firestore') {
        // TODO: Implement Firestore write
        // const firebase = await import('firebase/firestore');
        // await firebase.setDoc(
        //   firebase.doc(db, `projects/${projectId}/schedule/trades`, trade.id),
        //   trade
        // );
      }

      return trade;
    },
    onMutate: async (newTrade) => {
      // Optimistic update
      const trade: Trade = { ...newTrade, id: generateTradeId() };
      setOptimisticTrades(prev => [...prev, trade]);
      
      // Update query cache optimistically
      queryClient.setQueryData(['trades', projectId, dataSource], (old: Trade[] = []) => [...old, trade]);
      
      return { trade };
    },
    onSuccess: (trade) => {
      // Update milestones
      updateMilestonesAfterTradeChange();
    },
    onError: (error, variables, context) => {
      console.error('Failed to create trade:', error);
      // Revert optimistic update
      if (context?.trade) {
        queryClient.setQueryData(['trades', projectId, dataSource], (old: Trade[] = []) => 
          old.filter(t => t.id !== context.trade.id)
        );
      }
    }
  });

  // Update trade mutation
  const updateTradeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Trade> }): Promise<Trade> => {
      if (dataSource === 'firestore') {
        // TODO: Implement Firestore update
        // const firebase = await import('firebase/firestore');
        // await firebase.updateDoc(
        //   firebase.doc(db, `projects/${projectId}/schedule/trades`, id),
        //   updates
        // );
      }

      const updatedTrade = { ...trades.find(t => t.id === id)!, ...updates };
      return updatedTrade;
    },
    onMutate: async ({ id, updates }) => {
      // Optimistic update
      queryClient.setQueryData(['trades', projectId, dataSource], (old: Trade[] = []) =>
        old.map(trade => trade.id === id ? { ...trade, ...updates } : trade)
      );
    },
    onSuccess: () => {
      // Update milestones
      updateMilestonesAfterTradeChange();
    },
    onError: (error) => {
      console.error('Failed to update trade:', error);
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: ['trades', projectId, dataSource] });
    }
  });

  // Delete trade mutation
  const deleteTradeMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (dataSource === 'firestore') {
        // TODO: Implement Firestore delete
        // const firebase = await import('firebase/firestore');
        // await firebase.deleteDoc(
        //   firebase.doc(db, `projects/${projectId}/schedule/trades`, id)
        // );
      }
    },
    onMutate: async (id) => {
      // Optimistic update
      queryClient.setQueryData(['trades', projectId, dataSource], (old: Trade[] = []) =>
        old.filter(trade => trade.id !== id)
      );
    },
    onSuccess: () => {
      // Update milestones
      updateMilestonesAfterTradeChange();
    },
    onError: (error) => {
      console.error('Failed to delete trade:', error);
      // Revert optimistic update
      queryClient.invalidateQueries({ queryKey: ['trades', projectId, dataSource] });
    }
  });

  // Helper function to update milestones after trade changes
  const updateMilestonesAfterTradeChange = useCallback(() => {
    const currentTrades = queryClient.getQueryData(['trades', projectId, dataSource]) as Trade[] || [];
    const currentMilestones = queryClient.getQueryData(['milestones', projectId, dataSource]) as Milestone[] || [];
    const updatedMilestones = recalculateMilestones(currentTrades, currentMilestones);
    
    queryClient.setQueryData(['milestones', projectId, dataSource], updatedMilestones);
  }, [queryClient, projectId, dataSource]);

  // Public API
  const createTrade = useCallback(async (trade: Omit<Trade, 'id'>) => {
    await createTradeMutation.mutateAsync(trade);
  }, [createTradeMutation]);

  const updateTrade = useCallback(async (id: string, updates: Partial<Trade>) => {
    await updateTradeMutation.mutateAsync({ id, updates });
  }, [updateTradeMutation]);

  const deleteTrade = useCallback(async (id: string) => {
    await deleteTradeMutation.mutateAsync(id);
  }, [deleteTradeMutation]);

  const reorderTrades = useCallback(async (tradeIds: string[]) => {
    // TODO: Implement trade reordering logic
    console.log('Reordering trades:', tradeIds);
  }, []);

  const recalculateMilestonesManually = useCallback(async () => {
    updateMilestonesAfterTradeChange();
  }, [updateMilestonesAfterTradeChange]);

  return {
    trades: optimisticTrades.length > 0 ? optimisticTrades : trades,
    milestones: optimisticMilestones.length > 0 ? optimisticMilestones : milestones,
    isLoading: tradesLoading || milestonesLoading,
    error: tradesError || milestonesError,
    createTrade,
    updateTrade,
    deleteTrade,
    reorderTrades,
    recalculateMilestones: recalculateMilestonesManually
  };
}

/**
 * Generate a unique trade ID
 */
function generateTradeId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Environment-agnostic adapter for future Postgres integration
 */
export interface ScheduleDataAdapter {
  getTrades(projectId: string): Promise<Trade[]>;
  getMilestones(projectId: string): Promise<Milestone[]>;
  createTrade(projectId: string, trade: Omit<Trade, 'id'>): Promise<Trade>;
  updateTrade(projectId: string, id: string, updates: Partial<Trade>): Promise<Trade>;
  deleteTrade(projectId: string, id: string): Promise<void>;
  batchWrite(projectId: string, operations: any[]): Promise<void>;
}