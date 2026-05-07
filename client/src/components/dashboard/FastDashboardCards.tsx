import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DollarSign, Calendar, AlertTriangle, CheckCircle, Clock, Home } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Fast-loading dashboard cards with minimal API calls
export function FastProjectsCard() {
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('name', 'asc'), limit(10));
    const unsub = onSnapshot(q, snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow touch-target rounded-xl"
      onClick={() => setLocation('/projects')}
    >
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-fluid-lg">
          <Home className="h-5 w-5 flex-shrink-0" />
          <span className="min-w-0 text-wrap">Active Projects</span>
        </CardTitle>
        <CardDescription className="text-fluid-sm">{projects.length} project{projects.length !== 1 ? 's' : ''} in progress</CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="space-y-3">
          {projects.slice(0, 3).map((project: any) => (
            <div key={project.id} className="flex justify-between items-center gap-2 min-w-0">
              <span className="text-fluid-sm min-w-0 text-wrap flex-1">{project.name}</span>
              <Badge variant="outline" className="flex-shrink-0 text-xs">{project.status || 'Active'}</Badge>
            </div>
          ))}
          {projects.length === 0 && (
            <p className="text-fluid-sm text-gray-500 text-wrap">No projects yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function FastFinancialCard() {
  const [, setLocation] = useLocation();
  const [totals, setTotals] = useState({ collected: 0, outstanding: 0 });

  useEffect(() => {
    getDocs(query(collection(db, 'invoices'), limit(100))).then(snap => {
      let collected = 0, outstanding = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'paid') collected += data.amount || 0;
        else if (data.status === 'sent' || data.status === 'overdue') outstanding += data.amount || 0;
      });
      setTotals({ collected, outstanding });
    }).catch(() => {});
  }, []);

  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow touch-target rounded-xl"
      onClick={() => setLocation('/finance')}
    >
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-fluid-lg">
          <DollarSign className="h-5 w-5 flex-shrink-0" />
          <span className="min-w-0 text-wrap">Financial Overview</span>
        </CardTitle>
        <CardDescription className="text-fluid-sm">Current financial status</CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <p className="text-fluid-sm text-gray-600 text-wrap">Collected</p>
            <p className="text-fluid-lg font-bold text-green-700">{fmt(totals.collected)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-fluid-sm text-gray-600 text-wrap">Outstanding</p>
            <p className="text-fluid-lg font-bold text-orange-700">{fmt(totals.outstanding)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function FastScheduleCard() {
  const [, setLocation] = useLocation();
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, 'tasks'),
      where('status', 'in', ['todo', 'in_progress']),
      orderBy('dueDate', 'asc'),
      limit(5)
    );
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return unsub;
  }, []);

  const fmtDate = (d?: string) => {
    if (!d) return '';
    const date = new Date(d);
    const today = new Date();
    const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow touch-target rounded-xl"
      onClick={() => setLocation('/tasks')}
    >
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-fluid-lg">
          <Calendar className="h-5 w-5 flex-shrink-0" />
          <span className="min-w-0 text-wrap">Upcoming Tasks</span>
        </CardTitle>
        <CardDescription className="text-fluid-sm">{tasks.length} open item{tasks.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="space-y-3">
          {tasks.length === 0 && <p className="text-fluid-sm text-gray-400">No upcoming tasks</p>}
          {tasks.slice(0, 4).map(t => (
            <div key={t.id} className="flex justify-between items-center gap-2 min-w-0">
              <span className="text-fluid-sm min-w-0 text-wrap flex-1">{t.name || t.title}</span>
              <span className={`text-xs flex-shrink-0 ${t.dueDate && new Date(t.dueDate) < new Date() ? 'text-red-500' : 'text-gray-500'}`}>{fmtDate(t.dueDate)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FastUrgentCard() {
  const [, setLocation] = useLocation();
  const [urgentItems, setUrgentItems] = useState<any[]>([]);

  useEffect(() => {
    // Fetch blocked tasks + overdue tasks (dueDate < today)
    const today = new Date().toISOString().split('T')[0];
    const qBlocked = query(collection(db, 'tasks'), where('status', '==', 'blocked'), limit(5));
    const unsub = onSnapshot(qBlocked, snap => {
      const blocked = snap.docs.map(d => ({ id: d.id, urgency: 'critical', ...d.data() }));
      // Also include high-priority tasks
      getDocs(query(collection(db, 'tasks'), where('priority', '==', 'high'), where('status', 'in', ['todo', 'in_progress']), limit(5))).then(s2 => {
        const high = s2.docs
          .filter(d => !blocked.find(b => b.id === d.id))
          .map(d => ({ id: d.id, urgency: 'high', ...d.data() }));
        setUrgentItems([...blocked, ...high].slice(0, 4));
      }).catch(() => setUrgentItems(blocked.slice(0, 4)));
    }, () => {});
    return unsub;
  }, []);

  return (
    <Card className={`rounded-xl ${urgentItems.length > 0 ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50'}`}>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-fluid-lg">
          <AlertTriangle className={`h-5 w-5 flex-shrink-0 ${urgentItems.length > 0 ? 'text-orange-600' : 'text-green-600'}`} />
          <span className="min-w-0 text-wrap">Urgent Items</span>
        </CardTitle>
        <CardDescription className="text-fluid-sm">
          {urgentItems.length > 0 ? `${urgentItems.length} item${urgentItems.length !== 1 ? 's' : ''} need attention` : 'All clear — nothing urgent'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-0">
        <div className="space-y-3">
          {urgentItems.length === 0 && (
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span className="text-fluid-sm">No blocked or high-priority tasks</span>
            </div>
          )}
          {urgentItems.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-2 min-w-0 cursor-pointer hover:bg-orange-100 p-2 rounded-md transition-colors touch-target"
              onClick={() => setLocation('/tasks')}
            >
              <Badge variant={item.urgency === 'critical' ? 'destructive' : 'secondary'} className="text-xs flex-shrink-0">
                {item.urgency === 'critical' ? 'Blocked' : 'High'}
              </Badge>
              <span className="text-fluid-sm min-w-0 text-wrap">{item.name || item.title}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}