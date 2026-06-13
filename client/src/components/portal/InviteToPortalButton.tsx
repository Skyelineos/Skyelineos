// Reusable "Invite to portal" action. Drops into a lead, an estimate, a new
// project, or an active project — anywhere we want to give the homeowner portal
// access. Creates the portalInvites token (createPortalInvite) and then sends a
// real SendGrid email rendered from a stage-specific template the user picks
// from the dropdown. Templates live in the `emailTemplates` Firestore
// collection (built-in + uploaded) — managed via the dialog below.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { createPortalInvite } from '@/lib/portalInvite';
import { authFetch } from '@/lib/authFetch';
import {
  type EmailTemplate,
  STAGES,
  ensureSeedTemplates,
  listTemplates,
} from '@/lib/emailTemplates';
import { EmailTemplateManagerDialog } from '@/components/portal/EmailTemplateManagerDialog';
import { UserPlus, Send, Settings2, ChevronDown } from 'lucide-react';

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'https://api-mtph34upva-uc.a.run.app';

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
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const loadTemplates = async () => {
    try {
      await ensureSeedTemplates();
      setTemplates(await listTemplates());
    } catch (e: any) {
      toast({ title: 'Could not load templates', description: e?.message, variant: 'destructive' });
      setTemplates([]);
    }
  };

  const handleSend = async (template: EmailTemplate) => {
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
      const res = await authFetch(`${API_BASE}/api/send-portal-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: to, firstName, templateId: template.id, contactId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      toast({
        title: resend ? 'Invite re-sent' : 'Portal invite sent',
        description: `Emailed “${template.name}” to ${to}.`,
      });
      onInvited?.(token);
    } catch (e: any) {
      toast({ title: 'Invite failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu onOpenChange={open => { if (open && templates === null) loadTemplates(); }}>
        <DropdownMenuTrigger asChild>
          <Button type="button" size={size} variant={variant} className={className} disabled={busy}>
            {resend ? <Send className="mr-1.5 h-3.5 w-3.5" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
            {busy ? 'Sending…' : label || (resend ? 'Resend portal invite' : 'Invite to portal')}
            <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {templates === null && (
            <DropdownMenuItem disabled>Loading templates…</DropdownMenuItem>
          )}
          {templates !== null && STAGES.map(stage => {
            const inStage = templates.filter(t => t.stage === stage.value);
            if (inStage.length === 0) return null;
            return (
              <div key={stage.value}>
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {stage.label}
                </DropdownMenuLabel>
                {inStage.map(t => (
                  <DropdownMenuItem key={t.id} onSelect={() => handleSend(t)}>
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </div>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>
            <Settings2 className="mr-2 h-3.5 w-3.5" /> Upload / manage templates…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EmailTemplateManagerDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={loadTemplates}
      />
    </>
  );
}
