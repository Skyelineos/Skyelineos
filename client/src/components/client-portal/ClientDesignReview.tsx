// Client portal — "Design Review" tab.
//
// Embeds the room-by-room Designer Portal workspace (mood boards, selections,
// decisions, discussion, files) inside the client portal shell, in client
// review mode (view + comment + approve/reject/request-revision). This is the
// homeowner's entry point into the design loop the designer drives from
// /projects/:id/designer. Same data, same components — just the client lens.
import { DesignerWorkspace } from '@/components/designer/portal/DesignerWorkspace';
import type { DesignStatus } from '@/lib/designer/portalTypes';

interface Props {
  projectId: string;
  projectName: string;
  clientName?: string;
  designerName?: string;
  storedDesignStatus?: DesignStatus;
}

export default function ClientDesignReview({
  projectId,
  projectName,
  clientName,
  designerName,
  storedDesignStatus,
}: Props) {
  if (!projectId) {
    return (
      <div className="p-6 text-center text-gray-400">
        Select a project to view its design.
      </div>
    );
  }
  return (
    <div className="p-4 md:p-6">
      <DesignerWorkspace
        projectId={projectId}
        projectName={projectName}
        viewerRole="client"
        clientName={clientName}
        designerName={designerName}
        storedDesignStatus={storedDesignStatus}
      />
    </div>
  );
}
