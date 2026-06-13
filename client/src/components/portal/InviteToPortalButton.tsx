// Reusable "Invite to portal" action. Drops into a lead, an estimate, a new
// project, or an active project — anywhere we want to give the homeowner portal
// access. Reuses the existing portalInvites token flow (createPortalInvite) and
// opens the GC's mail client with a pre-filled sign-up link.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { createPortalInvite, openInviteMail } from '@/lib/portalInvite';
import { UserPlus, Send } from 'lucide-react';

interface Props {
  email?: string;
  firstName?: string;
  contactId?: string;
  role?: string;
  /** Already has a pending invite — render as "Resend invite". */
  resend?: boolean;
  label?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  onInvited?: (token: string) => void;
}

export function InviteToPortalButton({
  email,
  firstName,
  contactId,
  role = 'client',
  resend = false,
  label,
  size = 'sm',
  variant = 'outline',
  className,
  onInvited,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleInvite = async () => {
    const to = (email || '').trim();
    if (!to) {
      toast({
        title: 'No email on file',
        description: 'Add an email for this client before inviting them to the portal.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      const token = await createPortalInvite({
        contactId: contactId || '',
        email: to,
        role,
        firstName,
        invitedBy: user?.email,
      });
      openInviteMail({ email: to, firstName, token });
      toast({
        title: resend ? 'Invite re-sent' : 'Portal invite created',
        description: `Your email app should open with the invitation for ${to}.`,
      });
      onInvited?.(token);
    } catch (e: any) {
      toast({ title: 'Invite failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" size={size} variant={variant} className={className} onClick={handleInvite} disabled={busy}>
      {resend ? <Send className="mr-1.5 h-3.5 w-3.5" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
      {busy ? 'Opening…' : label || (resend ? 'Resend portal invite' : 'Invite to portal')}
    </Button>
  );
}
