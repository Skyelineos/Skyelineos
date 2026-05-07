import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { verifyToken } from './auth';
import url from 'url';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  userRole?: string;
  subscribedChannels?: Set<string>;
}

interface WebSocketMessage {
  type: string;
  channel?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

export class RealtimeManager {
  private wss: WebSocketServer;
  private clients: Map<number, AuthenticatedWebSocket[]> = new Map();
  private channels: Map<string, Set<AuthenticatedWebSocket>> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });

    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private verifyClient(info: { req: { url: string } }): boolean {
    try {
      const query = url.parse(info.req.url, true).query;
      const token = query.token as string;
      
      if (!token) return false;
      
      const decoded = verifyToken(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-production');
      return !!decoded;
    } catch {
      return false;
    }
  }

  private handleConnection(ws: AuthenticatedWebSocket, req: { url: string }) {
    try {
      const query = url.parse(req.url, true).query;
      const token = query.token as string;
      
      const decoded = verifyToken(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-production');
      if (!decoded) {
        ws.close(1008, 'Invalid token');
        return;
      }

      ws.userId = decoded.id;
      ws.userRole = decoded.role;
      ws.subscribedChannels = new Set();

      // Add to clients map
      if (!this.clients.has(decoded.id)) {
        this.clients.set(decoded.id, []);
      }
      this.clients.get(decoded.id)!.push(ws);

      // Development logging removed

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleDisconnection(ws));
      ws.on('error', (error) => console.error('WebSocket error:', error));

      // Send connection confirmation
      this.sendToClient(ws, {
        type: 'connection_established',
        data: { userId: decoded.id, role: decoded.role },
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1011, 'Internal server error');
    }
  }

  private handleMessage(ws: AuthenticatedWebSocket, data: Buffer) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, message.channel!);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(ws, message.channel!);
          break;
        case 'ping':
          this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
          break;
        default:
          // Development logging removed
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  private handleSubscribe(ws: AuthenticatedWebSocket, channel: string) {
    if (!this.isAuthorizedForChannel(ws, channel)) {
      this.sendToClient(ws, {
        type: 'error',
        data: { message: 'Not authorized for channel', channel },
        timestamp: Date.now()
      });
      return;
    }

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }

    this.channels.get(channel)!.add(ws);
    ws.subscribedChannels!.add(channel);

    this.sendToClient(ws, {
      type: 'subscribed',
      channel,
      timestamp: Date.now()
    });

    // Development logging removed
  }

  private handleUnsubscribe(ws: AuthenticatedWebSocket, channel: string) {
    if (this.channels.has(channel)) {
      this.channels.get(channel)!.delete(ws);
    }
    ws.subscribedChannels!.delete(channel);

    this.sendToClient(ws, {
      type: 'unsubscribed',
      channel,
      timestamp: Date.now()
    });
  }

  private handleDisconnection(ws: AuthenticatedWebSocket) {
    if (ws.userId) {
      const userClients = this.clients.get(ws.userId);
      if (userClients) {
        const index = userClients.indexOf(ws);
        if (index > -1) {
          userClients.splice(index, 1);
        }
        if (userClients.length === 0) {
          this.clients.delete(ws.userId);
        }
      }

      // Remove from all channels
      if (ws.subscribedChannels) {
        ws.subscribedChannels.forEach(channel => {
          if (this.channels.has(channel)) {
            this.channels.get(channel)!.delete(ws);
          }
        });
      }

      // Development logging removed
    }
  }

  private isAuthorizedForChannel(ws: AuthenticatedWebSocket, channel: string): boolean {
    const [type, ...parts] = channel.split(':');
    
    switch (type) {
      case 'project':
        // Allow access to project channels based on role
        return ['admin', 'project_manager'].includes(ws.userRole!) || 
               (ws.userRole === 'client' && this.isUserAssignedToProject(ws.userId!, parseInt(parts[0]))) ||
               (ws.userRole === 'subcontractor' && this.isSubcontractorAssignedToProject(ws.userId!, parseInt(parts[0])));
      
      case 'global':
        // Global channels only for admin and project managers
        return ['admin', 'project_manager'].includes(ws.userRole!);
      
      case 'user':
        // User-specific channels
        return ws.userId === parseInt(parts[0]);
      
      default:
        return false;
    }
  }

  private isUserAssignedToProject(userId: number, projectId: number): boolean {
    // TODO: Implement actual project assignment check
    return true; // Simplified for now
  }

  private isSubcontractorAssignedToProject(userId: number, projectId: number): boolean {
    // TODO: Implement actual subcontractor assignment check
    return true; // Simplified for now
  }

  private sendToClient(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Public methods for broadcasting updates
  public broadcastToChannel(channel: string, message: Omit<WebSocketMessage, 'timestamp'>) {
    const channelClients = this.channels.get(channel);
    if (!channelClients) return;

    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: Date.now()
    };

    channelClients.forEach(ws => {
      this.sendToClient(ws, fullMessage);
    });
  }

  public broadcastToUser(userId: number, message: Omit<WebSocketMessage, 'timestamp'>) {
    const userClients = this.clients.get(userId);
    if (!userClients) return;

    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: Date.now()
    };

    userClients.forEach(ws => {
      this.sendToClient(ws, fullMessage);
    });
  }

  public broadcastProjectUpdate(projectId: number, updateType: string, data: Record<string, unknown>) {
    this.broadcastToChannel(`project:${projectId}`, {
      type: 'project_update',
      data: { updateType, projectId, ...data }
    });
  }

  public broadcastScheduleUpdate(projectId: number, data: Record<string, unknown>) {
    this.broadcastToChannel(`project:${projectId}`, {
      type: 'schedule_update',
      data: { projectId, ...data }
    });
  }

  public broadcastBudgetUpdate(projectId: number, data: Record<string, unknown>) {
    this.broadcastToChannel(`project:${projectId}`, {
      type: 'budget_update',
      data: { projectId, ...data }
    });
  }

  public broadcastNewMessage(projectId: number, message: Record<string, unknown>) {
    this.broadcastToChannel(`project:${projectId}`, {
      type: 'new_message',
      data: { projectId, message }
    });
  }

  public notifyUser(userId: number, notification: Record<string, unknown>) {
    this.broadcastToUser(userId, {
      type: 'notification',
      data: notification
    });
  }
}

let realtimeManager: RealtimeManager;

export function initializeWebSocket(server: Server): RealtimeManager {
  realtimeManager = new RealtimeManager(server);
  return realtimeManager;
}

export function getRealtimeManager(): RealtimeManager {
  if (!realtimeManager) {
    throw new Error('WebSocket not initialized');
  }
  return realtimeManager;
}