import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { AdminPortalControls } from '@/components/admin/AdminPortalControls';
import { useAdminView } from '@/contexts/AdminViewContext';
import { useAutoAdminView } from '@/hooks/useAutoAdminView';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  Home,
  MapPin,
  AlertTriangle,
  Palette,
  BookOpen,
  LayoutDashboard,
  DoorOpen,
  Ruler,
} from 'lucide-react';
import SelectionsManager from '@/components/designer/SelectionsManager';
import SelectionsCatalog from '@/components/designer/SelectionsCatalog';
import { ProjectDesignDashboard } from '@/components/designer/ProjectDesignDashboard';
import { RoomManager } from '@/components/designer/RoomManager';
import { GlobalDesignDashboard } from '@/components/designer/GlobalDesignDashboard';
import TakeoffStudio from '@/components/takeoff/TakeoffStudio';

interface FirestoreProject {
  id: string;
  name: string;
  clientName?: string;
  address?: string;
  status?: string;
  clientId?: string;
  assignedUserIds?: string[];
}

interface ProjectWithStats extends FirestoreProject {
  overdueCount: number;
  completePct: number;
}

function useProjectsWithStats(
  projects: FirestoreProject[]
): ProjectWithStats[] {
  const [statsMap, setStatsMap] = useState<
    Record<string, { overdueCount: number; completePct: number }>
  >({});

  useEffect(() => {
    if (projects.length === 0) return;
    const unsubs: (() => void)[] = [];
    for (const proj of projects) {
      const unsub = onSnapshot(
        collection(db, 'projects', proj.id, 'selections'),
        snap => {
          const sels = snap.docs.map(d => d.data());
          const total = sels.length;
          const approved = sels.filter(s => s.clientApprovalStatus === 'Approved').length;
          const now = new Date();
          const overdue = sels.filter(s => {
            if (!s.dueDate || s.clientApprovalStatus === 'Approved') return false;
            const due = s.dueDate.toDate ? s.dueDate.toDate() : new Date(s.dueDate);
            return due < now;
          }).length;
          setStatsMap(prev => ({
            ...prev,
            [proj.id]: {
              overdueCount: overdue,
              completePct: total > 0 ? Math.round((approved / total) * 100) : 0,
            },
          }));
        }
      );
      unsubs.push(unsub);
    }
    return () => unsubs.forEach(u => u());
  }, [projects.map(p => p.id).join(',')]);

  return projects.map(p => ({
    ...p,
    overdueCount: statsMap[p.id]?.overdueCount ?? 0,
    completePct: statsMap[p.id]?.completePct ?? 0,
  }));
}

