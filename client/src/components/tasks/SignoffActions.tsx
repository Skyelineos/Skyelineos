import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { authFetch } from '@/lib/authFetch';

/**
 * Approve / Reject buttons for a task in `awaiting_signoff` state.
 *
 * Visible only to GC / PM / admin (uses useRoleAccess hook).
 *
 * Approve: one-click POST. Reject opens a modal asking for the reason (required).
 * Calls POST /api/tasks/:id/signoff (Stream 1 authMiddleware enforces JWT, the
 * server route enforces role + project-team membership).
 */
export function SignoffActions({
  taskId,
  taskName,
  projectId,
  size = 'sm',
  onDone,
}: {
  taskId: string;
  taskName?: string;
  projectId?: string;
  size?: 'sm' | 'default';
  onDone?: (action: 'approve' | 'reject') => void;
}) {
  const { hasRole } = useRoleAccess();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  // Permission gate — also enforced server-side; this just hides the buttons.
  if (!hasRole(['admin', 'gc', 'projectManager'])) return null;

  async function callSignoff(action: 'approve' | 'reject', note?: string) {
    setBusy(action);
    try {
      const res = await authFetch(`/api/tasks/${encodeURIComponent(taskId)}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      toast({
        title: action === 'approve' ? 'Signed off' : 'Sent back to sub',
        description:
          action === 'approve'
            ? `Marked "${taskName || 'task'}" complete.`
            : `Sent "${taskName || 'task'}" back with your note.`,
      });
      setRejectOpen(false);
      setRejectNote('');
      onDone?.(action);
    } catch (e: any) {
      toast({
        title: 'Sign-off failed',
        description: e?.message || 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }

  const onApprove = () => callSignoff('approve');
  const onSubmitReject = () => {
    if (!rejectNote.trim()) {
      toast({ title: 'Reason required', description: 'Add a short note so the sub knows what to fix.', variant: 'destructive' });
      return;
    }
    callSignoff('reject', rejectNote.trim());
  };

  return (
    <>
      <div className="flex items-center gap-2" data-projectid={projectId || ''}>
        <Button
          size={size}
          variant="default"
          disabled={busy !== null}
          onClick={onApprove}
          className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] md:min-h-0"
        >
          {busy === 'approve'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <CheckCircle2 className="h-4 w-4 mr-1" />}
          Approve
        </Button>
        <Button
          size={size}
          variant="outline"
          disabled={busy !== null}
          onClick={() => setRejectOpen(true)}
          className="border-red-200 text-red-700 hover:bg-red-50 min-h-[44px] md:min-h-0"
        >
          <XCircle className="h-4 w-4 mr-1" />
          Reject
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back to sub</DialogTitle>
            <DialogDescription>
              The sub gets your note and the task returns to In Progress. Be specific
              so they know exactly what to fix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-note">Reason (required)</Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={4}
              placeholder="e.g. Missed the trim around the back door — please redo and re-submit."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy === 'reject'}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onSubmitReject}
              disabled={busy === 'reject' || !rejectNote.trim()}
            >
              {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
