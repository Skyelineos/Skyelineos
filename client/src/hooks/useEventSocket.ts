import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Initialize socket connection
function getSocket(): Socket {
  if (!socket) {
    const url = window.location.origin;
    
    // Development logging removed
    
    socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      forceNew: true,
      // Development mode - no auth token needed due to server bypass
    });

    socket.on('connect', () => {
      // Success operation completed
    });

    socket.on('disconnect', () => {
      // Development logging removed
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
    });
  }
  
  return socket;
}

/**
 * Main hook for Socket.IO client - returns the socket instance
 * This replaces the legacy implementation
 */
export function useEventSocket(): Socket {
  const socketRef = useRef<Socket>();
  
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = getSocket();
    }
    
    return () => {
      // Don't disconnect here - keep socket alive for other components
    };
  }, []);
  
  return socketRef.current || getSocket();
}

/**
 * Legacy compatibility hook for components using subscribe pattern
 * Wraps Socket.IO socket.on/socket.off in a subscribe function
 */
export function useEventSocketLegacy() {
  const queryClient = useQueryClient();
  const socket = getSocket();
  
  const subscribe = (
    eventName: string, 
    handler?: (data: any) => void,
    queryKeysToInvalidate: string[] = []
  ) => {
    const eventHandler = (data: any) => {
      // Development logging removed
      
      // Call custom handler if provided
      if (handler) {
        handler(data);
      }
      
      // Invalidate React Query keys if provided
      queryKeysToInvalidate.forEach(key => {
        queryClient.invalidateQueries({ queryKey: [key] });
      });
    };
    
    socket.on(eventName, eventHandler);
    // Development logging removed
    
    // Return cleanup function
    return () => {
      socket.off(eventName, eventHandler);
      // Development logging removed
    };
  };
  
  return {
    subscribe,
    isConnected: socket?.connected || false,
    socket
  };
}

/**
 * Hook for subscribing to real-time schedule events
 * Automatically invalidates related queries when events are received
 */
export function useScheduleEvents(projectId?: string | number) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socketInstance = getSocket();

    // Handler for schedule updates
    const handleScheduleUpdate = ({ projectId: updatedProjectId, taskId }: { 
      projectId: string | number; 
      taskId?: number;
    }) => {
      // Development logging removed
      
      // Invalidate specific project queries
      queryClient.invalidateQueries({ queryKey: ['projects', updatedProjectId, 'schedule'] });
      queryClient.invalidateQueries({ queryKey: ['projectCalendar', updatedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['projectList', updatedProjectId] });
      
      // Always invalidate global schedule
      queryClient.invalidateQueries({ queryKey: ['schedule', 'global'] });
    };

    // Handler for task status changes
    const handleTaskStatusChange = ({ projectId: updatedProjectId, taskId, status }: { 
      projectId: string | number; 
      taskId: number;
      status: string;
    }) => {
      // Development logging removed
      
      // Invalidate queries for the affected project
      queryClient.invalidateQueries({ queryKey: ['projects', updatedProjectId, 'schedule'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', 'global'] });
    };

    // Handler for dependency changes
    const handleDependencyChange = ({ projectId: updatedProjectId, fromTaskId, toTaskId }: { 
      projectId: string | number; 
      fromTaskId: number;
      toTaskId: number;
    }) => {
      // Development logging removed
      
      queryClient.invalidateQueries({ queryKey: ['projects', updatedProjectId, 'dependencies'] });
      queryClient.invalidateQueries({ queryKey: ['schedule', 'global'] });
    };

    // Subscribe to events
    socketInstance.on('scheduleUpdated', handleScheduleUpdate);
    socketInstance.on('taskStatusChanged', handleTaskStatusChange);
    socketInstance.on('dependencyChanged', handleDependencyChange);

    // Cleanup on unmount
    return () => {
      socketInstance.off('scheduleUpdated', handleScheduleUpdate);
      socketInstance.off('taskStatusChanged', handleTaskStatusChange);
      socketInstance.off('dependencyChanged', handleDependencyChange);
    };
  }, [queryClient, projectId]);

  return {
    socket: getSocket(),
    isConnected: socket?.connected || false,
  };
}

/**
 * Hook for emitting schedule events (for components that modify schedules)
 */
export function useScheduleEventEmitter() {
  const emitScheduleUpdate = (projectId: string | number, taskId?: number) => {
    const socketInstance = getSocket();
    socketInstance.emit('scheduleUpdated', { projectId, taskId });
  };

  const emitTaskStatusChange = (projectId: string | number, taskId: number, status: string) => {
    const socketInstance = getSocket();
    socketInstance.emit('taskStatusChanged', { projectId, taskId, status });
  };

  const emitDependencyChange = (projectId: string | number, fromTaskId: number, toTaskId: number) => {
    const socketInstance = getSocket();
    socketInstance.emit('dependencyChanged', { projectId, fromTaskId, toTaskId });
  };

  return {
    emitScheduleUpdate,
    emitTaskStatusChange,
    emitDependencyChange,
  };
}