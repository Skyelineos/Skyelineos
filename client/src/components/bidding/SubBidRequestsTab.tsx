import { useState, useEffect } from 'react';
import {
  collectionGroup, collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useAdminView } from '@/contexts/AdminViewContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, Hammer, Clock, AlertTriangle, CheckCircle2, ExternalLink, Link2 } from 'lucide-react';
import { SubBidSubmissionForm } from './SubBidSubmissionForm';
import { ClaimContactDialog } from './ClaimContactDialog';
import type { BidRequest } from './types';

export function SubBidRequestsTab() {
  const { user } = useAuth();
  // Admin impersonation: when an admin is "viewing as" a specific sub, the
  // search set must use THAT sub's identifiers, not the admin's own. Without
  // this swap the query matches nothing (the admin is not on any
  // invitedSubIds array) and the portal shows "No bids found" even though
  // bid invites exist. Source of the original bug report.
  const { isAdminView, portalType, viewedUser } = useAdminView();
  const impersonatingSub = isAdminView && portalType === 'subcontractor' && !!viewedUser;

  // The GC invites subs by their **contact ID** (`contacts/{id}`) — NOT by
  // the sub's Firebase Auth UID or user doc ID. To survive every shape of
  // legacy data + registration flow, we gather EVERY plausible identifier
  // for this sub (user uid, user doc id, email, plus every contact whose
  // linkedUserId or email matches them) and let the bidRequest query do an
  // array-contains-any over the full set.
  const [subIds, setSubIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { if (!cancelled) setSubIds([]); return; }
      const ids = new Set<string>();
      // ── Identifier collection ─────────────────────────────────────────
      // Two modes:
      //   1) Real sub signed in — pull every identifier we can find about
      //      THEM (auth uid, user doc id, email casings, linked contact ids)
      //      so the query resolves whether the GC invited by contactId,
      //      linkedUserId, or email.
      //   2) Admin impersonating a specific sub — pull the VIEWED sub's
      //      identifiers (contact id + email + linkedUserId from the contact
      //      doc). The admin's own uid/email are useless here because the
      //      admin is not on any invitedSubIds array.
      let uid = '';
      let docEmail = '';
      let authEmail = '';
      let emailRaw = '';
      let userIdStr = '';

      if (impersonatingSub && viewedUser) {
        // Use the impersonated sub's contact id as the primary identifier.
        // Also pull email + linkedUserId off the contact doc so the
        // array-contains-any search hits every legacy field shape.
        const contactId = viewedUser.id;
        if (contactId) ids.add(contactId);
        try {
          const cSnap = await getDoc(doc(db, 'contacts', contactId));
          if (cSnap.exists()) {
            const c = cSnap.data() as any;
            const linkedUid = (c.linkedUserId || '').trim();
            if (linkedUid) {
              ids.add(linkedUid);
              uid = linkedUid; // for the optional bids subscription below
            }
            const cEmail = (c.email || viewedUser.email || '').toLowerCase().trim();
            const cEmailRaw = (c.email || viewedUser.email || '').trim();
            if (cEmail) {
              ids.add(cEmail);
              docEmail = cEmail;
              authEmail = cEmail;
              emailRaw = cEmailRaw;
            }
          } else if (viewedUser.email) {
            // No contact doc readable from the admin's perspective? Fall back
            // to the viewedUser.email (the admin set this when entering view).
            ids.add(viewedUser.email.toLowerCase().trim());
            ids.add(viewedUser.email.trim());
            docEmail = viewedUser.email.toLowerCase().trim();
            authEmail = docEmail;
          }
        } catch (e) {
          console.warn('[bidRequests] impersonated contact lookup failed', e);
        }
      } else {
        // Real sub path. Some Firestore user docs have a stale `email` that
        // disagrees with the live Firebase Auth token — when that happens,
        // the auth email is the canonical one for bid invites.
        const authUser = auth.currentUser;
        uid = authUser?.uid || (user as any).firebaseUid || '';
        userIdStr = user.id?.toString() || '';
        docEmail = (user.email || '').toLowerCase().trim();
        authEmail = (authUser?.email || '').toLowerCase().trim();
        emailRaw = (user.email || '').trim();
        if (uid) ids.add(uid);
        if (userIdStr) ids.add(userIdStr);
        if (docEmail) ids.add(docEmail);
        if (authEmail) ids.add(authEmail);
        if (emailRaw && emailRaw.toLowerCase() !== docEmail) ids.add(emailRaw);
      }
      const email = authEmail || docEmail; // canonical for contact lookups
      // Track which contact docs need auto-linking (matched by email but
       // missing linkedUserId). Setting linkedUserId here is what makes
       // future portal loads — and every other linkedUserId-based feature —
       // resolve this sub without going through email matching again.
      const needsLink: { id: string; data: any }[] = [];
      try {
        if (uid) {
          const s = await getDocs(query(collection(db, 'contacts'), where('linkedUserId', '==', uid)));
          s.docs.forEach(d => ids.add(d.id));
        }
        if (email) {
          const s = await getDocs(query(collection(db, 'contacts'), where('email', '==', email)));
          s.docs.forEach(d => {
            ids.add(d.id);
            const data = d.data() as any;
            if (uid && !data.linkedUserId) needsLink.push({ id: d.id, data });
          });
          // Case-insensitive fallback — try the raw cased email too in case
          // the contact was created with a different case.
          if (emailRaw && emailRaw !== email) {
            const s2 = await getDocs(query(collection(db, 'contacts'), where('email', '==', emailRaw)));
            s2.docs.forEach(d => {
              ids.add(d.id);
              const data = d.data() as any;
              if (uid && !data.linkedUserId) needsLink.push({ id: d.id, data });
            });
          }
        }
      } catch (e) {
        console.warn('[bidRequests] contact resolve failed', e);
      }
      // Fire-and-forget auto-link. If Firestore rules reject it (sub-role
      // trying to write a GC-owned contacts doc) we just log; the GC can
      // still link manually. Skip entirely when impersonating — the admin
      // shouldn't be stamping linkedUserId on contacts they don't own.
      if (!impersonatingSub && needsLink.length > 0 && uid) {
        for (const c of needsLink) {
          try {
            await updateDoc(doc(db, 'contacts', c.id), {
              linkedUserId: uid,
              linkedAt: serverTimestamp(),
            });
            console.log('[bidRequests] auto-linked contact', c.id, '→ user', uid);
          } catch (e) {
            console.warn('[bidRequests] auto-link failed for', c.id, e);
          }
        }
      }
      const arr = Array.from(ids).filter(Boolean);
      console.log('[bidRequests] searching invitedSubIds for any of:', arr,
        impersonatingSub ? `(impersonating ${viewedUser?.name || viewedUser?.id})` : '');
      if (!cancelled) setSubIds(arr);
    })();
    return () => { cancelled = true; };
  }, [user, impersonatingSub, viewedUser?.id]);

  const [requests, setRequests] = useState<BidRequest[]>([]);
  const [submittedBidIds, setSubmittedBidIds] = useState<Set<string>>(new Set());
  const [activeRequest, setActiveRequest] = useState<BidRequest | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

  // Subscribe to bidRequests where any of the resolved IDs match. Firestore
  // caps array-contains-any at 10 values per query, so we truncate (rare to
  // hit in practice — a sub usually has 1–3 identifiers).
  useEffect(() => {
    if (subIds.length === 0) return;
    const search = subIds.slice(0, 10);
    const q = query(
      collectionGroup(db, 'bidRequests'),
      where('invitedSubIds', 'array-contains-any', search),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      console.log(`[bidRequests] query returned ${snap.docs.length} doc(s)`);
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as BidRequest)));
    }, (err) => {
      // Index might not exist yet — surface clearly so the missing-index
      // link in the error message is easy to spot in DevTools.
      console.warn('[bidRequests] query failed (likely missing Firestore index):', err);
    });
    return () => unsub();
  }, [subIds]);

  // Subscribe to my own submitted bids (same union of identifiers).
  useEffect(() => {
    if (subIds.length === 0) return;
    const search = subIds.slice(0, 10);
    const q = query(
      collectionGroup(db, 'bids'),
      where('subContactId', 'in', search),
    );
    const unsub = onSnapshot(q, snap => {
      const ids = new Set<string>();
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.bidRequestId) ids.add(data.bidRequestId);
      });
      setSubmittedBidIds(ids);
    }, () => {});
    return () => unsub();
  }, [subIds]);

  if (activeRequest) {
    return (
      <SubBidSubmissionForm
        request={activeRequest}
        onClose={() => setActiveRequest(null)}
        alreadySubmitted={submittedBidIds.has(activeRequest.id)}
      />
    );
  }

  const todayYMD = new Date().toISOString().slice(0, 10);
  const open = requests.filter(r => r.status === 'open');
  const closed = requests.filter(r => r.status !== 'open');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Hammer className="w-5 h-5 text-[#C9A96E]" />
            Bid Requests
          </h2>
          <p className="text-sm text-gray-500">Open requests are waiting on your bid. Click to view scope, plans, and submit.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setClaimOpen(true)} className="gap-1.5">
          <Link2 className="w-3.5 h-3.5" />
          Claim profile
        </Button>
      </div>
      <ClaimContactDialog open={claimOpen} onClose={() => setClaimOpen(false)} />

      {open.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="font-medium text-gray-700">No open bid requests</p>
            <p className="text-sm text-gray-400 mt-1">When the GC requests bids from you, they'll show up here.</p>
            <details className="text-left mt-4 inline-block">
              <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600">
                Expected a bid? Click here.
              </summary>
              <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded p-2 max-w-md mx-auto">
                <p className="mb-1">Searched for invitations matching any of these IDs:</p>
                <code className="break-all text-[10px] text-gray-700 block whitespace-pre-wrap">
                  {subIds.length === 0 ? '(none — still loading)' : subIds.join('\n')}
                </code>
                <p className="mt-2">
                  Auth email from token: <code className="text-gray-700">{user?.email || '(none)'}</code>
                </p>
                <p className="mt-2">
                  Auth uid: <code className="text-gray-700 break-all">{(user as any)?.firebaseUid || '(none)'}</code>
                </p>
                <p className="mt-2">
                  If your bid invitation is missing, the GC may have entered your contact under a different email. Click <strong>Claim profile</strong> above to find and claim your card.
                </p>
              </div>
            </details>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {open.map(req => {
            const isOverdue = req.dueDate && req.dueDate < todayYMD;
            const submitted = submittedBidIds.has(req.id);
            return (
              <Card
                key={req.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  submitted ? 'border-green-300 bg-green-50/30' : isOverdue ? 'border-red-300 bg-red-50/30' : ''
                }`}
                onClick={() => setActiveRequest(req)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{req.trade}</CardTitle>
                      <CardDescription className="truncate">{req.projectName || 'Project'}</CardDescription>
                    </div>
                    {submitted ? (
                      <Badge className="bg-green-100 text-green-700 gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" /> Submitted
                      </Badge>
                    ) : isOverdue ? (
                      <Badge className="bg-red-100 text-red-700 gap-1 shrink-0">
                        <AlertTriangle className="w-3 h-3" /> Overdue
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 shrink-0">
                        <Clock className="w-3 h-3" /> Open
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <p className="text-sm text-gray-600 line-clamp-2">{req.scope}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Due {req.dueDate}
                    </span>
                    {req.plans?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {req.plans.length} plan{req.plans.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => setActiveRequest(req)}>
                    {submitted ? 'View / Update Bid' : 'Review & Submit Bid'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            Closed requests ({closed.length})
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {closed.map(req => (
              <Card key={req.id} className="opacity-70">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{req.trade} · {req.projectName}</div>
                    <div className="text-xs text-gray-500">Closed {req.dueDate}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{req.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
