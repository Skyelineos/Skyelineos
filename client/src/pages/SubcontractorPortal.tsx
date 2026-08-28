import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  collection, query, where, onSnapshot, doc, getDoc, getDocs, orderBy,
  updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { createNotification } from '@/lib/notifications';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { SubcontractorLayout } from '@/components/layout/SubcontractorLayout';
import { AdminPortalControls } from '@/components/admin/AdminPortalControls';
import { useAdminView } from '@/contexts/AdminViewContext';
import { useAutoAdminView } from '@/hooks/useAutoAdminView';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar, DollarSign, Upload, CheckCircle, AlertTriangle, Clock,
  Briefcase, Shield, FileCheck, Building, MessageSquare, Camera,
  FileText, ChevronRight, HelpCircle, Award, Send,
} from 'lucide-react';
import PhotosTab from '@/components/photos/PhotosTab';
import { RFIPanel } from '@/components/rfi/RFIPanel';
import { ProjectChat } from '@/components/messaging/ProjectChat';
import { SubTodayFeed } from '@/components/today/SubTodayFeed';
import { SubBidRequestsTab } from '@/components/bidding/SubBidRequestsTab';
import { MyContractsView } from '@/components/contracts/MyContractsView';
import { EnablePushButton } from '@/components/notifications/EnablePushButton';
import { RecipientMismatchBanner } from '@/components/bidding/RecipientMismatchBanner';
import { JobsiteLocationCard } from '@/components/common/JobsiteLocationCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { ComplianceUploadCard } from '@/components/sub/ComplianceUploadCard';
import { SubInvoiceForm } from '@/components/sub/SubInvoiceForm';

// ── Types ────────────────────────────────────────────────────────────────────

interface FSProject {
  id: string;
  name: string;
  address?: string;
  status?: string;
  currentPhase?: string;
}

interface FSTask {
  id: string;
  name: string;
  projectId?: string;
  projectName?: string;
  status: 'todo' | 'in_progress' | 'awaiting_signoff' | 'done' | 'blocked';
  dueDate?: string;
  priority?: string;
  submittedForSignoffAt?: any; // Firestore Timestamp once sub submits ready-for-review
}

interface FSBid {
  id: string;
  projectId?: string;
  projectName?: string;
  amount?: number;
  status: 'pending' | 'accepted' | 'rejected' | 'submitted';
  submittedAt?: string;
  notes?: string;
}

interface FSInvoice {
  id: string;
  invoiceNumber?: string;
  projectId?: string;
  projectName?: string;
  amount?: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  dueDate?: string;
  paidAt?: string;
}

interface FSPO {
  id: string;
  poNumber?: string;
  projectId?: string;
  projectName?: string;
  amount?: number;
  status?: string;
  issuedAt?: string;
}

interface ComplianceData {
  // Legacy boolean mirrors written by /api/compliance/upload — these are
  // what awardBidRoute.ts's D-016 gate reads from users/{uid}.
  w9Filed?: boolean;
  w9ExpiresAt?: string;
  insuranceCurrent?: boolean;
  insuranceExpiresAt?: string;
  agreementSigned?: boolean;
  agreementSignedAt?: string;
  contractorLicenseNumber?: string;
}

interface ComplianceEntry {
  uploadedAt?: any;
  fileUrl?: string;
  fileName?: string;
  expiresAt?: string;
  contractorLicenseNumber?: string;
}

interface ContactComplianceMap {
  w9?: ComplianceEntry;
  coi?: ComplianceEntry;
  agreement?: ComplianceEntry;
  contractorLicense?: ComplianceEntry;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const taskStatusColor: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  awaiting_signoff: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
};

const invoiceStatusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

const bidStatusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  submitted: 'bg-amber-100 text-amber-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

