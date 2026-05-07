// Shared types for messaging system
export interface MessageAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  timestamp: string;
  attachments?: MessageAttachment[];
  reactions?: MessageReaction[];
  deliveryStatus?: 'sent' | 'delivered' | 'read';
  replyTo?: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  userReacted: boolean;
}

export interface Contact {
  id: string; // Firebase document ID
  name: string;
  email?: string;
  phone?: string;
  role: string;
  type?: string;
  company?: string;
  trade?: string;
  associatedProjects?: string[];
  notes?: string;
  avatarUrl?: string;
  rating?: number;
  tags?: string[];
  isActive?: boolean;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}