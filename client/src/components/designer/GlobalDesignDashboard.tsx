import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Selection } from '@/types/selections';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  MessageSquare,
  Eye,
  TrendingUp,
  MapPin,
  ArrowRight,
} from 'lucide-react';

interface ProjectSummary {
  id: string;
  name: string;
  clientName?: string;
  address?: string;
}

interface Props {
  projects: ProjectSummary[];
  userId: string;
  userName: string;
  onNavigateToProject: (projectId: string) => void;
}

interface ProjectData {
  projectId: string;
  projectName: string;
  clientName?: string;
  address?: string;
  selections: Selection[];
}

interface UrgentItem {
  projectId: string;
  projectName: string;
  selectionId: string;
  roomLabel: string;
  category: string;
  area: string;
  dueDate: any;
  clientApprovalStatus: string;
  roomId?: string;
  required?: boolean;
  itemCount: number;
}

interface ActivityEvent {
  id: string;
  projectId: string;
  projectName: string;
  text: string;
  when: Date;
  roomId?: string;
  selectionId?: string;
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function toDate(val: any): Date | null {
  if (!val) return null;
  return val.toDate ? val.toDate() : new Date(val);
}

function isOverdue(sel: Selection): boolean {
  if (!sel.dueDate) return false;
  if (sel.clientApprovalStatus === 'Approved') return false;
  const due = toDate(sel.dueDate);
  return due ? due < new Date() : false;
}

function isDueSoon(sel: Selection): boolean {
  if (!sel.dueDate) return false;
  if (sel.clientApprovalStatus === 'Approved') return false;
  const due = toDate(sel.dueDate);
  if (!due) return false;
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  return diffDays >= 0 && diffDays <= 7;
}

function dueDateLabel(dueDate: any): { label: string; color: string } | null {
  if (!dueDate) return null;
  const due = toDate(dueDate);
  if (!due) return null;
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', color: 'bg-red-100 text-red-700' };
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, color: 'bg-amber-100 text-amber-700' };
  return { label: `Due ${due.toLocaleDateString()}`, color: 'bg-gray-100 text-gray-600' };
}

function urgencyScore(sel: Selection): number {
  if (isOverdue(sel)) return 0;
  if (isDueSoon(sel)) return 1;
  if (sel.required !== false && (sel.items?.length ?? 0) === 0) return 2;
  return 3;
}

