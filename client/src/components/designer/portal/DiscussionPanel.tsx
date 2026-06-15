// Designer Portal — Design Discussion panel (reuses the messaging channel system).
import { useEffect, useRef, useState } from 'react';
import { CornerUpRight, Send, MessageSquare } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  copyMessageToRoom,
  ensureRoomChannel,
  listenRoomMessages,
  postRoomMessage,
  type ChatMessage,
} from '@/lib/designer/portalService';
import type { DesignerRoom } from '@/lib/designer/portalTypes';
import { GENERAL_ROOM_ID } from '@/lib/designer/portalTypes';
import { EmptyState, LoadingState } from './shared';

interface Props {
  projectId: string;
  roomId: string;
  roomName: string;
  userRole: string;
  /** Other rooms — copy targets when in the General Design thread. */
  rooms: DesignerRoom[];
}

export function DiscussionPanel({
  projectId,
  roomId,
  roomName,
  userRole,
  rooms,
}: Props) {
  const { toast } = useToast();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const isGeneral = roomId === GENERAL_ROOM_ID;

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let active = true;
    setLoading(true);
    setError(null);
    ensureRoomChannel(projectId, roomId, roomName)
      .then((cid) => {
        if (!active) return;
        setChannelId(cid);
        unsub = listenRoomMessages(projectId, cid, (rows) => {
          setMessages(rows);
          setLoading(false);
        });
      })
      .catch((e) => {
        if (active) {
          setError(e?.message || 'Could not open discussion');
          setLoading(false);
        }
      });
    return () => {
      active = false;
      unsub?.();
    };
  }, [projectId, roomId, roomName]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    if (!channelId || !text.trim()) return;
    setSending(true);
    try {
      await postRoomMessage(projectId, channelId, text, {
        authorRole: userRole,
      });
      setText('');
    } catch (e: any) {
      toast({
        title: 'Message failed',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  async function copyTo(target: DesignerRoom, m: ChatMessage) {
    try {
      const targetChannel = await ensureRoomChannel(
        projectId,
        target.id,
        target.name
      );
      await copyMessageToRoom(
        projectId,
        { channelId: channelId!, message: m, roomId },
        targetChannel
      );
      toast({ title: `Copied to ${target.name}` });
    } catch (e: any) {
      toast({
        title: 'Copy failed',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }

  if (error)
    return (
      <EmptyState
        icon={MessageSquare}
        title="Discussion unavailable"
        hint={error}
      />
    );

  const myUid = auth.currentUser?.uid;

  return (
    <div className="flex flex-col h-[60vh] min-h-[420px] rounded-xl border border-gray-200 bg-white">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-700">
          {isGeneral ? 'General Design Discussion' : `${roomName} Discussion`}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {loading ? (
          <LoadingState label="Opening discussion…" />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            hint="Start the design conversation for this room."
          />
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.authorUid === myUid ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`group max-w-[78%] rounded-2xl px-3.5 py-2 ${m.authorUid === myUid ? 'bg-[#C9A96E] text-white' : 'bg-gray-100 text-gray-800'}`}
              >
                <p className="text-[11px] opacity-70 mb-0.5">
                  {m.authorName}
                  {m.authorRole ? ` · ${m.authorRole}` : ''}
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {m.text}
                </p>
                {isGeneral && rooms.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`mt-1 text-[11px] inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-80 ${m.authorUid === myUid ? 'text-white' : 'text-gray-500'}`}
                      >
                        <CornerUpRight className="w-3 h-3" /> Move to room
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-64 overflow-auto"
                    >
                      {rooms.map((r) => (
                        <DropdownMenuItem
                          key={r.id}
                          onClick={() => copyTo(r, m)}
                        >
                          {r.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-100 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message…  (⌘/Ctrl + Enter to send)"
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={send}
            disabled={sending || !text.trim()}
            className="gap-1.5"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
