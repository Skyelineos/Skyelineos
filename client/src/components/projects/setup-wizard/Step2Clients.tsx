import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, orderBy, query as fsQuery, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ProjectSetupDraft, ProjectClientRef } from '@/types/projectSetup';

/**
 * Step 2 — Clients.
 *
 * Captures the homeowners who'll use the client portal. Two slots:
 * primary (required) + co-buyer (optional, common for married couples).
 * Both slots support either:
 *   - Picking an existing contact from the contacts list
 *   - Creating a new contact inline (name + email + phone, role=client)
 *
 * Email is REQUIRED on the primary because the client portal magic-link
 * flow needs it. We surface that requirement in the helper text + the
 * completeness scorer (it's a blocker, not a warning).
 */

interface ClientContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface Props {
  draft: ProjectSetupDraft;
  onChange: (next: ProjectSetupDraft) => void;
}

export function Step2Clients({ draft, onChange }: Props) {
  const { toast } = useToast();
  const [allContacts, setAllContacts] = useState<ClientContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [addingFor, setAddingFor] = useState<'primary' | 'secondary' | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingNew, setSavingNew] = useState(false);

  // Load contacts with role=client/homeowner.
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(fsQuery(collection(db, 'contacts'), orderBy('name', 'asc')));
        const list: ClientContact[] = [];
        snap.docs.forEach(d => {
          const data = d.data() as any;
          const role = (data.role || data.type || '').toLowerCase();
          if (role === 'client' || role === 'homeowner') {
            list.push({
              id: d.id,
              name: data.name || '',
              email: data.email,
              phone: data.phone,
            });
          }
        });
        setAllContacts(list);
      } catch (e) {
        console.warn('[setup-wizard] contact load failed', e);
      } finally {
        setLoadingContacts(false);
      }
    })();
  }, []);

  const primary = draft.clients[0];
  const secondary = draft.clients[1];

  const setClient = (slot: 'primary' | 'secondary', client: ProjectClientRef | undefined) => {
    const clients = [...(draft.clients || [])];
    const idx = slot === 'primary' ? 0 : 1;
    // Ensure slot 0 exists if we're setting slot 1
    if (slot === 'secondary' && !clients[0]) {
      return; // can't set secondary without primary
    }
    if (client) {
      clients[idx] = client;
    } else {
      clients.splice(idx, 1);
    }
    // Denormalize primary for project list views
    const next: ProjectSetupDraft = {
      ...draft,
      clients,
      clientName: clients.map(c => c.name).filter(Boolean).join(' & '),
      clientEmail: clients[0]?.email,
      clientPhone: clients[0]?.phone,
    };
    onChange(next);
  };

  const createInline = async (slot: 'primary' | 'secondary') => {
    if (!newName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    if (slot === 'primary' && !newEmail.trim()) {
      toast({ title: 'Email is required for the primary client', description: 'The portal magic-link needs an email address.', variant: 'destructive' });
      return;
    }
    setSavingNew(true);
    try {
      const ref = await addDoc(collection(db, 'contacts'), {
        name: newName.trim(),
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
        role: 'client',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const newContact: ClientContact = {
        id: ref.id,
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
      };
      setAllContacts(prev => [...prev, newContact].sort((a, b) => a.name.localeCompare(b.name)));
      setClient(slot, {
        contactId: newContact.id,
        name: newContact.name,
        email: newContact.email,
        phone: newContact.phone,
        createdInWizard: true,
      });
      setAddingFor(null);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      toast({ title: 'Client added' });
    } catch (e: any) {
      console.warn('[setup-wizard] inline contact create failed', e);
      toast({ title: 'Could not create client', description: e.message, variant: 'destructive' });
    } finally {
      setSavingNew(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-semibold text-[#141414]">Clients</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Who's building this home. The primary client gets portal access via magic link — make sure their email is right.
        </p>
      </div>

      <ClientSlot
        slot="primary"
        required
        client={primary}
        contacts={allContacts}
        loadingContacts={loadingContacts}
        adding={addingFor === 'primary'}
        onStartAdd={() => setAddingFor('primary')}
        onCancelAdd={() => setAddingFor(null)}
        onPick={(c) => setClient('primary', {
          contactId: c.id, name: c.name, email: c.email, phone: c.phone,
        })}
        onRemove={() => setClient('primary', undefined)}
        newName={newName} setNewName={setNewName}
        newEmail={newEmail} setNewEmail={setNewEmail}
        newPhone={newPhone} setNewPhone={setNewPhone}
        savingNew={savingNew}
        onCreateInline={() => createInline('primary')}
      />

      <ClientSlot
        slot="secondary"
        required={false}
        client={secondary}
        contacts={allContacts}
        loadingContacts={loadingContacts}
        adding={addingFor === 'secondary'}
        onStartAdd={() => setAddingFor('secondary')}
        onCancelAdd={() => setAddingFor(null)}
        onPick={(c) => setClient('secondary', {
          contactId: c.id, name: c.name, email: c.email, phone: c.phone,
        })}
        onRemove={() => setClient('secondary', undefined)}
        newName={newName} setNewName={setNewName}
        newEmail={newEmail} setNewEmail={setNewEmail}
        newPhone={newPhone} setNewPhone={setNewPhone}
        savingNew={savingNew}
        onCreateInline={() => createInline('secondary')}
        disabled={!primary}
      />
    </div>
  );
}

interface SlotProps {
  slot: 'primary' | 'secondary';
  required: boolean;
  client?: ProjectClientRef;
  contacts: ClientContact[];
  loadingContacts: boolean;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onPick: (c: ClientContact) => void;
  onRemove: () => void;
  newName: string; setNewName: (v: string) => void;
  newEmail: string; setNewEmail: (v: string) => void;
  newPhone: string; setNewPhone: (v: string) => void;
  savingNew: boolean;
  onCreateInline: () => void;
  disabled?: boolean;
}

function ClientSlot(p: SlotProps) {
  const label = p.slot === 'primary' ? 'Primary client' : 'Co-buyer / spouse (optional)';
  return (
    <div className={`rounded-lg border p-4 ${p.disabled ? 'bg-gray-50 opacity-60' : 'bg-white'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-sm text-gray-900">
            {label} {p.required && <span className="text-red-500">*</span>}
          </h3>
        </div>
        {p.client && (
          <Button size="sm" variant="ghost" onClick={p.onRemove} className="text-gray-500 gap-1">
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </Button>
        )}
      </div>

      {p.client ? (
        <div className="mt-2 text-sm">
          <p className="font-medium text-gray-900">{p.client.name}</p>
          <p className="text-xs text-gray-500">
            {p.client.email || <span className="text-amber-600">no email on file</span>}
            {p.client.phone && ` · ${p.client.phone}`}
          </p>
          {p.client.createdInWizard && (
            <Badge variant="secondary" className="mt-1 text-[10px]">Created here</Badge>
          )}
        </div>
      ) : p.adding ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input value={p.newName} onChange={e => p.setNewName(e.target.value)} placeholder="Full name" />
            <Input value={p.newEmail} onChange={e => p.setNewEmail(e.target.value)} placeholder="Email (required for primary)" type="email" />
            <Input value={p.newPhone} onChange={e => p.setNewPhone(e.target.value)} placeholder="Phone" />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={p.onCancelAdd}>Cancel</Button>
            <Button size="sm" onClick={p.onCreateInline} disabled={p.savingNew} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
              {p.savingNew ? 'Saving…' : 'Add client'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {/* Pick from existing */}
          {p.loadingContacts ? (
            <p className="text-xs text-gray-400 mb-2">Loading contacts…</p>
          ) : p.contacts.length === 0 ? (
            <p className="text-xs text-gray-500 mb-2">No client contacts yet.</p>
          ) : (
            <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
              {p.contacts.slice(0, 8).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => p.onPick(c)}
                  disabled={p.disabled}
                  className="w-full text-left px-3 py-1.5 rounded text-sm hover:bg-amber-50 hover:text-[#141414] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="font-medium">{c.name}</span>
                  {c.email && <span className="text-xs text-gray-500 ml-2">· {c.email}</span>}
                </button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={p.onStartAdd}
            disabled={p.disabled}
            className="gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" /> Or add a new client
          </Button>
        </div>
      )}

      {p.disabled && !p.client && (
        <p className="text-[11px] text-gray-500 mt-2 italic">
          Pick the primary client above first.
        </p>
      )}
    </div>
  );
}
