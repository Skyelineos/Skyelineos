import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { PortalBidsPanel } from '@/components/bidding/PortalBidsPanel';
import { AddendaManager } from '@/components/bidding/AddendaManager';
import { SsotCurationPanel } from '@/components/bidding/SsotCurationPanel';
import { BidSetGatePanel } from '@/components/bidding/BidSetGatePanel';
import { BidCoveragePanel } from '@/components/bidding/BidCoveragePanel';
import { BidSolicitationPanel } from '@/components/BidSolicitation/BidSolicitationPanel';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { Hammer, Search } from 'lucide-react';

export default function ProjectBids() {
  const [, params] = useRoute('/projects/:id/bids');
  const projectId = params?.id;

  const { project: transformedProject, isLoading, error } = useOptimizedProject(projectId);

  if (isLoading) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Loading...">
        <div className="p-6">
          <ProjectDetailSkeleton />
        </div>
      </ProjectLayout>
    );
  }

  if (error || !transformedProject) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Project Not Found">
        <div className="p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-2">Project Not Found</h2>
            <p className="text-gray-600 mb-4">
              The project you're looking for doesn't exist or may have been deleted.
            </p>
          </div>
        </div>
      </ProjectLayout>
    );
  }

  const projectAny = transformedProject as unknown as Record<string, unknown>;
  const designerAssigned =
    !!projectAny.designerId ||
    !!projectAny.assignedDesignerId ||
    !!projectAny.designerName;

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
      <div className="p-6">
        <Tabs defaultValue="bid-packages" className="space-y-6">
          {/* ── Tab bar ────────────────────────────────────────────────── */}
          <TabsList className="h-auto bg-transparent border-b border-gray-200 rounded-none p-0 gap-0 w-full justify-start">
            <TabsTrigger
              value="bid-packages"
              className="
                relative rounded-none px-5 py-3 text-sm font-medium text-gray-500
                border-b-2 border-transparent
                data-[state=active]:text-[#C9A96E]
                data-[state=active]:border-[#C9A96E]
                data-[state=active]:bg-transparent
                data-[state=active]:shadow-none
                hover:text-gray-800
                transition-colors
              "
            >
              <Hammer className="w-4 h-4 mr-2 inline-block" />
              Bid Packages
            </TabsTrigger>
            <TabsTrigger
              value="find-contractors"
              className="
                relative rounded-none px-5 py-3 text-sm font-medium text-gray-500
                border-b-2 border-transparent
                data-[state=active]:text-[#C9A96E]
                data-[state=active]:border-[#C9A96E]
                data-[state=active]:bg-transparent
                data-[state=active]:shadow-none
                hover:text-gray-800
                transition-colors
              "
            >
              <Search className="w-4 h-4 mr-2 inline-block" />
              Find Contractors
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Trusted sub bid flow ────────────────────────────── */}
          <TabsContent value="bid-packages" className="space-y-6 mt-0">
            {/* Step 0 – Bid set must be approved before inviting subs */}
            <BidSetGatePanel projectId={projectId!} />

            {/* Step 1 – At-a-glance trade coverage */}
            <BidCoveragePanel projectId={projectId!} />

            {/* Step 2 – Create package → invite subs → compare → award */}
            <PortalBidsPanel projectId={projectId!} projectName={transformedProject.name} />

            {/* Step 3 – Curate project documents into the SSOT */}
            <SsotCurationPanel projectId={projectId!} />

            {/* Step 4 – Addenda management */}
            <AddendaManager
              projectId={projectId!}
              designerAssigned={designerAssigned}
            />
          </TabsContent>

          {/* ── Tab 2: Contractor discovery / solicitation ─────────────── */}
          <TabsContent value="find-contractors" className="mt-0">
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                <strong className="font-semibold">Find new subs for your network.</strong>{' '}
                Use this tool to discover and reach out to Utah County contractors you
                haven't worked with before. Once a contractor responds with a bid, you
                can add them to your Contacts to include them in future Bid Packages.
              </p>
            </div>
            <BidSolicitationPanel
              projectId={projectId!}
              projectName={transformedProject.name}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ProjectLayout>
  );
}
