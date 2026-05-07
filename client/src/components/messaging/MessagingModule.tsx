import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, Send, Users, Plus, Archive, Search, Paperclip, MoreVertical, Reply, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiRequest } from '@/lib/queryClient';
import { FileUploadDialog } from './FileUploadDialog';
import { ThreadSettings } from './ThreadSettings';
import { MobileMessagingModule } from './MobileMessagingModule';
import { cn } from '@/lib/utils';

interface Thread {
  id: number;
  projectId: number;
  title: string;
  description?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  creator?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  messages?: Message[];
  participants?: ThreadParticipant[];
  unreadCount?: number;
}

interface Message {
  id: number;
  threadId: number;
  senderId: number;
  content: string;
  messageType: string;
  attachments?: any[];
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  sender?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

interface ThreadParticipant {
  id: number;
  threadId: number;
  userId: number;
  role: string;
  joinedAt: string;
  lastReadAt?: string;
  isActive: boolean;
  user?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface MessagingModuleProps {
  projectId: number;
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
}

export function MessagingModule({ projectId, currentUser }: MessagingModuleProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const webSocket = useWebSocket();
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewThreadDialog, setShowNewThreadDialog] = useState(false);
  const [newThreadData, setNewThreadData] = useState({
    title: '',
    description: '',
    participants: [] as number[]
  });
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showThreadSettings, setShowThreadSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if mobile viewport
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Render mobile version on small screens
  if (isMobile) {
    return (
      <MobileMessagingModule 
        projectId={projectId} 
        currentUser={currentUser}
      />
    );
  }

  // Fetch threads
  const { data: threadsData, isLoading: threadsLoading } = useQuery({
    queryKey: [`/api/messaging/threads/project/${projectId}`],
    staleTime: 30000
  });

  // Ensure threads is always an array
  const threads = Array.isArray(threadsData) ? threadsData as Thread[] : [];