function fmtMoney(n?: number) {
  if (n == null) return '—';
  return `$${n.toLocaleString()}`;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SubcontractorPortal() {
  useAutoAdminView();
  const { isAdminView, viewedUser } = useAdminView();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const effectiveUid = isAdminView && viewedUser ? viewedUser.id : user?.firebaseUid || '';
  const userName = isAdminView && viewedUser ? viewedUser.name : user?.name || 'Subcontractor';
  const userEmail = isAdminView && viewedUser ? (viewedUser.email || '') : user?.email || '';

  // Derive tab from URL: /subcontractor-portal/bids → 'bids'
  const pathParts = location.split('/').filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1] || '';
  const currentTab = lastPart === 'subcontractor-portal' || lastPart === '' ? 'dashboard' : lastPart;

  // Redirect bare /subcontractor-portal to dashboard
  useEffect(() => {
    if (location === '/subcontractor-portal' || location === '/subcontractor-portal/') {
      setLocation('/subcontractor-portal/dashboard');
    }
  }, [location, setLocation]);

  // ── Firestore state ─────────────────────────────────────────────────────
  const [projects, setProjects] = useState<FSProject[]>([]);
  const [tasks, setTasks] = useState<FSTask[]>([]);
  const [bids, setBids] = useState<FSBid[]>([]);
  const [invoices, setInvoices] = useState<FSInvoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<FSPO[]>([]);
  const [compliance, setCompliance] = useState<ComplianceData>({});
  const [subContactId, setSubContactId] = useState<string>('');
  const [contactCompliance, setContactCompliance] = useState<ContactComplianceMap>({});
  const [loading, setLoading] = useState(true);
  // Which assigned project the RFIs tab is scoped to (subs can be on several).
  const [rfiProjectId, setRfiProjectId] = useState<string>('');
  const [msgProjectId, setMsgProjectId] = useState<string>('');
  const [acknowledgingPoId, setAcknowledgingPoId] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveUid) { setLoading(false); return; }

    const unsubs: (() => void)[] = [];

    // Projects
    const qProjects = query(
      collection(db, 'projects'),
      where('assignedUserIds', 'array-contains', effectiveUid),
    );
    unsubs.push(onSnapshot(qProjects, snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as FSProject)));
    }, () => {}));

    // Tasks
    const qTasks = query(
      collection(db, 'tasks'),
      where('assignedSubId', '==', effectiveUid),
    );
    unsubs.push(onSnapshot(qTasks, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as FSTask)));
    }, () => {}));

    // Bids by subId
    const qBids = query(collection(db, 'bids'), where('subId', '==', effectiveUid));
    unsubs.push(onSnapshot(qBids, snap => {
      setBids(snap.docs.map(d => ({ id: d.id, ...d.data() } as FSBid)));
    }, () => {}));

    // Invoices
    const qInvoices = query(collection(db, 'invoices'), where('subId', '==', effectiveUid));
    unsubs.push(onSnapshot(qInvoices, snap => {
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as FSInvoice)));
    }, () => {}));

    // Purchase orders
    const qPOs = query(collection(db, 'purchaseOrders'), where('subId', '==', effectiveUid));
    unsubs.push(onSnapshot(qPOs, snap => {
      setPurchaseOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as FSPO)));
      setLoading(false);
    }, () => { setLoading(false); }));

    // Compliance from user doc
    getDoc(doc(db, 'users', effectiveUid)).then(snap => {
      if (snap.exists()) setCompliance(snap.data() as ComplianceData);
    }).catch(() => {});

    // Resolve the sub's contact record (sub portal needs this for the
    // compliance + invoice upload paths under projects/{projectId}/...).
    // Subs are matched on contacts.linkedUserId === their Firebase UID.
    (async () => {
      try {
        const s = await getDocs(query(collection(db, 'contacts'), where('linkedUserId', '==', effectiveUid)));
        if (!s.empty) {
          const doc0 = s.docs[0];
          setSubContactId(doc0.id);
          const data = doc0.data() as any;
          setContactCompliance((data.compliance || {}) as ContactComplianceMap);
        }
      } catch { /* non-fatal — UI shows a "not linked" hint */ }
    })();

    return () => unsubs.forEach(u => u());
  }, [effectiveUid]);

  // ── PO acknowledgment ────────────────────────────────────────────────────
  async function handleAcknowledgePO(po: FSPO) {
    setAcknowledgingPoId(po.id);
    try {
      await updateDoc(doc(db, 'purchaseOrders', po.id), {
        acknowledgedAt: serverTimestamp(),
        status: 'acknowledged',
        acknowledgedByUid: effectiveUid,
        acknowledgedByName: userName,
      });
      toast({
        title: 'PO Accepted',
        description: `Purchase order${po.poNumber ? ` #${po.poNumber}` : ''} acknowledged. The GC has been notified.`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not acknowledge PO',
        description: e?.message || 'Try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setAcknowledgingPoId(null);
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const activeProjects = projects.filter(p => p.status !== 'completed' && p.status !== 'cancelled');
  const openBids = bids.filter(b => b.status === 'pending' || b.status === 'submitted');
  const pendingInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
  const paidThisMonth = invoices
    .filter(i => {
      if (i.status !== 'paid' || !i.paidAt) return false;
      const d = new Date(i.paidAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const upcomingTasks = [...tasks]
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 5);

  const compliantItems = [
    compliance.w9Filed,
    compliance.insuranceCurrent,
    compliance.agreementSigned,
    !!(compliance.contractorLicenseNumber && compliance.contractorLicenseNumber.trim()),
  ].filter(Boolean).length;
  const compliancePct = Math.round((compliantItems / 4) * 100);

  // ── Render helpers ────────────────────────────────────────────────────────

  const tabTitle = (tab: string) =>
    tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // ── Tab content ───────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div className="space-y-4 md:space-y-6">
      {/* Quick Actions hub */}
      <Card className="rounded-xl border-[#C9A96E]/40 bg-[#FFF8E7]/50">
        <CardContent className="p-4 md:p-5">
          <p className="text-xs uppercase tracking-widest text-[#8a6a2c] font-semibold mb-3">Quick Actions</p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="gap-2 font-semibold min-h-[44px]"
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={() => setLocation('/subcontractor-portal/bid-requests')}
            >
              <Send className="w-4 h-4" /> Respond to a Bid Request
              {openBids.length > 0 && (
                <span className="ml-1 bg-[#141414] text-[#C9A96E] text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {openBids.length}
                </span>
              )}
            </Button>
            <Button
              className="gap-2 font-semibold min-h-[44px]"
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={() => setLocation('/subcontractor-portal/pay-app')}
            >
              <DollarSign className="w-4 h-4" /> Submit an Invoice
            </Button>
            <Button
              className="gap-2 font-semibold min-h-[44px]"
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={() => setLocation('/subcontractor-portal/purchase-orders')}
            >
              <FileText className="w-4 h-4" /> View My POs
              {purchaseOrders.filter(po => po.status !== 'acknowledged' && po.status !== 'signed').length > 0 && (
                <span className="ml-1 bg-[#141414] text-[#C9A96E] text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {purchaseOrders.filter(po => po.status !== 'acknowledged' && po.status !== 'signed').length}
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <SubTodayFeed />

      {/* Stat cards — unified with the GC dashboard's design language. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div className="cursor-pointer" onClick={() => setLocation('/subcontractor-portal/bid-requests')}>
          <StatCard label="Open Bid Requests" value={openBids.length} icon={Briefcase} accent="gold" />
        </div>
        <div className="cursor-pointer" onClick={() => setLocation('/subcontractor-portal/bids')}>
          <StatCard label="Submitted Bids" value={bids.filter(b => b.status === 'submitted' || b.status === 'pending').length} icon={Send} accent="gold" />
        </div>
        <div className="cursor-pointer" onClick={() => setLocation('/subcontractor-portal/pay-app')}>
          <StatCard label="Pending Invoices" value={pendingInvoices.length} icon={FileText} accent="amber" />
        </div>
        <div className="cursor-pointer" onClick={() => setLocation('/subcontractor-portal/purchase-orders')}>
          <StatCard label="Active POs" value={purchaseOrders.length} icon={DollarSign} accent="green" />
        </div>
      </div>

      {/* Compliance alert */}
      {compliantItems < 4 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Your compliance profile is incomplete ({compliancePct}%). Please update your documents.
            <Button variant="link" className="h-auto p-0 ml-2 text-amber-700 underline text-sm"
              onClick={() => setLocation('/subcontractor-portal/compliance')}>
              View Compliance
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Upcoming Tasks */}
        <Card className="rounded-xl hover:shadow-md transition-shadow">
          <CardHeader className="p-4 md:p-6 pb-3">
            <CardTitle className="text-fluid-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#C9A96E]" /> Upcoming Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No upcoming tasks</p>
            ) : (
              <div className="space-y-2">
                {upcomingTasks.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{t.name}</p>
                      {t.projectName && <p className="text-xs text-gray-400">{t.projectName}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {t.dueDate && <span className="text-xs text-gray-400">{fmt(t.dueDate)}</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${taskStatusColor[t.status] || 'bg-gray-100 text-gray-600'}`}>
                        {t.status === 'awaiting_signoff' ? 'Awaiting sign-off' : t.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assigned Projects */}
        <Card className="rounded-xl hover:shadow-md transition-shadow">
          <CardHeader className="p-4 md:p-6 pb-3">
            <CardTitle className="text-fluid-lg flex items-center gap-2">
              <Building className="w-5 h-5 text-[#C9A96E]" /> Assigned Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeProjects.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No projects assigned yet</p>
            ) : (
              <div className="space-y-3">
                {activeProjects.map(p => (
                  <JobsiteLocationCard
                    key={p.id}
                    project={p}
                    badge={
                      <>
                        {p.currentPhase && <span className="text-xs text-gray-500">{p.currentPhase}</span>}
                        {p.status && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{p.status}</span>
                        )}
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderBids = () => (
    <div className="space-y-4">
      <RecipientMismatchBanner />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Heading was "Bid Management" — which was misleading. This tab
            shows ONLY the bids the sub has already SUBMITTED. Incoming
            invitations live on the separate Bid Requests tab. */}
        <h2 className="text-xl font-bold text-gray-900">My Submitted Bids</h2>
        <EnablePushButton />
      </div>
      <p className="text-[11px] text-gray-500 -mt-2">
        Bids you've sent in response to invitations. To see new invitations from Skyeline Homes, go to <strong>Bid Requests</strong> in the left menu.
      </p>
      {bids.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-700 font-medium">No bids submitted yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              When you respond to a Skyeline Homes bid invitation, your submission shows up here.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setLocation('/subcontractor-portal/bid-requests')}
            >
              See open bid requests
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bids.map(bid => (
            <Card key={bid.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{bid.projectName || bid.projectId || 'Unknown Project'}</p>
                    {bid.notes && <p className="text-sm text-gray-500 mt-0.5">{bid.notes}</p>}
                    <p className="text-xs text-gray-400 mt-1">Submitted {fmt(bid.submittedAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{fmtMoney(bid.amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${bidStatusColor[bid.status] || 'bg-gray-100 text-gray-600'}`}>
                      {bid.status}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Submit a task for GC/PM sign-off. Status flips to 'awaiting_signoff' and
  // we capture a submittedForSignoffAt timestamp so the GC dashboard queue can
  // sort oldest-first. Notifies anyone on the project who should approve.
  //
  // Sub cannot undo from their side — only GC/PM can approve or reject.
  async function handleSubmitForSignoff(task: FSTask) {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'awaiting_signoff',
        submittedForSignoffAt: serverTimestamp(),
        submittedForSignoffBy: effectiveUid,
        updatedAt: serverTimestamp(),
      });
      // Notify the project owners. Fetch the project doc once to get assignedUserIds.
      // TODO Dispatch 6: switch to fireTrigger with kind 'task_awaiting_signoff'
      //   once feat/notifications-engine lands; that branch's catalog will own
      //   the email/SMS fan-out. Until then, in-app notifications cover it.
      try {
        if (task.projectId) {
          const projSnap = await getDoc(doc(db, 'projects', task.projectId));
          const assigned: string[] = (projSnap.data() as any)?.assignedUserIds || [];
          for (const uid of assigned) {
            if (uid === effectiveUid) continue; // don't notify self
            await createNotification({
              userId: uid,
              kind: 'task_completed', // existing kind — Dispatch 6 will introduce 'task_awaiting_signoff'
              title: 'Task awaiting sign-off',
              body: `${userName} submitted "${task.name}" for your review.`,
              link: `/projects/${task.projectId}/tasks`,
              projectId: task.projectId,
              refType: 'task',
              refId: task.id,
              fromUserId: effectiveUid,
              fromUserName: userName,
            });
          }
        }
      } catch { /* notifications are best-effort */ }
      toast({
        title: 'Submitted for review',
        description: `"${task.name}" is now waiting on the GC's sign-off.`,
      });
    } catch (e: any) {
      toast({
        title: 'Could not submit',
        description: e?.message || 'Try again in a moment.',
        variant: 'destructive',
      });
    }
  }

  const renderSchedule = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Job Schedule</h2>
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 font-medium">No tasks assigned</p>
            <p className="text-sm text-gray-400 mt-1">Tasks assigned to you will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...tasks].sort((a, b) => {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
          }).map(task => (
            <Card key={task.id}>
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{task.name}</p>
                    {task.projectName && <p className="text-sm text-gray-500 truncate">{task.projectName}</p>}
                    {task.status === 'awaiting_signoff' && task.submittedForSignoffAt ? (
                      <p className="text-xs text-amber-700 mt-1">
                        Submitted {(() => {
                          const at: any = task.submittedForSignoffAt;
                          const ms = at?.toMillis?.() ?? (at ? Date.parse(at) : NaN);
                          if (!Number.isFinite(ms)) return 'recently';
                          return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        })()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    {task.dueDate && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="w-3.5 h-3.5" />
                        {fmt(task.dueDate)}
                      </div>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${taskStatusColor[task.status] || 'bg-gray-100 text-gray-600'}`}>
                      {task.status === 'awaiting_signoff' ? 'Awaiting GC sign-off' : task.status.replace('_', ' ')}
                    </span>
                    {/* Sub-side action: 'Mark Ready for Review' submits the task to
                        awaiting_signoff. Once submitted, the sub sees the 'Awaiting GC
                        sign-off' badge and cannot undo from their side. */}
                    {(task.status === 'todo' || task.status === 'in_progress') && (
                      <Button
                        size="sm"
                        onClick={() => handleSubmitForSignoff(task)}
                        className="bg-[#C9A96E] hover:bg-[#b59459] text-white min-h-[44px] md:min-h-0"
                      >
                        Mark Ready for Review
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderCompliance = () => {
    // The sub's first awarded/assigned project — Storage rules are project-scoped
    // so compliance uploads need *some* project to live under. If the sub is on
    // multiple projects, any one works (the same compliance doc covers them all
    // logically — the file just lives under one).
    const uploadProjectId = projects[0]?.id || '';

    const items: Array<{
      key: 'w9' | 'coi' | 'agreement' | 'contractorLicense';
      label: string;
      icon: any;
      onFile: boolean;
      description: string;
      entry?: ComplianceEntry;
    }> = [
      {
        key: 'w9',
        label: 'W-9 Form',
        icon: FileCheck,
        onFile: !!compliance.w9Filed,
        description: 'Federal tax identification form (W-9).',
        entry: contactCompliance.w9,
      },
      {
        key: 'coi',
        label: 'Certificate of Insurance',
        icon: Shield,
        onFile: !!compliance.insuranceCurrent,
        description: 'Current general liability / workers\' comp COI.',
        entry: contactCompliance.coi,
      },
      {
        key: 'agreement',
        label: 'Signed Subcontractor Agreement',
        icon: FileCheck,
        onFile: !!compliance.agreementSigned,
        description: 'Master subcontractor agreement, fully signed.',
        entry: contactCompliance.agreement,
      },
      {
        key: 'contractorLicense',
        label: 'Contractor License',
        icon: Award,
        onFile: !!(compliance.contractorLicenseNumber && compliance.contractorLicenseNumber.trim()),
        description: 'Trade license — D-016 requires a license number on file.',
        entry: {
          ...(contactCompliance.contractorLicense || {}),
          contractorLicenseNumber:
            contactCompliance.contractorLicense?.contractorLicenseNumber
            || compliance.contractorLicenseNumber,
        },
      },
    ];

    const refresh = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', effectiveUid));
        if (snap.exists()) setCompliance(snap.data() as ComplianceData);
        if (subContactId) {
          const cs = await getDoc(doc(db, 'contacts', subContactId));
          if (cs.exists()) setContactCompliance(((cs.data() as any).compliance || {}) as ContactComplianceMap);
        }
      } catch { /* non-fatal */ }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Compliance Profile</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{compliancePct}% complete</span>
            <div className="w-24">
              <Progress value={compliancePct} className="h-2" />
            </div>
          </div>
        </div>

        {compliancePct === 100 && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Your compliance profile is fully up to date. You're eligible for bid awards.
            </AlertDescription>
          </Alert>
        )}

        {!subContactId && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Your login isn't linked to a Skyeline contact record yet — uploads will be
              disabled until that's resolved. Contact Skyeline to finish onboarding.
            </AlertDescription>
          </Alert>
        )}

        {!uploadProjectId && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You'll be able to upload compliance docs once you're assigned to at least one
              project. (Compliance files live under the project's Storage tree.)
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {items.map(item => (
            <ComplianceUploadCard
              key={item.key}
              type={item.key}
              label={item.label}
              description={item.description}
              icon={item.icon}
              entry={item.entry}
              onFile={item.onFile}
              subContactId={subContactId}
              projectId={uploadProjectId}
              onUploaded={refresh}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderInvoices = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Invoices</h2>
      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 font-medium">No invoices yet</p>
            <p className="text-sm text-gray-400 mt-1">Invoices will appear here once issued.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map(inv => (
            <Card key={inv.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {inv.invoiceNumber ? `Invoice #${inv.invoiceNumber}` : 'Invoice'}
                    </p>
                    {inv.projectName && <p className="text-sm text-gray-500">{inv.projectName}</p>}
                    {inv.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due {fmt(inv.dueDate)}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{fmtMoney(inv.amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${invoiceStatusColor[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // Pay-app / invoice submission — sub picks an awarded project, fills the
  // invoice form, hits Submit, the GC sees the bill in their existing Bills
  // page (financials where type='bill') with submittedBy:'sub'.
  const renderPayApp = () => {
    // Awarded projects: bids with status 'accepted' or 'awarded' tell us which
    // projects this sub is contractually billable on.
    const awardedProjectIds = new Set(
      bids
        .filter(b => b.status === 'accepted' || (b.status as any) === 'awarded')
        .map(b => b.projectId)
        .filter(Boolean) as string[],
    );
    const awardedProjects = projects
      .filter(p => awardedProjectIds.has(p.id))
      .map(p => ({ id: p.id, name: p.name }));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900">Pay Application</h2>
          <p className="text-[11px] text-gray-500 max-w-md text-right">
            Submit a pay app or invoice straight to Skyeline — no more emailing PDFs.
          </p>
        </div>

        <SubInvoiceForm
          subContactId={subContactId}
          awardedProjects={awardedProjects}
          onSubmitted={() => { /* parent already subscribes via Bills.tsx on the GC side */ }}
        />
      </div>
    );
  };

  const renderPurchaseOrders = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Purchase Orders</h2>
      {purchaseOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 font-medium">No purchase orders</p>
            <p className="text-sm text-gray-400 mt-1">Purchase orders issued to you will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {purchaseOrders.map(po => {
            const isAcknowledged = po.status === 'acknowledged' || po.status === 'signed';
            const isAcknowledging = acknowledgingPoId === po.id;
            return (
              <Card key={po.id} className={isAcknowledged ? 'border-green-200 bg-green-50/30' : ''}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {po.poNumber ? `PO #${po.poNumber}` : 'Purchase Order'}
                      </p>
                      {po.projectName && <p className="text-sm text-gray-500">{po.projectName}</p>}
                      {po.issuedAt && <p className="text-xs text-gray-400 mt-0.5">Issued {fmt(po.issuedAt)}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{fmtMoney(po.amount)}</p>
                        {po.status && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            isAcknowledged
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {po.status === 'acknowledged' ? '✓ Acknowledged' : po.status}
                          </span>
                        )}
                      </div>
                      {!isAcknowledged && (
                        <Button
                          size="sm"
                          disabled={isAcknowledging}
                          onClick={() => handleAcknowledgePO(po)}
                          className="gap-1.5 min-h-[44px] md:min-h-0 font-semibold"
                          style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                        >
                          {isAcknowledging ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" />
                              Accepting…
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3.5 h-3.5" /> Accept PO
                            </>
                          )}
                        </Button>
                      )}
                      {isAcknowledged && (
                        <div className="flex items-center gap-1 text-sm text-green-600 font-medium">
                          <CheckCircle className="w-4 h-4" /> Accepted
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderMessages = () => {
    const activeId = msgProjectId || projects[0]?.id || '';
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900">Messages</h2>
          {projects.length > 0 && (
            <select
              value={activeId}
              onChange={e => setMsgProjectId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
        {!activeId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-700 font-medium">No projects assigned yet</p>
              <p className="text-sm text-gray-500 mt-1">You'll see a channel here when the team tags you on a job.</p>
            </CardContent>
          </Card>
        ) : (
          <ProjectChat projectId={activeId} />
        )}
      </div>
    );
  };

  // RFIs — field questions the sub raises and the team answers. Scoped to one
  // assigned project at a time (a sub may be on several jobs at once).
  const renderRFIs = () => {
    const activeId = rfiProjectId || projects[0]?.id || '';
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-gray-900">RFIs &amp; Field Questions</h2>
          {projects.length > 0 && (
            <select
              value={activeId}
              onChange={e => setRfiProjectId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        {!activeId ? (
          <Card>
            <CardContent className="py-12 text-center">
              <HelpCircle className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-700 font-medium">No projects assigned yet</p>
              <p className="text-sm text-gray-500 mt-1">Once you're assigned to a job, you can raise RFIs here.</p>
            </CardContent>
          </Card>
        ) : (
          <RFIPanel
            projectId={activeId}
            projectName={projects.find(p => p.id === activeId)?.name}
          />
        )}
      </div>
    );
  };

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-t-transparent"
            style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
        </div>
      );
    }

    switch (currentTab) {
      case 'dashboard': return renderDashboard();
      case 'bid-requests': return <><RecipientMismatchBanner /><SubBidRequestsTab /></>;
      case 'bids': return renderBids();
      case 'contracts': return <MyContractsView userId={effectiveUid} audience="sub" />;
      case 'schedule': return renderSchedule();
      case 'compliance': return renderCompliance();
      case 'invoices': return renderInvoices();
      case 'pay-app': return renderPayApp();
      case 'purchase-orders': return renderPurchaseOrders();
      case 'progress-photos': return <PhotosTab projectId={projects[0]?.id || ''} />;
      case 'rfis': return renderRFIs();
      case 'messages': return renderMessages();
      default: return renderDashboard();
    }
  };

  return (
    <>
      <AdminPortalControls />
      <SubcontractorLayout>
        <div className="space-y-4">
          {/* Page header */}
          {currentTab !== 'messages' && currentTab !== 'progress-photos' && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">{userName}</p>
            </div>
          )}

          {renderTabContent()}
        </div>
      </SubcontractorLayout>
    </>
  );
}
