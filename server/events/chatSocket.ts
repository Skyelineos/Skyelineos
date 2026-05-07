import { Server } from 'socket.io';

export function initChatSocket(io: Server) {
  io.on('connection', (socket) => {
    const user = socket.data.user;
    // Development logging removed

    // Handle joining thread rooms
    socket.on('joinThread', (threadId: string) => {
      socket.join(`thread:${threadId}`);
      // Development logging removed
    });

    // Handle leaving thread rooms  
    socket.on('leaveThread', (threadId: string) => {
      socket.leave(`thread:${threadId}`);
      // Development logging removed
    });

    // Handle project room joining
    socket.on('joinProject', (projectId: string | number) => {
      socket.join(`project:${projectId}`);
      // Development logging removed
    });

    // Handle project room leaving
    socket.on('leaveProject', (projectId: string | number) => {
      socket.leave(`project:${projectId}`);
      // Development logging removed
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const user = socket.data.user;
      // Development logging removed
    });
  });

  // Add broadcast methods to the io instance
  (io as any).broadcastNewMessage = (threadId: string, message: any) => {
    io.to(`thread:${threadId}`).emit('thread:newMessage', message);
    // Development logging removed
  };

  (io as any).broadcastProjectUpdate = (projectId: string | number, updateType: string, data: any) => {
    io.to(`project:${projectId}`).emit('project:update', { 
      updateType, 
      projectId, 
      ...data 
    });
    // Development logging removed
  };

  // Success operation completed
}