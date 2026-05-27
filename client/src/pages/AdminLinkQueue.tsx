// /admin/link-queue — staff view of pending sub→contact link review entries.
// Per docs/decisions.md D-012-h.
//
// Each entry was created when a new sub signed up and the system couldn't
// auto-link them to an existing contact by exact email. The backend ran a
// fuzzy match (name + phone + company) against the contacts collection and
// surfaced up to 5 candidate contacts. Staff resolve each entry by:
//   - Linking to one of the suggested candidates ("Link this one")
//   - Creating a brand-new contact from the sub's signup info ("Create new")
//   - Marking the entry as "No match" (closes without linking)
//
// Backend endpoint: POST /api/sub/link-queue/:id/resolve

import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, UserCheck, UserPlus, UserX, Mail, Phone, Building, AlertTriangle,
} from 'lucide-react';

interface Candidate {
  contactId: string;
  vendorName: string;
  email?: string;
  phone?: string;
  company?: string;
  matchScore: number;
  matchReasons: string[];
}

interface QueueEntry {
  id: string;
  userId: string;
  userEmail?: string | null;
  userVendorName?: string | null;
  userPhone?: string | null;
  userCompany?: string | null;
  candidates: Candidate[];
  status: 'pending' | 'resolved';
  createdAt?: Timestamp;
}

export default function AdminLinkQueue() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    const q = query(
      collection(db, 'linkReviewQueue'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      (err) => {
        console.error('link-queue snapshot error', err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  async function resolve(entryId: string, action: 'link' | 'new_contact' | 'no_match', contactId?: string) {
    setResolving(prev => ({ ...prev, [entryId]: true }));
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch(`/api/sub/link-queue/${entryId}/resolve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, contactId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Resolve failed (${res.status})`);
      toast({
        title: action === 'link' ? 'Linked' : action === 'new_contact' ? 'New contact created' : 'Marked no match',
        description: data.resolvedContactId ? `Contact ID: ${data.resolvedContactId}` : 'Queue entry closed',
      });
    } catch (e: any) {
      toast({
        title: 'Could not resolve',
        description: e?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setResolving(prev => ({ ...prev, [entryId]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Sub link review queue</h1>
        <p className="text-sm text-muted-foreground">
          New subcontractors whose accounts couldn't be auto-linked to an existing contact record.
          Pick the best candidate, create a fresh contact, or mark no match.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserCheck className="h-10 w-10 mx-auto mb-3 text-green-600" />
            <p className="text-base font-medium">Nothing to review</p>
            <p className="text-sm text-muted-foreground">
              All new subs are auto-linked or have been resolved.
            </p>
          </CardContent>
        </Card>
      ) : (
        entries.map(entry => (
          <Card key={entry.id} className="border-amber-200">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>{entry.userVendorName || '(unnamed sub)'}</CardTitle>
                  <CardDescription className="mt-1 flex flex-col gap-1 text-sm">
                    {entry.userEmail && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> {entry.userEmail}
                      </span>
                    )}
                    {entry.userPhone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" /> {entry.userPhone}
                      </span>
                    )}
                    {entry.userCompany && (
                      <span className="flex items-center gap-1.5">
                        <Building className="h-3.5 w-3.5" /> {entry.userCompany}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  Signed up {entry.createdAt?.toDate?.().toLocaleDateString?.() || ''}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {entry.candidates.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No candidate matches were found above the threshold.
                    Create a new contact or mark no match.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="text-sm font-medium">
                    Suggested matches ({entry.candidates.length}):
                  </div>
                  {entry.candidates.map(c => (
                    <div
                      key={c.contactId}
                      className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="space-y-1">
                        <div className="font-medium">{c.vendorName}</div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {c.email && <div>{c.email}</div>}
                          {c.phone && <div>{c.phone}</div>}
                          {c.company && <div>{c.company}</div>}
                        </div>
                        <div className="flex gap-1 flex-wrap pt-1">
                          <Badge variant="secondary" className="text-xs">
                            Match score: {Math.round(c.matchScore * 100)}%
                          </Badge>
                          {c.matchReasons.map((r, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={!!resolving[entry.id]}
                        onClick={() => resolve(entry.id, 'link', c.contactId)}
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Link this one
                      </Button>
                    </div>
                  ))}
                </>
              )}
              <div className="pt-2 flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!resolving[entry.id]}
                  onClick={() => resolve(entry.id, 'new_contact')}
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Create new contact
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!resolving[entry.id]}
                  onClick={() => resolve(entry.id, 'no_match')}
                >
                  <UserX className="h-4 w-4 mr-1" />
                  No match — close
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
