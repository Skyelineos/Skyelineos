/**
 * Simple in-process event bus for decoupling controller side-effects
 */

export interface EventHandler<T = any> {
  (payload: T): Promise<void> | void;
}

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  /**
   * Subscribe to an event with a handler function
   */
  subscribe<T = any>(eventName: string, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
    // Development logging removed
  }

  /**
   * Publish an event with optional payload and emit via Socket.IO
   */
  async publish<T = any>(eventName: string, payload?: T): Promise<void> {
    const eventHandlers = this.handlers.get(eventName) || [];
    
    if (eventHandlers.length === 0) {
      // Development logging removed
    } else {
      // Development logging removed
      
      // Execute all handlers in parallel
      const promises = eventHandlers.map(async (handler) => {
        try {
          await handler(payload);
        } catch (error) {
          console.error(`❌ Error in event handler for "${eventName}":`, error);
          // Continue processing other handlers even if one fails
        }
      });

      await Promise.all(promises);
      // Development logging removed
    }
    
    // Emit via Socket.IO for real-time updates
    try {
      if (global.socketIO) {
        global.socketIO.emit(eventName, payload);
        // Development logging removed
      }
    } catch (socketError) {
      console.error(`Socket.IO emission error for "${eventName}":`, socketError);
    }
  }

  /**
   * Get the count of handlers for an event (useful for testing)
   */
  getHandlerCount(eventName: string): number {
    return this.handlers.get(eventName)?.length || 0;
  }

  /**
   * Clear all handlers for an event (useful for testing)
   */
  clearHandlers(eventName?: string): void {
    if (eventName) {
      this.handlers.delete(eventName);
    } else {
      this.handlers.clear();
    }
  }
}

// Export a singleton instance
export const eventBus = new EventBus();