  // Fetch messages for selected thread
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: [`/api/messaging/threads/${selectedThread?.id}/messages`],
    enabled: !!selectedThread,
    staleTime: 10000
  });

  // Ensure messages is always an array
  const messages = Array.isArray(messagesData) ? messagesData as Message[] : [];

  // Fetch project contacts for thread participants
  const { data: contacts = [] } = useQuery({
    queryKey: [`/api/contacts/project/${projectId}`],
    staleTime: 60000
  });

  // Create new thread mutation
  const createThreadMutation = useMutation({
    mutationFn: (threadData: typeof newThreadData) => 
      apiRequest(`/api/messaging/threads`, {
        method: 'POST',
        body: JSON.stringify({
          ...threadData,
          projectId,
          createdBy: parseInt(currentUser.id)
        })
      }),
    onSuccess: (newThread) => {
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
      setSelectedThread(newThread);
      setShowNewThreadDialog(false);
      setNewThreadData({ title: '', description: '', participants: [] });
    }
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (messageData: { threadId: number; content: string; attachments?: any[] }) =>
      apiRequest(`/api/messaging/threads/${messageData.threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: messageData.content,
          senderId: parseInt(currentUser.id),
          messageType: messageData.attachments ? 'file' : 'text',
          attachments: messageData.attachments
        })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/${selectedThread?.id}/messages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
      setNewMessage('');
    }
  });

  // Mark thread as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (threadId: number) =>
      apiRequest(`/api/messaging/threads/${threadId}/read`, {
        method: 'POST',
        body: JSON.stringify({
          userId: parseInt(currentUser.id)
        })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
    }
  });

  // WebSocket message handling
  useEffect(() => {
    if (webSocket.lastMessage && webSocket.lastMessage.type === 'message') {
      const messageData = webSocket.lastMessage.payload;
      if (messageData?.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
        if (selectedThread && messageData?.threadId === selectedThread.id) {
          queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/${selectedThread.id}/messages`] });
        }
      }
    }
  }, [webSocket.lastMessage, projectId, selectedThread?.id, queryClient]);

  // Render mobile version on small screens
  if (isMobile) {
    return (
      <MobileMessagingModule 
        projectId={projectId} 
        currentUser={currentUser}
      />
    );
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark thread as read when selected
  useEffect(() => {
    if (selectedThread && selectedThread.unreadCount && selectedThread.unreadCount > 0) {
      markAsReadMutation.mutate(selectedThread.id);
    }
  }, [selectedThread]);

  const handleSendMessage = () => {
    if (!selectedThread || !newMessage.trim()) return;
    sendMessageMutation.mutate({
      threadId: selectedThread.id,
      content: newMessage.trim()
    });
  };

  const handleCreateThread = () => {
    if (!newThreadData.title.trim()) return;
    createThreadMutation.mutate(newThreadData);
  };

  const filteredThreads = threads.filter((thread: Thread) =>
    thread.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    thread.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFilesUploaded = (files: any[]) => {
    // Add files as messages or attachments
    files.forEach(file => {
      if (selectedThread) {
        sendMessageMutation.mutate({
          threadId: selectedThread.id,
          content: `📎 ${file.name}`,
          attachments: [file]
        });
      }
    });
  };

  const getParticipantNames = (thread: Thread) => {
    if (!thread.participants) return '';
    return thread.participants
      .filter(p => p.isActive)
      .map(p => `${p.user?.firstName} ${p.user?.lastName}`.trim())
      .join(', ');
  };

  return (
    <div className="h-[calc(100vh-200px)] flex border rounded-lg overflow-hidden">
      {/* Thread List Sidebar */}
      <div className="w-1/3 border-r flex flex-col">
        {/* Header */}
        <div className="p-4 border-b bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Conversations</h2>
            <Dialog open={showNewThreadDialog} onOpenChange={setShowNewThreadDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90">
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Conversation</DialogTitle>
                  <DialogDescription>
                    Start a new conversation with project team members
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      placeholder="Conversation title"
                      value={newThreadData.title}
                      onChange={(e) => setNewThreadData({ ...newThreadData, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description (Optional)</label>
                    <Textarea
                      placeholder="Conversation description"
                      value={newThreadData.description}
                      onChange={(e) => setNewThreadData({ ...newThreadData, description: e.target.value })}
                    />
                  </div>
                  <Button 
                    onClick={handleCreateThread} 
                    className="w-full"
                    disabled={!newThreadData.title.trim() || createThreadMutation.isPending}
                  >
                    {createThreadMutation.isPending ? 'Creating...' : 'Create Conversation'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Thread List */}
        <ScrollArea className="flex-1">
          {threadsLoading ? (
            <div className="p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="mb-3 p-3 rounded animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {searchTerm ? 'No conversations found' : 'No conversations yet'}
            </div>
          ) : (
            <div className="p-2">
              {filteredThreads.map((thread: Thread) => (
                <div
                  key={thread.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors mb-1 ${
                    selectedThread?.id === thread.id ? 'bg-accent' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedThread(thread)}
                >
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-medium text-sm truncate">{thread.title}</h3>
                    {thread.unreadCount && thread.unreadCount > 0 && (
                      <Badge variant="destructive" className="text-xs ml-2">
                        {thread.unreadCount}
                      </Badge>
                    )}
                  </div>
                  {thread.description && (
                    <p className="text-xs text-muted-foreground truncate mb-1">
                      {thread.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{getParticipantNames(thread)}</span>
                    <span>
                      {(() => {
                        try {
                          if (!thread.updatedAt) return 'Just now';
                          const date = new Date(thread.updatedAt);
                          if (isNaN(date.getTime())) return 'Just now';
                          return formatDistanceToNow(date, { addSuffix: true });
                        } catch {
                          return 'Just now';
                        }
                      })()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Message Area */}
      <div className="flex-1 flex flex-col">
        {selectedThread ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{selectedThread.title}</h2>
                  {selectedThread.description && (
                    <p className="text-sm text-muted-foreground">{selectedThread.description}</p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowFileUpload(true)}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setShowThreadSettings(true)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start space-x-3 animate-pulse">
                      <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message: Message, index: number) => {
                    const isOwnMessage = message.senderId === parseInt(currentUser.id);
                    const showAvatar = index === 0 || messages[index - 1].senderId !== message.senderId;
                    
                    return (
                      <div key={message.id} className={`flex items-start space-x-3 ${isOwnMessage ? 'flex-row-reverse space-x-reverse' : ''}`}>
                        {showAvatar && (
                          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm font-medium">
                            {message.sender ? `${message.sender.firstName[0]}${message.sender.lastName[0]}` : 'U'}
                          </div>
                        )}
                        {!showAvatar && <div className="w-8"></div>}
                        
                        <div className={`flex-1 max-w-[70%] ${isOwnMessage ? 'text-right' : ''}`}>
                          {showAvatar && (
                            <div className={`text-sm font-medium mb-1 ${isOwnMessage ? 'text-right' : ''}`}>
                              {message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : 'Unknown User'}
                            </div>
                          )}
                          <div className={`rounded-lg px-3 py-2 ${
                            isOwnMessage 
                              ? 'bg-[var(--accent-color)] text-white ml-auto' 
                              : 'bg-muted'
                          }`}>
                            <p className="text-sm">{message.content}</p>
                          </div>
                          <div className={`text-xs text-muted-foreground mt-1 ${isOwnMessage ? 'text-right' : ''}`}>
                            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                            {message.isEdited && <span className="ml-1">(edited)</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t">
              <div className="flex items-end space-x-2">
                <Textarea
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="min-h-[44px] max-h-32 resize-none"
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendMessageMutation.isPending}
                  className="bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Select a conversation</h3>
              <p className="text-muted-foreground">Choose a conversation from the sidebar to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* File Upload Dialog */}
      <FileUploadDialog
        open={showFileUpload}
        onOpenChange={setShowFileUpload}
        onFilesUploaded={handleFilesUploaded}
        maxFiles={5}
        maxFileSize={10}
      />

      {/* Thread Settings Dialog */}
      {selectedThread && (
        <ThreadSettings
          open={showThreadSettings}
          onOpenChange={setShowThreadSettings}
          thread={selectedThread}
          projectId={projectId}
          currentUserId={currentUser.id}
          onThreadUpdated={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
            queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/${selectedThread.id}/messages`] });
          }}
          onThreadDeleted={() => {
            setSelectedThread(null);
            queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
          }}
        />
      )}
    </div>
  );
}