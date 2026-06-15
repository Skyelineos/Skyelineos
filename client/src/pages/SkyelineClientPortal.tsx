import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { resolveClientIdentity } from '@/lib/clientIdentity';
import {
  logClientActivity,
  type ClientActivityType,
} from '@/lib/clientActivity';
import { BuildLocation } from '@/components/common/BuildLocation';
import {
  locationFromProject,
  logLocationEvent,
  type BuildLocation as BLType,
} from '@/lib/buildLocation';
import { useAuth } from '@/hooks/use-auth';
import { AdminPortalControls } from '@/components/admin/AdminPortalControls';
import { useAdminView } from '@/contexts/AdminViewContext';
import { useAutoAdminView } from '@/hooks/useAutoAdminView';
import { useToast } from '@/hooks/use-toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

import DocumentsTab from '@/components/documents/DocumentsTab';
import PhotosTab from '@/components/photos/PhotosTab';
import { ClientMessenger } from '@/components/communications/ClientMessenger';
import ClientDashboard from '@/components/client-portal/ClientDashboard';
import { ClientWelcomePreview } from '@/components/client-portal/ClientWelcomePreview';
import { ClientTabPreview } from '@/components/client-portal/ClientTabPreview';
import { SalesPitchSection } from '@/components/client-portal/SalesPitchSection';
import { InspirationBoard } from '@/components/client-portal/InspirationBoard';
import SelectionsBoard from '@/components/client-portal/SelectionsBoard';
import DesignStudio from '@/components/client-portal/DesignStudio';
import StyleDiscovery from '@/components/client-portal/StyleDiscovery';
import ClientSelectionsTimeline from '@/components/client/ClientSelectionsTimeline';
import ChangeOrdersTab from '@/components/client-portal/ChangeOrdersTab';
import ClientFinancials from '@/components/client-portal/ClientFinancials';
import ClientSiteLog from '@/components/site-log/ClientSiteLog';
import { ClientTodayFeed } from '@/components/today/ClientTodayFeed';
import { ScheduleTimeline } from '@/components/schedule/ScheduleTimeline';
import type { GeneratedSchedule } from '@/lib/schedule/types';