export default function DesignerPortal() {
  const { isAdminView, viewedUser } = useAdminView();
  useAutoAdminView();
  const { user } = useAuth();
  const { toast } = useToast();

  const [rawProjects, setRawProjects] = useState<FirestoreProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<FirestoreProject | null>(null);
  const [projectTab, setProjectTab] = useState<'dashboard' | 'rooms' | 'selections' | 'catalog' | 'plans'>('dashboard');
  const [filterRoomId, setFilterRoomId] = useState<string | undefined>(undefined);

  const userRole = user?.role || 'designer';
  const userId = user?.id?.toString() || '';
  const userName = user?.name || '';
  const isGcOrAdmin = userRole === 'gc' || userRole === 'admin';

  useEffect(() => {
    const q = isGcOrAdmin
      ? query(collection(db, 'projects'), orderBy('name', 'asc'))
      : query(
          collection(db, 'projects'),
          where('assignedUserIds', 'array-contains', userId),
          orderBy('name', 'asc')
        );

    const unsub = onSnapshot(
      q,
      snap => {
        setRawProjects(
          snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreProject))
        );
        setProjectsLoading(false);
      },
      err => {
        console.error('projects onSnapshot error', err);
        setProjectsLoading(false);
      }
    );
    return unsub;
  }, [isGcOrAdmin, userId]);

  const projects = useProjectsWithStats(rawProjects);

  const hasAccess =
    userRole === 'designer' ||
    userRole === 'admin' ||
    userRole === 'gc' ||
    userRole === 'project_manager';

  function selectProject(proj: FirestoreProject) {
    setSelectedProject(proj);
    setProjectTab('dashboard');
    setFilterRoomId(undefined);
  }

  function goBack() {
    setSelectedProject(null);
    setFilterRoomId(undefined);
  }

  if (!hasAccess) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 gap-2">
          <AlertTriangle className="w-6 h-6 text-yellow-500" />
          <p className="text-gray-600">Designer access required.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <>
      <AdminPortalControls />
      <AppLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            {selectedProject ? (
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5 text-gray-500">
                  <ArrowLeft className="w-4 h-4" />
                  All Projects
                </Button>
                <div className="h-5 w-px bg-gray-200" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{selectedProject.name}</h1>
                  {selectedProject.clientName && (
                    <p className="text-sm text-gray-500">{selectedProject.clientName}</p>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Designer Portal</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {isAdminView && viewedUser
                    ? `Viewing as ${viewedUser.name}`
                    : `Welcome, ${userName}`}
                </p>
              </div>
            )}
          </div>

          {/* Global Dashboard + Project Grid */}
          {!selectedProject && (
            <>
              {projectsLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#C9A96E' }} />
                </div>
              ) : projects.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
                  <Home className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No projects found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {isGcOrAdmin
                      ? 'Create a project to get started'
                      : 'You have not been assigned to any projects yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Cross-project summary dashboard */}
                  <GlobalDesignDashboard
                    projects={rawProjects}
                    userId={userId}
                    userName={userName}
                    onNavigateToProject={(projectId) => {
                      const proj = rawProjects.find(p => p.id === projectId);
                      if (proj) selectProject(proj);
                    }}
                  />

                  {/* Project grid below */}
                  <div>
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">All Projects</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {projects.map(proj => (
                        <button
                          key={proj.id}
                          onClick={() => selectProject(proj)}
                          className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow focus:outline-none focus:ring-2"
                          style={{ '--tw-ring-color': '#C9A96E' } as React.CSSProperties}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{proj.name}</p>
                              {proj.clientName && (
                                <p className="text-sm text-gray-500 mt-0.5">{proj.clientName}</p>
                              )}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: '#C9A96E22', color: '#8a6a3a' }}
                              >
                                {proj.completePct}%
                              </span>
                              {proj.overdueCount > 0 && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                                  {proj.overdueCount} overdue
                                </span>
                              )}
                            </div>
                          </div>
                          {proj.address && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{proj.address}</span>
                            </div>
                          )}
                          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${proj.completePct}%`, backgroundColor: '#C9A96E' }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Project Detail */}
          {selectedProject && (
            <Tabs value={projectTab} onValueChange={v => setProjectTab(v as typeof projectTab)}>
              <TabsList className="border-b border-gray-200 bg-transparent p-0 h-auto w-full justify-start rounded-none gap-0">
                {[
                  { value: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
                  { value: 'rooms', icon: DoorOpen, label: 'Rooms' },
                  { value: 'selections', icon: Palette, label: 'Selections' },
                  { value: 'catalog', icon: BookOpen, label: 'Catalog' },
                  { value: 'plans', icon: Ruler, label: 'Plans' },
                ].map(tab => (
                  <button
                    key={tab.value}
                    onClick={() => setProjectTab(tab.value as typeof projectTab)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      projectTab === tab.value
                        ? 'border-[#C9A96E] text-[#8a6a3a]'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </TabsList>

              <div className="mt-6">
                <TabsContent value="dashboard" className="m-0">
                  <ProjectDesignDashboard
                    projectId={selectedProject.id}
                    projectName={selectedProject.name}
                    userRole={userRole}
                    userId={userId}
                    userName={userName}
                    onNavigateToRooms={() => setProjectTab('rooms')}
                    onNavigateToSelections={(roomId) => {
                      setFilterRoomId(roomId);
                      setProjectTab('selections');
                    }}
                  />
                </TabsContent>

                <TabsContent value="rooms" className="m-0">
                  <RoomManager
                    projectId={selectedProject.id}
                    userRole={userRole}
                    onRoomSelect={(roomId) => {
                      setFilterRoomId(roomId);
                      setProjectTab('selections');
                    }}
                  />
                </TabsContent>

                <TabsContent value="selections" className="m-0">
                  <SelectionsManager
                    projectId={selectedProject.id}
                    designerId={userId}
                    userRole={userRole}
                  />
                </TabsContent>

                <TabsContent value="catalog" className="m-0">
                  <SelectionsCatalog allowManage={true} />
                </TabsContent>

                <TabsContent value="plans" className="m-0">
                  <div style={{ height: 'calc(100vh - 260px)', minHeight: 600 }}>
                    <TakeoffStudio
                      projectId={selectedProject.id}
                      projectName={selectedProject.name}
                    />
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </AppLayout>
    </>
  );
}
