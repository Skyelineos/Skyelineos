// GC control on the Project → Schedule page. Snapshots the live Gantt to the
// client portal (the client's source of truth) and tells the GC whether what
// the client currently sees is up to date or has drifted from the live Gantt.

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useGantt } from '@/modules/gantt/state';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { wbsToClientSchedule, scheduleSignature } from '@/lib/schedule/wbsToClientSchedule';
import { publishScheduleToClient } from '@/lib/schedule/publishSchedule';

interface Props { projectId: string }

export function PublishScheduleButton({ projectId }: Props) {
  const { tasks } = useGantt();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(doc(db, 'projects', projectId), s => setProject(s.exists() ? s.data() : null), () => {});
    return () => unsub();
  }, [projectId]);

  const clientSchedule = useMemo(() => wbsToClientSchedule(tasks), [tasks]);
  const liveSignature = useMemo(() => scheduleSignature(clientSchedule), [clientSchedule]);

  const publishedAt = project?.estimatedSchedulePublishedAt;
  const publishedSig = project?.estimatedSchedulePublishedSignature || '';
  const hasPublished = !!project?.estimatedSchedule && !!publishedAt;
  const upToDate = hasPublished && publishedSig === liveSignature;

  const fmtAt = () => {
    if (!publishedAt) return '';
    const ms = publishedAt?.toMillis?.() ?? Date.parse(publishedAt || '');
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : '';
  };

  const handlePublish = async () => {
    if (!clientSchedule) {
      toast({ title: 'Nothing to publish', description: 'Add tasks to the schedule first.', variant: 'destructive' });
      return;
    }
    setPublishing(true);
    try {
      await publishScheduleToClient({
        projectId,
        schedule: clientSchedule,
        source: 'Work schedule (Gantt)',
        startDate: clientSchedule.startDate,
        fromUserId: user?.id?.toString(),
        fromUserName: user?.name || user?.email || 'GC',
      });
      toast({ title: 'Published to client', description: 'The homeowner now sees this timeline and was notified.' });
    } catch (e: any) {
      toast({ title: 'Publish failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = !!clientSchedule;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b ${
      !hasPublished ? 'bg-gray-50 border-gray-200' : upToDate ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-center gap-2">
        {!hasPublished ? (
          <Badge variant="outline" className="text-gray-600 border-gray-300 bg-white gap-1">
            Not shared with client yet
          </Badge>
        ) : upToDate ? (
          <Badge className="bg-green-100 text-green-800 border-green-300 gap-1">
            <CheckCircle2 className="w-3 h-3" /> Client schedule up to date
          </Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
            <AlertTriangle className="w-3 h-3" /> Out of date — republish
          </Badge>
        )}
        <span className="text-xs text-gray-500">
          {!hasPublished
            ? 'Publish to show this timeline in the client portal.'
            : upToDate
              ? `Client sees this schedule (published ${fmtAt()}).`
              : `The client is seeing an older version (published ${fmtAt()}).`}
        </span>
      </div>
      <Button
        size="sm"
        onClick={handlePublish}
        disabled={publishing || !canPublish || upToDate}
        className="gap-1.5"
        style={!upToDate ? { backgroundColor: '#C9A96E', color: 'white' } : undefined}
        variant={upToDate ? 'outline' : 'default'}
      >
        <Send className="w-3.5 h-3.5" />
        {publishing ? 'Publishing…' : upToDate ? 'Published' : hasPublished ? 'Republish to client' : 'Publish to client'}
      </Button>
    </div>
  );
}