import {
  LayoutDashboard,
  Palette,
  DollarSign,
  FileText,
  MessageSquare,
  Image,
  ClipboardList,
  ChevronDown,
  ClipboardCheck,
  CalendarClock,
  Sparkles,
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
  estimatedSchedule?: GeneratedSchedule; // published estimated timeline
  estimatedSchedulePublishedAt?: any;
  buildLocation?: BLType | null;
}

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'schedule', label: 'Schedule', icon: CalendarClock },
  { key: 'financials', label: 'Financials', icon: DollarSign },
  { key: 'design', label: 'Design Studio', icon: Sparkles },
  { key: 'selections', label: 'Selections', icon: Palette },
  { key: 'change-orders', label: 'Change Orders', icon: ClipboardList },
  { key: 'site-log', label: 'Site Log', icon: ClipboardCheck },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'photos', label: 'Photos', icon: Image },
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

  // Resolve the full identifier union for this client. Real clients are keyed
  // on projects by their CONTACT-doc id (via contact.linkedUserId = auth.uid),
  // NOT their Firebase uid — so querying by uid alone returns nothing. This
  // mirrors ClientTodayFeed: resolve uid + email → contact ids, then match any.
  // `primaryClientId` is the single id passed to child tabs (the contact id, or
  // the impersonated id) so selections / change-orders / site-log scope right.
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [primaryClientId, setPrimaryClientId] = useState<string>('');
  const [identityResolved, setIdentityResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const authUser = auth.currentUser;
      const impersonatedContactId =
        isAdminView && viewedUser ? viewedUser.id : undefined;
      const id = await resolveClientIdentity({
        uid: authUser?.uid || '',
        email: authUser?.email || user?.email || '',
        legacyUserId: user?.id,
        impersonatedContactId,
      });
      if (cancelled) return;
      setIdentifiers(id.arrayContainsAny);
      setPrimaryClientId(
        impersonatedContactId || id.contactIds[0] || id.uid || ''
      );
      setIdentityResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, isAdminView, viewedUser?.id]);

  // Kept as `effectiveUid` so the rest of the component (location confirm +
  // child tab props) reads unchanged.
  const effectiveUid = primaryClientId;

  // Derive current tab from URL
  const urlParts = location.split('/');
  const currentTab = urlParts[2] || 'dashboard';

  // Redirect /client-portal → /client-portal/dashboard
  useEffect(() => {
    if (location === '/client-portal' || location === '/client-portal/') {
      navigate('/client-portal/dashboard', { replace: true });
    }
  }, [location, navigate]);

  // Log which sections the client opens (once per tab per session) so the GC's
  // Portal Activity panel reflects real engagement. Skip admin impersonation.
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || isAdminView || !selectedProjectId) return;
    const tab = TABS.find((t) => t.key === currentTab);
    const type: ClientActivityType =
      currentTab === 'selections'
        ? 'view_selections'
        : currentTab === 'financials'
          ? 'view_invoice'
          : 'view_tab';
    logClientActivity({
      uid,
      type,
      role: user?.role,
      contactId: primaryClientId || undefined,
      projectId: selectedProjectId,
      label: tab?.label || currentTab,
      once: `tab:${selectedProjectId}:${currentTab}`,
    });
  }, [currentTab, selectedProjectId, isAdminView, primaryClientId, user?.role]);

  // Load this client's projects. Projects store the client link in three
  // shapes across creation paths: canonical `clientIds[]`, legacy `clientId`,
  // and occasionally `assignedUserIds`. We query all three against the
  // identifier union and merge. Sorting is client-side to avoid composite
  // indexes (array-contains-any/in + orderBy would need one).
  useEffect(() => {
    if (!identityResolved) return;
    if (identifiers.length === 0) {
      setProjects([]);
      setProjectsLoading(false);
      return;
    }
    const ids = identifiers.slice(0, 10);

    let rArr: FirestoreProject[] = [];
    let rLeg: FirestoreProject[] = [];

    const merge = () => {
      const seen = new Set<string>();
      const combined: FirestoreProject[] = [];
      for (const p of [...rArr, ...rLeg]) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          combined.push(p);
        }
      }
      combined.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setProjects(combined);
      setSelectedProjectId((prev) => prev || combined[0]?.id || '');
      setProjectsLoading(false);
    };

    const map = (snap: any): FirestoreProject[] =>
      snap.docs.map(
        (d: any) => ({ id: d.id, ...d.data() }) as FirestoreProject
      );
    const onErr = () => setProjectsLoading(false);

    // Two shapes: canonical `clientIds[]` and legacy `clientId`. (assignedUserIds
    // holds team/designer/sub uids, never the homeowner, so it's not queried.)
    const u1 = onSnapshot(
      query(
        collection(db, 'projects'),
        where('clientIds', 'array-contains-any', ids)
      ),
      (snap) => {
        rArr = map(snap);
        merge();
      },
      onErr
    );
    const u2 = onSnapshot(
      query(collection(db, 'projects'), where('clientId', 'in', ids)),
      (snap) => {
        rLeg = map(snap);
        merge();
      },
      onErr
    );

    return () => {
      u1();
      u2();
    };
  }, [identifiers, identityResolved]);

  // Safety net: never leave the homeowner staring at an indefinite spinner. On a
  // cold Firestore connection or flaky network the snapshot listeners can take a
  // while to first fire; if loading hasn't resolved within a few seconds, drop
  // the spinner and render the portal anyway. The listeners stay attached, so
  // projects still fill in the moment they arrive.
  useEffect(() => {
    if (!projectsLoading) return;
    const t = setTimeout(() => setProjectsLoading(false), 6000);
    return () => clearTimeout(t);
  }, [projectsLoading]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const handleNavigate = (tab: string) => navigate(`/client-portal/${tab}`);

  // A project is "set up" once there's something real for the client to track:
  // a published schedule, started progress, or scheduled dates. Until then the
  // dashboard would be a wall of zeros, so we show the welcome/preview instead.
  const projectIsSetUp = !!(
    selectedProject &&
    (selectedProject.estimatedSchedule ||
      (typeof selectedProject.progress === 'number' &&
        selectedProject.progress > 0) ||
      selectedProject.startDate ||
      selectedProject.estimatedCompletion)
  );
  // The portal is "the client's" — so the welcome should greet the client, not
  // whoever is logged in. When an admin is impersonating, that's `viewedUser`;
  // for a real client it's their own `user`. The project's clientName is the
  // most authoritative when present.
  const clientFullName =
    (isAdminView && viewedUser?.name) ||
    selectedProject?.clientName ||
    user?.name ||
    '';
  const clientFirstName = clientFullName.trim().split(/\s+/)[0] || '';

  const confirmLocation = async () => {
    if (!selectedProjectId) return;
    try {
      await updateDoc(doc(db, 'projects', selectedProjectId), {
        'buildLocation.status': 'confirmed',
        'buildLocation.locationConfirmedByClient': true,
        'buildLocation.locationConfirmedAt': new Date().toISOString(),
        'buildLocation.locationConfirmedByUserId': effectiveUid,
      });
      await logLocationEvent(selectedProjectId, {
        type: 'client_confirmed',
        byUserId: effectiveUid,
      });
      toast({
        title: 'Location confirmed',
        description: 'Thanks — the team has your verified build location.',
      });
    } catch (e: any) {
      toast({
        title: 'Could not confirm',
        description: e?.message,
        variant: 'destructive',
      });
    }
  };

  const requestCorrection = async (notes: string) => {
    if (!selectedProjectId) return;
    try {
      await updateDoc(doc(db, 'projects', selectedProjectId), {
        'buildLocation.status': 'correction_requested',
        'buildLocation.correctionNotes': notes || '',
      });
      await logLocationEvent(selectedProjectId, {
        type: 'client_requested_correction',
        byUserId: effectiveUid,
        details: notes,
      });
      toast({
        title: 'Correction sent',
        description: "We let the team know — they'll update the location.",
      });
    } catch (e: any) {
      toast({
        title: 'Could not send correction',
        description: e?.message,
        variant: 'destructive',
      });
    }
  };

  const renderContent = () => {
    // No project yet (lead / pre-plans). Each tab gets tailored content so the
    // nav actually goes somewhere: a welcome on Dashboard, a working inspiration
    // board on Selections + Photos, and a "what to expect" preview elsewhere.
    if (!selectedProjectId) {
      const goInspiration = () => handleNavigate('selections');
      switch (currentTab) {
        case 'design':
          // Design Discovery works before a project exists — it's contact-scoped.
          // Lead with the blind style-preference flow, then the inspiration board.
          return (
            <div className="p-4 sm:p-6 space-y-8">
              <StyleDiscovery
                clientContactId={primaryClientId}
                clientName={clientFullName}
              />
              <div className="border-t border-gray-100 pt-6">
                <InspirationBoard
                  clientContactId={primaryClientId}
                  clientName={clientFullName}
                />
              </div>
            </div>
          );
        case 'selections':
        case 'photos':
          return (
            <InspirationBoard
              clientContactId={primaryClientId}
              clientName={clientFullName}
            />
          );
        case 'schedule':
        case 'financials':
        case 'change-orders':
        case 'site-log':
        case 'documents':
        case 'messages':
          return (
            <ClientTabPreview
              tab={currentTab as any}
              onStartInspiration={goInspiration}
            />
          );
        case 'dashboard':
        default:
          return (
            <div className="space-y-2 pb-6">
              <ClientWelcomePreview
                clientFirstName={clientFirstName}
                hasProject={false}
                onNavigate={handleNavigate}
              />
              {/* Soft sales pitch — interactive one-pagers that answer the
                  questions prospective clients have before a project exists. */}
              <SalesPitchSection onNavigate={handleNavigate} />
            </div>
          );
      }
    }

    switch (currentTab) {
      case 'dashboard': {
        // Build-location confirm card — relevant in every state, so it renders
        // for both the welcome preview and the full dashboard.
        const buildLocationCard = selectedProject?.buildLocation ? (
          <div className="rounded-xl border border-gray-200 bg-white p-5 mx-4 sm:mx-6">
            <h3 className="font-semibold text-gray-900 mb-1">
              Your build location
            </h3>
            <p className="text-sm text-gray-500 mb-3">
              Please confirm this is the correct build location.
            </p>
            <BuildLocation
              mode="confirm"
              value={locationFromProject(selectedProject)}
              onConfirm={confirmLocation}
              onRequestCorrection={requestCorrection}
            />
          </div>
        ) : null;

        // Project not set up yet → warm welcome + feature preview instead of a
        // dashboard full of zeros.
        if (!projectIsSetUp) {
          return (
            <div className="space-y-6 pb-6">
              <ClientWelcomePreview
                clientFirstName={clientFirstName}
                projectName={selectedProject?.name}
                projectAddress={selectedProject?.address}
                hasProject={true}
                onNavigate={handleNavigate}
              />
              {buildLocationCard}
              {/* Pre-construction clients still benefit from the soft pitch /
                  one-pagers while their project is being set up. */}
              <SalesPitchSection onNavigate={handleNavigate} />
            </div>
          );
        }

        return (
          <div className="space-y-6">
            <ClientTodayFeed />
            {buildLocationCard}
            <ClientDashboard
              projectId={selectedProjectId}
              project={selectedProject}
              onNavigate={handleNavigate}
            />
          </div>
        );
      }

      case 'schedule':
        return (
          <div className="p-6">
            {selectedProject?.estimatedSchedule ? (
              <div className="rounded-xl border border-gray-200 bg-white p-5 max-w-3xl">
                {(() => {
                  const at = (selectedProject as any)
                    .estimatedSchedulePublishedAt;
                  const ms = at?.toMillis?.() ?? (at ? Date.parse(at) : NaN);
                  return Number.isFinite(ms) ? (
                    <p className="text-xs text-gray-400 mb-3">
                      Updated{' '}
                      {new Date(ms).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  ) : null;
                })()}
                <ScheduleTimeline
                  schedule={selectedProject.estimatedSchedule}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-center">
                <div>
                  <CalendarClock className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">
                    Your schedule isn't ready yet
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your estimated build timeline will appear here once your
                    estimate is finalized.
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      case 'financials':
        return (
          <ClientFinancials
            projectId={selectedProjectId}
            userRole={user?.role}
          />
        );

      case 'design':
        return (
          <DesignStudio
            projectId={selectedProjectId}
            clientContactId={primaryClientId}
            clientName={clientFullName}
            onNavigate={handleNavigate}
          />
        );

      case 'selections':
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
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                All your selections (detailed view)
              </h3>
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
            projectBudget={
              selectedProject?.contractAmount ?? selectedProject?.budget ?? 0
            }
          />
        );

      case 'site-log':
        return (
          <div className="p-6">
            <ClientSiteLog
              projectId={selectedProjectId}
              clientId={effectiveUid}
            />
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
          <div className="p-3 sm:p-6">
            {selectedProjectId
              ? <ClientMessenger projectId={selectedProjectId} projectName={selectedProject?.name} />
              : <p className="text-sm text-gray-500">Select a project to see its messages.</p>}
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
            <div
              className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent mx-auto"
              style={{ borderColor: '#C9A96E', borderTopColor: 'transparent' }}
            />
            <p className="text-gray-600 font-medium">
              Loading your project portal…
            </p>
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
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedProject.address}
                  </p>
                )}
              </div>
              {projects.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 pr-8 appearance-none bg-white text-gray-700 focus:outline-none focus:ring-2"
                    style={
                      { '--tw-ring-color': '#C9A96E' } as React.CSSProperties
                    }
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>

            {/* Tab bar */}
            <nav className="-mb-px flex gap-0 overflow-x-auto">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = currentTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => handleNavigate(tab.key)}
                    className={`flex flex-shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
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

        {/* Content — wrapped in ErrorBoundary so a thrown error in one
            tab doesn't blank out the whole portal. The header + nav stay
            outside the boundary so the homeowner can navigate to another
            tab even if the current one breaks. */}
        <div className="max-w-7xl mx-auto">
          <ErrorBoundary>{renderContent()}</ErrorBoundary>
        </div>
      </div>
    </>
  );
}
