import { useState, useEffect } from 'react';
import {
  collectionGroup, query, where, onSnapshot, orderBy, doc, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, Hammer, Clock, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { SubBidSubmissionForm } from './SubBidSubmissionForm';
import type { BidRequest } from './types';

export function SubBidRequestsTab() {
  const { user } = useAuth();
  const subId = user?.id?.toString() || user?.email || '';

  const [requests, setRequests] = useState<BidRequest[]>([]);
  const [submittedBidIds, setSubmittedBidIds] = useState<Set<string>>(new Set());
  const [activeRequest, setActiveRequest] = useState<BidRequest | null>(null);

  // Subscribe to bidRequests where I'm invited (collectionGroup query)
  useEffect(() => {
    if (!subId) return;
    // collectionGroup query — needs index on (invitedSubIds, createdAt) at the bidRequests subcollection
    const q = query(
      collectionGroup(db, 'bidRequests'),
      where('invitedSubIds', 'array-contains', subId),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as BidRequest)));
    }, (err) => {
      // Index might not exist yet — handle gracefully
      console.warn('[bidRequests] query failed', err);
    });
    return () => unsub();
  }, [subId]);

  // Subscribe to my own submitted bids
  useEffect(() => {
    if (!subId) return;
    const q = query(
      collectionGroup(db, 'bids'),
      where('subContactId', '==', subId),
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
  }, [subId]);

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
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Hammer className="w-5 h-5 text-[#C9A96E]" />
          Bid Requests
        </h2>
        <p className="text-sm text-gray-500">Open requests are waiting on your bid. Click to view scope, plans, and submit.</p>
      </div>

      {open.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="font-medium text-gray-700">No open bid requests</p>
            <p className="text-sm text-gray-400 mt-1">When the GC requests bids from you, they'll show up here.</p>
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
