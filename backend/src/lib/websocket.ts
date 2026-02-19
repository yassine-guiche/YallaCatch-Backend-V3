import { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { typedLogger } from '@/lib/typed-logger';
import { verifyToken } from '@/lib/jwt';

// Socket.IO instance reference (set from server.ts)
let socketIO: any = null;

export function setSocketIO(io: any) {
  socketIO = io;
  typedLogger.info('Socket.IO instance registered in websocket module');
}

interface WebSocketClient {
  id: string;
  userId: string;
  isAdmin: boolean;
  ws: any;
  subscriptions: Set<string>;
  connectedAt: Date;
}

class WebSocketManager {
  private clients: Map<string, WebSocketClient> = new Map();
  private rooms: Map<string, Set<string>> = new Map(); // room -> clientIds
  private eventQueue: any[] = [];
  private maxQueueSize = 1000;

  addClient(client: WebSocketClient) {
    this.clients.set(client.id, client);
    typedLogger.info('WebSocket client connected', { userId: client.userId, clientId: client.id });
  }

  removeClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (client) {
      // Remove from all rooms
      this.rooms.forEach(members => members.delete(clientId));
      this.clients.delete(clientId);
      typedLogger.info('WebSocket client disconnected', { userId: client.userId, clientId });
    }
  }

  getClient(clientId: string): WebSocketClient | undefined {
    return this.clients.get(clientId);
  }

  getClientsByUserId(userId: string): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(c => c.userId === userId);
  }

  getAdminClients(): WebSocketClient[] {
    return Array.from(this.clients.values()).filter(c => c.isAdmin);
  }

  joinRoom(clientId: string, room: string) {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(room);
    }
  }

  leaveRoom(clientId: string, room: string) {
    const roomMembers = this.rooms.get(room);
    if (roomMembers) {
      roomMembers.delete(clientId);
    }
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.delete(room);
    }
  }

  broadcastToRoom(room: string, message: any) {
    const roomMembers = this.rooms.get(room);
    if (!roomMembers) return;

    roomMembers.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client && !client.ws.destroyed) {
        try {
          client.ws.write(JSON.stringify(message));
        } catch (error) {
          typedLogger.error('Failed to write to client', { clientId, error });
        }
      }
    });
  }

  broadcastToAdmins(message: any) {
    this.getAdminClients().forEach(client => {
      if (!client.ws.destroyed) {
        try {
          client.ws.write(JSON.stringify(message));
        } catch (error) {
          typedLogger.error('Failed to write to admin client', { error });
        }
      }
    });
  }

  broadcastToUser(userId: string, message: any) {
    this.getClientsByUserId(userId).forEach(client => {
      if (!client.ws.destroyed) {
        try {
          client.ws.write(JSON.stringify(message));
        } catch (error) {
          typedLogger.error('Failed to write to user client', { userId, error });
        }
      }
    });
  }

  broadcastToAll(message: any) {
    this.clients.forEach(client => {
      if (!client.ws.destroyed) {
        try {
          client.ws.write(JSON.stringify(message));
        } catch (error) {
          typedLogger.error('Failed to write to client', { error });
        }
      }
    });
  }

  queueEvent(event: any) {
    if (this.eventQueue.length < this.maxQueueSize) {
      this.eventQueue.push(event);
    } else {
      // Remove oldest event if queue is full
      this.eventQueue.shift();
      this.eventQueue.push(event);
    }
  }

  getEventHistory(limit: number = 50): any[] {
    return this.eventQueue.slice(-limit);
  }

  getStats() {
    return {
      totalClients: this.clients.size,
      adminClients: this.getAdminClients().length,
      rooms: this.rooms.size,
      queueSize: this.eventQueue.length
    };
  }
}

export const wsManager = new WebSocketManager();

