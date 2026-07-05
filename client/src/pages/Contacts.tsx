import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { findDuplicateContacts, computeMergeUpdates, type DuplicateMatch } from '@/lib/contacts/duplicateDetection';
import { DuplicateContactDialog, type DuplicateResolution } from '@/components/contacts/DuplicateContactDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Users, Search, Download, Upload, Plus, TrendingUp, Building, UserCheck, Wrench, Edit, Trash2, Mail, Phone, MoreVertical, User, Star } from 'lucide-react';
import { StarRating } from '@/components/common/StarRating';
import PreferredCategoriesEditor from '@/components/contacts/PreferredCategoriesEditor';
import { MultiTradeSelector } from '@/components/contacts/MultiTradeSelector';
import { EditContactModal } from '@/components/contacts/EditContactModal';
import ContactImportModal from '@/components/contacts/ContactImportModal';
import ContactDetailView from '@/components/contacts/ContactDetailView';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  role: string;
  trade?: string;
  isActive: boolean;
  associatedProjects?: string[];
  createdAt?: string;
  notes?: string;
  rating?: number;
  tags?: string[];
}

interface Trade {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface TradeFormData {
  name: string;
  description: string;
  isActive: boolean;
}

export default function Contacts() {
  const [activeTab, setActiveTab] = useState('contacts');
  const [searchTerm, setSearchTerm] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDetail, setShowContactDetail] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [preferredFor, setPreferredFor] = useState<Contact | null>(null);

  // Firestore data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTrades, setIsLoadingTrades] = useState(true);

