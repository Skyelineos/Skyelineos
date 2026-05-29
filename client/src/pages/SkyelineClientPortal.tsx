import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { collection, query, where, onSnapshot, orderBy, or } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { AdminPortalControls } from '@/components/admin/AdminPortalControls';
import { useAdminView } from '@/contexts/AdminViewContext';
import { useAutoAdminView } from '@/hooks/useAutoAdminView';
import { useToast } from '@/hooks/use-toast';

import DocumentsTab from '@/components/documents/DocumentsTab';
import PhotosTab from '@/components/photos/PhotosTab';
import { MessagingModule } from '@/components/messaging/MessagingModule';
import ClientDashboard from '@/components/client-portal/ClientDashboard';
import SelectionsBoard from '@/components/client-portal/SelectionsBoard';
import ClientSelectionsTimeline from '@/components/client/ClientSelectionsTimeline';
import ChangeOrdersTab from '@/components/client-portal/ChangeOrdersTab';
import ClientFinancials from '@/components/client-portal/ClientFinancials';
import ClientSiteLog from '@/components/site-log/ClientSiteLog';
import { ClientTodayFeed } from '@/components/today/ClientTodayFeed';

import {
  LayoutDashboard, Palette, DollarSign, FileText, MessageSquare,
  Image, ClipboardList, ChevronDown, ClipboardCheck,
} from 'lucide-react';

interface FirestoreProject {
  id: string;
  name: string;
  clientName?: string;
  address?: string;
  status?: string;
  clientId?: string;
  assignedUserIds?: string[];
  budget?: number;
  contractAmount?: number;
  progress?: number;
  currentPhase?: string;
  startDate?: string;
  estimatedCompletion?: string;
  actualCompletion?: string;
}

const TABS = [
  { key: 'dashboard',     label: 'Dashboard',      icon: LayoutDashboard },
  { key: 'financials',    label: 'Financials',      icon: DollarSign },
  { key: 'selections',    label: 'Selections',      icon: Palette },
  { key: 'change-orders', label: 'Change Orders',   icon: ClipboardList },
  { key: 'site-log',      label: 'Site Log',        icon: ClipboardCheck },
  { key: 'documents',     label: 'Documents',       icon: FileText },
  { key: 'messages',      label: 'Messages',        icon: MessageSquare },
  { key: 'photos',        label: 'Photos',          icon: Image },
];

