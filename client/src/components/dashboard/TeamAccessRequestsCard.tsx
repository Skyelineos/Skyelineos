import { useEffect, useState } from 'react';
import {
  collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where, deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserPlus, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PendingTeamUser {
  id: string;
  name?: string;
  email?: string;
  requestedPermissions?: string[];
  createdAt?: { toDate: () => Date } | null;
}

// Surfaces team members who signed up and are waiting for Tyler's approval.
// Sits at the top of the GC dashboard's to-do list so a join request is
// impossible to miss — the alert title turns red and pulses when there are
// outstanding requests.
export function TeamAccessRequestsCard() {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingTeamUser[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'pending_team'));
    const unsub = onSnapshot(q, snap => {
      setPending(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, []);

  const approve = async (u: PendingTeamUser) => {
    setBusyId(u.id);
    try {
      await updateDoc(doc(db, 'users', u.id), {
        role: 'admin',
        permissions: u.requestedPermissions ?? [],
        status: 'active',
        active: true,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Team member approved', description: `${u.name || u.email} can now sign in.` });
    } catch (e: any) {
      toast({ title: 'Approve failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (u: PendingTeamUser) => {
    if (!confirm(`Decline ${u.name || u.email}'s request? Their profile will be removed.`)) return;
    setBusyId(u.id);
    try {
      await deleteDoc(doc(db, 'users', u.id));
      toast({
        title: 'Request declined',
        description: 'Profile removed. Delete the Firebase Auth account from console if you want the email reusable.',
      });
    } catch (e: any) {
      toast({ title: 'Decline failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-red-300 bg-red-50/80 p-3 mb-4 shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left"
      >
        <UserPlus className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-900">
            {pending.length} team member{pending.length === 1 ? '' : 's'} requesting access
          </p>
          <p className="text-xs text-red-700/80">
            Review the permissions they asked for and approve or decline.
          </p>
        </div>
        <Badge variant="outline" className="bg-white border-red-300 text-red-700">
          {pending.length}
        </Badge>
        {expanded ? <ChevronUp className="w-4 h-4 text-red-700" /> : <ChevronDown className="w-4 h-4 text-red-700" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {pending.map(u => (
            <div
              key={u.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white border border-red-200 rounded p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{u.name || '(no name)'}</p>
                <p className="text-xs text-gray-600 truncate">{u.email}</p>
                {u.requestedPermissions && u.requestedPermissions.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.requestedPermissions.map(p => (
                      <Badge key={p} variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                        {p.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 italic mt-1">No specific permissions requested</p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:ml-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decline(u)}
                  disabled={busyId === u.id}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Decline
                </Button>
                <Button
                  size="sm"
                  onClick={() => approve(u)}
                  disabled={busyId === u.id}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
