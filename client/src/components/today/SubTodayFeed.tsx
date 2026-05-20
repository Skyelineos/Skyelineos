import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useAdminView } from '@/contexts/AdminViewContext';
import { TodaySection, TodayRow, greeting, todayLabel } from './TodaySection';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  ClipboardList, Camera, FileText, Phone, Mail, MapPin,
  Hammer, AlertTriangle,
} from 'lucide-react';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const todayYMD = ymd(today);
const sevenDaysYMD = ymd(new Date(today.getTime() + 7 * 86400000));

export function SubTodayFeed() {
  const { user } = useAuth();
  const { isAdminView, viewedUser } = useAdminView();
  const subId = isAdminView && viewedUser
    ? viewedUser.id
    : (user?.id?.toString() || user?.email || '');
  const displayName = isAdminView && viewedUser ? viewedUser.name : user?.name;

  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [myWalkthroughs, setMyWalkthroughs] = useState<any[]>([]);
  const [myInvoices, setMyInvoices] = useState<any[]>([]);
  const [myBids, setMyBids] = useState<any[]>([]);
  const [contactInfo, setContactInfo] = useState<{ name: string; phone?: string; email?: string } | null>(null);

  // My tasks (assignedSubId or assignedToContactId == me), due in next 7 days, not done
  useEffect(() => {
    if (!subId) return;
    const q = query(
      collection(db, 'tasks'),
      where('assignedSubId', '==', subId),
      orderBy('dueDate', 'asc'),
      limit(30),
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setMyTasks(items.filter(t => t.status !== 'done').slice(0, 12));
    }, () => {});
  }, [subId]);

  // Walkthroughs assigned to me — across all projects (collectionGroup)
  // Note: collectionGroup queries need a separate index; fallback to client filter if needed
  useEffect(() => {
    if (!subId) return;
    // For MVP, walkthroughs auto-create tasks (already covered above), so just surface
    // any tasks of category 'walkthrough' separately
    setMyWalkthroughs([]);
  }, [subId]);

  // Outstanding invoices I issued (subId == me, status unpaid)
  useEffect(() => {
    if (!subId) return;
    const q = query(
      collection(db, 'invoices'),
      where('subId', '==', subId),
      where('status', 'in', ['sent', 'overdue', 'unpaid']),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    return onSnapshot(q, snap => {
      setMyInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, [subId]);

  // Bids I've submitted
  useEffect(() => {
    if (!subId) return;
    const q = query(
      collection(db, 'bids'),
      where('subId', '==', subId),
      orderBy('createdAt', 'desc'),
      limit(10),
    );
    return onSnapshot(q, snap => {
      setMyBids(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, [subId]);

  // GC contact info from settings
  useEffect(() => {
    (async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'companyInfo'));
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          setContactInfo({
            name: data.gcName || 'Skyeline Homes',
            phone: data.gcPhone || data.companyPhone,
            email: data.gcEmail || data.companyEmail,
          });
        }
      } catch {}
    })();
  }, []);

  const tasksOverdue = myTasks.filter(t => t.dueDate && t.dueDate < todayYMD).length;
  const tasksToday = myTasks.filter(t => t.dueDate === todayYMD).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {displayName?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-sm text-gray-500">{todayLabel()}</p>
      </div>

      {/* Stats strip — uses the shared StatCard so it matches the rest of
          the dashboard's design language. Semantic accents (red/amber) only
          when the tile is communicating status. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          icon={AlertTriangle}
          label="Overdue"
          value={tasksOverdue}
          accent={tasksOverdue > 0 ? 'red' : 'gold'}
        />
        <StatCard
          icon={ClipboardList}
          label="Due today"
          value={tasksToday}
          accent={tasksToday > 0 ? 'amber' : 'gold'}
        />
        <StatCard icon={FileText} label="Open invoices" value={myInvoices.length} accent="gold" />
        <StatCard icon={Hammer} label="Active bids" value={myBids.length} accent="gold" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My tasks */}
        <TodaySection
          title="My work"
          count={myTasks.length}
          icon={<ClipboardList className="w-4 h-4" />}
          emptyState="Nothing on your plate. New work will appear here."
          viewAllHref="/subcontractor-portal/tasks"
        >
          {myTasks.slice(0, 8).map(t => {
            const isOverdue = t.dueDate && t.dueDate < todayYMD;
            const isToday = t.dueDate === todayYMD;
            return (
              <TodayRow
                key={t.id}
                primary={<span className="font-medium">{t.name || 'Task'}</span>}
                secondary={
                  <span className="flex items-center gap-1.5">
                    {t.projectName && <span>{t.projectName}</span>}
                    {t.category === 'walkthrough' && <Badge variant="outline" className="text-[10px]">📷 walkthrough</Badge>}
                  </span>
                }
                meta={
                  isOverdue
                    ? <span className="text-red-600 font-medium">overdue</span>
                    : isToday
                      ? <span className="text-orange-600">today</span>
                      : <span>{t.dueDate || ''}</span>
                }
                href="/subcontractor-portal/tasks"
                highlight={isOverdue}
              />
            );
          })}
        </TodaySection>

        {/* GC Contact */}
        <TodaySection
          title="Who you're reporting to"
          count={contactInfo ? 1 : 0}
          icon={<Phone className="w-4 h-4" />}
          emptyState="Contact info coming soon."
        >
          {contactInfo && (
            <div className="space-y-1.5 py-1">
              <div className="font-semibold text-gray-900">{contactInfo.name}</div>
              {contactInfo.phone && (
                <a href={`tel:${contactInfo.phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#C9A96E]">
                  <Phone className="w-3.5 h-3.5" /> {contactInfo.phone}
                </a>
              )}
              {contactInfo.email && (
                <a href={`mailto:${contactInfo.email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#C9A96E]">
                  <Mail className="w-3.5 h-3.5" /> {contactInfo.email}
                </a>
              )}
            </div>
          )}
        </TodaySection>

        {/* Outstanding invoices */}
        <TodaySection
          title="Outstanding invoices"
          count={myInvoices.length}
          icon={<FileText className="w-4 h-4" />}
          emptyState="No open invoices."
          viewAllHref="/subcontractor-portal/invoices"
        >
          {myInvoices.slice(0, 5).map(i => (
            <TodayRow
              key={i.id}
              primary={<span className="font-medium">{i.invoiceNumber || `Invoice ${i.id.slice(0, 6)}`}</span>}
              secondary={i.projectName || i.description || ''}
              meta={
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                  <span className="font-mono">${(i.amount || 0).toLocaleString()}</span>
                </span>
              }
              href="/subcontractor-portal/invoices"
            />
          ))}
        </TodaySection>

        {/* My bids */}
        <TodaySection
          title="My bids"
          count={myBids.length}
          icon={<Hammer className="w-4 h-4" />}
          emptyState="No active bids."
          viewAllHref="/subcontractor-portal/bids"
        >
          {myBids.slice(0, 5).map(b => (
            <TodayRow
              key={b.id}
              primary={<span className="font-medium">{b.trade || 'Bid'}</span>}
              secondary={b.projectName || b.vendor || ''}
              meta={
                <span className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{b.status || 'submitted'}</Badge>
                  {b.amount && <span className="font-mono">${(b.amount || 0).toLocaleString()}</span>}
                </span>
              }
              href="/subcontractor-portal/bids"
            />
          ))}
        </TodaySection>
      </div>
    </div>
  );
}

