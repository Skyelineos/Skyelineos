import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Live summary of a project's selections — counts by status, urgency, and phase.
 * Used by the SelectionsNeededTile on the client dashboard and the
 * SelectionsBanner across the portal.
 */
export interface SelectionsSummary {
  total: number;
  notStarted: number;
  inDiscussion: number;
  awaitingClient: number; // clientApprovalStatus === 'Checking w/ Client'
  approved: number;       // clientApprovalStatus === 'Approved'
  ordered: number;
  installed: number;
  overdue: number;        // past phase deadline AND not yet Selected/Approved
  dueThisWeek: number;
  dueThisMonth: number;
  nextDue?: {
    selectionId: string;
    item: string;
    room: string;
    phase: string;
    dueDate?: Date;
  };
  loading: boolean;
}

export interface PhaseDeadlines {
  'Pre-Construction'?: Date;
  Foundation?: Date;
  Framing?: Date;
  'Rough-In'?: Date;
  'Pre-Drywall'?: Date;
  Finish?: Date;
  Closeout?: Date;
}

const EMPTY: SelectionsSummary = {
  total: 0, notStarted: 0, inDiscussion: 0, awaitingClient: 0,
  approved: 0, ordered: 0, installed: 0, overdue: 0,
  dueThisWeek: 0, dueThisMonth: 0, loading: true,
};

export function useSelectionsSummary(
  projectId: string,
  phaseDeadlines?: PhaseDeadlines
): SelectionsSummary {
  const [summary, setSummary] = useState<SelectionsSummary>(EMPTY);

  useEffect(() => {
    if (!projectId) {
      setSummary({ ...EMPTY, loading: false });
      return;
    }

    const q = query(collection(db, `projects/${projectId}/selections`));
    const unsub = onSnapshot(q, (snap) => {
      const now = new Date();
      const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const oneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      let total = 0, notStarted = 0, inDiscussion = 0, awaitingClient = 0,
          approved = 0, ordered = 0, installed = 0, overdue = 0,
          dueThisWeek = 0, dueThisMonth = 0;
      let nextDue: SelectionsSummary['nextDue'];
      let nextDueTime = Infinity;

      snap.docs.forEach((d) => {
        const data = d.data() as any;
        total += 1;
        const status = data.status || 'Not Started';
        const clientApproval = data.clientApprovalStatus || 'Pending Options';

        if (status === 'Not Started') notStarted += 1;
        else if (status === 'In Discussion') inDiscussion += 1;
        else if (status === 'Ordered') ordered += 1;
        else if (status === 'Installed') installed += 1;

        if (clientApproval === 'Checking w/ Client') awaitingClient += 1;
        if (clientApproval === 'Approved') approved += 1;

        const phase = data.phase as keyof PhaseDeadlines | undefined;
        const phaseDl = phase && phaseDeadlines?.[phase];
        if (phaseDl && status !== 'Selected' && status !== 'Ordered' && status !== 'Received' && status !== 'Installed') {
          if (phaseDl < now) overdue += 1;
          else if (phaseDl < oneWeek) dueThisWeek += 1;
          else if (phaseDl < oneMonth) dueThisMonth += 1;

          if (clientApproval === 'Checking w/ Client' && phaseDl.getTime() < nextDueTime) {
            nextDueTime = phaseDl.getTime();
            nextDue = {
              selectionId: d.id,
              item: data.item || 'Untitled selection',
              room: data.room || '',
              phase: data.phase || '',
              dueDate: phaseDl,
            };
          }
        }
      });

      setSummary({
        total, notStarted, inDiscussion, awaitingClient, approved,
        ordered, installed, overdue, dueThisWeek, dueThisMonth,
        nextDue, loading: false,
      });
    });

    return () => unsub();
  }, [projectId, JSON.stringify(phaseDeadlines || {})]);

  return summary;
}
