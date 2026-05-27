import { useState } from 'react';
import { useRoute } from 'wouter';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { EstimateBuilderContent } from '@/pages/EstimateBuilder';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { SendBidPackageModal } from '@/components/bidding/SendBidPackageModal';

export default function ProjectEstimates() {
  const [, params] = useRoute('/projects/:id/estimates');
  const projectId = params?.id;
  const [bidPackageModalOpen, setBidPackageModalOpen] = useState(false);

  const { project: transformedProject, isLoading, error } = useOptimizedProject(projectId);

  if (isLoading) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Loading...">
        <div className="p-6"><ProjectDetailSkeleton /></div>
      </ProjectLayout>
    );
  }

  if (error || !transformedProject) {
    return (
      <ProjectLayout projectId={projectId!} projectName="Project Not Found">
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Project Not Found</h2>
          <p className="text-gray-600">The project you're looking for doesn't exist or may have been deleted.</p>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <ProjectLayout projectId={projectId!} projectName={transformedProject.name}>
      <div className="p-4 md:p-6 space-y-4">
        {/* Top-level "Send Bid Package" entry — discoverable launcher for the
            bid-package flow that used to be buried in an estimate-edit dialog
            tab. Opens SendBidPackageModal which now routes through
            /api/bid-requests/send (Phase 1D Slice 1 magic-link flow). */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Estimates &amp; Bidding</h1>
            <p className="text-sm text-muted-foreground">
              Build line-item estimates below, or send a multi-trade bid package to vendors.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => setBidPackageModalOpen(true)}
            data-testid="open-send-bid-package"
          >
            <Send className="h-4 w-4 mr-2" />
            Create new bid package
          </Button>
        </div>

        <EstimateBuilderContent
          projectId={projectId!}
          projectName={transformedProject.name}
          embedded
        />

        <SendBidPackageModal
          open={bidPackageModalOpen}
          projectId={projectId!}
          projectName={transformedProject.name}
          onClose={() => setBidPackageModalOpen(false)}
        />
      </div>
    </ProjectLayout>
  );
}