export default function SkyelineClientPortal() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  useAutoAdminView();
  const { isAdminView, viewedUser } = useAdminView();

  const [projects, setProjects] = useState<FirestoreProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Determine the effective user (admin impersonation vs real user)
  const effectiveUid = isAdminView && viewedUser
    ? viewedUser.id
    : user?.firebaseUid || '';

  // Derive current tab from URL
  const urlParts = location.split('/');
  const currentTab = urlParts[2] || 'dashboard';

  // Redirect /client-portal → /client-portal/dashboard
  useEffect(() => {
    if (location === '/client-portal' || location === '/client-portal/') {
      navigate('/client-portal/dashboard', { replace: true });
    }
  }, [location, navigate]);

  // Load projects from Firestore for this client
  useEffect(() => {
    if (!effectiveUid) { setProjectsLoading(false); return; }

    // Query for projects where clientId matches OR assignedUserIds contains the uid
    // Firestore doesn't support OR across different fields without a composite query,
    // so we run two queries and merge.
    const q1 = query(collection(db, 'projects'), where('clientId', '==', effectiveUid), orderBy('name', 'asc'));
    const q2 = query(collection(db, 'projects'), where('assignedUserIds', 'array-contains', effectiveUid), orderBy('name', 'asc'));

    const seen = new Set<string>();
    let results1: FirestoreProject[] = [];
    let results2: FirestoreProject[] = [];

    const merge = () => {
      const combined: FirestoreProject[] = [];
      const all = [...results1, ...results2];
      for (const p of all) {
        if (!seen.has(p.id)) { seen.add(p.id); combined.push(p); }
      }
      setProjects(combined);
      if (combined.length > 0 && !selectedProjectId) {
        setSelectedProjectId(combined[0].id);
      }
      setProjectsLoading(false);
    };

    const unsub1 = onSnapshot(q1, snap => {
      results1 = snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreProject));
      seen.clear();
      merge();
    }, () => { setProjectsLoading(false); });

    const unsub2 = onSnapshot(q2, snap => {
      results2 = snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreProject));
      seen.clear();
      merge();
    }, () => { setProjectsLoading(false); });

    return () => { unsub1(); unsub2(); };
  }, [effectiveUid]);

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const handleNavigate = (tab: string) => navigate(`/client-portal/${tab}`);

  const renderContent = () => {
    if (!selectedProjectId && !projectsLoading) {
      return (
        <div className="flex items-center justify-center h-64 p-8 text-center">
          <div>
            <p className="text-gray-500 font-medium">No projects found</p>
            <p className="text-sm text-gray-400 mt-1">You haven't been assigned to any projects yet</p>
          </div>
        </div>
      );
    }

    switch (currentTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <ClientTodayFeed />
            <ClientDashboard
              projectId={selectedProjectId}
              project={selectedProject}
              onNavigate={handleNavigate}
            />
          </div>
        );

      case 'financials':
        return (
          <ClientFinancials
            projectId={selectedProjectId}
            userRole={user?.role}
          />
        );

      case 'selections':
      case 'design':
        return (
          <div className="space-y-6 p-6">
            <ClientSelectionsTimeline
              projectId={selectedProjectId}
              clientUserId={effectiveUid}
            />
            <div className="border-t pt-6">
              {/* Detailed approval board — this is the homeowner's full
                  finish-selections surface (organized floor → room → item).
                  Label was previously "Designer's full selections board"
                  which read like an internal tool; the component itself
                  is client-facing (header "Finish Selections", Approve
                  buttons gated to the 'Checking w/ Client' state). */}
              <h3 className="text-sm font-semibold text-gray-700 mb-3">All your selections (detailed view)</h3>
              <SelectionsBoard
                projectId={selectedProjectId}
                clientId={effectiveUid}
              />
            </div>
          </div>
        );

      case 'change-orders':
        return (
          <ChangeOrdersTab
            projectId={selectedProjectId}
            clientId={effectiveUid}
            projectBudget={selectedProject?.contractAmount ?? selectedProject?.budget ?? 0}
          />
        );

      case 'site-log':
        return (
          <div className="p-6">
            <ClientSiteLog projectId={selectedProjectId} clientId={effectiveUid} />
          </div>
        );

      case 'documents':
        return (
          <div className="p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-4">Documents</h1>
            <DocumentsTab projectId={selectedProjectId} />
          </div>
        );

      case 'messages':
        return (
          <div className="p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-4">Messages</h1>
            <MessagingModule
              projectId={selectedProjectId as any}
              currentUser={{ id: effectiveUid, name: user?.name || '', email: user?.email || '', role: 'client' as const, avatar: '' }}
            />
          </div>
        );

      case 'photos':
        return (
          <div className="p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-4">Photos</h1>
            <PhotosTab projectId={selectedProjectId as any} />
          </div>
        );

      default:
        return (
          <ClientDashboard
            projectId={selectedProjectId}
            project={selectedProject}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  if (projectsLoading) {
    return (
      <>
        <AdminPortalControls />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto"
              style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }} />
            <p className="text-gray-600 font-medium">Loading your project portal…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPortalControls />
      <div className="min-h-screen bg-gray-50">

        {/* Portal header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">

            {/* Project selector + title */}
            <div className="flex items-center justify-between py-4 border-b border-gray-100">
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  {selectedProject?.name || 'My Project'}
                </h1>
                {selectedProject?.address && (
                  <p className="text-xs text-gray-500 mt-0.5">{selectedProject.address}</p>
                )}
              </div>
              {projects.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 pr-8 appearance-none bg-white text-gray-700 focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#C9A96E' } as React.CSSProperties}
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>

            {/* Tab bar */}
            <nav className="-mb-px flex gap-0 overflow-x-auto">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const active = currentTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleNavigate(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      active
                        ? 'border-[#C9A96E] text-[#8a6a3a]'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
