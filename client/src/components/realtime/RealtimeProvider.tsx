import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface RealtimeContextType {
  isConnected: boolean;
  lastUpdate: Date | null;
  subscribe: (channel: string, callback: (data: any) => void) => () => void;
  publish: (channel: string, data: any) => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

interface RealtimeProviderProps {
  children: ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [subscribers, setSubscribers] = useState<Map<string, Set<(data: any) => void>>>(new Map());

  useEffect(() => {
    // Simulate real-time connection
    setIsConnected(true);
    setLastUpdate(new Date());

    // Set up polling for real updates every 30 seconds
    const interval = setInterval(() => {
      setLastUpdate(new Date());
      
      // Trigger updates for all subscribers
      subscribers.forEach((callbacks, channel) => {
        callbacks.forEach(callback => {
          // Simulate receiving updates
          if (Math.random() > 0.7) { // 30% chance of update
            callback({ 
              type: 'update', 
              timestamp: new Date().toISOString(),
              channel 
            });
          }
        });
      });
    }, 30000);

    return () => {
      clearInterval(interval);
      setIsConnected(false);
    };
  }, [subscribers]);

  const subscribe = (channel: string, callback: (data: any) => void) => {
    setSubscribers(prev => {
      const newMap = new Map(prev);
      if (!newMap.has(channel)) {
        newMap.set(channel, new Set());
      }
      newMap.get(channel)!.add(callback);
      return newMap;
    });

    // Return unsubscribe function
    return () => {
      setSubscribers(prev => {
        const newMap = new Map(prev);
        const callbacks = newMap.get(channel);
        if (callbacks) {
          callbacks.delete(callback);
          if (callbacks.size === 0) {
            newMap.delete(channel);
          }
        }
        return newMap;
      });
    };
  };

  const publish = (channel: string, data: any) => {
    const callbacks = subscribers.get(channel);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  };

  return (
    <RealtimeContext.Provider value={{
      isConnected,
      lastUpdate,
      subscribe,
      publish
    }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}