import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useAdminView } from '@/contexts/AdminViewContext';
import { TodaySection, TodayRow, greeting, todayLabel } from './TodaySection';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Home, Camera, CheckCircle2, DollarSign, Calendar, FileText,
} from 'lucide-react';

export function ClientTodayFeed() {
  const { user } = useAuth();
  const { isAdminView, viewedUser } = useAdminView();
  // When admin is impersonating, scope every query to the impersonated user
  // so the dashboard mirrors what they would actually see.
  const clientId = isAdminView && viewedUser
    ? viewedUser.id
    : (user?.id?.toString() || user?.email || '');
  const displayName = isAdminView && viewedUser ? viewedUser.name : user?.name;

  const [myProject, setMyProject] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState<any[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<any[]>([]);

  // My project (where clientId matches me)
  useEffect(() => {
    if (!clientId) return;
    const q = query(
      collection(db, 'projects'),
      where('clientId', '==', clientId),
      limit(1),
    );
    return onSnapshot(q, snap => {
      setMyProject(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    }, () => {});
  }, [clientId]);

  const projectId = myProject?.id;

  // Recent walkthrough photos (visible to client) for my project
  useEffect(() => {
    if (!projectId) return;
    const q = query(
      collection(db, 'projects', projectId, 'walkthroughs'),
      orderBy('createdAt', 'desc'),
      limit(8),
    );
    return onSnapshot(q, snap => {
      setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, [projectId]);

  // Selections needing my approval
  useEffect(() => {
    if (!projectId) return;
    const q = query(
      collection(db, 'projects', projectId, 'selections'),
      where('clientApprovalStatus', '==', 'submitted'),
      limit(20),
    );
    return onSnapshot(q, snap => {
      setPendingApprovals(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, [projectId]);

  // Outstanding invoices for me
  useEffect(() => {
    if (!clientId) return;
    const q = query(
      collection(db, 'invoices'),
      where('clientId', '==', clientId),
      where('status', 'in', ['sent', 'overdue']),
      limit(10),
    );
    return onSnapshot(q, snap => {
      setOutstandingInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, [clientId]);

  // Upcoming milestones (project tasks visible to client, due in 30 days)
  useEffect(() => {
    if (!projectId) return;
    const cutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const q = query(
      collection(db, 'tasks'),
      where('projectId', '==', projectId),
      where('visibleToClient', '==', true),
      orderBy('dueDate', 'asc'),
      limit(10),
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setUpcomingMilestones(items.filter(t => !t.dueDate || t.dueDate <= cutoff).slice(0, 5));
    }, () => {});
  }, [projectId]);

  const totalOwed = outstandingInvoices.reduce((s, i) => s + (i.amount || 0), 0);

  if (!myProject) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {displayName?.split(' ')[0] || 'there'}
        </h1>
        <Card>
          <CardContent className="p-8 text-center">
            <Home className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">No project linked yet</p>
            <p className="text-xs text-gray-400 mt-1">Once your builder links your project, it'll show up here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {displayName?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-sm text-gray-500">{todayLabel()}</p>
      </div>

      {/* My home — hero card */}
      <Card className="bg-gradient-to-br from-[#FFF8E7] to-white border-[#C9A96E]/30">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wide text-[#C9A96E] font-semibold mb-1">My Home</div>
              <h2 className="text-xl font-bold text-gray-900">{myProject.name}</h2>
              {myProject.address && (
                <p className="text-sm text-gray-500 mt-0.5">{myProject.address}</p>
              )}
              {myProject.currentPhase && (
                <Badge className="mt-2 bg-[#C9A96E] text-white border-0">Currently: {myProject.currentPhase}</Badge>
              )}
            </div>
            <div className="text-right text-sm">
              {myProject.targetCompletion && (
                <>
                  <div className="text-xs text-gray-500">Target completion</div>
                  <div className="font-semibold text-gray-900">
                    {new Date(myProject.targetCompletion).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                </>
              )}
            </div>
          </div>

          {typeof myProject.progressPercent === 'number' && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-500">Progress</span>
                <span className="font-semibold text-gray-900">{myProject.progressPercent}%</span>
              </div>
              <Progress value={myProject.progressPercent} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Approvals needed */}
        <TodaySection
          title="Waiting on your approval"
          count={pendingApprovals.length}
          icon={<CheckCircle2 className="w-4 h-4" />}
          emptyState="Nothing needs approving — you're all set."
          viewAllHref="/client-portal/selections"
        >
          {pendingApprovals.slice(0, 5).map(s => (
            <TodayRow
              key={s.id}
              primary={<span className="font-medium">{s.item || s.description}</span>}
              secondary={
                <span className="flex items-center gap-1.5">
                  {s.room && <Badge variant="outline" className="text-[10px]">{s.room}</Badge>}
                  {s.cost && <span className="text-xs">${(s.cost || 0).toLocaleString()}</span>}
                </span>
              }
              meta={<span className="text-blue-600 text-[10px] uppercase">review</span>}
              href="/client-portal/selections"
              highlight
            />
          ))}
        </TodaySection>

        {/* Outstanding invoices */}
        <TodaySection
          title={`Outstanding ${totalOwed > 0 ? `· $${totalOwed.toLocaleString()}` : ''}`}
          count={outstandingInvoices.length}
          icon={<DollarSign className="w-4 h-4" />}
          emptyState="No invoices waiting."
          viewAllHref="/client-portal/financials"
        >
          {outstandingInvoices.slice(0, 5).map(i => (
            <TodayRow
              key={i.id}
              primary={<span className="font-medium">{i.invoiceNumber || `Invoice`}</span>}
              secondary={i.description || ''}
              meta={
                <span className="font-mono">
                  ${(i.amount || 0).toLocaleString()}
                  {i.dueDate && <span className="text-gray-400 ml-1.5">· due {i.dueDate}</span>}
                </span>
              }
              href="/client-portal/financials"
            />
          ))}
        </TodaySection>

        {/* Upcoming milestones */}
        <TodaySection
          title="What's happening soon"
          count={upcomingMilestones.length}
          icon={<Calendar className="w-4 h-4" />}
          emptyState="No upcoming milestones shared yet."
          viewAllHref="/client-portal/site-log"
        >
          {upcomingMilestones.map(t => (
            <TodayRow
              key={t.id}
              primary={<span className="font-medium">{t.name}</span>}
              secondary={t.description || ''}
              meta={<span>{t.dueDate || ''}</span>}
              href="/client-portal/site-log"
            />
          ))}
        </TodaySection>

        {/* Recent photos */}
        <TodaySection
          title="Recent site photos"
          count={photos.length}
          icon={<Camera className="w-4 h-4" />}
          emptyState="No site photos shared yet."
          viewAllHref="/client-portal/site-log"
        >
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {photos.slice(0, 6).map(p => (
                <a
                  key={p.id}
                  href={p.mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-md overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
                >
                  {p.mediaType === 'photo' ? (
                    <img src={p.mediaUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="relative w-full h-full">
                      <video src={p.mediaUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs font-bold">▶</div>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </TodaySection>
      </div>
    </div>
  );
}