export async function setupWebSocket(fastify: FastifyInstance) {
  await fastify.register(fastifyWebsocket);

  fastify.get('/ws', { websocket: true }, async (socket, request) => {
    try {
      // Authenticate user
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        socket.write(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
        socket.end();
        return;
      }

      // Decode token to get user info
      let userId = 'unknown';
      let isAdmin = false;

      try {
        const verificationResult = await verifyToken(token);
        if (verificationResult.valid && verificationResult.decoded) {
          const payload = verificationResult.decoded;
          userId = payload.sub || 'unknown';
          isAdmin = ['admin', 'super_admin', 'moderator'].includes(payload.role);
        } else {
          socket.write(JSON.stringify({
            type: 'error',
            message: verificationResult.error || 'Invalid or expired token'
          }));
          socket.end();
          return;
        }
      } catch (e) {
        typedLogger.warn('WebSocket authentication failed', { error: (e as any).message });
        socket.write(JSON.stringify({ type: 'error', message: 'Authentication error' }));
        socket.end();
        return;
      }

      const clientId = `${userId}-${Date.now()}-${Math.random()}`;
      const client: WebSocketClient = {
        id: clientId,
        userId,
        isAdmin,
        ws: socket,
        subscriptions: new Set(),
        connectedAt: new Date()
      };

      wsManager.addClient(client);

      // Send welcome message
      socket.write(JSON.stringify({
        type: 'connected',
        clientId,
        userId,
        isAdmin,
        timestamp: new Date().toISOString()
      }));

      // Handle incoming messages
      socket.on('data', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          handleWebSocketMessage(client, message);
        } catch (error) {
          typedLogger.error('WebSocket message parse error', { error });
        }
      });

      // Handle disconnection
      socket.on('end', () => {
        wsManager.removeClient(clientId);
      });

      // Handle errors
      socket.on('error', (error) => {
        typedLogger.error('WebSocket error', { clientId, error });
        wsManager.removeClient(clientId);
      });
    } catch (error) {
      typedLogger.error('WebSocket setup error', { error });
      socket.end();
    }
  });

  typedLogger.info('WebSocket endpoint registered at /ws');
}

function handleWebSocketMessage(client: WebSocketClient, message: any) {
  const { type, data, room } = message;

  switch (type) {
    case 'subscribe':
      wsManager.joinRoom(client.id, room || 'general');
      client.ws.write(JSON.stringify({ type: 'subscribed', room }));
      break;

    case 'unsubscribe':
      wsManager.leaveRoom(client.id, room || 'general');
      client.ws.write(JSON.stringify({ type: 'unsubscribed', room }));
      break;

    case 'get-history': {
      const limit = data?.limit || 50;
      const history = wsManager.getEventHistory(limit);
      client.ws.write(JSON.stringify({ type: 'history', data: history }));
      break;
    }

    case 'get-stats': {
      if (client.isAdmin) {
        const stats = wsManager.getStats();
        client.ws.write(JSON.stringify({ type: 'stats', data: stats }));
      }
      break;
    }

    case 'ping':
      client.ws.write(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;

    default:
      typedLogger.warn('Unknown WebSocket message type', { type });
  }
}

export function broadcastGameEvent(event: any) {
  const message = {
    type: 'game-event',
    data: event,
    timestamp: new Date().toISOString()
  };
  wsManager.queueEvent(event);
  wsManager.broadcastToRoom('game-events', message);

  // Also emit to Socket.IO if available
  if (socketIO) {
    socketIO.to('game').emit('game_event', event);
  }
}

export function broadcastAdminEvent(event: any) {
  const message = {
    type: 'admin-event',
    data: event,
    timestamp: new Date().toISOString()
  };
  wsManager.queueEvent(event);
  wsManager.broadcastToAdmins(message);

  // Also emit to Socket.IO rooms
  if (socketIO) {
    const eventType = event.type || 'admin_update';

    // Send to all admin rooms
    socketIO.to('admin').emit(eventType, event);
    socketIO.to('dashboard').emit(eventType, event);
    socketIO.to('dashboard').emit('stats_update', { stats: event.stats || event });

    // Send marketplace events to marketplace room
    if (eventType.includes('marketplace')) {
      socketIO.to('marketplace').emit(eventType, event);
      socketIO.to('rewards').emit(eventType, event);
    }

    // Send reward events to rewards room
    if (eventType.includes('reward') || eventType.includes('redemption')) {
      socketIO.to('rewards').emit(eventType, event);
      socketIO.to('marketplace').emit(eventType, event);
    }

    typedLogger.debug('Socket.IO admin event emitted', { eventType, rooms: ['admin', 'dashboard', 'marketplace', 'rewards'] });
  }
}

export function broadcastUserNotification(userId: string, notification: any) {
  const message = {
    type: 'notification',
    data: notification,
    timestamp: new Date().toISOString()
  };
  wsManager.broadcastToUser(userId, message);
}

export function broadcastRoomEvent(room: string, event: any) {
  const message = {
    type: 'room-event',
    data: event,
    timestamp: new Date().toISOString()
  };
  wsManager.queueEvent(event);
  wsManager.broadcastToRoom(room, message);
}
