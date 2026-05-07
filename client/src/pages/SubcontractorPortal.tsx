import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  collection, query, where, onSnapshot, doc, getDoc, orderBy,
} from 'firebase/firestore';
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
  FileText, ChevronRight,
} from 'lucide-react';
import PhotosTab from '@/components/photos/PhotosTab';
import { MessagingModule } from '@/components/messaging/MessagingModule';

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
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  dueDate?: string;
  priority?: string;
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
  w9Filed?: boolean;
  w9ExpiresAt?: string;
  insuranceCurrent?: boolean;
  insuranceExpiresAt?: string;
  agreementSigned?: boolean;
  agreementSignedAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const taskStatusColor: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
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
  const [loading, setLoading] = useState(true);

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

    return () => unsubs.forEach(u => u());
  }, [effectiveUid]);

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

  const compliantItems = [compliance.w9Filed, compliance.insuranceCurrent, compliance.agreementSigned].filter(Boolean).length;
  const compliancePct = Math.round((compliantItems / 3) * 100);

  // ── Render helpers ────────────────────────────────────────────────────────

  const tabTitle = (tab: string) =>
    tab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  // ── Tab content ───────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', value: activeProjects.length, icon: Building, color: 'text-blue-600' },
          { label: 'Open Bids', value: openBids.length, icon: Briefcase, color: 'text-amber-600' },
          { label: 'Pending Invoices', value: pendingInvoices.length, icon: FileText, color: 'text-orange-600' },
          { label: 'Paid This Month', value: fmtMoney(paidThisMonth), icon: DollarSign, color: 'text-green-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-gray-50 ${s.color}`}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Compliance alert */}
      {compliantItems < 3 && (
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Tasks */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#C9A96E]" /> Upcoming Tasks
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
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assigned Projects */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="w-4 h-4 text-[#C9A96E]" /> Assigned Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeProjects.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No projects assigned yet</p>
            ) : (
              <div className="space-y-2">
                {activeProjects.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      {p.address && <p className="text-xs text-gray-400">{p.address}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.currentPhase && <span className="text-xs text-gray-400">{p.currentPhase}</span>}
                      {p.status && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {p.status}
                        </span>
                      )}
                    </div>
                  </div>
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
      <h2 className="text-xl font-bold text-gray-900">Bid Management</h2>
      {bids.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 font-medium">No bids found</p>
            <p className="text-sm text-gray-400 mt-1">Bid invitations from Skyeline Homes will appear here.</p>
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{task.name}</p>
                    {task.projectName && <p className="text-sm text-gray-500">{task.projectName}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {task.dueDate && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="w-3.5 h-3.5" />
                        {fmt(task.dueDate)}
                      </div>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${taskStatusColor[task.status] || 'bg-gray-100 text-gray-600'}`}>
                      {task.status.replace('_', ' ')}
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

  const renderCompliance = () => {
    const items = [
      {
        key: 'w9',
        label: 'W-9 Form',
        icon: FileCheck,
        filed: compliance.w9Filed,
        expiresAt: compliance.w9ExpiresAt,
        description: 'Federal tax identification form',
      },
      {
        key: 'insurance',
        label: 'Insurance Certificate',
        icon: Shield,
        filed: compliance.insuranceCurrent,
        expiresAt: compliance.insuranceExpiresAt,
        description: 'Certificate of insurance (COI)',
      },
      {
        key: 'agreement',
        label: 'Subcontractor Agreement',
        icon: FileCheck,
        filed: compliance.agreementSigned,
        expiresAt: compliance.agreementSignedAt,
        description: 'Master subcontractor agreement',
      },
    ];

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
              Your compliance profile is fully up to date.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {items.map(item => (
            <Card key={item.key}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${item.filed ? 'bg-green-50' : 'bg-red-50'}`}>
                      <item.icon className={`w-5 h-5 ${item.filed ? 'text-green-600' : 'text-red-500'}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.description}</p>
                      {item.expiresAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {item.filed ? 'On file since' : 'Signed'}: {fmt(item.expiresAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      item.filed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {item.filed ? 'On File' : 'Missing'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => toast({ title: 'Upload coming soon', description: 'Document upload will be available shortly.' })}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
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
          {purchaseOrders.map(po => (
            <Card key={po.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {po.poNumber ? `PO #${po.poNumber}` : 'Purchase Order'}
                    </p>
                    {po.projectName && <p className="text-sm text-gray-500">{po.projectName}</p>}
                    {po.issuedAt && <p className="text-xs text-gray-400 mt-0.5">Issued {fmt(po.issuedAt)}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{fmtMoney(po.amount)}</p>
                    {po.status && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {po.status}
                      </span>
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

  const renderMessages = () => (
    <div className="h-[calc(100vh-200px)]">
      <MessagingModule
        projectId={0}
        currentUser={{
          id: effectiveUid,
          name: userName,
          email: userEmail,
          role: 'sub' as const,
          avatar: '',
        }}
      />
    </div>
  );

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
      case 'bids': return renderBids();
      case 'schedule': return renderSchedule();
      case 'compliance': return renderCompliance();
      case 'invoices': return renderInvoices();
      case 'purchase-orders': return renderPurchaseOrders();
      case 'progress-photos': return <PhotosTab />;
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
