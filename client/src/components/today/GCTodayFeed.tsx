import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { TodaySection, TodayRow, greeting, todayLabel } from './TodaySection';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList, DollarSign, Camera, MessageSquare, Wallet,
  AlertTriangle, FolderOpen, Flame,
} from 'lucide-react';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = new Date();
const todayYMD = ymd(today);
const sevenDays = new Date(today.getTime() + 7 * 86400000);
const sevenDaysYMD = ymd(sevenDays);

export function GCTodayFeed() {
  const { user } = useAuth();
  const [tasksToday, setTasksToday] = useState<any[]>([]);
  const [billsDueWeek, setBillsDueWeek] = useState<any[]>([]);
  const [walkthroughsOpen, setWalkthroughsOpen] = useState<any[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState<any[]>([]);
  const [drawsPending, setDrawsPending] = useState<any[]>([]);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);

  // Tasks due today or earlier (overdue + due-today), not done
  useEffect(() => {
    const q = query(
      collection(db, 'tasks'),
      where('status', 'in', ['todo', 'in_progress']),
      orderBy('dueDate', 'asc'),
      limit(50),
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      // Filter client-side to today-or-earlier (Firestore can't do AND on different orderBy)
      setTasksToday(items.filter(t => t.dueDate && t.dueDate <= todayYMD).slice(0, 8));
    }, () => {});
  }, []);

  // Bills due in next 7 days, unpaid
  useEffect(() => {
    const q = query(
      collection(db, 'financials'),
      where('type', '==', 'bill'),
      where('status', '==', 'unpaid'),
      orderBy('dueDate', 'asc'),
      limit(50),
    );
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setBillsDueWeek(items.filter(b => !b.dueDate || b.dueDate <= sevenDaysYMD).slice(0, 8));
    }, () => {});
  }, []);

  // Open walkthroughs across all projects (collectionGroup)
  useEffect(() => {
    // Use /projects/{anyId}/walkthroughs query via collectionGroup is ideal but
    // requires extra index — for MVP, query each known project. Simpler: use
    // top-level fanout if we had one. Skip for now and surface via tasks (since
    // walkthroughs auto-create tasks).
    setWalkthroughsOpen([]);
  }, []);

  // Unread message-type notifications for me
  useEffect(() => {
    if (!user) return;
    const userId = user.id?.toString() || user.email || '';
    if (!userId) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    return onSnapshot(q, snap => {
      setUnreadNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, [user]);

  // Draws — pending status, by due date soonest
  useEffect(() => {
    // Draws live in projects/{id}/draws — collectionGroup query
    const q = query(
      collection(db, 'draws'),
      where('status', 'in', ['pending', 'requested']),
      orderBy('dueDate', 'asc'),
      limit(10),
    );
    return onSnapshot(q, snap => {
      setDrawsPending(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, () => {});
  }, []);

  // High-priority leads created or updated in the past 7 days. Anchors the
  // GC's "what's hot in the pipeline" attention.
  useEffect(() => {
    const q = query(
      collection(db, 'clients'),
      where('priority', '==', 'high'),
      orderBy('updatedAt', 'desc'),
      limit(20),
    );
    const unsub = onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const cutoffMs = Date.now() - 7 * 86400000;
      // Keep ones updated within 7 days, OR with no updatedAt (fall back to created)
      setHotLeads(items.filter(c => {
        const updated = c.updatedAt?.seconds ? c.updatedAt.seconds * 1000 : 0;
        const created = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : 0;
        const ts = updated || created;
        return !ts || ts >= cutoffMs;
      }).slice(0, 8));
    }, () => {
      // Fallback if composite index missing — fetch w/o orderBy and filter+sort client-side.
      const fb = query(collection(db, 'clients'), where('priority', '==', 'high'), limit(50));
      onSnapshot(fb, fbsnap => {
        const items = fbsnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const cutoffMs = Date.now() - 7 * 86400000;
        const filtered = items.filter(c => {
          const updated = c.updatedAt?.seconds ? c.updatedAt.seconds * 1000 : 0;
          const created = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : 0;
          const ts = updated || created;
          return !ts || ts >= cutoffMs;
        }).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
        setHotLeads(filtered.slice(0, 8));
      }, () => {});
    });
    return unsub;
  }, []);

  // Recent projects (most recently updated)
  useEffect(() => {
    const q = query(
      collection(db, 'projects'),
      where('status', 'in', ['active', 'planning']),
      orderBy('updatedAt', 'desc'),
      limit(5),
    );
    return onSnapshot(q, snap => {
      setRecentProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, err => {
      // updatedAt ordering may need an index — fallback
      const fb = query(collection(db, 'projects'), where('status', '==', 'active'), limit(5));
      return onSnapshot(fb, fbsnap => {
        setRecentProjects(fbsnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      }, () => {});
    });
  }, []);

  const totalBillsDue = useMemo(
    () => billsDueWeek.reduce((s, b) => s + (b.amount || 0), 0),
    [billsDueWeek],
  );

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {user?.name?.split(' ')[0] || 'Tyler'}
        </h1>
        <p className="text-sm text-gray-500">{todayLabel()}</p>
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<ClipboardList className="w-4 h-4" />}
          label="Tasks today"
          value={tasksToday.length}
          color={tasksToday.length > 5 ? 'text-orange-600' : 'text-gray-900'}
        />
        <Stat
          icon={<DollarSign className="w-4 h-4" />}
          label="Bills this week"
          value={`$${(totalBillsDue / 1000).toFixed(1)}k`}
          sublabel={`${billsDueWeek.length} bills`}
        />
        <Stat
          icon={<MessageSquare className="w-4 h-4" />}
          label="Unread notifs"
          value={unreadNotifs.length}
          color={unreadNotifs.length > 0 ? 'text-blue-600' : 'text-gray-900'}
        />
        <Stat
          icon={<Wallet className="w-4 h-4" />}
          label="Draws pending"
          value={drawsPending.length}
          color={drawsPending.length > 0 ? 'text-amber-600' : 'text-gray-900'}
        />
      </div>

      {/* Hot leads — high-priority pipeline items from past 7 days. Always
          renders (empty state included) so it's a stable spot the GC looks. */}
      <TodaySection
        title="Hot leads (high priority, last 7 days)"
        count={hotLeads.length}
        icon={<Flame className="w-4 h-4 text-red-500" />}
        emptyState="No high-priority leads in the past week."
        viewAllHref="/sales"
      >
        {hotLeads.map(c => (
          <TodayRow
            key={c.id}
            primary={
              <span className="font-medium flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {c.name}
              </span>
            }
            secondary={c.stage || c.email || ''}
            meta={
              <span className="font-mono">
                {c.budget ? `$${(c.budget / 1000).toFixed(0)}k` : ''}
                {c.assignedToName && <span className="text-gray-400 ml-1.5">· {c.assignedToName}</span>}
              </span>
            }
            href="/sales"
          />
        ))}
      </TodaySection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tasks today */}
        <TodaySection
          title="Tasks due today or overdue"
          count={tasksToday.length}
          icon={<ClipboardList className="w-4 h-4" />}
          emptyState="No tasks due today — clear runway."
          viewAllHref="/tasks"
        >
          {tasksToday.map(t => (
            <TodayRow
              key={t.id}
              primary={<span className="font-medium">{t.name || 'Untitled task'}</span>}
              secondary={t.projectName || '—'}
              meta={
                t.dueDate < todayYMD
                  ? <span className="text-red-600 font-medium">overdue</span>
                  : <span className="text-orange-600">today</span>
              }
              href={t.projectId ? `/projects/${t.projectId}/overview` : '/tasks'}
              highlight={t.dueDate < todayYMD}
            />
          ))}
        </TodaySection>

        {/* Bills due */}
        <TodaySection
          title="Bills due this week"
          count={billsDueWeek.length}
          icon={<DollarSign className="w-4 h-4" />}
          emptyState="No bills due in the next 7 days."
          viewAllHref="/finance"
        >
          {billsDueWeek.map(b => (
            <TodayRow
              key={b.id}
              primary={<span className="font-medium">{b.vendor || 'Unknown vendor'}</span>}
              secondary={b.description || b.invoiceNumber || ''}
              meta={
                <span className="font-mono">
                  ${(b.amount || 0).toLocaleString()}
                  {b.dueDate && <span className="text-gray-400 ml-1.5">· {b.dueDate}</span>}
                </span>
              }
              href="/finance"
            />
          ))}
        </TodaySection>

        {/* Notifications */}
        <TodaySection
          title="Unread notifications"
          count={unreadNotifs.length}
          icon={<MessageSquare className="w-4 h-4" />}
          emptyState="Nothing in the inbox."
          viewAllHref="/messages"
        >
          {unreadNotifs.slice(0, 5).map(n => (
            <TodayRow
              key={n.id}
              primary={<span className="font-medium">{n.title}</span>}
              secondary={n.body || n.fromUserName || ''}
              meta={<span className="text-[10px] uppercase">{n.kind?.replace('_', ' ')}</span>}
              href={n.link || '#'}
            />
          ))}
        </TodaySection>

        {/* Draws pending */}
        <TodaySection
          title="Draws pending release"
          count={drawsPending.length}
          icon={<Wallet className="w-4 h-4" />}
          emptyState="No draws waiting."
          viewAllHref="/finance"
        >
          {drawsPending.slice(0, 5).map(d => (
            <TodayRow
              key={d.id}
              primary={<span className="font-medium">{d.milestone || `Draw ${d.drawNumber || ''}`}</span>}
              secondary={d.projectName || ''}
              meta={
                <span className="font-mono">
                  ${(d.amount || 0).toLocaleString()}
                  {d.dueDate && <span className="text-gray-400 ml-1.5">· {d.dueDate}</span>}
                </span>
              }
              href="/finance"
            />
          ))}
        </TodaySection>

        {/* Active projects — full width */}
        <div className="lg:col-span-2">
          <TodaySection
            title="Active projects"
            count={recentProjects.length}
            icon={<FolderOpen className="w-4 h-4" />}
            emptyState="No active projects yet."
            viewAllHref="/projects"
          >
            {recentProjects.map(p => (
              <TodayRow
                key={p.id}
                primary={<span className="font-medium">{p.name}</span>}
                secondary={p.address || p.clientName || ''}
                meta={
                  <span className="flex items-center gap-2">
                    {p.currentPhase && <Badge variant="outline" className="text-[10px]">{p.currentPhase}</Badge>}
                    <span>{p.status}</span>
                  </span>
                }
                href={`/projects/${p.id}/overview`}
              />
            ))}
          </TodaySection>
        </div>
      </div>
    </div>
  );
}

// ─── Stat tile ───────────────────────────────────────────────────────────────

function Stat({
  icon, label, value, sublabel, color = 'text-gray-900',
}: { icon: React.ReactNode; label: string; value: string | number; sublabel?: string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sublabel && <div className="text-[10px] text-gray-400">{sublabel}</div>}
    </div>
  );
}
