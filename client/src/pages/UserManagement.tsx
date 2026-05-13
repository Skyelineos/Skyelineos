import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/auth/AuthContext';
import { TEAM_NAV } from '@/components/layout/Sidebar';
import {
  Search, X, Shield, UserCheck, HardHat, Palette, Users,
  CheckCircle2, XCircle, Clock, Wrench, MapPin, Settings2
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirestoreUser {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  status: string;
  company?: string;
  trade?: string;
  tradeIsCustom?: boolean;
  projectAddress?: string;
  projectCity?: string;
  linkedClientId?: string;
  navDisabled?: string[];
  createdAt?: any;
}

interface PendingTrade {
  id: string;
  tradeName: string;
  requestedBy: string;
  requestedByEmail: string;
  requestedByUid: string;
  status: string;
  createdAt?: any;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ROLES = [
  { value: 'admin',    label: 'Admin / Staff',        color: '#C9A96E', bg: 'rgba(201,169,110,0.12)' },
  { value: 'client',   label: 'Home Owner',            color: '#3b82f6', bg: '#eff6ff'               },
  { value: 'sub',      label: 'Subcontractor',         color: '#f59e0b', bg: '#fffbeb'               },
  { value: 'designer', label: 'Interior Designer',     color: '#8b5cf6', bg: '#f5f3ff'               },
  { value: 'gc',       label: 'Team (Legacy)',         color: '#6b7280', bg: '#f3f4f6'               },
];

function roleConfig(role: string) {
  return ROLES.find(r => r.value === role) ?? { value: role, label: role, color: '#6b7280', bg: '#f3f4f6' };
}

function RoleBadge({ role }: { role: string }) {
  const cfg = roleConfig(role);
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status, active }: { status: string; active: boolean }) {
  if (!active || status === 'deactivated') {
    return <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="h-3.5 w-3.5" />Inactive</span>;
  }
  if (status === 'pending_approval') {
    return <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" />Pending</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />Active</span>;
}

// ─── Permissions Dialog ───────────────────────────────────────────────────────

function PermissionsDialog({
  user, open, onClose, onSave,
}: {
  user: FirestoreUser;
  open: boolean;
  onClose: () => void;
  onSave: (navDisabled: string[]) => void;
}) {
  // Flatten all hrefs from TEAM_NAV
  const allItems = TEAM_NAV.flatMap(g => g.items.map(i => ({ ...i, group: g.label })));
  const [disabled, setDisabled] = useState<Set<string>>(new Set(user.navDisabled ?? []));

  // Reset when opening for a different user
  useEffect(() => {
    setDisabled(new Set(user.navDisabled ?? []));
  }, [user.id, open]);

  const toggle = (href: string) => {
    setDisabled(prev => {
      const next = new Set(prev);
      next.has(href) ? next.delete(href) : next.add(href);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Access Permissions — {user.name || user.email}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500 -mt-2">Uncheck items to hide them from this user's sidebar.</p>
        <div className="space-y-4 max-h-96 overflow-y-auto py-2">
          {TEAM_NAV.map(group => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{group.label}</p>
              <div className="space-y-1">
                {group.items.map(item => (
                  <label key={item.href} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                    <input
                      type="checkbox"
                      checked={!disabled.has(item.href)}
                      onChange={() => toggle(item.href)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">{item.label}</span>
                    <span className="text-xs text-gray-400 ml-auto font-mono">{item.href}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button style={{ backgroundColor: '#C9A96E', color: '#141414' }} onClick={() => onSave(Array.from(disabled))}>
            Save Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user, currentUserId, onRoleChange, onToggleActive, onPermissionsChange,
}: {
  user: FirestoreUser;
  currentUserId: string;
  onRoleChange: (uid: string, role: string) => void;
  onToggleActive: (uid: string, active: boolean, status: string) => void;
  onPermissionsChange: (uid: string, navDisabled: string[]) => void;
}) {
  const isSelf = user.id === currentUserId;
  const [permOpen, setPermOpen] = useState(false);
  const isTeamRole = ['admin', 'gc', 'project_manager'].includes(user.role);

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex flex-wrap sm:flex-nowrap items-center gap-4">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
        style={{ backgroundColor: roleConfig(user.role).color }}>
        {user.name?.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2) || '??'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm text-gray-900">{user.name || '—'}</p>
          {isSelf && <span className="text-xs text-gray-400">(you)</span>}
        </div>
        <p className="text-xs text-gray-500 truncate">{user.email}</p>
        {user.company && <p className="text-xs text-gray-400">{user.company}</p>}
        {user.trade && (
          <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5">
            <Wrench className="h-3 w-3" />{user.trade}
            {user.tradeIsCustom && <span className="text-amber-500 italic">(custom)</span>}
          </p>
        )}
        {user.projectAddress && (
          <p className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" />{user.projectAddress}{user.projectCity ? `, ${user.projectCity}` : ''}
            {user.linkedClientId && <span className="text-green-600 font-medium ml-1">✓ linked</span>}
          </p>
        )}
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        <StatusBadge status={user.status} active={user.active} />
      </div>

      {/* Role selector */}
      <div className="flex-shrink-0 w-44">
        <Select
          value={user.role}
          onValueChange={v => onRoleChange(user.id, v)}
          disabled={isSelf}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.filter(r => r.value !== 'gc').map(r => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Activate / Deactivate */}
      {!isSelf && (
        <div className="flex-shrink-0">
          {user.active && user.status === 'active' ? (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 h-8 text-xs"
              onClick={() => onToggleActive(user.id, false, 'deactivated')}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 text-xs"
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={() => onToggleActive(user.id, true, 'active')}
            >
              Activate
            </Button>
          )}
        </div>
      )}

      {/* Employment agreement link (team roles only) */}
      {isTeamRole && (
        <div className="flex-shrink-0">
          <a
            href={`/contracts?employee=${encodeURIComponent(user.id)}`}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 border border-gray-200 rounded"
            title="Open this person's employment agreement"
          >
            <span>📄</span>
            Agreement
          </a>
        </div>
      )}

      {/* Permissions (team roles only, not self) */}
      {isTeamRole && !isSelf && (
        <div className="flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700"
            title="Edit nav permissions"
            onClick={() => setPermOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {permOpen && (
        <PermissionsDialog
          user={user}
          open={permOpen}
          onClose={() => setPermOpen(false)}
          onSave={(navDisabled) => {
            onPermissionsChange(user.id, navDisabled);
            setPermOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreUser)));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'pendingTrades'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setPendingTrades(snap.docs.map(d => ({ id: d.id, ...d.data() } as PendingTrade)).filter(t => t.status === 'pending'));
    });
  }, []);

  const approveTrade = async (trade: PendingTrade) => {
    // Add to the global trades collection
    await addDoc(collection(db, 'trades'), {
      name: trade.tradeName,
      active: true,
      createdAt: serverTimestamp(),
    });
    // Mark pending request as approved
    await updateDoc(doc(db, 'pendingTrades', trade.id), { status: 'approved' });
    // Update the sub's user record with the official trade
    await updateDoc(doc(db, 'users', trade.requestedByUid), { trade: trade.tradeName, tradeIsCustom: false });
    toast({ title: 'Trade approved', description: `"${trade.tradeName}" added to the system.` });
  };

  const rejectTrade = async (trade: PendingTrade) => {
    await updateDoc(doc(db, 'pendingTrades', trade.id), { status: 'rejected' });
    toast({ title: 'Trade request rejected' });
  };

  const handleRoleChange = async (uid: string, role: string) => {
    await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp() });
    toast({ title: 'Role updated' });
  };

  const handleToggleActive = async (uid: string, active: boolean, status: string) => {
    await updateDoc(doc(db, 'users', uid), { active, status, updatedAt: serverTimestamp() });
    toast({ title: active ? 'User activated' : 'User deactivated' });
  };

  const handlePermissionsChange = async (uid: string, navDisabled: string[]) => {
    await updateDoc(doc(db, 'users', uid), { navDisabled, updatedAt: serverTimestamp() });
    toast({ title: 'Permissions saved' });
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || [u.name, u.email, u.company]
      .filter(Boolean).some(v => v!.toLowerCase().includes(search.toLowerCase()));
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const pending = users.filter(u => u.status === 'pending_approval');

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="font-heading font-semibold text-brand-black" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
            Users
          </h1>
          <p className="text-sm text-gray-500">{users.length} accounts registered</p>
        </div>

        {/* Pending account activations */}
        {pending.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">{pending.length} account{pending.length > 1 ? 's' : ''} pending activation</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {pending.map(u => u.name || u.email).join(', ')} — activate them below to grant access.
              </p>
            </div>
          </div>
        )}

        {/* Pending trade requests */}
        {pendingTrades.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-blue-800">{pendingTrades.length} new trade{pendingTrades.length > 1 ? 's' : ''} requested</p>
            </div>
            {pendingTrades.map(trade => (
              <div key={trade.id} className="flex items-center justify-between gap-3 bg-white rounded-lg px-3 py-2.5 border border-blue-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">"{trade.tradeName}"</p>
                  <p className="text-xs text-gray-500">Requested by {trade.requestedBy} · {trade.requestedByEmail}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" className="h-7 text-xs" style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                    onClick={() => approveTrade(trade)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => rejectTrade(trade)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-gray-400" /></button>}
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Staff',         count: users.filter(u => u.role === 'admin' || u.role === 'gc').length, color: '#C9A96E' },
            { label: 'Home Owners',   count: users.filter(u => u.role === 'client').length,   color: '#3b82f6' },
            { label: 'Subs',          count: users.filter(u => u.role === 'sub').length,       color: '#f59e0b' },
            { label: 'Designers',     count: users.filter(u => u.role === 'designer').length,  color: '#8b5cf6' },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.count}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* User list */}
        {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>}
        <div className="space-y-2">
          {filtered.map(u => (
            <UserRow
              key={u.id}
              user={u}
              currentUserId={currentUser?.firebaseUid ?? ''}
              onRoleChange={handleRoleChange}
              onToggleActive={handleToggleActive}
              onPermissionsChange={handlePermissionsChange}
            />
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No users found</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
