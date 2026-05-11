import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useAdminView } from '@/contexts/AdminViewContext';
import { TodaySection, TodayRow, greeting, todayLabel } from './TodaySection';
import { Badge } from '@/components/ui/badge';
import {
  Palette, Clock, MessageSquare, Briefcase, AlertTriangle,
} from 'lucide-react';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const todayYMD = ymd(today);
const sevenDaysYMD = ymd(new Date(today.getTime() + 7 * 86400000));

export function DesignerTodayFeed() {
  const { user } = useAuth();
  const { isAdminView, viewedUser } = useAdminView();
  const designerId = isAdminView && viewedUser
    ? viewedUser.id
    : (user?.id?.toString() || user?.email || '');
  const displayName = isAdminView && viewedUser ? viewedUser.name : user?.name;

  const [waitingOnMe, setWaitingOnMe] = useState<any[]>([]);
  const [submittedToClient, setSubmittedToClient] = useState<any[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [myTasks, setMyTasks] = useState<any[]>([]);

  // Selections waiting on me to revise (status=revision OR proposed for me)
  useEffect(() => {
    if (!designerId) return;
    const q = query(
      collection(db, 'designSelections'),
      where('designerId', '==', designerId),
      orderBy('createdAt', 'desc'),
      limit(40),
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setWaitingOnMe(items.filter(s =>
        s.clientApprovalStatus === 'revision' || s.clientApprovalStatus === 'pending'
      ).slice(0, 10));
      setSubmittedToClient(items.filter(s =>
        s.clientApprovalStatus === 'submitted'
      ).slice(0, 10));
    }, () => {});
  }, [designerId]);

  // My projects (assigned to me as designer)
  useEffect(() => {
    if (!designerId) return;
    const q = query(
      collection(db, 'projects'),
      where('assignedDesignerId', '==', designerId),
      limit(20),
    );
    return onSnapshot(q, snap => {
      setMyProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, [designerId]);

  // Tasks assigned with assigneeRole=designer or specifically to me
  useEffect(() => {
    if (!designerId) return;
    const q = query(
      collection(db, 'tasks'),
      where('assigneeRole', '==', 'designer'),
      orderBy('dueDate', 'asc'),
      limit(20),
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setMyTasks(items.filter(t => t.status !== 'done').slice(0, 8));
    }, () => {});
  }, [designerId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {displayName?.split(' ')[0] || 'Designer'}
        </h1>
        <p className="text-sm text-gray-500">{todayLabel()}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<Clock className="w-4 h-4" />} label="Selections waiting on you" value={waitingOnMe.length} color={waitingOnMe.length > 0 ? 'text-orange-600' : 'text-gray-900'} />
        <Stat icon={<Palette className="w-4 h-4" />} label="Submitted to client" value={submittedToClient.length} />
        <Stat icon={<Briefcase className="w-4 h-4" />} label="My projects" value={myProjects.length} />
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Tasks open" value={myTasks.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Waiting on me */}
        <TodaySection
          title="Selections waiting on you"
          count={waitingOnMe.length}
          icon={<Clock className="w-4 h-4" />}
          emptyState="All caught up — no selections need revision."
          viewAllHref="/designer-portal/selections"
        >
          {waitingOnMe.slice(0, 6).map(s => (
            <TodayRow
              key={s.id}
              primary={<span className="font-medium">{s.item || 'Selection'}</span>}
              secondary={
                <span className="flex items-center gap-1.5">
                  {s.room && <Badge variant="outline" className="text-[10px]">{s.room}</Badge>}
                  {s.projectName || ''}
                </span>
              }
              meta={<Badge variant="outline" className="text-[10px]">{s.clientApprovalStatus}</Badge>}
              href="/designer-portal/selections"
              highlight={s.clientApprovalStatus === 'revision'}
            />
          ))}
        </TodaySection>

        {/* Submitted to client */}
        <TodaySection
          title="Awaiting client approval"
          count={submittedToClient.length}
          icon={<Palette className="w-4 h-4" />}
          emptyState="Nothing submitted yet."
          viewAllHref="/designer-portal/selections"
        >
          {submittedToClient.slice(0, 6).map(s => (
            <TodayRow
              key={s.id}
              primary={<span className="font-medium">{s.item || 'Selection'}</span>}
              secondary={
                <span className="flex items-center gap-1.5">
                  {s.room && <Badge variant="outline" className="text-[10px]">{s.room}</Badge>}
                  {s.projectName || ''}
                </span>
              }
              meta={<span className="text-blue-600 text-[10px] uppercase">submitted</span>}
              href="/designer-portal/selections"
            />
          ))}
        </TodaySection>

        {/* My tasks */}
        <TodaySection
          title="My tasks"
          count={myTasks.length}
          icon={<AlertTriangle className="w-4 h-4" />}
          emptyState="No design tasks open."
          viewAllHref="/designer-portal"
        >
          {myTasks.slice(0, 5).map(t => {
            const isOverdue = t.dueDate && t.dueDate < todayYMD;
            return (
              <TodayRow
                key={t.id}
                primary={<span className="font-medium">{t.name}</span>}
                secondary={t.projectName || ''}
                meta={
                  isOverdue
                    ? <span className="text-red-600 font-medium">overdue</span>
                    : <span>{t.dueDate || ''}</span>
                }
                href="/designer-portal"
                highlight={isOverdue}
              />
            );
          })}
        </TodaySection>

        {/* My projects */}
        <TodaySection
          title="My projects"
          count={myProjects.length}
          icon={<Briefcase className="w-4 h-4" />}
          emptyState="You're not assigned to any projects yet."
          viewAllHref="/designer-portal"
        >
          {myProjects.slice(0, 5).map(p => (
            <TodayRow
              key={p.id}
              primary={<span className="font-medium">{p.name}</span>}
              secondary={p.address || p.clientName || ''}
              meta={<Badge variant="outline" className="text-[10px]">{p.status || 'active'}</Badge>}
              href={`/designer-portal/${p.id}`}
            />
          ))}
        </TodaySection>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color = 'text-gray-900' }: any) {
  return (
    <div className="bg-white rounded-lg border p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">{icon}<span>{label}</span></div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
