import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  MessageCircle, 
  Send, 
  Users, 
  Plus, 
  Archive, 
  Search, 
  Paperclip, 
  MoreVertical, 
  Reply, 
  Settings,
  ArrowLeft,
  Menu,
  X,
  ChevronLeft,
  Phone,
  Video,
  Info
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { apiRequest } from '@/lib/queryClient';
import { FileUploadDialog } from './FileUploadDialog';
import { ThreadSettings } from './ThreadSettings';
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

interface MobileMessagingModuleProps {
  projectId: number;
  currentUser: {
    id: string;
    name: string;
    role: string;
  };
}

export function MobileMessagingModule({ projectId, currentUser }: MobileMessagingModuleProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const webSocket = useWebSocket();
  
  // Mobile-specific state
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [showThreadList, setShowThreadList] = useState(true);
  const [showThreadInfo, setShowThreadInfo] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadDescription, setNewThreadDescription] = useState('');
  const [showNewThreadDialog, setShowNewThreadDialog] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showThreadSettings, setShowThreadSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom for new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch threads for the project
  const { data: threads = [], isLoading: threadsLoading, refetch: refetchThreads } = useQuery({
    queryKey: [`/api/messaging/threads/project/${projectId}`],
    queryFn: () => apiRequest(`/api/messaging/threads/project/${projectId}`, 'GET'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch messages for selected thread
  const { data: messages = [], isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: [`/api/messaging/threads/${selectedThread?.id}/messages`],
    queryFn: () => selectedThread ? apiRequest(`/api/messaging/threads/${selectedThread.id}/messages`, 'GET') : Promise.resolve([]),
    enabled: !!selectedThread,
    refetchInterval: 5000, // Refresh every 5 seconds for real-time feel
  });

  // WebSocket for real-time updates
  useEffect(() => {
    if (!webSocket || !selectedThread) return;

    const handleNewMessage = (message: Message) => {
      if (message.threadId === selectedThread.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/${selectedThread.id}/messages`] });
        setTimeout(scrollToBottom, 100);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/messaging/threads/project/${projectId}`] });
    };

    webSocket.on('new_message', handleNewMessage);
    webSocket.on('message_updated', handleNewMessage);

    return () => {
      webSocket.off('new_message', handleNewMessage);
      webSocket.off('message_updated', handleNewMessage);
    };
  }, [webSocket, selectedThread, queryClient, projectId]);

  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: (messageData: { content: string; threadId: number; attachments?: any[] }) =>
      apiRequest('/api/messaging/messages', 'POST', messageData),
    onSuccess: () => {
      setNewMessage('');
      setIsTyping(false);
      refetchMessages();
      refetchThreads();
      setTimeout(scrollToBottom, 100);
    },
  });

  // Create thread mutation
  const createThreadMutation = useMutation({
    mutationFn: (threadData: { title: string; description?: string; projectId: number }) =>
      apiRequest('/api/messaging/threads', 'POST', threadData),
    onSuccess: (newThread) => {
      setShowNewThreadDialog(false);
      setNewThreadTitle('');
      setNewThreadDescription('');
      refetchThreads();
      setSelectedThread(newThread);
      setShowThreadList(false);
    },
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedThread) return;

    sendMessageMutation.mutate({
      content: newMessage.trim(),
      threadId: selectedThread.id,
    });
  };

  const handleThreadSelect = (thread: Thread) => {
    setSelectedThread(thread);
    setShowThreadList(false);
    setShowThreadInfo(false);
  };

  const handleBackToThreads = () => {
    setSelectedThread(null);
    setShowThreadList(true);
    setShowThreadInfo(false);
  };

  const handleCreateThread = () => {
    if (!newThreadTitle.trim()) return;

    createThreadMutation.mutate({
      title: newThreadTitle.trim(),
      description: newThreadDescription.trim() || undefined,
      projectId,
    });
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Yesterday';
    } else {
      return format(date, 'MMM d');
    }
  };

  const getMessageSenderName = (message: Message) => {
    if (message.sender) {
      return `${message.sender.firstName} ${message.sender.lastName}`.trim();
    }
    return 'Unknown User';
  };

  const getThreadPreview = (thread: Thread) => {
    const lastMessage = thread.messages?.[thread.messages.length - 1];
    if (lastMessage) {
      return lastMessage.content.length > 50
        ? `${lastMessage.content.substring(0, 50)}...`
        : lastMessage.content;
    }
    return 'No messages yet';
  };

  const getThreadLastActivity = (thread: Thread) => {
    const lastMessage = thread.messages?.[thread.messages.length - 1];
    if (lastMessage) {
      return formatDistanceToNow(new Date(lastMessage.createdAt), { addSuffix: true });
    }
    return formatDistanceToNow(new Date(thread.createdAt), { addSuffix: true });
  };

  const filteredThreads = threads.filter((thread: Thread) =>
    searchQuery === '' ||
    thread.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Mobile thread list view
  const ThreadListView = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Mobile header */}
      <div className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6 text-blue-600" />
          <h1 className="text-lg font-semibold">Messages</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className="p-2"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNewThreadDialog(true)}
            className="p-2"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="p-4 border-b bg-gray-50">
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
      )}

      {/* Thread list */}
      <ScrollArea className="flex-1">
        <div className="divide-y">
          {threadsLoading ? (
            <div className="p-8 text-center text-gray-500">
              Loading conversations...
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
              {!searchQuery && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setShowNewThreadDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Start conversation
                </Button>
              )}
            </div>
          ) : (
            filteredThreads.map((thread: Thread) => (
              <div
                key={thread.id}
                className="p-4 hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                onClick={() => handleThreadSelect(thread)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-gray-900 truncate">{thread.title}</h3>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                        {getThreadLastActivity(thread)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {getThreadPreview(thread)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">
                          {thread.participants?.length || 0} participants
                        </span>
                      </div>
                      {thread.unreadCount && thread.unreadCount > 0 && (
                        <Badge variant="default" className="bg-blue-600 text-white text-xs px-2 py-1">
                          {thread.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  // Mobile conversation view
  const ConversationView = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Mobile conversation header */}
      <div className="flex items-center justify-between p-3 border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToThreads}
            className="p-2 flex-shrink-0 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 truncate text-base">{selectedThread?.title}</h2>
            <p className="text-xs text-gray-500">
              {selectedThread?.participants?.length || 0} participants • Active now
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowThreadInfo(!showThreadInfo)}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <Info className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowThreadSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Thread info panel */}
      {showThreadInfo && (
        <div className="p-4 bg-blue-50 border-b">
          <div className="text-sm">
            <p className="font-medium text-gray-900 mb-1">About this conversation</p>
            <p className="text-gray-600">{selectedThread?.description || 'No description'}</p>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span>Created {formatDistanceToNow(new Date(selectedThread?.createdAt || ''), { addSuffix: true })}</span>
              <span>•</span>
              <span>{messages.length} messages</span>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messagesLoading ? (
            <div className="text-center text-gray-500 py-8">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          ) : (
            messages.map((message: Message, index: number) => {
              const isOwn = String(message.senderId) === currentUser.id;
              const showSender = index === 0 || messages[index - 1]?.senderId !== message.senderId;
              const showTime = index === 0 || 
                new Date(message.createdAt).getTime() - new Date(messages[index - 1]?.createdAt).getTime() > 300000; // 5 minutes

              return (
                <div key={message.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] space-y-1", isOwn ? "items-end" : "items-start")}>
                    {showSender && !isOwn && (
                      <p className="text-xs font-medium text-gray-600 px-3">
                        {getMessageSenderName(message)}
                      </p>
                    )}
                    {showTime && (
                      <p className="text-xs text-gray-400 text-center w-full py-2">
                        {formatMessageTime(message.createdAt)}
                      </p>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 text-base break-words shadow-sm max-w-full",
                        isOwn
                          ? "bg-blue-600 text-white rounded-br-md ml-auto"
                          : "bg-gray-100 text-gray-900 rounded-bl-md"
                      )}
                      style={{ wordBreak: 'break-word' }}
                    >
                      {message.content}
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {message.attachments.map((attachment: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs opacity-75 p-2 bg-black/10 rounded-lg">
                              <Paperclip className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{attachment.originalName}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Message status indicators for own messages */}
                    {isOwn && (
                      <div className="flex justify-end mt-1">
                        <span className="text-xs text-gray-400">
                          {formatMessageTime(message.createdAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Message input - Enhanced mobile design */}
      <div className="p-4 border-t bg-white safe-area-inset-bottom">
        <div className="flex items-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFileUpload(true)}
            className="p-3 hover:bg-gray-100 rounded-full flex-shrink-0"
          >
            <Paperclip className="h-5 w-5 text-gray-600" />
          </Button>
          <div className="flex-1 relative">
            <Textarea
              ref={messageInputRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                setIsTyping(e.target.value.length > 0);
                
                // Auto-resize textarea
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
              placeholder="Message..."
              className="min-h-[44px] max-h-[120px] resize-none border-gray-300 rounded-3xl px-4 py-3 pr-12 text-base leading-tight focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              style={{ lineHeight: '1.25' }}
            />
            {newMessage.trim() && (
              <Button
                onClick={handleSendMessage}
                disabled={sendMessageMutation.isPending}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 rounded-full flex-shrink-0 w-8 h-8"
              >
                <Send className="h-4 w-4 text-white" />
              </Button>
            )}
          </div>
          {!newMessage.trim() && (
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="p-3 hover:bg-gray-100 rounded-full"
              >
                <Video className="h-5 w-5 text-gray-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="p-3 hover:bg-gray-100 rounded-full"
              >
                <Phone className="h-5 w-5 text-gray-600" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Typing indicator */}
        {isTyping && sendMessageMutation.isPending && (
          <div className="flex items-center gap-2 mt-2 ml-3 text-xs text-gray-500">
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce delay-100"></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce delay-200"></div>
            </div>
            <span>Sending...</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="h-[calc(100vh-theme('spacing.32'))] md:h-[600px] max-w-full">
        {showThreadList || !selectedThread ? (
          <ThreadListView />
        ) : (
          <ConversationView />
        )}
      </div>

      {/* New thread dialog */}
      <Dialog open={showNewThreadDialog} onOpenChange={setShowNewThreadDialog}>
        <DialogContent className="sm:max-w-md mx-4">
          <DialogHeader>
            <DialogTitle>Start New Conversation</DialogTitle>
            <DialogDescription>
              Create a new conversation thread for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Conversation title"
              value={newThreadTitle}
              onChange={(e) => setNewThreadTitle(e.target.value)}
            />
            <Textarea
              placeholder="Description (optional)"
              value={newThreadDescription}
              onChange={(e) => setNewThreadDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowNewThreadDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateThread}
              disabled={!newThreadTitle.trim() || createThreadMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createThreadMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* File upload dialog */}
      <FileUploadDialog
        open={showFileUpload}
        onOpenChange={setShowFileUpload}
        onFilesUploaded={(files) => {
          // Handle file upload completion
          setShowFileUpload(false);
        }}
      />

      {/* Thread settings */}
      {selectedThread && (
        <ThreadSettings
          open={showThreadSettings}
          onOpenChange={setShowThreadSettings}
          thread={selectedThread}
          projectId={projectId}
          currentUserId={currentUser.id}
          onThreadUpdated={() => {
            refetchThreads();
            refetchMessages();
          }}
          onThreadDeleted={() => {
            setSelectedThread(null);
            setShowThreadList(true);
            refetchThreads();
          }}
        />
      )}
    </>
  );
}