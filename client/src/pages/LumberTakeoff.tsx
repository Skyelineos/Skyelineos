import { useEffect, useState } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import {
  collection, doc, getDoc, getDocs, query, orderBy, addDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  Hammer, Plus, ChevronLeft, ChevronRight, FolderOpen, FileText, AlertTriangle,
} from 'lucide-react';
import { UTAH_DEFAULTS } from '@/lib/lumber/assemblies';
import type { LumberTakeoff } from '@/lib/lumber/types';
import LumberWizard from '@/components/lumber/LumberWizard';

const ALLOWED_ROLES = ['admin', 'gc', 'projectManager'];

interface ProjectRow {
  id: string;
  name: string;
  address?: string;
}

interface TakeoffRow {
  id: string;
  name: string;
  status: 'draft' | 'final';
  updatedAt?: string;
}

export default function LumberTakeoffPage() {
  // Two routes register this component:
  //   /tools/lumber                  → project picker
  //   /tools/lumber/:projectId       → takeoff picker + wizard
  //   /tools/lumber/:projectId/:takeoffId → wizard for that takeoff
  const [, paramsList]    = useRoute('/tools/lumber');
  const [, paramsProj]    = useRoute('/tools/lumber/:projectId');
  const [, paramsTakeoff] = useRoute('/tools/lumber/:projectId/:takeoffId');

  const projectId = paramsTakeoff?.projectId ?? paramsProj?.projectId;
  const takeoffId = paramsTakeoff?.takeoffId;
  const isList = !!paramsList && !projectId;

  const { user } = useAuth();
  const hasAccess = user && ALLOWED_ROLES.includes(user.role || '');

  if (!hasAccess) {
    return (
      <AppLayout>
        <div className="p-8 max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold mb-1">Access Restricted</h2>
              <p className="text-sm text-gray-600">
                The Lumber Takeoff Calculator is available to admins, GCs, and project managers.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (isList) return <ProjectPicker />;
  if (projectId && !takeoffId) return <TakeoffPicker projectId={projectId} />;
  if (projectId && takeoffId) return <TakeoffEditor projectId={projectId} takeoffId={takeoffId} />;

  return <ProjectPicker />;
}

// ─── Step 1: Pick a project ──────────────────────────────────────────────────

function ProjectPicker() {
  const [, setLocation] = useLocation();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')));
      setProjects(snap.docs.map(d => ({ id: d.id, name: d.data().name || 'Untitled', address: d.data().address })));
      setLoading(false);
    })();
  }, []);

  return (
    <AppLayout>
      <div className="min-h-screen" style={{ backgroundColor: '#F8F7F4' }}>
        <Crumbs items={[{ label: 'Tools', href: '/tools' }, { label: 'Lumber Takeoff Calculator' }]} />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}
            >
              <Hammer className="w-6 h-6" style={{ color: '#C9A96E' }} />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-semibold" style={{ color: '#141414' }}>
                Pick a project
              </h1>
              <p className="text-sm text-gray-600">Lumber takeoffs are saved per project.</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-gray-500">Loading projects…</div>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                <p className="text-sm text-gray-600">No projects yet.</p>
                <Link href="/projects">
                  <Button className="mt-4">Create a project</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setLocation(`/tools/lumber/${p.id}`)}
                  className="text-left bg-white border rounded-lg p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
                  style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#141414' }}>
                        {p.name}
                      </p>
                      {p.address && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{p.address}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Step 2: Pick (or create) a takeoff under that project ───────────────────

function TakeoffPicker({ projectId }: { projectId: string }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [takeoffs, setTakeoffs] = useState<TakeoffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      const [projSnap, listSnap] = await Promise.all([
        getDoc(doc(db, 'projects', projectId)),
        getDocs(query(collection(db, 'projects', projectId, 'lumberTakeoffs'), orderBy('updatedAt', 'desc'))),
      ]);
      if (projSnap.exists()) {
        setProject({ id: projSnap.id, name: projSnap.data().name || 'Project' });
      }
      setTakeoffs(listSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name || 'Untitled',
        status: d.data().status || 'draft',
        updatedAt: d.data().updatedAt,
      })));
      setLoading(false);
    })();
  }, [projectId]);

  const createNew = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const name = `Lumber Takeoff — ${new Date().toLocaleDateString()}`;
      const draft: Omit<LumberTakeoff, 'id'> = {
        projectId,
        name,
        floors: [{ id: 'main', label: 'Main Floor' }],
        calibrations: {},
        legend: { beams: {}, posts: {} },
        walls: [],
        headers: [],
        subfloors: [],
        defaults: { ...UTAH_DEFAULTS },
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user.id?.toString() || user.email || 'unknown',
        updatedBy: user.id?.toString() || user.email || 'unknown',
      };
      const ref = await addDoc(collection(db, 'projects', projectId, 'lumberTakeoffs'), {
        ...draft,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      setLocation(`/tools/lumber/${projectId}/${ref.id}`);
    } catch (e: any) {
      toast({ title: 'Could not create takeoff', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen" style={{ backgroundColor: '#F8F7F4' }}>
        <Crumbs items={[
          { label: 'Tools', href: '/tools' },
          { label: 'Lumber Takeoff', href: '/tools/lumber' },
          { label: project?.name ?? '…' },
        ]} />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-heading font-semibold" style={{ color: '#141414' }}>
                {project?.name ?? '…'}
              </h1>
              <p className="text-sm text-gray-600">Lumber takeoffs for this project.</p>
            </div>
            <Button
              onClick={createNew}
              disabled={creating}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              className="hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-1" /> {creating ? 'Creating…' : 'New takeoff'}
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-gray-500">Loading takeoffs…</div>
          ) : takeoffs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Hammer className="w-12 h-12 mx-auto mb-3" style={{ color: '#C9A96E' }} />
                <h3 className="text-lg font-semibold mb-1" style={{ color: '#141414' }}>
                  No takeoffs yet
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Click <strong>New takeoff</strong> to start your first lumber takeoff for this project.
                </p>
                <Button
                  onClick={createNew}
                  disabled={creating}
                  style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                >
                  <Plus className="w-4 h-4 mr-1" /> Start a takeoff
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {takeoffs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setLocation(`/tools/lumber/${projectId}/${t.id}`)}
                  className="w-full text-left bg-white border rounded-lg p-4 hover:shadow-md transition-all duration-150"
                  style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: '#141414' }}>
                          {t.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {t.updatedAt ? `Updated ${formatRelative(t.updatedAt)}` : 'Just created'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge
                        variant="outline"
                        style={
                          t.status === 'final'
                            ? { color: '#0F6F40', borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.08)' }
                            : { color: '#8B6F3F', borderColor: 'rgba(201,169,110,0.4)', backgroundColor: 'rgba(201,169,110,0.08)' }
                        }
                      >
                        {t.status === 'final' ? 'Final' : 'Draft'}
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Step 3: Edit a specific takeoff (the wizard) ────────────────────────────

function TakeoffEditor({ projectId, takeoffId }: { projectId: string; takeoffId: string }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [takeoff, setTakeoff] = useState<LumberTakeoff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [projSnap, takeoffSnap] = await Promise.all([
          getDoc(doc(db, 'projects', projectId)),
          getDoc(doc(db, 'projects', projectId, 'lumberTakeoffs', takeoffId)),
        ]);
        if (projSnap.exists()) {
          setProject({ id: projSnap.id, name: projSnap.data().name || 'Project' });
        }
        if (takeoffSnap.exists()) {
          const raw = { id: takeoffSnap.id, ...(takeoffSnap.data() as Omit<LumberTakeoff, 'id'>) } as LumberTakeoff;
          // Normalize older docs (pre-v1.5) so the wizard never crashes on missing fields.
          if (!raw.calibrations) raw.calibrations = {};
          if (!raw.floors) raw.floors = [{ id: 'main', label: 'Main Floor' }];
          if (!raw.legend) raw.legend = { beams: {}, posts: {} };
          if (!raw.walls) raw.walls = [];
          if (!raw.headers) raw.headers = [];
          if (!raw.subfloors) raw.subfloors = [];
          setTakeoff(raw);
        }
      } catch (e: any) {
        toast({ title: 'Could not load takeoff', description: e.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, takeoffId, toast]);

  const handleSave = async (next: LumberTakeoff) => {
    if (!user) return;
    const payload = { ...next, updatedAt: new Date().toISOString(), updatedBy: user.id?.toString() || user.email || 'unknown' };
    // Firestore rejects undefined values — strip them recursively before writing.
    const clean = stripUndefined(payload) as LumberTakeoff;
    await setDoc(doc(db, 'projects', projectId, 'lumberTakeoffs', takeoffId), clean, { merge: true });
    setTakeoff(clean);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#C9A96E' }} />
        </div>
      </AppLayout>
    );
  }

  if (!takeoff) {
    return (
      <AppLayout>
        <div className="p-8">
          <p className="text-sm text-gray-600">Takeoff not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation(`/tools/lumber/${projectId}`)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Crumbs items={[
        { label: 'Tools', href: '/tools' },
        { label: 'Lumber Takeoff', href: '/tools/lumber' },
        { label: project?.name ?? '…', href: `/tools/lumber/${projectId}` },
        { label: takeoff.name },
      ]} />
      <LumberWizard
        takeoff={takeoff}
        onChange={handleSave}
        projectName={project?.name ?? ''}
      />
    </AppLayout>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <div className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-1 text-xs">
        {items.map((it, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            {it.href ? (
              <Link href={it.href} className="text-gray-500 hover:text-gray-900">{it.label}</Link>
            ) : (
              <span className="text-gray-900 font-medium">{it.label}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// Deep-strip undefined values. Firestore allows null but not undefined; we drop
// the key entirely so optional fields can be cleanly added/removed.
function stripUndefined(v: any): any {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      out[k] = stripUndefined(val);
    }
    return out;
  }
  return v;
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}