  // Mutation loading states
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isSavingTrade, setIsSavingTrade] = useState(false);

  // Trades related state
  const [tradeSearchTerm, setTradeSearchTerm] = useState('');
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [tradeFormData, setTradeFormData] = useState<TradeFormData>({
    name: '',
    description: '',
    isActive: true
  });

  // Contact form data state. `trades` is the source of truth (multi-trade);
  // `trade` is mirrored from trades[0] for backwards-compat with old reads.
  // `firstName` + `lastName` are the source of truth; `name` is joined.
  const [newContactFormData, setNewContactFormData] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    company: string;
    role: string;
    trades: string[];
    salesStage: string;
    sendInvite: boolean;
  }>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    role: 'client',
    trades: [],
    salesStage: '',
    sendInvite: false,
  });

  // Sales pipeline stages (kept in sync with NewClientModal/Sales). Loaded from
  // settings/salesStages on mount; falls back to defaults.
  const [salesStages, setSalesStages] = useState<{ key: string; label: string; color: string }[]>([
    { key: 'new_lead',        label: 'New Lead',         color: '#64748b' },
    { key: 'meeting_booked',  label: 'Meeting Booked',   color: '#3b82f6' },
    { key: 'design_phase',    label: 'Design Phase',     color: '#8b5cf6' },
    { key: 'in_estimating',   label: 'In Estimating',    color: '#f59e0b' },
    { key: 'close_to_sign',   label: 'Close to Signing', color: '#C9A96E' },
    { key: 'won',             label: 'Won',              color: '#22c55e' },
    { key: 'lost',            label: 'Lost',             color: '#ef4444' },
  ]);

  const { toast } = useToast();
  const { user } = useAuth();

  // Duplicate-detection flow. When a new contact looks like an existing one,
  // we surface DuplicateContactDialog and pause handleAddContact on a promise
  // until the operator chooses merge / create-anyway / cancel.
  const [dupState, setDupState] = useState<{
    candidate: Parameters<typeof findDuplicateContacts>[0];
    matches: DuplicateMatch[];
    resolve: (r: DuplicateResolution) => void;
  } | null>(null);

  // Subscribe to contacts
  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Contact)));
      setIsLoading(false);
    }, () => {
      setIsLoading(false);
    });
    return unsub;
  }, []);

  // Subscribe to trades
  useEffect(() => {
    const q = query(collection(db, 'trades'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() } as Trade)));
      setIsLoadingTrades(false);
    }, () => {
      setIsLoadingTrades(false);
    });
    return unsub;
  }, []);

  // Load sales stages from settings (matches Sales.tsx + NewClientModal source).
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'pipeline'));
        const data = snap.exists() ? snap.data() : null;
        if (data?.stages && Array.isArray(data.stages) && data.stages.length > 0) {
          setSalesStages(data.stages);
        }
      } catch {
        // Stay on defaults.
      }
    })();
  }, []);

  // Reset contact form
  const resetContactForm = () => {
    setNewContactFormData({
      firstName: '', lastName: '', email: '', phone: '', company: '',
      role: 'client', trades: [], salesStage: '', sendInvite: false,
    });
  };

  const handleContactClick = (contact: Contact) => {
    setSelectedContact(contact);
    setShowContactDetail(true);
  };

  // Manual 1–5 sub quality rating. Used to sort subs highest-first when picking
  // them for bid packages.
  const updateRating = async (id: string, rating: number) => {
    try {
      await updateDoc(doc(db, 'contacts', id), { rating });
    } catch (e: any) {
      toast({ title: 'Could not update rating', description: e?.message, variant: 'destructive' });
    }
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact as any);
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      await deleteDoc(doc(db, 'contacts', contactId));
      toast({ title: 'Success', description: 'Contact deleted successfully' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: `Failed to delete contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      });
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRole = newContactFormData.role?.trim() || 'client';

    // Hard rule: clients must land somewhere in the sales pipeline so nothing
    // slips through without an owner / next-action stage.
    if (validRole === 'client' && !newContactFormData.salesStage) {
      toast({
        title: 'Sales pipeline stage required',
        description: 'Pick where this client sits in the sales pipeline before saving.',
        variant: 'destructive',
      });
      return;
    }

    // Subs and vendors must have at least one trade so the bid-package flow
    // can target them by specialty. Multiple trades are allowed.
    if ((validRole === 'subcontractor' || validRole === 'vendor') && newContactFormData.trades.length === 0) {
      toast({
        title: 'Trade required',
        description: 'Add at least one trade so this sub/vendor can be matched to bid packages.',
        variant: 'destructive',
      });
      return;
    }

    // Duplicate detection — surface existing contacts that share a name, email,
    // phone, or address. The operator decides: merge into the existing record,
    // create a new one anyway (optionally noting what's different), or cancel.
    const candidate = {
      firstName: newContactFormData.firstName,
      lastName: newContactFormData.lastName,
      email: newContactFormData.email,
      phone: newContactFormData.phone,
      company: newContactFormData.company,
    };
    let differenceNote: string | undefined;
    const matches = await findDuplicateContacts(candidate);
    if (matches.length > 0) {
      const resolution = await new Promise<DuplicateResolution>((resolve) => {
        setDupState({ candidate, matches, resolve });
      });
      setDupState(null);
      if (resolution.action === 'cancel') return; // keep the form open to edit
      if (resolution.action === 'merge') {
        const updates = computeMergeUpdates(resolution.match.data, candidate);
        try {
          await updateDoc(doc(db, 'contacts', resolution.match.id), {
            ...updates,
            updatedAt: serverTimestamp(),
          });
          toast({
            title: 'Merged into existing contact',
            description: Object.keys(updates).length
              ? `Filled in missing details on “${resolution.match.name}”.`
              : `“${resolution.match.name}” already had everything — nothing to change.`,
          });
        } catch (e: any) {
          toast({ title: 'Merge failed', description: e?.message || '', variant: 'destructive' });
        }
        resetContactForm();
        setShowAddModal(false);
        return;
      }
      differenceNote = resolution.differenceNote;
    }

    // Optimistic UX: close the modal immediately so the user isn't stuck
    // watching a spinner. The write keeps running in the background and we
    // toast either success or failure once it resolves.
    const formSnapshot = { ...newContactFormData };
    resetContactForm();
    setShowAddModal(false);
    setIsSavingContact(false);
    try {
      if (validRole === 'client') {
        // Dual-write: contact + matching CRM client doc, cross-referenced.
        const batch = writeBatch(db);
        const contactRef = doc(collection(db, 'contacts'));
        const clientRef  = doc(collection(db, 'clients'));
        const fullName = `${formSnapshot.firstName} ${formSnapshot.lastName}`.trim();
        batch.set(contactRef, {
          firstName: formSnapshot.firstName,
          lastName: formSnapshot.lastName,
          name: fullName,
          email: formSnapshot.email,
          phone: formSnapshot.phone,
          company: formSnapshot.company,
          role: validRole,
          type: 'client',
          trade: '',
          trades: [],
          isActive: true,
          notes: differenceNote || '',
          salesClientId: clientRef.id,
          // Record the portal-invite choice. Clients are NOT auto-invited by
          // the backend — the invite is opt-in (sent below when checked).
          portalInviteOptIn: formSnapshot.sendInvite,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(clientRef, {
          name: fullName,
          email: formSnapshot.email,
          phone: formSnapshot.phone,
          stage: formSnapshot.salesStage,
          projectType: 'custom_home',
          source: 'referral',
          priority: 'medium',
          tags: [],
          contactId: contactRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        const stageLabel = salesStages.find(s => s.key === formSnapshot.salesStage)?.label || formSnapshot.salesStage;
        toast({
          title: 'Contact added',
          description: `Client created — also placed in Sales at "${stageLabel}".`,
        });

        // Portal invite is opt-in for clients: only send when the box is
        // checked. Unready leads just sit in the pipeline for nurture. Email
        // when we have one; otherwise text the invite to their phone.
        if (formSnapshot.sendInvite && (formSnapshot.email || formSnapshot.phone)) {
          try {
            const { sendPortalInviteEmail, sendPortalInviteSms } = await import('@/lib/portalInvite');
            if (formSnapshot.email) {
              const { templateName } = await sendPortalInviteEmail({
                contactId: contactRef.id,
                email: formSnapshot.email,
                role: 'client',
                firstName: formSnapshot.firstName,
                invitedBy: user?.email || '',
                preferStage: 'lead',
              });
              toast({ title: 'Portal invite sent', description: `Emailed “${templateName}” to ${formSnapshot.email}.` });
            } else {
              await sendPortalInviteSms({
                contactId: contactRef.id,
                phone: formSnapshot.phone,
                role: 'client',
                firstName: formSnapshot.firstName,
                invitedBy: user?.email || '',
              });
              toast({ title: 'Portal invite texted', description: `Sent a sign-up link to ${formSnapshot.phone}.` });
            }
          } catch (e: any) {
            toast({ title: 'Invite not sent', description: e?.message || '', variant: 'destructive' });
          }
        }
      } else {
        const fullName = `${formSnapshot.firstName} ${formSnapshot.lastName}`.trim();
        const newRef = await addDoc(collection(db, 'contacts'), {
          firstName: formSnapshot.firstName,
          lastName: formSnapshot.lastName,
          name: fullName,
          email: formSnapshot.email,
          phone: formSnapshot.phone,
          company: formSnapshot.company,
          role: validRole,
          trade: formSnapshot.trades[0] || '',
          trades: formSnapshot.trades,
          isActive: true,
          notes: differenceNote || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Contact added', description: `${fullName} added to contacts.` });
        if (formSnapshot.sendInvite && formSnapshot.email) {
          // Send a real portal-invite email (SendGrid) using the default
          // template for a new contact. No mail client involved.
          const { sendPortalInviteEmail } = await import('@/lib/portalInvite');
          try {
            const { templateName } = await sendPortalInviteEmail({
              contactId: newRef.id,
              email: formSnapshot.email,
              role: validRole,
              firstName: formSnapshot.firstName,
              invitedBy: user?.email || '',
              preferStage: 'lead',
            });
            toast({ title: 'Portal invite sent', description: `Emailed “${templateName}” to ${formSnapshot.email}.` });
          } catch (e: any) {
            toast({ title: 'Invite not sent', description: e?.message || '', variant: 'destructive' });
          }
        }
      }
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('Add contact failed:', error);
      toast({
        title: 'Could not add contact',
        description: error instanceof Error ? error.message : 'Failed to add contact',
        variant: 'destructive',
      });
    }
  };

  // Trade handlers
  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeFormData.name) return;
    setIsSavingTrade(true);
    try {
      await addDoc(collection(db, 'trades'), {
        ...tradeFormData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsTradeDialogOpen(false);
      setTradeFormData({ name: '', description: '', isActive: true });
      toast({ title: 'Success', description: 'Trade created successfully' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create trade',
        variant: 'destructive'
      });
    } finally {
      setIsSavingTrade(false);
    }
  };

  const handleEditTrade = (trade: Trade) => {
    setEditingTrade(trade);
    setTradeFormData({ name: trade.name, description: trade.description, isActive: trade.isActive });
    setIsTradeDialogOpen(true);
  };

  const handleUpdateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrade || !tradeFormData.name) return;
    setIsSavingTrade(true);
    try {
      await updateDoc(doc(db, 'trades', editingTrade.id), {
        ...tradeFormData,
        updatedAt: serverTimestamp()
      });
      setIsTradeDialogOpen(false);
      setEditingTrade(null);
      setTradeFormData({ name: '', description: '', isActive: true });
      toast({ title: 'Success', description: 'Trade updated successfully' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update trade',
        variant: 'destructive'
      });
    } finally {
      setIsSavingTrade(false);
    }
  };

  const handleDeleteTrade = async (trade: Trade) => {
    if (!confirm(`Are you sure you want to delete the trade "${trade.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'trades', trade.id));
      toast({ title: 'Success', description: 'Trade deleted successfully' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete trade',
        variant: 'destructive'
      });
    }
  };

  const resetTradeForm = () => {
    setEditingTrade(null);
    setTradeFormData({ name: '', description: '', isActive: true });
    setIsTradeDialogOpen(false);
  };

  // Derived data
  const filteredTrades = trades.filter((trade) => {
    const matchesSearch = tradeSearchTerm === '' ||
      trade.name.toLowerCase().includes(tradeSearchTerm.toLowerCase()) ||
      trade.description.toLowerCase().includes(tradeSearchTerm.toLowerCase());
    return matchesSearch;
  });

  // Internal Skyeline staff roles — grouped under the "Team Members" tile/filter.
  const TEAM_ROLES = ['team', 'employee', 'gc', 'admin', 'project_manager', 'projectmanager', 'staff'];
  const isTeamRole = (role?: string) => TEAM_ROLES.includes((role || '').toLowerCase());

  const filteredContacts = contacts.filter((contact) => {
    const matchesSearch = searchTerm === '' ||
      contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.company && contact.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
      contact.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.trade && contact.trade.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (Array.isArray((contact as any).trades) && (contact as any).trades.some((t: string) =>
        typeof t === 'string' && t.toLowerCase().includes(searchTerm.toLowerCase())
      ));
    const matchesRole = roleFilter === 'all'
      ? true
      : roleFilter === 'team'
        ? isTeamRole(contact.role)
        : contact.role?.toLowerCase() === roleFilter.toLowerCase();
    const matchesCompany = companyFilter === 'all' || contact.company === companyFilter;
    return matchesSearch && matchesRole && matchesCompany;
  }).sort((a, b) => {
    // Alphabetical by name — primary sort. Fall back to email if name is empty.
    const aKey = String(a.name || a.email || '').toLowerCase();
    const bKey = String(b.name || b.email || '').toLowerCase();
    return aKey.localeCompare(bKey);
  });

  const uniqueRoles = Array.from(new Set(contacts.map((c) => c.role))).sort();
  const uniqueCompanies = Array.from(new Set(contacts.map((c) => c.company).filter(Boolean))).sort();

  const summaryStats = {
    total: contacts.length,
    clients: contacts.filter((c) => c.role.toLowerCase() === 'client').length,
    subcontractors: contacts.filter((c) => c.role.toLowerCase() === 'subcontractor').length,
    suppliers: contacts.filter((c) => c.role.toLowerCase() === 'supplier').length,
    team: contacts.filter((c) => isTeamRole(c.role)).length,
    active: contacts.filter((c) => c.isActive).length
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'client': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'subcontractor': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'supplier': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'vendor': return 'bg-green-100 text-green-800 border-green-200';
      case 'architect': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'engineer': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const exportContacts = () => {
    const headers = ['Name', 'Email', 'Phone', 'Company', 'Role', 'Trades'];
    const csvContent = [
      headers.join(','),
      ...filteredContacts.map((contact) => {
        const arr: string[] = Array.isArray((contact as any).trades) ? (contact as any).trades : [];
        const tradesStr = arr.length > 0 ? arr.join('; ') : (contact.trade || '');
        return [
          contact.name, contact.email, contact.phone || '',
          contact.company || '', contact.role,
          // Wrap in quotes since trades are joined by `;` (CSV-safe).
          `"${tradesStr.replace(/"/g, '""')}"`,
        ].join(',');
      })
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'contacts-export.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <PageHeader title="Contacts" icon={<Users className="h-6 w-6" />} />
          <div className="grid gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Contacts & Trades"
          icon={<Users className="h-6 w-6" />}
          actions={
            <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant={activeTab === 'contacts' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('contacts')}
              className={activeTab === 'contacts' ? 'bg-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/90' : ''}
            >
              <Users className="h-4 w-4 mr-2" />
              Contacts
            </Button>
            <Button
              variant={activeTab === 'trades' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('trades')}
              className={activeTab === 'trades' ? 'bg-[var(--accent-color)] text-white hover:bg-[var(--accent-color)]/90' : ''}
            >
              <Wrench className="h-4 w-4 mr-2" />
              Trades
            </Button>
            </div>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="hidden">
            <TabsList className="hidden">
              <TabsTrigger value="contacts" className="hidden">Contacts</TabsTrigger>
              <TabsTrigger value="trades" className="hidden">Trades</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="contacts" className="space-y-6">
            {/* Contacts Header Actions */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm text-gray-600">
                Manage your construction project contacts
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={exportContacts}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button variant="outline" onClick={() => setShowImportModal(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV/Excel
                </Button>
                <Button
                  onClick={() => setShowAddModal(true)}
                  className="min-w-[120px] min-h-[40px] text-white"
                  style={{ backgroundColor: 'var(--accent-color)', border: '1px solid var(--accent-color)' }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card
                onClick={() => setRoleFilter('all')}
                className={`cursor-pointer transition-shadow hover:shadow-md ${roleFilter === 'all' ? 'ring-2 ring-[#C9A96E]' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-sm text-gray-600">Total</p>
                      <p className="text-xl font-semibold">{summaryStats.total}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card
                onClick={() => setRoleFilter('client')}
                className={`cursor-pointer transition-shadow hover:shadow-md ${roleFilter === 'client' ? 'ring-2 ring-[#C9A96E]' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-sm text-gray-600">Clients</p>
                      <p className="text-xl font-semibold">{summaryStats.clients}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card
                onClick={() => setRoleFilter('subcontractor')}
                className={`cursor-pointer transition-shadow hover:shadow-md ${roleFilter === 'subcontractor' ? 'ring-2 ring-[#C9A96E]' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Wrench className="h-4 w-4 text-orange-600" />
                    <div>
                      <p className="text-sm text-gray-600">Subcontractors</p>
                      <p className="text-xl font-semibold">{summaryStats.subcontractors}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card
                onClick={() => setRoleFilter('supplier')}
                className={`cursor-pointer transition-shadow hover:shadow-md ${roleFilter === 'supplier' ? 'ring-2 ring-[#C9A96E]' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Building className="h-4 w-4 text-purple-600" />
                    <div>
                      <p className="text-sm text-gray-600">Suppliers</p>
                      <p className="text-xl font-semibold">{summaryStats.suppliers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card
                onClick={() => setRoleFilter('team')}
                className={`cursor-pointer transition-shadow hover:shadow-md ${roleFilter === 'team' ? 'ring-2 ring-[#C9A96E]' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-slate-600" />
                    <div>
                      <p className="text-sm text-gray-600">Team Members</p>
                      <p className="text-xl font-semibold">{summaryStats.team}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card
                onClick={() => setRoleFilter('all')}
                className="cursor-pointer transition-shadow hover:shadow-md"
              >
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Users className="h-4 w-4 text-indigo-600" />
                    <div>
                      <p className="text-sm text-gray-600">Active</p>
                      <p className="text-xl font-semibold">{summaryStats.active}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Search */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search contacts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {uniqueRoles.map(role => (
                    <SelectItem key={role} value={role}>{role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  {uniqueCompanies.map(company => (
                    <SelectItem key={company} value={company!}>{company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contacts List */}
            <div className="space-y-3">
              {filteredContacts.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts found</h3>
                    <p className="text-gray-600 mb-4">
                      {searchTerm ? 'Try adjusting your search terms' : 'Get started by adding a contact or importing from CSV/Excel'}
                    </p>
                    {!searchTerm && (
                      <div className="flex justify-center space-x-2">
                        <Button variant="outline" onClick={() => setShowImportModal(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Import Contacts
                        </Button>
                        <Button
                          onClick={() => setShowAddModal(true)}
                          className="text-white"
                          style={{ backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Contact
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                filteredContacts.map((contact) => (
                  <Card key={contact.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div
                          className="flex items-center space-x-4 flex-1 cursor-pointer"
                          onClick={() => handleContactClick(contact)}
                        >
                          <div className={`w-1 h-12 rounded-full ${getRoleColor(contact.role).split(' ')[0]}`}></div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <h3 className="font-semibold text-base">{contact.name}</h3>
                              <Badge className={`text-xs ${getRoleColor(contact.role)}`} variant="secondary">
                                {contact.role}
                              </Badge>
                            </div>
                            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                              {contact.company && (
                                <span className="font-medium text-gray-800">{contact.company}</span>
                              )}
                              {(() => {
                                const role = String(contact.role || '').toLowerCase();
                                if (role !== 'subcontractor' && role !== 'vendor') return null;
                                const arr = Array.isArray((contact as any).trades) ? (contact as any).trades : [];
                                const display: string[] = arr.length > 0
                                  ? arr.filter((t: any) => typeof t === 'string' && t.trim())
                                  : (contact.trade ? [contact.trade] : []);
                                return display.map((t: string) => (
                                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                                ));
                              })()}
                              <span>{contact.email}</span>
                              {contact.phone && <span>{contact.phone}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          {(() => {
                            const role = String(contact.role || '').toLowerCase();
                            if (role !== 'subcontractor' && role !== 'sub' && role !== 'vendor') return null;
                            return (
                              <div onClick={(e) => e.stopPropagation()} className="mr-2" title="Sub rating">
                                <StarRating
                                  value={(contact as any).rating || 0}
                                  size={16}
                                  onChange={(v) => updateRating(contact.id, v)}
                                />
                              </div>
                            );
                          })()}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `mailto:${contact.email}`;
                            }}
                          >
                            <Mail className="h-4 w-4" />
                          </Button>
                          {contact.phone && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `tel:${contact.phone}`;
                              }}
                            >
                              <Phone className="h-4 w-4" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditContact(contact); }}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Contact
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleContactClick(contact); }}>
                                <User className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {(contact.role === 'subcontractor' || contact.role === 'vendor') && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPreferredFor(contact); }}>
                                  <Star className="h-4 w-4 mr-2" />
                                  Preferred Categories
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('Are you sure you want to delete this contact?')) {
                                    handleDeleteContact(contact.id);
                                  }
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Contact
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Add Contact Modal */}
            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Contact</DialogTitle>
                  <DialogDescription>
                    Add a new contact to your construction project database
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddContact} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        value={newContactFormData.firstName}
                        onChange={(e) => setNewContactFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        value={newContactFormData.lastName}
                        onChange={(e) => setNewContactFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newContactFormData.email}
                        onChange={(e) => setNewContactFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={newContactFormData.phone}
                        onChange={(e) => setNewContactFormData(prev => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="role">Role *</Label>
                      <Select
                        value={newContactFormData.role}
                        onValueChange={(value) => {
                          const isVendorish = value === 'subcontractor' || value === 'vendor';
                          const isDesigner = value === 'designer';
                          // Designers and vendors both have a company/business
                          // name. Trades are sub/vendor only.
                          setNewContactFormData(prev => ({
                            ...prev,
                            role: value,
                            company: (isVendorish || isDesigner) ? prev.company : '',
                            trades:  isVendorish ? prev.trades  : [],
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
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
                  {(() => {
                    const isVendorish = newContactFormData.role === 'subcontractor' || newContactFormData.role === 'vendor';
                    const isDesigner = newContactFormData.role === 'designer';
                    const showCompany = isVendorish || isDesigner;
                    const isClient = newContactFormData.role === 'client';
                    return (
                      <>
                        {showCompany && (
                          <div>
                            <Label htmlFor="company">
                              {isDesigner ? 'Business Name' : 'Company'}
                            </Label>
                            <Input
                              id="company"
                              value={newContactFormData.company}
                              onChange={(e) => setNewContactFormData(prev => ({ ...prev, company: e.target.value }))}
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
                              value={newContactFormData.trades}
                              onValueChange={(trades) => setNewContactFormData(prev => ({ ...prev, trades }))}
                            />
                            <p className="text-[11px] text-gray-500 mt-1">
                              Add every trade this sub/vendor covers — each one makes them eligible for that trade's bid packages.
                            </p>
                          </div>
                        )}

                        {isClient && (
                          <div className="rounded-lg border border-[#C9A96E] bg-[#FFF8E7]/60 p-3">
                            <Label htmlFor="salesStage" className="font-medium">
                              Sales Pipeline Stage *
                            </Label>
                            <p className="text-xs text-gray-500 mb-2">
                              Required for clients — every client has to live somewhere in the pipeline.
                            </p>
                            <Select
                              value={newContactFormData.salesStage}
                              onValueChange={(v) => setNewContactFormData(prev => ({ ...prev, salesStage: v }))}
                            >
                              <SelectTrigger id="salesStage">
                                <SelectValue placeholder="Where in the pipeline?" />
                              </SelectTrigger>
                              <SelectContent>
                                {salesStages.map(s => (
                                  <SelectItem key={s.key} value={s.key}>
                                    <span className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                                      {s.label}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <label className="flex items-start gap-2 p-3 border rounded-lg bg-amber-50/40 border-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newContactFormData.sendInvite}
                      onChange={e => setNewContactFormData(prev => ({ ...prev, sendInvite: e.target.checked }))}
                      className="mt-1"
                    />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900">Send portal login invite now</p>
                      <p className="text-xs text-amber-700/80">
                        Emails them a sign-up link to create their portal account. Leave unchecked for leads you're still nurturing — you can invite them later from the contact or project.
                      </p>
                    </div>
                  </label>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { resetContactForm(); setShowAddModal(false); }}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSavingContact}
                      className="text-white"
                      style={{ backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
                    >
                      {isSavingContact ? 'Adding...' : 'Add Contact'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="trades" className="space-y-6">
            {/* Trades Header Actions */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Manage construction trades and specialties
              </div>
              <Button
                onClick={() => setIsTradeDialogOpen(true)}
                className="text-white"
                style={{ minWidth: '120px', minHeight: '40px', backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Trade
              </Button>
            </div>

            {/* Trades Search */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search trades..."
                  value={tradeSearchTerm}
                  onChange={(e) => setTradeSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Trades List */}
            <div className="space-y-4">
              {isLoadingTrades ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="animate-pulse space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </CardContent>
                </Card>
              ) : filteredTrades.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No trades found</h3>
                    <p className="text-gray-600 mb-4">
                      {tradeSearchTerm ? 'Try adjusting your search terms' : 'Get started by adding your first trade'}
                    </p>
                    {!tradeSearchTerm && (
                      <Button
                        onClick={() => setIsTradeDialogOpen(true)}
                        className="text-white"
                        style={{ backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Trade
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                filteredTrades.map((trade) => (
                  <Card key={trade.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium">{trade.name}</h4>
                            <Badge variant={trade.isActive ? 'default' : 'secondary'}>
                              {trade.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          {trade.description && (
                            <p className="text-sm text-gray-600">{trade.description}</p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEditTrade(trade)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDeleteTrade(trade)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Trade Form Dialog */}
            <Dialog open={isTradeDialogOpen} onOpenChange={(open) => { if (!open) resetTradeForm(); setIsTradeDialogOpen(open); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTrade ? 'Edit Trade' : 'Add New Trade'}</DialogTitle>
                  <DialogDescription>
                    {editingTrade ? 'Update trade information' : 'Add a new trade specialty'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={editingTrade ? handleUpdateTrade : handleCreateTrade} className="space-y-4">
                  <div>
                    <Label htmlFor="trade-name">Trade Name</Label>
                    <Input
                      id="trade-name"
                      value={tradeFormData.name}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, name: e.target.value })}
                      placeholder="e.g., Electrical, Plumbing, HVAC"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="trade-description">Description (Optional)</Label>
                    <Input
                      id="trade-description"
                      value={tradeFormData.description}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, description: e.target.value })}
                      placeholder="Brief description of the trade"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="trade-active"
                      checked={tradeFormData.isActive}
                      onChange={(e) => setTradeFormData({ ...tradeFormData, isActive: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="trade-active">Active</Label>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={resetTradeForm}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSavingTrade}
                      className="text-white"
                      style={{ backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
                    >
                      {isSavingTrade ? 'Saving...' : (editingTrade ? 'Update Trade' : 'Add Trade')}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>

        {/* Import Modal */}
        <ContactImportModal
          open={showImportModal}
          onOpenChange={setShowImportModal}
        />

        {/* Contact Detail View Modal */}
        {selectedContact && (
          <ContactDetailView
            contact={selectedContact}
            open={showContactDetail}
            onOpenChange={setShowContactDetail}
            onEdit={(contact) => {
              setEditingContact(contact as any);
              setShowContactDetail(false);
            }}
          />
        )}

        <EditContactModal
          contact={editingContact}
          open={!!editingContact}
          onClose={() => setEditingContact(null)}
        />

        {dupState && (
          <DuplicateContactDialog
            open={true}
            candidate={dupState.candidate}
            matches={dupState.matches}
            entityLabel="contact"
            onResolve={dupState.resolve}
          />
        )}

        {preferredFor && (
          <PreferredCategoriesEditor
            contactId={preferredFor.id}
            contactName={preferredFor.name || preferredFor.company || 'Vendor'}
            initial={Array.isArray((preferredFor as any).preferredCategories) ? (preferredFor as any).preferredCategories : []}
            open={!!preferredFor}
            onClose={() => setPreferredFor(null)}
          />
        )}
      </div>
    </AppLayout>
  );
}
