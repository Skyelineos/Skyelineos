import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Camera, Video, MapPin, User, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface Walkthrough {
  id: string;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  note: string;
  assignedToContactId?: string | null;
  assignedToName?: string | null;
  trade?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'done';
  createdAt?: any;
  createdBy?: string;
}

const STATUS_META = {
  open:         { label: 'Open',        color: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle },
  in_progress:  { label: 'In Progress', color: 'bg-blue-100 text-blue-700 border-blue-200',         icon: Clock },
  done:         { label: 'Done',        color: 'bg-green-100 text-green-700 border-green-200',     icon: CheckCircle2 },
} as const;

const PRIORITY_COLOR: Record<string, string> = {
  low:    'text-gray-500',
  medium: 'text-blue-600',
  high:   'text-red-600',
};

export function WalkthroughList({ projectId, filterAssigneeId }: { projectId: string; filterAssigneeId?: string }) {
  const [items, setItems] = useState<Walkthrough[]>([]);
  const [activeStatus, setActiveStatus] = useState<'all' | 'open' | 'in_progress' | 'done'>('all');
  const { toast } = useToast();

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'projects', projectId, 'walkthroughs'),
        orderBy('createdAt', 'desc'),
      ),
      snap => setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Walkthrough))),
      () => {},
    );
    return () => unsub();
  }, [projectId]);

  const filtered = items.filter(w => {
    if (filterAssigneeId && w.assignedToContactId !== filterAssigneeId) return false;
    if (activeStatus !== 'all' && w.status !== activeStatus) return false;
    return true;
  });

  const updateStatus = async (id: string, status: Walkthrough['status']) => {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'walkthroughs', id), { status });
      toast({ title: `Marked ${status.replace('_', ' ')}` });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const counts = {
    all: items.length,
    open: items.filter(w => w.status === 'open').length,
    in_progress: items.filter(w => w.status === 'in_progress').length,
    done: items.filter(w => w.status === 'done').length,
  };

  return (
    <div className="space-y-3">
      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'open', 'in_progress', 'done'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveStatus(s)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              activeStatus === s
                ? 'bg-[#C9A96E] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            <span className="ml-1.5 opacity-70">({counts[s]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <Camera className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">
            {items.length === 0 ? 'No walkthroughs yet' : `No ${activeStatus.replace('_', ' ')} items`}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {items.length === 0 ? 'Tap the Capture button to log your first one.' : 'Switch the filter above.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(w => {
            const StatusIcon = STATUS_META[w.status].icon;
            return (
              <div key={w.id} className="bg-white border rounded-lg overflow-hidden flex flex-col">
                {/* Media */}
                <div className="relative bg-black aspect-video">
                  {w.mediaType === 'photo' ? (
                    <img src={w.mediaUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={w.mediaUrl} controls className="w-full h-full object-cover" />
                  )}
                  <Badge className={`absolute top-2 left-2 gap-1 ${STATUS_META[w.status].color} border`}>
                    <StatusIcon className="w-3 h-3" />
                    {STATUS_META[w.status].label}
                  </Badge>
                  {w.priority === 'high' && (
                    <Badge className="absolute top-2 right-2 bg-red-500 text-white border-0">
                      HIGH
                    </Badge>
                  )}
                </div>

                {/* Body */}
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <p className="text-sm text-gray-800 line-clamp-3 min-h-[3.5rem]">
                    {w.note || <span className="text-gray-400 italic">No note</span>}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    {w.assignedToName ? (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {w.assignedToName}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-orange-500">
                        <User className="w-3 h-3" />
                        Unassigned
                      </span>
                    )}
                    {w.trade && (
                      <Badge variant="outline" className="text-[10px] uppercase">{w.trade}</Badge>
                    )}
                    <span className={`flex items-center gap-1 ${PRIORITY_COLOR[w.priority]} ml-auto`}>
                      {w.priority}
                    </span>
                  </div>

                  <Select value={w.status} onValueChange={v => updateStatus(w.id, v as any)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
