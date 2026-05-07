import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowLeft, Send, MoreVertical, Paperclip, Phone, Video } from 'lucide-react';
import { useMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  isOwnMessage: boolean;
}

interface Thread {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: Date;
  unreadCount: number;
  participants: string[];
}

interface MobileMessagingInterfaceProps {
  threads: Thread[];
  activeThread?: Thread;
  messages: Message[];
  onThreadSelect: (thread: Thread) => void;
  onSendMessage: (content: string) => void;
  className?: string;
}

export function MobileMessagingInterface({
  threads,
  activeThread,
  messages,
  onThreadSelect,
  onSendMessage,
  className
}: MobileMessagingInterfaceProps) {
  const [newMessage, setNewMessage] = useState('');
  const [showThreadSettings, setShowThreadSettings] = useState(false);
  const isMobile = useMobile();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatThreadTime = (date: Date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (messageDate.getTime() === today.getTime()) {
      return formatTime(date);
    } else if (messageDate.getTime() === today.getTime() - 86400000) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Mobile: Show conversation view if activeThread, otherwise show thread list
  if (isMobile) {
    if (activeThread) {
      return (
        <div className={cn('flex flex-col h-full bg-white', className)}>
          {/* Mobile Header */}
          <div className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10 safe-top">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onThreadSelect(null as any)}
                className="p-1"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-sm">
                  {activeThread.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">{activeThread.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {activeThread.participants.length} participants
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="p-2">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="p-2">
                <Video className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="p-2"
                onClick={() => setShowThreadSettings(true)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.isOwnMessage ? 'justify-end' : 'justify-start'
                  )}
                >
                  {!message.isOwnMessage && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {message.sender.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2',
                      message.isOwnMessage
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-900'
                    )}
                  >
                    <p className="text-sm">{message.content}</p>
                    <p className={cn(
                      'text-xs mt-1',
                      message.isOwnMessage ? 'text-blue-100' : 'text-gray-500'
                    )}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Mobile Message Input */}
          <div className="p-4 border-t bg-white safe-bottom">
            <div className="flex items-end gap-2">
              <Button variant="ghost" size="sm" className="p-2 shrink-0">
                <Paperclip className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <Input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="rounded-full resize-none min-h-[40px]"
                />
              </div>
              <Button 
                onClick={handleSend}
                disabled={!newMessage.trim()}
                size="sm"
                className="rounded-full p-2 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Thread Settings Sheet */}
          <Sheet open={showThreadSettings} onOpenChange={setShowThreadSettings}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Thread Settings</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Participants</h4>
                  <div className="space-y-2">
                    {activeThread.participants.map((participant, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {participant.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{participant}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      );
    }

    // Mobile Thread List
    return (
      <div className={cn('h-full bg-white', className)}>
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Messages</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onThreadSelect(thread)}
                className="w-full p-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {thread.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-sm truncate">{thread.name}</h3>
                      <span className="text-xs text-muted-foreground">
                        {formatThreadTime(thread.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {thread.lastMessage}
                    </p>
                  </div>
                  {thread.unreadCount > 0 && (
                    <div className="bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // Desktop view (existing implementation would go here)
  return (
    <div className={cn('flex h-full', className)}>
      {/* Desktop implementation */}
    </div>
  );
}