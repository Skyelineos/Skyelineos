import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Selection, Room, SELECTION_CATEGORIES } from '@/types/selections';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  MessageSquare,
  Eye,
  TrendingUp,
} from 'lucide-react';

interface Props {
  projectId: string;
  projectName: string;
  userRole: string;
  userId: string;
  userName: string;
  onNavigateToRooms: () => void;
  onNavigateToSelections: (roomId?: string) => void;
}

interface ActivityEvent {
  id: string;
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

function dueDateLabel(dueDate: any): { label: string; color: string } | null {
  if (!dueDate) return null;
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return { label: 'Overdue', color: 'bg-red-100 text-red-700' };
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, color: 'bg-amber-100 text-amber-700' };
  return { label: `Due ${due.toLocaleDateString()}`, color: 'bg-gray-100 text-gray-600' };
}

function isOverdue(sel: Selection): boolean {
  if (!sel.dueDate) return false;
  if (sel.clientApprovalStatus === 'Approved') return false;
  const due = sel.dueDate.toDate ? sel.dueDate.toDate() : new Date(sel.dueDate);
  return due < new Date();
}

function isDueSoon(sel: Selection): boolean {
  if (!sel.dueDate) return false;
  if (sel.clientApprovalStatus === 'Approved') return false;
  const due = sel.dueDate.toDate ? sel.dueDate.toDate() : new Date(sel.dueDate);
  const diffDays = Math.ceil((due.getTime() - Date.now()) / 86400000);
  return diffDays >= 0 && diffDays <= 7;
}

