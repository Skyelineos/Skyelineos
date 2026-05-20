import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';

// API base — these routes live on the existing api Cloud Function because
// the org IAM policy blocks creating new public Cloud Run services.
const API_BASE = '';

async function callApi(path: string, body: any = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in required');
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(detail.error || `Request failed (${resp.status})`);
  }
  return resp.json();
}
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Search, Loader2, CheckCircle2, AlertCircle, Link2 } from 'lucide-react';

interface UnclaimedContact {
  id: string;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  trades?: string[];
  linkedUserId?: string;
  type?: string;
  role?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Sub portal "claim your profile" flow. Surfaces every UNLINKED sub-type
 * contact in the Contacts directory so the signed-in sub can pick the one
 * that's actually them — covers the case where the GC entered the sub's
 * contact under a different email than the sub signs in with.
 *
 * When claimed, writes `linkedUserId` on the contact doc. Bid invitations
 * sent to that contact ID will resolve to this user from that point on.
 *
 * V2 (separate function) will offer Replace/Add email merge via a Cloud
 * Function with admin SDK. V1 only sets the link.
 */
export function ClaimContactDialog({ open, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contacts, setContacts] = useState<UnclaimedContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [claiming, setClaiming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<UnclaimedContact | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await callApi('/api/contacts/list-unclaimed-subs');
        if (cancelled) return;
        setContacts(data.contacts || []);
      } catch (e) {
        if (!cancelled) {
          console.error('[claim] list-unclaimed-subs failed', e);
          setContacts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter(c =>
      (c.name || '').toLowerCase().includes(q)
      || (c.company || '').toLowerCase().includes(q)
      || (c.email || '').toLowerCase().includes(q)
      || (c.phone || '').includes(q),
    );
  }, [contacts, search]);

  const handleClaim = async (c: UnclaimedContact, mode: 'claim' | 'replace' | 'add') => {
    const uid = auth.currentUser?.uid || (user as any)?.firebaseUid;
    if (!uid) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    setClaiming(c.id);
    try {
      await callApi('/api/contacts/claim', { contactId: c.id, mode });
      toast({
        title: `Claimed ${c.name || c.company || 'profile'}`,
        description: mode === 'replace'
          ? `Email overwritten with ${auth.currentUser?.email}.`
          : mode === 'add'
          ? `Your email was added as an additional contact.`
          : 'Bid invitations sent to this contact will now reach you.',
      });
      setConfirming(null);
      onClose();
      // Force a refresh so the bid-requests query picks up the new linkage.
      setTimeout(() => { window.location.reload(); }, 600);
    } catch (e: any) {
      toast({
        title: 'Could not claim',
        description: e?.message || String(e),
        variant: 'destructive',
      });
    } finally {
      setClaiming(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !claiming) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" style={{ color: '#C9A96E' }} />
            Claim your contact profile
          </DialogTitle>
          <DialogDescription>
            If the GC entered your contact under a different email than the one you signed in with, find your card below and claim it. From then on, every bid invitation to that card reaches you here.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, company, phone, or email…"
              className="pl-8 h-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 -mx-6 px-6 py-2">
          {loading ? (
            <p className="text-sm text-gray-500 text-center py-10 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading sub contacts…
            </p>
          ) : contacts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No unclaimed sub contacts found. (Every sub in the directory is already linked to a user, or you have no sub contacts yet.)
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">
              No contacts match "{search}".
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map(c => (
                <div key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.name || '(no name)'}
                      {c.company && <span className="text-gray-500 font-normal"> · {c.company}</span>}
                    </p>
                    {(c.email || c.phone) && (
                      <p className="text-xs text-gray-500 truncate">
                        {[c.email, c.phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {(c.trades || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(c.trades || []).slice(0, 4).map(t => (
                          <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirming(c)}
                    disabled={!!claiming}
                    className="gap-1.5 flex-shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    This is me
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={onClose} disabled={!!claiming}>
            Close
          </Button>
        </DialogFooter>

        {/* Confirm action — gives the sub three modes for handling the email
            difference between the contact card and their auth account. */}
        {confirming && (() => {
          const authEmail = (auth.currentUser?.email || '').toLowerCase().trim();
          const contactEmail = (confirming.email || '').toLowerCase().trim();
          const emailsMatch = !!contactEmail && contactEmail === authEmail;
          return (
            <Dialog open onOpenChange={o => { if (!o && !claiming) setConfirming(null); }}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    Confirm claim
                  </DialogTitle>
                  <DialogDescription>
                    Claim <strong>{confirming.name || confirming.company || 'this contact'}</strong> as your profile.
                  </DialogDescription>
                </DialogHeader>

                <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 space-y-0.5">
                  {confirming.email && <p><strong>Email on file:</strong> {confirming.email}</p>}
                  {confirming.phone && <p><strong>Phone:</strong> {confirming.phone}</p>}
                  <p><strong>Signed-in email:</strong> {auth.currentUser?.email || '(unknown)'}</p>
                </div>

                {!emailsMatch && contactEmail ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-900">
                      The contact's email is different from your sign-in email. How should we reconcile it?
                    </p>
                    <div className="space-y-2">
                      <Button
                        onClick={() => handleClaim(confirming, 'replace')}
                        disabled={!!claiming}
                        style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                        className="w-full justify-start gap-2 h-auto py-2.5 hover:opacity-90"
                      >
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span className="text-left">
                          <strong className="block">Replace the email</strong>
                          <span className="text-[11px] font-normal opacity-80">
                            Overwrite <code>{confirming.email}</code> with <code>{auth.currentUser?.email}</code>. Old email archived.
                          </span>
                        </span>
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleClaim(confirming, 'add')}
                        disabled={!!claiming}
                        className="w-full justify-start gap-2 h-auto py-2.5"
                      >
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span className="text-left">
                          <strong className="block">Add as an additional email</strong>
                          <span className="text-[11px] font-normal text-gray-600">
                            Keep <code>{confirming.email}</code> as primary, add <code>{auth.currentUser?.email}</code> as a secondary.
                          </span>
                        </span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => handleClaim(confirming, 'claim')}
                    disabled={!!claiming}
                    style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                    className="w-full gap-1.5 font-semibold hover:opacity-90"
                  >
                    {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Yes, claim it
                  </Button>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setConfirming(null)} disabled={!!claiming}>
                    Cancel
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
