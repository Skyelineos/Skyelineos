import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2, Clock, AlertTriangle, ChevronRight,
  Calendar, DollarSign, Home, Wrench, Palette
} from 'lucide-react';
import SelectionsNeededTile from '@/components/dashboard/SelectionsNeededTile';

const PHASES = [
  'Pre-Construction', 'Site Prep', 'Foundation', 'Framing',
  'Rough MEP', 'Insulation', 'Drywall', 'Finish Work', 'Punch List', 'Complete'
];

interface ClientDashboardProps {
  projectId: string;
  project: any;
  onNavigate: (tab: string) => void;
}

export default function ClientDashboard({ projectId, project, onNavigate }: ClientDashboardProps) {
  // Pending selections needing approval
  const { data: selections = [] } = useQuery({
    queryKey: ['selections', projectId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'projects', projectId, 'selections'), orderBy('createdAt', 'asc'))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    },
    enabled: !!projectId,
  });

  // Pending change orders needing client decision
  const { data: changeOrders = [] } = useQuery({
    queryKey: ['changeOrders', projectId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'projects', projectId, 'changeOrders'), orderBy('createdAt', 'desc'))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    },
    enabled: !!projectId,
  });

  const pendingSelections = selections.filter((s: any) => s.status === 'pending_approval');
  const pendingChangeOrders = changeOrders.filter((c: any) => c.status === 'pending');
  const totalActions = pendingSelections.length + pendingChangeOrders.length;

  const progress = project?.progress ?? 0;
  const currentPhase = project?.currentPhase || 'Pre-Construction';
  const phaseIndex = PHASES.indexOf(currentPhase);
  const budget = project?.budget ?? 0;
  const approvedChanges = changeOrders
    .filter((c: any) => c.status === 'approved')
    .reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
  const currentTotal = budget + approvedChanges;

  const startDate = project?.startDate ? new Date(project.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const estCompletion = project?.estimatedCompletion ? new Date(project.estimatedCompletion).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <div className="p-6 space-y-6">
      {/* Action Items Banner */}
      {totalActions > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {totalActions} item{totalActions > 1 ? 's' : ''} need{totalActions === 1 ? 's' : ''} your attention
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {pendingSelections.length > 0 && `${pendingSelections.length} selection${pendingSelections.length > 1 ? 's' : ''} to review`}
                {pendingSelections.length > 0 && pendingChangeOrders.length > 0 && ' · '}
                {pendingChangeOrders.length > 0 && `${pendingChangeOrders.length} change order${pendingChangeOrders.length > 1 ? 's' : ''} to approve`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {pendingSelections.length > 0 && (
              <Button size="sm" variant="outline" className="text-amber-700 border-amber-300" onClick={() => onNavigate('selections')}>
                Review Selections <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}
            {pendingChangeOrders.length > 0 && (
              <Button size="sm" variant="outline" className="text-amber-700 border-amber-300" onClick={() => onNavigate('change-orders')}>
                Review Changes <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Selections Needed — live tile (v2) */}
      <SelectionsNeededTile
        projectId={projectId}
        phaseDeadlines={project?.phaseDeadlines}
        navigateTo="/client-portal/selections"
      />

      {/* Project Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{project?.name || 'Your Project'}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{project?.address}{project?.city ? `, ${project.city}` : ''}</p>
            </div>
            <Badge style={{ backgroundColor: '#C9A96E22', color: '#92713A', border: '1px solid #C9A96E55' }}>
              {project?.stage?.replace('_', ' ') || 'Active'}
            </Badge>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-medium">Overall Progress</span>
              <span className="font-semibold text-gray-900">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>

          {/* Phase Timeline */}
          <div className="mt-5">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Build Phases</p>
            <div className="flex gap-1 flex-wrap">
              {PHASES.map((phase, i) => (
                <div key={phase} className={`text-xs px-2 py-1 rounded-full font-medium ${
                  i < phaseIndex ? 'bg-green-100 text-green-700' :
                  i === phaseIndex ? 'text-white' :
                  'bg-gray-100 text-gray-400'
                }`} style={i === phaseIndex ? { backgroundColor: '#C9A96E', color: '#141414' } : {}}>
                  {i < phaseIndex ? '✓ ' : ''}{phase}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-gray-500 font-medium">Start Date</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{startDate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-xs text-gray-500 font-medium">Est. Completion</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{estCompletion}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-gray-500 font-medium">Contract Value</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {budget ? `$${budget.toLocaleString()}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-gray-500 font-medium">Current Phase</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{currentPhase}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => onNavigate('selections')}
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-amber-300 hover:shadow-sm transition-all text-left">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Palette className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Finish Selections</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {pendingSelections.length > 0 ? `${pendingSelections.length} awaiting your approval` : `${selections.length} categories`}
            </p>
          </div>
          {pendingSelections.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 flex-shrink-0">{pendingSelections.length}</Badge>
          )}
        </button>

        <button onClick={() => onNavigate('change-orders')}
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-left">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Change Orders</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {pendingChangeOrders.length > 0 ? `${pendingChangeOrders.length} pending your decision` : `${changeOrders.length} total`}
            </p>
          </div>
          {pendingChangeOrders.length > 0 && (
            <Badge className="bg-blue-100 text-blue-700 flex-shrink-0">{pendingChangeOrders.length}</Badge>
          )}
        </button>

        <button onClick={() => onNavigate('schedule')}
          className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-green-300 hover:shadow-sm transition-all text-left">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <Calendar className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Project Schedule</p>
            <p className="text-xs text-gray-500 mt-0.5">View your build timeline</p>
          </div>
        </button>
      </div>
    </div>
  );
}
