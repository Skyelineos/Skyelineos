/**
 * People-on-this-project strip — single horizontal row, avatars + quick actions.
 *
 * Renders:
 *   - Client (from project.clientEmail + clientPhone or linked contact)
 *   - Designer (from project.designerName + designerEmail when designerChoice=select)
 *   - Project Manager
 *   - Awarded subs, one chip per trade (from awarded bids on this project)
 *
 * Each chip has:
 *   - Avatar circle (initials, brand-gold ring)
 *   - Name + role label
 *   - Quick-call (tel:) and quick-message (mailto: or /messages?...) icons
 *
 * Horizontally scrolls on mobile via overflow-x-auto.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, Mail, Users, MessageSquare } from 'lucide-react';

interface Props {
  projectId: string;
  project: any;
}

interface Person {
  key: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  initials: string;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '')
    .join('') || '·';
}

export function ProjectPeopleStrip({ projectId, project }: Props) {
  const [, setLocation] = useLocation();
  const [linkedClient, setLinkedClient] = useState<{ name?: string; email?: string; phone?: string } | null>(null);
  const [subs, setSubs] = useState<Person[]>([]);

  // Linked-contact lookup for legacy projects that only stored clientId
  useEffect(() => {
    const contactId = Array.isArray(project?.clientIds) && project.clientIds[0]
      ? String(project.clientIds[0])
      : (project?.clientContactId ? String(project.clientContactId) : '');
    if (!contactId) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'contacts'), where('__name__', '==', contactId)));
        if (!snap.empty) {
          const d = snap.docs[0].data() as any;
          setLinkedClient({ name: d.name, email: d.email, phone: d.phone });
        }
      } catch {}
    })();
  }, [project?.clientIds, project?.clientContactId]);

  // Awarded subs per trade — pulled from bids where status=awarded.
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'bids'), where('projectId', '==', projectId)),
      snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter((b: any) => String(b.status || '').toLowerCase() === 'awarded'
            || String(b.status || '').toLowerCase() === 'accepted');
        // Dedup per trade — keep the lowest bid in case of multiple awarded rows.
        const byTrade = new Map<string, any>();
        for (const b of rows) {
          const trade = String(b.trade || 'sub');
          const prev = byTrade.get(trade);
          if (!prev || Number(b.totalAmount || 0) < Number(prev.totalAmount || 0)) {
            byTrade.set(trade, b);
          }
        }
        const out: Person[] = Array.from(byTrade.values()).map((b: any) => ({
          key: `sub:${b.id}`,
          name: b.subName || b.companyName || 'Sub',
          role: b.trade ? `Sub · ${b.trade}` : 'Sub',
          email: b.subEmail,
          phone: b.subPhone,
          initials: initialsOf(b.subName || b.companyName || 'Sub'),
        }));
        setSubs(out);
      },
      () => {},
    );
    return () => unsub();
  }, [projectId]);

  const people: Person[] = useMemo(() => {
    const list: Person[] = [];

    // Client
    const clientName = project?.client || project?.clientName || linkedClient?.name || '';
    if (clientName) {
      list.push({
        key: 'client',
        name: clientName,
        role: 'Client',
        email: project?.clientEmail || linkedClient?.email || '',
        phone: project?.clientPhone || linkedClient?.phone || '',
        initials: initialsOf(clientName),
      });
    }

    // PM
    const pmName = project?.projectManager || project?.projectManagerName || '';
    if (pmName) {
      list.push({
        key: 'pm',
        name: pmName,
        role: 'Project Manager',
        email: project?.projectManagerEmail || '',
        phone: project?.projectManagerPhone || '',
        initials: initialsOf(pmName),
      });
    }

    // Designer (only when designerChoice=select, otherwise the labels are
    // meta-states like "Client doing design themselves" — those shouldn't get
    // a person chip.)
    if (project?.designerChoice === 'select' && project?.designerName) {
      list.push({
        key: 'designer',
        name: project.designerName,
        role: project.designerCompany ? `Designer · ${project.designerCompany}` : 'Designer',
        email: project.designerEmail || '',
        phone: project.designerPhone || '',
        initials: initialsOf(project.designerName),
      });
    }

    // Subs
    list.push(...subs);

    return list;
  }, [project, linkedClient, subs]);

  if (people.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-[#C9A96E]" />
            People on this project
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 text-center py-4">
            No people linked to this project yet. Add the client + PM from
            <button className="text-[#C9A96E] underline ml-1" onClick={() => setLocation(`/projects/${projectId}/overview`)}>
              project details
            </button>{' '}
            to see them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-[#C9A96E]" />
          People on this project
          <span className="text-xs text-gray-400 ml-1">({people.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
          {people.map(p => (
            <div
              key={p.key}
              className="shrink-0 w-44 sm:w-48 border border-gray-200 rounded-xl p-3 bg-white flex flex-col items-center text-center"
            >
              <div className="w-10 h-10 rounded-full bg-[#FFF8E7] border-2 border-[#C9A96E] text-[#8a6a3a] font-semibold flex items-center justify-center text-sm">
                {p.initials}
              </div>
              <div className="mt-2 min-w-0 w-full">
                <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                <div className="text-[11px] text-gray-500 truncate">{p.role}</div>
              </div>
              <div className="mt-2 flex gap-1.5">
                {p.phone ? (
                  <a
                    href={`tel:${p.phone}`}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 active:scale-95 transition"
                    title="Call"
                    style={{ touchAction: 'manipulation' as any }}
                  >
                    <Phone className="w-3.5 h-3.5 text-gray-700" />
                  </a>
                ) : null}
                {p.email ? (
                  <a
                    href={`mailto:${p.email}`}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 active:scale-95 transition"
                    title="Email"
                    style={{ touchAction: 'manipulation' as any }}
                  >
                    <Mail className="w-3.5 h-3.5 text-gray-700" />
                  </a>
                ) : null}
                <button
                  onClick={() => setLocation(`/messages?projectId=${projectId}&with=${encodeURIComponent(p.email || p.name)}`)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 active:scale-95 transition"
                  title="Message in app"
                  style={{ touchAction: 'manipulation' as any }}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-gray-700" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProjectPeopleStrip;
