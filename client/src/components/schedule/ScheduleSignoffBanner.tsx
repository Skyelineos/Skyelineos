import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Lock, Unlock } from 'lucide-react';

interface Props { projectId: string }

// Sign-off banner displayed above the Gantt. Until a project's schedule is
// signed off, it sits in "Draft" — the dashboard's UnsignedSchedulesCard
// nudges the GC to review and sign each one.
export function ScheduleSignoffBanner({ projectId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(doc(db, 'projects', projectId), s => {
      setProject(s.exists() ? s.data() : null);
    }, () => {});
    return () => unsub();
  }, [projectId]);

  const signed = !!project?.scheduleSignedOff;
  const at = project?.scheduleSignedOffAt;
  const by = project?.scheduleSignedOffBy;

  const toggle = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      if (signed) {
        await updateDoc(doc(db, 'projects', projectId), {
          scheduleSignedOff: false,
          scheduleSignedOffAt: null,
          scheduleSignedOffBy: '',
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Sign-off cleared — schedule is back in draft.' });
      } else {
        await updateDoc(doc(db, 'projects', projectId), {
          scheduleSignedOff: true,
          scheduleSignedOffAt: serverTimestamp(),
          scheduleSignedOffBy: user?.name || user?.email || 'GC',
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Schedule signed off — it is now live.' });
      }
    } catch (e: any) {
      toast({ title: 'Sign-off failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatAt = () => {
    if (!at) return '';
    const ms = at?.toMillis?.() ?? Date.parse(at || '');
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : '';
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b ${
        signed ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-center gap-2">
        {signed ? (
          <Badge className="bg-green-100 text-green-800 border-green-300 gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Signed off
            {at && (
              <span className="text-[10px] opacity-70 ml-1">
                {formatAt()}{by ? ` · ${by}` : ''}
              </span>
            )}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-amber-800 border-amber-300 bg-amber-100 gap-1">
            <AlertTriangle className="w-3 h-3" />
            Draft schedule — needs sign-off
          </Badge>
        )}
        <span className="text-xs text-gray-500">
          {signed
            ? 'Live: this schedule is the source of truth for subs and clients.'
            : 'Review and sign off when ready to go live.'}
        </span>
      </div>
      <Button
        size="sm"
        variant={signed ? 'outline' : 'default'}
        onClick={toggle}
        disabled={saving}
        className="gap-1.5"
        style={!signed ? { backgroundColor: '#C9A96E', color: 'white' } : undefined}
      >
        {signed ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
        {saving ? 'Saving…' : signed ? 'Re-open Draft' : 'Sign Off Schedule'}
      </Button>
    </div>
  );
}
