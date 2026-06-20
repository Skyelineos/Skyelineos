// GC-side bid-set approval (design §5b). The bid set (plans + approved design +
// addenda) must clear the Approval Quorum before any sub can be invited; this
// records those sign-offs. Approvals are staff-recorded for now.

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { getBidSetGate, recordBidSetApproval, type BidSetGate } from '@/lib/ssot/bidSet';
import { requiredRoles } from '@/lib/ssot/addenda';
import type { ApprovalRole } from '@/lib/ssot/types';

export function BidSetGatePanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gate, setGate] = useState<BidSetGate | null>(null);

  const refresh = async () => {
    try { setGate(await getBidSetGate(projectId)); }
    catch (e) { console.warn('[ssot] bid-set gate load failed', e); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [projectId]);

  const record = async (role: ApprovalRole) => {
    try {
      await recordBidSetApproval(projectId, {
        role,
        uid: (user as any)?.firebaseUid || user?.id?.toString() || 'staff',
        name: user?.name || role,
      });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not record approval', description: e?.message, variant: 'destructive' });
    }
  };

  if (!gate) return null;
  const have = new Set(gate.approvals.map(a => a.role));
  const needed = requiredRoles(gate.designerAssigned);

  return (
    <Card className={gate.approved ? 'border-green-300' : 'border-amber-300'}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className={`w-4 h-4 ${gate.approved ? 'text-green-600' : 'text-[#C9A96E]'}`} />
          Bid Set Approval
          {gate.approved && <Badge className="bg-green-100 text-green-700 text-[10px]">Approved</Badge>}
        </CardTitle>
        <CardDescription>
          {gate.approved
            ? 'The bid set is approved — you can invite subs.'
            : 'The client must approve the bid set (plans + approved design + addenda) before any sub can be invited.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500">Approvals:</span>
        {needed.map(role => (
          <Button
            key={role}
            size="sm"
            variant={have.has(role) ? 'secondary' : 'outline'}
            className="h-7 text-[11px] gap-1"
            onClick={() => record(role)}
            disabled={have.has(role)}
          >
            {have.has(role) && <CheckCircle2 className="w-3 h-3 text-green-600" />}
            {role}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
