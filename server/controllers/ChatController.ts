import { Request, Response } from 'express';
import { db } from '../db';
import { threads, messages, threadParticipants, users, projects } from '../../shared/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { insertThreadSchema, insertMessageSchema, insertThreadParticipantSchema } from '../../shared/schema';
import { z } from 'zod';
import { Server as SocketIOServer } from 'socket.io';

export class ChatController {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  /**
   * GET /api/projects/:projectId/threads
   * Get all threads for a specific project
   */
  async getProjectThreads(req: Request, res: Response) {
    try {
      const projectId = parseInt(req.params.projectId);
      
      if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }

      const projectThreads = await db
        .select({
          id: threads.id,
          title: threads.title,
          description: threads.description,
          createdAt: threads.createdAt,
          updatedAt: threads.updatedAt,
          isArchived: threads.isArchived,
          creator: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          },
          participantCount: 0, // Will be calculated separately
          lastMessage: {
            id: 0,
            content: '',
            createdAt: new Date(),
            sender: {
              firstName: '',
              lastName: '',
            },
          },
        })
        .from(threads)
        .leftJoin(users, eq(threads.createdBy, users.id))
        .where(and(
          eq(threads.projectId, projectId),
          eq(threads.isArchived, false)
        ))
        .orderBy(desc(threads.updatedAt));

      // Get participant counts and last messages for each thread
      const enrichedThreads = await Promise.all(
        projectThreads.map(async (thread) => {
          // Get participant count
          const participantCount = await db
            .select({ count: threadParticipants.id })
            .from(threadParticipants)
            .where(and(
              eq(threadParticipants.threadId, thread.id),
              eq(threadParticipants.isActive, true)
            ));

          // Get last message
          const lastMessage = await db
            .select({
              id: messages.id,
              content: messages.content,
              createdAt: messages.createdAt,
              sender: {
                firstName: users.firstName,
                lastName: users.lastName,
              },
            })
            .from(messages)
            .leftJoin(users, eq(messages.senderId, users.id))
            .where(eq(messages.threadId, thread.id))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          return {
            ...thread,
            participantCount: participantCount.length,
            lastMessage: lastMessage[0] || null,
          };
        })
      );

