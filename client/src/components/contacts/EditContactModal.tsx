import { useEffect, useState } from 'react';
import {
  collection, doc, onSnapshot, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { MultiTradeSelector } from './MultiTradeSelector';
import { InviteToPortalButton } from '@/components/portal/InviteToPortalButton';
import { contactsWithEmail, confirmDuplicateEmail } from '@/lib/contacts/duplicateEmail';

interface ContactLike {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  trade?: string;
  trades?: string[];
  spouseContactId?: string;
  spouseName?: string;
  spouseEmail?: string;
  spousePhone?: string;
  linkedUserId?: string;
  smsConsent?: boolean;
  notificationPrefs?: { sms?: boolean; email?: boolean; push?: boolean };
}

interface Props {
  contact: ContactLike | null;
  open: boolean;
  onClose: () => void;
}

export function EditContactModal({ contact, open, onClose }: Props) {
  const { toast } = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('client');
  const [trades, setTrades] = useState<string[]>([]);
  // Spouse: either link to an existing contact or capture inline info.
  // If linked, the spouse may sign up later — when they do, sign-up matching
  // promotes them to a real contact and mirrors the link both ways.
  const [spouseContactId, setSpouseContactId] = useState<string>('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseEmail, setSpouseEmail] = useState('');
  const [spousePhone, setSpousePhone] = useState('');
  const [allContacts, setAllContacts] = useState<Array<{ id: string; name?: string; email?: string }>>([]);
  const [saving, setSaving] = useState(false);
  // SMS consent — the auditable opt-in proof carriers/TCPA expect before we
  // text a contact. Checking it also flips notificationPrefs.sms on so the
  // dispatcher sends (forced bid/award texts ignore this, but the record stands).
  const [smsConsent, setSmsConsent] = useState(false);

  // Sync form state from the contact every time the dialog opens.
  useEffect(() => {
    if (!open || !contact) return;
    // Prefer split first/last when available; fall back to splitting the
    // legacy `name` field for older records.
    const fn = contact.firstName?.trim() || '';
    const ln = contact.lastName?.trim() || '';
    if (fn || ln) {
      setFirstName(fn);
      setLastName(ln);
    } else {
      const tokens = String(contact.name || '').trim().split(/\s+/).filter(Boolean);
      setFirstName(tokens[0] || '');
      setLastName(tokens.slice(1).join(' '));
    }
    setEmail(contact.email || '');
    setPhone(contact.phone || '');
    setCompany(contact.company || '');
    setRole((contact.role || 'client').toLowerCase());
    const arr = Array.isArray(contact.trades) ? contact.trades : [];
    setTrades(arr.length > 0 ? arr : (contact.trade ? [contact.trade] : []));
    const c = contact as any;
    setSpouseContactId(String(c.spouseContactId || ''));
    setSpouseName(String(c.spouseName || ''));
    setSpouseEmail(String(c.spouseEmail || ''));
    setSpousePhone(String(c.spousePhone || ''));
    // Seed consent from the explicit flag, falling back to an existing SMS pref
    // for contacts that were opted in before this field existed.
    setSmsConsent(!!c.smsConsent || c.notificationPrefs?.sms === true);
  }, [open, contact]);

  // Live contact list — used for the "Link existing contact as spouse" picker.
  useEffect(() => {
    if (!open) return;
    const unsub = onSnapshot(query(collection(db, 'contacts')), snap => {
      setAllContacts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    }, () => {});
    return () => unsub();
  }, [open]);

  const isVendorish = role === 'subcontractor' || role === 'vendor';
  const isDesigner = role === 'designer';
  const showCompany = isVendorish || isDesigner;

  const handleSave = async () => {
    if (!contact) return;
    if (!firstName.trim() && !lastName.trim()) {
      toast({ title: 'First or last name is required', variant: 'destructive' });
      return;
    }
    if (isVendorish && trades.length === 0) {
      toast({
        title: 'Trade required',
        description: 'Add at least one trade so this sub/vendor can be matched to bid packages.',
        variant: 'destructive',
      });
      return;
    }

    // Soft duplicate-email warning — only when the email actually changed, so
    // unrelated edits to an existing contact don't nag. Contacts that share an
    // email can't each get their own portal login.
    const emailLower = email.trim().toLowerCase();
    if (emailLower && emailLower !== String(contact.email || '').trim().toLowerCase()) {
      const dupes = await contactsWithEmail(email.trim(), contact.id);
      if (dupes.length > 0 && !confirmDuplicateEmail(email.trim(), dupes)) {
        return;
      }
    }

    setSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const updates: Record<string, any> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        email: email.trim(),
        phone: phone.trim(),
        company: showCompany ? company.trim() : '',
        role,
        trade: isVendorish ? (trades[0] || '') : '',
        trades: isVendorish ? trades : [],
        spouseContactId: spouseContactId.trim(),
        spouseName: spouseName.trim(),
        spouseEmail: spouseEmail.trim(),
        spousePhone: spousePhone.trim(),
        updatedAt: serverTimestamp(),
      };

      // SMS consent — only meaningful when there's a number to text. Use dot-path
      // keys so we set notificationPrefs.sms without clobbering sibling prefs
      // (email/push). Stamp the consent timestamp + source on the rising edge so
      // there's an auditable record of when/how they opted in.
      if (phone.trim()) {
        const hadConsent = !!contact.smsConsent || contact.notificationPrefs?.sms === true;
        updates.smsConsent = smsConsent;
        updates['notificationPrefs.sms'] = smsConsent;
        if (smsConsent && !hadConsent) {
          updates.smsConsentAt = serverTimestamp();
          updates.smsConsentSource = 'gc_contact_form';
        } else if (!smsConsent && hadConsent) {
          updates.smsConsentRevokedAt = serverTimestamp();
        }
      }

      await updateDoc(doc(db, 'contacts', contact.id), updates);

      // Mirror the spouse link both ways when an existing contact was linked.
      // (Inline spouse info doesn't need mirroring — it lives on this contact alone.)
      const previousSpouseId = String((contact as any).spouseContactId || '');
      if (spouseContactId && spouseContactId !== previousSpouseId) {
        try {
          await updateDoc(doc(db, 'contacts', spouseContactId), {
            spouseContactId: contact.id,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal — partner record may not exist or permission denied.
        }
      }
      if (previousSpouseId && previousSpouseId !== spouseContactId) {
        // Clear the previous spouse's link if we switched or removed it.
        try {
          await updateDoc(doc(db, 'contacts', previousSpouseId), {
            spouseContactId: '',
            updatedAt: serverTimestamp(),
          });
        } catch {}
      }

      toast({ title: 'Contact updated' });
      onClose();
    } catch (e: any) {
      toast({
        title: 'Could not update contact',
        description: e?.message || 'Failed to save changes',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
          <DialogDescription>Update this contact's details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-firstName">First Name *</Label>
              <Input id="edit-firstName" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-lastName">Last Name *</Label>
              <Input id="edit-lastName" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-role">Role</Label>
              <Select value={role} onValueChange={v => {
                setRole(v);
                const isV = v === 'subcontractor' || v === 'vendor';
                const isD = v === 'designer';
                // Designers + subs/vendors keep company; only sub/vendor keep trades.
                if (!(isV || isD)) setCompany('');
                if (!isV) setTrades([]);
              }}>
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="designer">Designer</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SMS consent — only surfaced once there's a number to text. This is
              the opt-in record we need before texting subs/contacts at scale.
              Checking it flips notificationPrefs.sms on and stamps when/how
              they consented; STOP replies still override it at send time. */}
          {phone.trim() && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3 cursor-pointer">
              <Checkbox
                checked={smsConsent}
                onCheckedChange={(c) => setSmsConsent(!!c)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">This contact agreed to receive SMS text alerts</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">
                  Required before we text them. They can reply STOP anytime to opt out.
                </span>
              </span>
            </label>
          )}

          {showCompany && (
            <div>
              <Label htmlFor="edit-company">
                {isDesigner ? 'Business Name' : 'Company'}
              </Label>
              <Input
                id="edit-company"
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder={isDesigner ? 'e.g. Skyeline Design' : ''}
              />
            </div>
          )}
          {isVendorish && (
            <div>
              <Label>
                Trades / Specialties <span className="text-red-500">*</span>
              </Label>
              <MultiTradeSelector
                value={trades}
                onValueChange={setTrades}
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Add every trade this sub/vendor covers.
              </p>
            </div>
          )}

          {/* Spouse section — only meaningful for clients. Either link an
              existing contact OR capture spouse info inline. If they sign up
              later, the signup flow will tie them to this record automatically. */}
          {role === 'client' && (
            <div className="border-t pt-4 mt-2">
              <Label className="text-sm font-semibold">Spouse</Label>
              <p className="text-[11px] text-gray-500 mb-2">
                Optional. Add spouse info here so both can be looped into the project.
                If they sign up for their own portal later, their account auto-links.
              </p>

              <div className="space-y-2">
                <Label className="text-xs">Link to existing contact</Label>
                <Select
                  value={spouseContactId || 'none'}
                  onValueChange={(v) => {
                    const next = v === 'none' ? '' : v;
                    setSpouseContactId(next);
                    if (next) {
                      // Auto-fill inline display fields from the picked contact.
                      const c = allContacts.find(x => x.id === next);
                      if (c) {
                        setSpouseName(c.name || '');
                        setSpouseEmail(c.email || '');
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick existing spouse contact (or enter info below)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not linked —</SelectItem>
                    {allContacts
                      .filter(c => c.id !== contact?.id)
                      .map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name || '(unnamed)'}{c.email ? ` — ${c.email}` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <Label className="text-xs">Spouse Name</Label>
                  <Input
                    value={spouseName}
                    onChange={e => setSpouseName(e.target.value)}
                    placeholder="Laura Gardanier"
                  />
                </div>
                <div>
                  <Label className="text-xs">Spouse Email</Label>
                  <Input
                    type="email"
                    value={spouseEmail}
                    onChange={e => setSpouseEmail(e.target.value)}
                    placeholder="laura@example.com"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Spouse Phone</Label>
                  <Input
                    type="tel"
                    value={spousePhone}
                    onChange={e => setSpousePhone(e.target.value)}
                    placeholder="(208) 555-1234"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 mt-2 flex-col sm:flex-row gap-2">
          {!contact?.linkedUserId && (contact?.email || contact?.phone) && (
            <InviteToPortalButton
              email={email.trim()}
              phone={phone.trim()}
              firstName={firstName.trim()}
              contactId={contact.id}
              role={role}
              variant="outline"
              className="sm:mr-auto"
              label="Send portal invite"
            />
          )}
          {contact?.linkedUserId && (
            <span className="text-xs text-green-700 sm:mr-auto inline-flex items-center gap-1">
              ✓ Already has portal access
            </span>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
