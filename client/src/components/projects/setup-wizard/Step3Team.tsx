import { useState, useEffect } from 'react';
import { collection, getDocs, orderBy, query as fsQuery } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Palette, HardHat, Users, Trash2 } from 'lucide-react';
import type { ProjectSetupDraft, ProjectTeamRef } from '@/types/projectSetup';

/**
 * Step 3 — Team.
 *
 * Who's working on this project from your side. The designer is the
 * most important assignment because they own selections curation; if
 * the designer slot is empty, the client portal silently has no one
 * to surface options.
 *
 * Slots:
 *   - Designer (warn if empty — blocks client portal usefulness)
 *   - Project manager (warn if empty — task auto-assign falls back to creator)
 *   - Lead carpenter / superintendent (optional — future "site lead" notifications)
 *
 * Each slot picks from the contacts list filtered by role.
 */

interface ContactPick {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  company?: string;
}

interface Props {
  draft: ProjectSetupDraft;
  onChange: (next: ProjectSetupDraft) => void;
}

export function Step3Team({ draft, onChange }: Props) {
  const [contacts, setContacts] = useState<ContactPick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(fsQuery(collection(db, 'contacts'), orderBy('name', 'asc')));
        setContacts(snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || '',
            email: data.email,
            phone: data.phone,
            role: (data.role || data.type || '').toLowerCase(),
            company: data.company,
          };
        }));
      } catch (e) {
        console.warn('[setup-wizard] contact load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const designers = contacts.filter(c => c.role === 'designer' || c.role === 'architect');
  const team = contacts.filter(c => ['admin', 'projectmanager', 'project_manager', 'gc'].includes(c.role || ''));

  const setRole = (role: ProjectTeamRef['role'], contact: ContactPick | undefined) => {
    const without = (draft.team || []).filter(t => t.role !== role);
    const next: ProjectSetupDraft = { ...draft, team: without };
    if (contact) {
      next.team.push({
        contactId: contact.id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        role,
      });
    }
    // Denormalize designer + PM onto the project root so existing
    // queries (selections curation, task auto-assign, etc.) keep working
    // without learning about the `team[]` array.
    if (role === 'designer') {
      next.designerContactId = contact?.id;
      next.designerName = contact?.name;
    }
    if (role === 'projectManager') {
      next.projectManagerId = contact?.id;
      next.projectManagerName = contact?.name;
    }
    onChange(next);
  };

  const designer = draft.team?.find(t => t.role === 'designer');
  const pm = draft.team?.find(t => t.role === 'projectManager');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-semibold text-[#141414]">Team</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Who's on the build from your side. The designer curates selections for the client — if that slot is empty, the client portal has no one to surface options.
        </p>
      </div>

      <TeamSlot
        icon={<Palette className="w-4 h-4 text-[#C9A96E]" />}
        title="Designer"
        helper="Owns selection curation. The client portal surfaces this designer as their style contact."
        current={designer}
        options={designers}
        loading={loading}
        emptyMsg="No designer contacts yet. Add one in Contacts and come back here."
        onPick={(c) => setRole('designer', c)}
        onRemove={() => setRole('designer', undefined)}
      />

      <TeamSlot
        icon={<HardHat className="w-4 h-4 text-blue-500" />}
        title="Project manager"
        helper="Default assignee for tasks unless you pick a more specific person."
        current={pm}
        options={team}
        loading={loading}
        emptyMsg="No team contacts yet. Add one (role = admin / project manager) in Contacts."
        onPick={(c) => setRole('projectManager', c)}
        onRemove={() => setRole('projectManager', undefined)}
      />

      <p className="text-xs text-gray-500 italic">
        Lead carpenter and superintendent slots ship in a follow-up update — for now, they default to the project manager for assignments.
      </p>
    </div>
  );
}

interface SlotProps {
  icon: React.ReactNode;
  title: string;
  helper: string;
  current?: ProjectTeamRef;
  options: ContactPick[];
  loading: boolean;
  emptyMsg: string;
  onPick: (c: ContactPick) => void;
  onRemove: () => void;
}

function TeamSlot(p: SlotProps) {
  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {p.icon}
          <Label className="text-sm font-semibold">{p.title}</Label>
        </div>
        {p.current && (
          <Button size="sm" variant="ghost" onClick={p.onRemove} className="text-gray-500 gap-1">
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </Button>
        )}
      </div>
      <p className="text-[11px] text-gray-500">{p.helper}</p>

      {p.current ? (
        <div className="mt-1">
          <p className="text-sm font-medium text-gray-900">{p.current.name}</p>
          <p className="text-xs text-gray-500">
            {p.current.email || <span className="text-amber-600">no email</span>}
            {p.current.phone && ` · ${p.current.phone}`}
          </p>
          <Badge variant="secondary" className="mt-1 text-[10px]">{p.current.role}</Badge>
        </div>
      ) : p.loading ? (
        <p className="text-xs text-gray-400">Loading contacts…</p>
      ) : p.options.length === 0 ? (
        <p className="text-xs text-gray-500 italic">{p.emptyMsg}</p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {p.options.slice(0, 8).map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => p.onPick(c)}
              className="w-full text-left px-3 py-1.5 rounded text-sm hover:bg-amber-50 hover:text-[#141414] transition-colors"
            >
              <span className="font-medium">{c.name}</span>
              {c.company && <span className="text-xs text-gray-500 ml-2">· {c.company}</span>}
              {c.email && <span className="text-xs text-gray-400 ml-2">· {c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