      res.json(enrichedThreads);
    } catch (error) {
      console.error('Error fetching project threads:', error);
      res.status(500).json({ error: 'Failed to fetch threads' });
    }
  }

  /**
   * GET /api/threads/:threadId/messages
   * Get all messages for a specific thread
   */
  async getThreadMessages(req: Request, res: Response) {
    try {
      const threadId = parseInt(req.params.threadId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      if (isNaN(threadId)) {
        return res.status(400).json({ error: 'Invalid thread ID' });
      }

      // Verify thread exists and user has access
      const thread = await db
        .select()
        .from(threads)
        .where(eq(threads.id, threadId))
        .limit(1);

      if (thread.length === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      // Get messages with sender information
      const threadMessages = await db
        .select({
          id: messages.id,
          content: messages.content,
          messageType: messages.messageType,
          attachments: messages.attachments,
          createdAt: messages.createdAt,
          updatedAt: messages.updatedAt,
          isEdited: messages.isEdited,
          sender: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            role: users.role,
          },
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.threadId, threadId))
        .orderBy(asc(messages.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total message count for pagination
      const totalMessages = await db
        .select({ count: messages.id })
        .from(messages)
        .where(eq(messages.threadId, threadId));

      res.json({
        messages: threadMessages,
        pagination: {
          page,
          limit,
          total: totalMessages.length,
          totalPages: Math.ceil(totalMessages.length / limit),
        },
        thread: thread[0],
      });
    } catch (error) {
      console.error('Error fetching thread messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }

  /**
   * POST /api/threads
   * Create a new thread with participants
   */
  async createThread(req: Request, res: Response) {
    try {
      const createThreadSchema = insertThreadSchema.extend({
        participantIds: z.array(z.number()).min(1, 'At least one participant is required'),
      });

      const validatedData = createThreadSchema.parse(req.body);
      const { participantIds, ...threadData } = validatedData;

      // Verify project exists
      const project = await db
        .select()
        .from(projects)
        .where(eq(projects.id, threadData.projectId))
        .limit(1);

      if (project.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Create thread
      const newThread = await db
        .insert(threads)
        .values(threadData)
        .returning();

      const createdThread = newThread[0];

      // Add participants
      const participantData = participantIds.map(userId => ({
        threadId: createdThread.id,
        userId,
        role: userId === threadData.createdBy ? 'owner' : 'participant',
      }));

      await db
        .insert(threadParticipants)
        .values(participantData);

      // Get thread with creator info
      const threadWithCreator = await db
        .select({
          id: threads.id,
          projectId: threads.projectId,
          title: threads.title,
          description: threads.description,
          createdAt: threads.createdAt,
          updatedAt: threads.updatedAt,
          isArchived: threads.isArchived,
          creator: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          },
        })
        .from(threads)
        .leftJoin(users, eq(threads.createdBy, users.id))
        .where(eq(threads.id, createdThread.id));

      res.status(201).json(threadWithCreator[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Error creating thread:', error);
      res.status(500).json({ error: 'Failed to create thread' });
    }
  }

  /**
   * POST /api/threads/:threadId/messages
   * Create a new message in a thread
   */
  async createMessage(req: Request, res: Response) {
    try {
      const threadId = parseInt(req.params.threadId);
      
      if (isNaN(threadId)) {
        return res.status(400).json({ error: 'Invalid thread ID' });
      }

      const messageData = insertMessageSchema.parse({
        ...req.body,
        threadId,
      });

      // Verify thread exists and user is a participant
      const thread = await db
        .select()
        .from(threads)
        .where(eq(threads.id, threadId))
        .limit(1);

      if (thread.length === 0) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const participant = await db
        .select()
        .from(threadParticipants)
        .where(and(
          eq(threadParticipants.threadId, threadId),
          eq(threadParticipants.userId, messageData.senderId),
          eq(threadParticipants.isActive, true)
        ))
        .limit(1);

      if (participant.length === 0) {
        return res.status(403).json({ error: 'User is not a participant in this thread' });
      }

      // Create message
      const newMessage = await db
        .insert(messages)
        .values(messageData)
        .returning();

      // Update thread's updatedAt timestamp
      await db
        .update(threads)
        .set({ updatedAt: new Date() })
        .where(eq(threads.id, threadId));

      // Get message with sender info
      const messageWithSender = await db
        .select({
          id: messages.id,
          threadId: messages.threadId,
          content: messages.content,
          messageType: messages.messageType,
          attachments: messages.attachments,
          createdAt: messages.createdAt,
          updatedAt: messages.updatedAt,
          isEdited: messages.isEdited,
          sender: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            role: users.role,
          },
        })
        .from(messages)
        .leftJoin(users, eq(messages.senderId, users.id))
        .where(eq(messages.id, newMessage[0].id));

      const createdMessage = messageWithSender[0];

      // Emit Socket.IO event for real-time updates
      this.io.emit(`thread:${threadId}:newMessage`, {
        message: createdMessage,
        threadId,
        timestamp: new Date().toISOString(),
      });

      // Development logging removed

      res.status(201).json(createdMessage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      console.error('Error creating message:', error);
      res.status(500).json({ error: 'Failed to create message' });
    }
  }

  /**
   * PUT /api/threads/:threadId/participants/:userId/read
   * Update user's last read timestamp for a thread
   */
  async updateLastRead(req: Request, res: Response) {
    try {
      const threadId = parseInt(req.params.threadId);
      const userId = parseInt(req.params.userId);

      if (isNaN(threadId) || isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid thread ID or user ID' });
      }

      await db
        .update(threadParticipants)
        .set({ lastReadAt: new Date() })
        .where(and(
          eq(threadParticipants.threadId, threadId),
          eq(threadParticipants.userId, userId)
        ));

      res.json({ message: 'Last read timestamp updated' });
    } catch (error) {
      console.error('Error updating last read:', error);
      res.status(500).json({ error: 'Failed to update last read timestamp' });
    }
  }

  /**
   * GET /api/threads/:threadId/participants
   * Get all participants for a thread
   */
  async getThreadParticipants(req: Request, res: Response) {
    try {
      const threadId = parseInt(req.params.threadId);

      if (isNaN(threadId)) {
        return res.status(400).json({ error: 'Invalid thread ID' });
      }

      const participants = await db
        .select({
          id: threadParticipants.id,
          role: threadParticipants.role,
          joinedAt: threadParticipants.joinedAt,
          lastReadAt: threadParticipants.lastReadAt,
          isActive: threadParticipants.isActive,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            role: users.role,
          },
        })
        .from(threadParticipants)
        .leftJoin(users, eq(threadParticipants.userId, users.id))
        .where(and(
          eq(threadParticipants.threadId, threadId),
          eq(threadParticipants.isActive, true)
        ))
        .orderBy(asc(threadParticipants.joinedAt));

      res.json(participants);
    } catch (error) {
      console.error('Error fetching thread participants:', error);
      res.status(500).json({ error: 'Failed to fetch participants' });
    }
  }
}