/**
 * Socket.IO Authentication Tests
 * 
 * Tests Socket.IO connection security:
 * - Connection fails without JWT
 * - Connection succeeds with valid JWT
 * - JWT validation in Socket.IO handshake
 */

import { Server as IOServer } from 'socket.io';
import { createServer } from 'http';
import Client from 'socket.io-client';
import { signAccessToken } from '../auth/tokens';

// Mock token verification
jest.mock('../auth/tokens', () => ({
  signAccessToken: jest.fn((payload: any) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    const signature = 'mock-signature';
    return `${header}.${payloadB64}.${signature}`;
  }),
  verifyAccessToken: jest.fn((token: string) => {
    if (token === 'invalid-token') {
      return null;
    }
    if (token === 'expired-token') {
      return null;
    }
    if (token.includes('mock-signature')) {
      try {
        const [, payloadB64] = token.split('.');
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        
        // Check if token is expired
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          return null;
        }
        
        return payload;
      } catch {
        return null;
      }
    }
    return null;
  })
}));

describe('Socket.IO Authentication Tests', () => {
  let httpServer: any;
  let io: IOServer;
  let serverPort: number;

  beforeEach((done) => {
    // Create HTTP server
    httpServer = createServer();
    
    // Create Socket.IO server
    io = new IOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Import token verification after mocking
    const { verifyAccessToken } = require('../auth/tokens');

    // Add authentication middleware to Socket.IO
    io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer /i, '');
      
      if (!token) {
        const err = new Error('Authentication token required') as Error & { data?: any };
        err.data = { code: 'AUTH_TOKEN_REQUIRED' };
        return next(err);
      }

      try {
        const decoded = verifyAccessToken(token);
        if (!decoded) {
          const err = new Error('Invalid or expired token') as Error & { data?: any };
          err.data = { code: 'AUTH_TOKEN_INVALID' };
          return next(err);
        }

        // Attach user info to socket
        socket.data.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role
        };
        
        next();
      } catch (error) {
        const err = new Error('Token verification failed') as Error & { data?: any };
        err.data = { code: 'AUTH_TOKEN_VERIFICATION_FAILED' };
        next(err);
      }
    });

    // Add event handlers for testing
    io.on('connection', (socket) => {
      // Send welcome message with user info
      socket.emit('authenticated', {
        message: 'Successfully authenticated',
        user: socket.data.user
      });

      // Handle test events
      socket.on('test-message', (data, callback) => {
        callback({
          status: 'received',
          user: socket.data.user,
          data
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', reason);
      });
    });

    // Start server on random port
    httpServer.listen(0, () => {
      serverPort = httpServer.address()?.port;
      done();
    });
  });

  afterEach((done) => {
    io.close();
    httpServer.close(() => {
      done();
    });
  });

  describe('Connection Authentication', () => {
    it('should reject connection without JWT token', (done) => {
      const client = Client(`http://localhost:${serverPort}`, {
        autoConnect: false
      });

      client.on('connect_error', (error) => {
        expect(error.message).toBe('Authentication token required');
        expect(error.data?.code).toBe('AUTH_TOKEN_REQUIRED');
        client.close();
        done();
      });

      client.on('connect', () => {
        // Should not reach here
        client.close();
        done(new Error('Connection should have been rejected'));
      });

      client.connect();
    });

    it('should reject connection with invalid JWT token', (done) => {
      const client = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: 'invalid-token'
        },
        autoConnect: false
      });

      client.on('connect_error', (error) => {
        expect(error.message).toBe('Invalid or expired token');
        expect(error.data?.code).toBe('AUTH_TOKEN_INVALID');
        client.close();
        done();
      });

      client.on('connect', () => {
        // Should not reach here
        client.close();
        done(new Error('Connection should have been rejected'));
      });

      client.connect();
    });

    it('should accept connection with valid JWT token', (done) => {
      const testUser = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
      const validToken = signAccessToken(testUser);

      const client = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: validToken
        },
        autoConnect: false
      });

      client.on('connect_error', (error) => {
        client.close();
        done(error);
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.close();
      });

      client.on('authenticated', (data) => {
        expect(data.message).toBe('Successfully authenticated');
        expect(data.user).toEqual(testUser);
        done();
      });

      client.connect();
    });

    it('should accept connection with token in Authorization header format', (done) => {
      const testUser = { id: 2, email: 'user@example.com', role: 'user', permissions: [] };
      const validToken = signAccessToken(testUser);

      const client = Client(`http://localhost:${serverPort}`, {
        extraHeaders: {
          authorization: `Bearer ${validToken}`
        },
        autoConnect: false
      });

      client.on('connect_error', (error) => {
        client.close();
        done(error);
      });

      client.on('authenticated', (data) => {
        expect(data.message).toBe('Successfully authenticated');
        expect(data.user).toEqual(testUser);
        client.close();
        done();
      });

      client.connect();
    });
  });

  describe('Authenticated Socket Communication', () => {
    let authenticatedClient: any;
    let testUser: any;

    beforeEach((done) => {
      testUser = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
      const validToken = signAccessToken(testUser);

      authenticatedClient = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: validToken
        }
      });

      authenticatedClient.on('connect', () => {
        done();
      });

      authenticatedClient.on('connect_error', done);
    });

    afterEach(() => {
      if (authenticatedClient) {
        authenticatedClient.close();
      }
    });

    it('should handle events with authenticated context', (done) => {
      const testData = { message: 'Hello from client' };

      authenticatedClient.emit('test-message', testData, (response: any) => {
        expect(response.status).toBe('received');
        expect(response.user).toEqual(testUser);
        expect(response.data).toEqual(testData);
        done();
      });
    });

    it('should maintain user context across multiple events', (done) => {
      let eventCount = 0;
      const expectedEvents = 2;

      const handleResponse = (response: any) => {
        expect(response.user).toEqual(testUser);
        eventCount++;
        
        if (eventCount === expectedEvents) {
          done();
        }
      };

      authenticatedClient.emit('test-message', { msg: 'First message' }, handleResponse);
      authenticatedClient.emit('test-message', { msg: 'Second message' }, handleResponse);
    });
  });

  describe('Token Validation Edge Cases', () => {
    it('should handle malformed token', (done) => {
      const client = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: 'malformed.token.here'
        },
        autoConnect: false
      });

      client.on('connect_error', (error) => {
        expect(error.message).toBe('Invalid or expired token');
        expect(error.data?.code).toBe('AUTH_TOKEN_INVALID');
        client.close();
        done();
      });

      client.connect();
    });

    it('should handle expired token', (done) => {
      const testUser = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
      // Mock an expired token by returning null from verifyAccessToken
      const { verifyAccessToken } = require('../auth/tokens');
      verifyAccessToken.mockReturnValueOnce(null);
      
      
      const client = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: 'expired-token'
        },
        autoConnect: false
      });

      client.on('connect_error', (error) => {
        expect(error.message).toBe('Invalid or expired token');
        expect(error.data?.code).toBe('AUTH_TOKEN_INVALID');
        client.close();
        done();
      });

      client.connect();
    });

    it('should handle empty token string', (done) => {
      const client = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: ''
        },
        autoConnect: false
      });

      client.on('connect_error', (error) => {
        expect(error.message).toBe('Authentication token required');
        expect(error.data?.code).toBe('AUTH_TOKEN_REQUIRED');
        client.close();
        done();
      });

      client.connect();
    });

    it('should handle token with Bearer prefix in auth field', (done) => {
      const testUser = { id: 3, email: 'bearer@example.com', role: 'user', permissions: [] };
      const validToken = signAccessToken(testUser);

      const client = Client(`http://localhost:${serverPort}`, {
        auth: {
          token: `Bearer ${validToken}`
        },
        autoConnect: false
      });

      client.on('authenticated', (data) => {
        expect(data.user).toEqual(testUser);
        client.close();
        done();
      });

      client.on('connect_error', (error) => {
        client.close();
        done(error);
      });

      client.connect();
    });
  });

  describe('Connection Lifecycle', () => {
    it('should handle multiple connection attempts', (done) => {
      const testUser = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
      const validToken = signAccessToken(testUser);

      let connectionCount = 0;
      const expectedConnections = 3;

      const connectClient = () => {
        const client = Client(`http://localhost:${serverPort}`, {
          auth: {
            token: validToken
          }
        });

        client.on('authenticated', () => {
          connectionCount++;
          client.close();
          
          if (connectionCount === expectedConnections) {
            done();
          } else if (connectionCount < expectedConnections) {
            setTimeout(connectClient, 50);
          }
        });

        client.on('connect_error', (error) => {
          client.close();
          done(error);
        });
      };

      connectClient();
    });

    it('should handle rapid connect/disconnect cycles', (done) => {
      const testUser = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
      const validToken = signAccessToken(testUser);

      let cycleCount = 0;
      const maxCycles = 5;

      const cycle = () => {
        const client = Client(`http://localhost:${serverPort}`, {
          auth: {
            token: validToken
          }
        });

        client.on('authenticated', () => {
          cycleCount++;
          client.close();
          
          if (cycleCount < maxCycles) {
            setTimeout(cycle, 10);
          } else {
            done();
          }
        });

        client.on('connect_error', (error) => {
          client.close();
          done(error);
        });
      };

      cycle();
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle network errors gracefully', (done) => {
      const testUser = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
      const validToken = signAccessToken(testUser);

      // Connect to a non-existent port
      const client = Client('http://localhost:99999', {
        auth: {
          token: validToken
        },
        autoConnect: false,
        timeout: 1000
      });

      client.on('connect_error', (error) => {
        expect(error).toBeDefined();
        client.close();
        done();
      });

      client.on('connect', () => {
        client.close();
        done(new Error('Should not connect to non-existent server'));
      });

      client.connect();
    });
  });
});