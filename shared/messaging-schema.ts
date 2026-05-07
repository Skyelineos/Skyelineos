// Enhanced messaging schema types for the construction management app

export interface MessageThread {
  id: number;
  projectId: number;
  chatType: 'general' | 'design' | 'schedule' | 'finance' | 'change_order' | 'issue';
  participants: string[]; // Array of user IDs or contact IDs
  title: string;
  lastMessageAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
  tags?: string[];
}

export interface Message {
  id: number;
  threadId: number;
  senderId: string;
  senderName: string;
  senderRole: 'admin' | 'project_manager' | 'client' | 'subcontractor' | 'designer' | 'accountant';
  content: string;
  messageType: 'text' | 'file' | 'image' | 'system' | 'announcement';
  attachments: MessageAttachment[];
  readBy: string[]; // Array of user IDs who have read this message
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  replyToId?: number;
  reactions?: MessageReaction[];
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface MessageReaction {
  id: string;
  userId: string;
  userName: string;
  emoji: string;
  createdAt: string;
}

export interface ThreadWithDetails extends MessageThread {
  lastMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  };
  unreadCount: number;
  participantDetails: ThreadParticipant[];
}

export interface ThreadParticipant {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  isOnline?: boolean;
  lastSeen?: string;
  email?: string;
  company?: string;
}

export interface MessageWithDetails extends Message {
  senderAvatar?: string;
  isOwn: boolean;
  deliveryStatus?: 'sent' | 'delivered' | 'read';
  replyTo?: {
    id: number;
    content: string;
    senderName: string;
  };
}

export interface CreateThreadData {
  projectId: number;
  title: string;
  chatType: MessageThread['chatType'];
  participants: string[];
  initialMessage?: string;
  priority?: MessageThread['priority'];
  category?: string;
  tags?: string[];
}

export interface CreateMessageData {
  threadId: number;
  content: string;
  messageType?: Message['messageType'];
  attachments?: Omit<MessageAttachment, 'id' | 'uploadedAt'>[];
  replyToId?: number;
}

export interface MessageFilter {
  chatType?: MessageThread['chatType'];
  priority?: MessageThread['priority'];
  searchTerm?: string;
  unreadOnly?: boolean;
  participantId?: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

export interface ChatContext {
  type: 'designer_portal' | 'client_portal' | 'subcontractor_portal' | 'admin_dashboard' | 'project_specific';
  allowedParticipants?: string[]; // Role-based filtering
  defaultChatType?: MessageThread['chatType'];
  permissions?: {
    canCreateThread: boolean;
    canInviteParticipants: boolean;
    canDeleteMessages: boolean;
    canEditMessages: boolean;
    canUploadFiles: boolean;
    maxFileSize: number;
  };
}

export interface UnreadMessageSummary {
  totalCount: number;
  byProject: Array<{
    projectId: number;
    projectName: string;
    count: number;
  }>;
  byType: Array<{
    chatType: MessageThread['chatType'];
    count: number;
  }>;
  urgent: number;
}

export interface MessageNotification {
  id: string;
  messageId: number;
  threadId: number;
  recipientId: string;
  type: 'new_message' | 'thread_mention' | 'urgent_message' | 'file_shared';
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  projectId: number;
  senderName: string;
}

// Portal-specific interfaces
export interface PortalMessagingProps {
  currentUser: ThreadParticipant;
  projectFilter?: number[];
  chatContext: ChatContext;
  onNotificationUpdate?: (count: number) => void;
}

export interface ClientPortalMessaging extends PortalMessagingProps {
  // Client-specific features
  allowedChatTypes: ['general', 'design', 'schedule', 'change_order'];
  canViewFinancial: boolean;
}

export interface SubcontractorPortalMessaging extends PortalMessagingProps {
  // Subcontractor-specific features
  allowedChatTypes: ['general', 'schedule', 'issue'];
  assignedProjects: number[];
  tradeSpecialty: string;
}

export interface DesignerPortalMessaging extends PortalMessagingProps {
  // Designer-specific features
  allowedChatTypes: ['general', 'design'];
  designProjects: number[];
  clientCollaboration: boolean;
}