export function ProjectDesignDashboard({
  projectId,
  projectName,
  userRole,
  userId,
  userName,
  onNavigateToRooms,
  onNavigateToSelections,
}: Props) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastLoginAt, setLastLoginAt] = useState<Date | null>(null);

  useEffect(() => {
    const lsKey = `lastLoginAt_${projectId}_${userId}`;
    const stored = localStorage.getItem(lsKey);
    const prev = stored ? new Date(stored) : null;
    setLastLoginAt(prev);
    localStorage.setItem(lsKey, new Date().toISOString());
  }, [projectId, userId]);

  useEffect(() => {
    const unsubRooms = onSnapshot(
      collection(db, 'projects', projectId, 'rooms'),
      (snap) => {
        setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() } as Room)));
      }
    );
    const unsubSels = onSnapshot(
      collection(db, 'projects', projectId, 'selections'),
      (snap) => {
        setSelections(snap.docs.map(d => ({ id: d.id, ...d.data() } as Selection)));
        setLoading(false);
      }
    );
    return () => {
      unsubRooms();
      unsubSels();
    };
  }, [projectId]);

  const roomMap = Object.fromEntries(rooms.map(r => [r.id, r.name]));

  // Stat computations
  const totalRequired = selections.filter(s => s.required !== false).length;
  const totalApproved = selections.filter(s => s.clientApprovalStatus === 'Approved').length;
  const completePct = totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0;

  const overdueCount = selections.filter(isOverdue).length;

  const openQuestions = selections.reduce((acc, s) => {
    const qs = (s.comments || []).filter(c => c.isQuestion && !c.resolved);
    return acc + qs.length;
  }, 0);

  // Category progress
  const categoryStats = SELECTION_CATEGORIES.map(cat => {
    const catSels = selections.filter(s => s.category === cat);
    const approved = catSels.filter(s => s.clientApprovalStatus === 'Approved').length;
    const hasOverdue = catSels.some(isOverdue);
    return { cat, total: catSels.length, approved, hasOverdue };
  }).filter(c => c.total > 0);

  // Urgent selections: top 8
  const urgentSelections = [...selections]
    .filter(s => s.clientApprovalStatus !== 'Approved')
    .sort((a, b) => {
      const aOver = isOverdue(a) ? 0 : isDueSoon(a) ? 1 : a.required !== false && a.items.length === 0 ? 2 : 3;
      const bOver = isOverdue(b) ? 0 : isDueSoon(b) ? 1 : b.required !== false && b.items.length === 0 ? 2 : 3;
      if (aOver !== bOver) return aOver - bOver;
      // secondary sort by dueDate ascending
      if (a.dueDate && b.dueDate) {
        const aD = a.dueDate.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
        const bD = b.dueDate.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
        return aD.getTime() - bD.getTime();
      }
      return 0;
    })
    .slice(0, 8);

  // Activity feed
  const activityEvents: ActivityEvent[] = [];
  if (lastLoginAt) {
    for (const sel of selections) {
      const updatedAt = sel.updatedAt?.toDate ? sel.updatedAt.toDate() : sel.updatedAt ? new Date(sel.updatedAt) : null;
      if (updatedAt && updatedAt > lastLoginAt) {
        if (sel.clientApprovalStatus === 'Approved') {
          activityEvents.push({
            id: `approved-${sel.id}`,
            text: `Client approved ${sel.area} in ${sel.roomName || roomMap[sel.roomId || ''] || sel.room}`,
            when: updatedAt,
            roomId: sel.roomId,
            selectionId: sel.id,
          });
        } else if (sel.items.length > 0) {
          const newest = sel.items[sel.items.length - 1];
          activityEvents.push({
            id: `item-${sel.id}`,
            text: `${newest.proposedBy || 'Designer'} added ${sel.area} option in ${sel.roomName || roomMap[sel.roomId || ''] || sel.room}`,
            when: updatedAt,
            roomId: sel.roomId,
            selectionId: sel.id,
          });
        }
      }
      for (const comment of sel.comments || []) {
        const commentAt = comment.createdAt?.toDate ? comment.createdAt.toDate() : comment.createdAt ? new Date(comment.createdAt) : null;
        if (commentAt && commentAt > lastLoginAt) {
          const locLabel = sel.roomName || roomMap[sel.roomId || ''] || sel.room;
          activityEvents.push({
            id: `comment-${comment.id}`,
            text: comment.isQuestion
              ? `${comment.authorName} asked: "${comment.text.slice(0, 60)}${comment.text.length > 60 ? '…' : ''}" on ${locLabel} ${sel.area}`
              : `${comment.authorName} commented on ${locLabel} ${sel.area}`,
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
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 p-4" style={{ borderColor: '#C9A96E' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overall Complete</span>
            <TrendingUp className="w-4 h-4" style={{ color: '#C9A96E' }} />
          </div>
          <div className="text-3xl font-bold text-gray-900">{completePct}%</div>
          <div className="text-xs text-gray-400 mt-1">{totalApproved} of {totalRequired} required</div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${completePct}%`, backgroundColor: '#C9A96E' }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Selections</span>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{totalApproved}</div>
          <div className="text-xs text-gray-400 mt-1">approved / {selections.length} total</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Overdue</span>
            <AlertTriangle className={`w-4 h-4 ${overdueCount > 0 ? 'text-red-500' : 'text-gray-300'}`} />
          </div>
          <div className={`text-3xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {overdueCount}
          </div>
          <div className="text-xs text-gray-400 mt-1">past due date</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Open Questions</span>
            <MessageSquare className={`w-4 h-4 ${openQuestions > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
          </div>
          <div className={`text-3xl font-bold ${openQuestions > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
            {openQuestions}
          </div>
          <div className="text-xs text-gray-400 mt-1">need response</div>
        </div>
      </div>

      {/* Three-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Category progress */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Completion by Category</h3>
          {categoryStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No selections yet</p>
          ) : (
            <div className="space-y-3">
              {categoryStats.map(({ cat, total, approved, hasOverdue }) => {
                const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
                const barColor = pct === 100 ? '#22c55e' : hasOverdue ? '#ef4444' : '#C9A96E';
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-700 truncate max-w-[160px]">{cat}</span>
                      <span className="text-xs text-gray-500 ml-2 shrink-0">{approved}/{total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: Urgent selections */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Next Crucial Selections</h3>
          {urgentSelections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
              <p className="text-sm text-gray-500">All required selections approved!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {urgentSelections.map(sel => {
                const roomLabel = sel.roomName || roomMap[sel.roomId || ''] || sel.room || '—';
                const dd = dueDateLabel(sel.dueDate);
                const over = isOverdue(sel);
                const soon = !over && isDueSoon(sel);

                return (
                  <div
                    key={sel.id}
                    className={`rounded-lg p-3 border text-sm ${over ? 'bg-red-50 border-red-100' : soon ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{roomLabel}</p>
                        <p className="text-xs text-gray-500 truncate">{sel.category} · {sel.area}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 h-6 px-2 text-xs"
                        onClick={() => onNavigateToSelections(sel.roomId)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {dd && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${dd.color}`}>
                          {over && <Clock className="w-3 h-3" />}
                          {dd.label}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                        {sel.clientApprovalStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Activity feed */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Activity Since Last Visit</h3>
          {lastLoginAt && (
            <p className="text-xs text-gray-400 mb-4">
              Since {lastLoginAt.toLocaleDateString()} {lastLoginAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {!lastLoginAt && (
            <p className="text-xs text-gray-400 mb-4">First visit — showing recent activity</p>
          )}
          {activityEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mb-2" />
              <p className="text-sm text-gray-500">No new activity since your last visit</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activityEvents.slice(0, 10).map(event => (
                <div key={event.id} className="flex items-start gap-3 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: '#C9A96E' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 leading-snug">{event.text}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{relativeTime(event.when)}</span>
                      {event.selectionId && (
                        <button
                          onClick={() => onNavigateToSelections(event.roomId)}
                          className="text-xs underline"
                          style={{ color: '#C9A96E' }}
                        >
                          View
                        </button>
                      )}
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