export function GlobalDesignDashboard({ projects, userId, userName, onNavigateToProject }: Props) {
  const [projectDataMap, setProjectDataMap] = useState<Record<string, Selection[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastLoginAt, setLastLoginAt] = useState<Date | null>(null);

  // Track last login globally (across all projects)
  useEffect(() => {
    const lsKey = `globalLastLoginAt_${userId}`;
    const stored = localStorage.getItem(lsKey);
    setLastLoginAt(stored ? new Date(stored) : null);
    localStorage.setItem(lsKey, new Date().toISOString());
  }, [userId]);

  // Subscribe to selections for all assigned projects
  useEffect(() => {
    if (projects.length === 0) {
      setLoading(false);
      return;
    }

    let resolved = 0;
    const total = projects.length;

    const unsubs = projects.map(proj => {
      return onSnapshot(
        collection(db, 'projects', proj.id, 'selections'),
        snap => {
          const sels = snap.docs.map(d => ({ id: d.id, ...d.data() } as Selection));
          setProjectDataMap(prev => ({ ...prev, [proj.id]: sels }));
          resolved += 1;
          if (resolved >= total) setLoading(false);
        },
        err => {
          console.error(`selections error project ${proj.id}`, err);
          resolved += 1;
          if (resolved >= total) setLoading(false);
        }
      );
    });

    return () => unsubs.forEach(u => u());
  }, [projects.map(p => p.id).join(',')]);

  // Aggregate all selections
  const allSelections: { sel: Selection; projectId: string; projectName: string }[] = [];
  for (const proj of projects) {
    const sels = projectDataMap[proj.id] || [];
    for (const sel of sels) {
      allSelections.push({ sel, projectId: proj.id, projectName: proj.name });
    }
  }

  // Global stats
  const totalRequired = allSelections.filter(({ sel }) => sel.required !== false).length;
  const totalApproved = allSelections.filter(({ sel }) => sel.clientApprovalStatus === 'Approved').length;
  const globalCompletePct = totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0;
  const globalOverdue = allSelections.filter(({ sel }) => isOverdue(sel)).length;
  const globalOpenQuestions = allSelections.reduce((acc, { sel }) => {
    return acc + (sel.comments || []).filter(c => c.isQuestion && !c.resolved).length;
  }, 0);

  // Per-project stats
  const projectStats = projects.map(proj => {
    const sels = projectDataMap[proj.id] || [];
    const total = sels.filter(s => s.required !== false).length;
    const approved = sels.filter(s => s.clientApprovalStatus === 'Approved').length;
    const overdue = sels.filter(isOverdue).length;
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { proj, total, approved, overdue, pct };
  });

  // Cross-project urgent items (top 10)
  const urgentItems: UrgentItem[] = allSelections
    .filter(({ sel }) => sel.clientApprovalStatus !== 'Approved')
    .sort((a, b) => urgencyScore(a.sel) - urgencyScore(b.sel))
    .slice(0, 10)
    .map(({ sel, projectId, projectName }) => ({
      projectId,
      projectName,
      selectionId: sel.id,
      roomLabel: (sel as any).roomName || sel.room || '—',
      category: sel.category,
      area: sel.area,
      dueDate: sel.dueDate,
      clientApprovalStatus: sel.clientApprovalStatus,
      roomId: sel.roomId,
      required: sel.required,
      itemCount: sel.items?.length ?? 0,
    }));

  // Cross-project activity feed
  const activityEvents: ActivityEvent[] = [];
  if (lastLoginAt) {
    for (const { sel, projectId, projectName } of allSelections) {
      const updatedAt = toDate(sel.updatedAt);
      if (updatedAt && updatedAt > lastLoginAt) {
        if (sel.clientApprovalStatus === 'Approved') {
          activityEvents.push({
            id: `approved-${projectId}-${sel.id}`,
            projectId,
            projectName,
            text: `Client approved ${sel.area} — ${(sel as any).roomName || sel.room || 'Unknown room'}`,
            when: updatedAt,
            roomId: sel.roomId,
            selectionId: sel.id,
          });
        } else if ((sel.items?.length ?? 0) > 0) {
          activityEvents.push({
            id: `item-${projectId}-${sel.id}`,
            projectId,
            projectName,
            text: `Selection added for ${sel.area} — ${(sel as any).roomName || sel.room || 'Unknown room'}`,
            when: updatedAt,
            roomId: sel.roomId,
            selectionId: sel.id,
          });
        }
      }
      for (const comment of sel.comments || []) {
        const commentAt = toDate(comment.createdAt);
        if (commentAt && commentAt > lastLoginAt) {
          const loc = (sel as any).roomName || sel.room || 'Unknown room';
          activityEvents.push({
            id: `comment-${projectId}-${comment.id}`,
            projectId,
            projectName,
            text: comment.isQuestion
              ? `${comment.authorName} asked: "${comment.text.slice(0, 55)}${comment.text.length > 55 ? '…' : ''}" (${loc})`
              : `${comment.authorName} commented on ${loc} · ${sel.area}`,
            when: commentAt,
            roomId: sel.roomId,
            selectionId: sel.id,
          });
        }
      }
    }
    activityEvents.sort((a, b) => b.when.getTime() - a.when.getTime());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#C9A96E' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 p-4" style={{ borderColor: '#C9A96E' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">All Projects</span>
            <TrendingUp className="w-4 h-4" style={{ color: '#C9A96E' }} />
          </div>
          <div className="text-3xl font-bold text-gray-900">{globalCompletePct}%</div>
          <div className="text-xs text-gray-400 mt-1">{totalApproved} of {totalRequired} approved</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${globalCompletePct}%`, backgroundColor: '#C9A96E' }} />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Selections</span>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{totalApproved}</div>
          <div className="text-xs text-gray-400 mt-1">approved · {allSelections.length} total</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overdue</span>
            <AlertTriangle className={`w-4 h-4 ${globalOverdue > 0 ? 'text-red-500' : 'text-gray-300'}`} />
          </div>
          <div className={`text-3xl font-bold ${globalOverdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {globalOverdue}
          </div>
          <div className="text-xs text-gray-400 mt-1">across all projects</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Open Questions</span>
            <MessageSquare className={`w-4 h-4 ${globalOpenQuestions > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
          </div>
          <div className={`text-3xl font-bold ${globalOpenQuestions > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {globalOpenQuestions}
          </div>
          <div className="text-xs text-gray-400 mt-1">need response</div>
        </div>
      </div>

      {/* Three-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Per-project progress */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Projects Overview</h3>
          {projectStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No projects assigned</p>
          ) : (
            <div className="space-y-4">
              {projectStats.map(({ proj, total, approved, overdue, pct }) => (
                <button
                  key={proj.id}
                  onClick={() => onNavigateToProject(proj.id)}
                  className="w-full text-left group"
                >
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate group-hover:underline" style={{ textDecorationColor: '#C9A96E' }}>
                        {proj.name}
                      </p>
                      {proj.clientName && (
                        <p className="text-xs text-gray-400 truncate">{proj.clientName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {overdue > 0 && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600">
                          {overdue} overdue
                        </span>
                      )}
                      <span className="text-xs font-bold" style={{ color: '#8a6a3a' }}>{pct}%</span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: overdue > 0 ? '#ef4444' : pct === 100 ? '#22c55e' : '#C9A96E',
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{approved} of {total} approved</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: Cross-project urgent items */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Next Crucial Selections</h3>
          {urgentItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
              <p className="text-sm text-gray-500">All required selections approved!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {urgentItems.map(item => {
                const over = isOverdue({ dueDate: item.dueDate, clientApprovalStatus: item.clientApprovalStatus } as Selection);
                const soon = !over && isDueSoon({ dueDate: item.dueDate, clientApprovalStatus: item.clientApprovalStatus } as Selection);
                const dd = dueDateLabel(item.dueDate);

                return (
                  <div
                    key={`${item.projectId}-${item.selectionId}`}
                    className={`rounded-lg p-3 border text-sm ${over ? 'bg-red-50 border-red-100' : soon ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate text-xs" style={{ color: '#8a6a3a' }}>
                          {item.projectName}
                        </p>
                        <p className="font-medium text-gray-800 truncate">{item.roomLabel}</p>
                        <p className="text-xs text-gray-500 truncate">{item.category} · {item.area}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 h-6 px-2 text-xs"
                        onClick={() => onNavigateToProject(item.projectId)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </Button>
                    </div>
                    {dd && (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${dd.color}`}>
                          {over && <Clock className="w-3 h-3" />}
                          {dd.label}
                        </span>
                        <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                          {item.clientApprovalStatus}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Cross-project activity feed */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Activity Since Last Visit</h3>
          {lastLoginAt ? (
            <p className="text-xs text-gray-400 mb-4">
              Since {lastLoginAt.toLocaleDateString()} at {lastLoginAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mb-4">First visit — showing recent activity</p>
          )}

          {activityEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
              <p className="text-sm text-gray-500">No new activity since your last visit</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {activityEvents.slice(0, 15).map(event => (
                <div key={event.id} className="flex items-start gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#C9A96E' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: '#8a6a3a' }}>
                      {event.projectName}
                    </p>
                    <p className="text-gray-700 leading-snug text-xs">{event.text}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{relativeTime(event.when)}</span>
                      <button
                        onClick={() => onNavigateToProject(event.projectId)}
                        className="text-xs underline"
                        style={{ color: '#C9A96E' }}
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
