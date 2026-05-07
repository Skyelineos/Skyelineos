import { useState, useRef, useEffect, useCallback } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { Send, Paperclip, Download, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useEventSocket } from '@/hooks/useEventSocket';

interface Message {
  id: number;
  content: string;
  createdAt: string;
  messageType: string;
  attachments?: Array<{
    id: number;
    filename: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    url: string;
  }>;
  sender: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
}

interface Thread {
  id: number;
  title: string;
  description?: string;
  projectId: number;
}

interface ChatThreadProps {
  threadId: string;
  threadTitle: string;
  className?: string;
}

export function ChatThread({ threadId, threadTitle, className = '' }: ChatThreadProps) {
  const [newMessage, setNewMessage] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Initialize Socket.IO for real-time updates
  const socket = useEventSocket();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Listen for real-time messages
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: Message) => {
      // Invalidate and refetch the messages query
      queryClient.invalidateQueries({ queryKey: ['chat-messages', threadId] });
      scrollToBottom();
    };

    socket.on(`thread:${threadId}:newMessage`, handleNewMessage);

    return () => {
      socket.off(`thread:${threadId}:newMessage`, handleNewMessage);
    };
  }, [socket, threadId, queryClient, scrollToBottom]);

  // Fetch messages with infinite scroll
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error
  } = useInfiniteQuery({
    queryKey: ['chat-messages', threadId],
    queryFn: async ({ pageParam }) => {
      const response = await fetch(`/api/chat/threads/${threadId}/messages?${new URLSearchParams({
        cursor: pageParam?.toString() || '',
        limit: '20'
      })}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      
      return response.json();
    },
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || null,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
    }),
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, attachments }: { content: string; attachments: File[] }) => {
      const formData = new FormData();
      formData.append('content', content);
      formData.append('threadId', threadId);
      
      attachments.forEach((file, index) => {
        formData.append(`attachments`, file);
      });

      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      return response.json();
    },
    onSuccess: () => {
      setNewMessage('');
      setAttachments([]);
      queryClient.invalidateQueries({ queryKey: ['chat-messages', threadId] });
      scrollToBottom();
    },
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() && attachments.length === 0) return;
    
    sendMessageMutation.mutate({
      content: newMessage.trim(),
      attachments
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachments(prev => [...prev, ...Array.from(event.target.files!)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatMessageDate = (date: string) => {
    const messageDate = new Date(date);
    
    if (isToday(messageDate)) {
      return format(messageDate, 'h:mm a');
    } else if (isYesterday(messageDate)) {
      return `Yesterday ${format(messageDate, 'h:mm a')}`;
    } else if (differenceInDays(new Date(), messageDate) < 7) {
      return format(messageDate, 'EEE h:mm a');
    } else {
      return format(messageDate, 'MMM d, h:mm a');
    }
  };

  const allMessages = data?.pages.flatMap(page => page.messages) || [];

  if (error) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-2">Failed to load messages</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['chat-messages', threadId] })}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-white rounded-lg border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <h3 className="font-medium text-gray-900">{threadTitle}</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {allMessages.length} messages
        </Badge>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : allMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">No messages yet</p>
              <p className="text-gray-400 text-xs mt-1">Start the conversation!</p>
            </div>
          </div>
        ) : (
          <>
            {hasNextPage && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load more messages'}
                </Button>
              </div>
            )}
            
            {allMessages.map((message) => (
              <div key={message.id} className="flex gap-3">
                <Avatar className="w-8 h-8 flex-shrink-0">
                  <AvatarFallback className="text-xs">
                    {message.sender.firstName[0]}{message.sender.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900">
                      {message.sender.firstName} {message.sender.lastName}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {message.sender.role}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {formatMessageDate(message.createdAt)}
                    </span>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">
                      {message.content}
                    </p>
                    
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {message.attachments.map((attachment: any) => (
                          <div key={attachment.id} className="flex items-center gap-2 p-2 bg-white rounded border">
                            {attachment.fileType.startsWith('image/') ? (
                              <ImageIcon className="w-4 h-4 text-blue-500" />
                            ) : (
                              <FileText className="w-4 h-4 text-gray-500" />
                            )}
                            <span className="text-xs text-gray-700 flex-1 truncate">
                              {attachment.originalName}
                            </span>
                            <Button variant="ghost" size="sm" asChild>
                              <a href={attachment.url} download>
                                <Download className="w-3 h-3" />
                              </a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t bg-gray-50 rounded-b-lg">
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <div key={index} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                <span className="truncate max-w-20">{file.name}</span>
                <button onClick={() => removeAttachment(index)} className="text-blue-600 hover:text-blue-800">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex gap-2">
          <div className="flex-1">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="min-h-[40px] max-h-32 resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
          </div>
          
          <div className="flex flex-col gap-1">
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id={`file-input-${threadId}`}
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById(`file-input-${threadId}`)?.click()}
              className="px-3"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            
            <Button
              onClick={handleSendMessage}
              disabled={(!newMessage.trim() && attachments.length === 0) || sendMessageMutation.isPending}
              size="sm"
              className="px-3"
            >
              {sendMessageMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}