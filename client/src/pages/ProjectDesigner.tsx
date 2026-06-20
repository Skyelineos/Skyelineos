// Designer Portal — project-scoped, room-by-room design collaboration.
// Route: /projects/:id/designer  (RoleGuard: admin · gc · projectManager · designer · client)
import { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  hasPortalAccess,
  normalizeRole,
  type DesignStatus,
} from '@/lib/designer/portalTypes';
import { DesignerWorkspace } from '@/components/designer/portal/DesignerWorkspace';
import { ErrorState, LoadingState } from '@/components/designer/portal/shared';

interface ProjectDoc {
  id: string;
  name?: string;
  clientName?: string;
  designerName?: string;
  designStatus?: DesignStatus;
}

export default function ProjectDesigner() {
  const [, params] = useRoute('/projects/:id/designer');
  const projectId = params?.id || '';
  const { user } = useAuth();
  const { toast } = useToast();

  const role = normalizeRole(user?.role);

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      doc(db, 'projects', projectId),
      (snap) => {
        if (!snap.exists()) {
          setProjectError('Project not found');
          setProjectLoading(false);
          return;
        }
        setProject({ id: snap.id, ...(snap.data() as any) });
        setProjectLoading(false);
      },
      (err) => {
        setProjectError(err?.message || 'Could not load project');
        setProjectLoading(false);
      }
    );
    return unsub;
  }, [projectId]);

  async function changeStatus(s: DesignStatus) {
    try {
      await updateDoc(doc(db, 'projects', projectId), { designStatus: s });
    } catch (e: any) {
      toast({
        title: 'Could not update status',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }

  if (!hasPortalAccess(role)) {
    return (
      <ProjectLayout projectId={projectId} projectName="Designer Portal">
        <div className="p-6">
          <ErrorState message="You don't have access to the Designer Portal for this project." />
        </div>
      </ProjectLayout>
    );
  }
  if (projectLoading) {
    return (
      <ProjectLayout projectId={projectId} projectName="Loading…">
        <div className="p-6">
          <LoadingState label="Loading project…" />
        </div>
      </ProjectLayout>
    );
  }
  if (projectError || !project) {
    return (
      <ProjectLayout projectId={projectId} projectName="Designer Portal">
        <div className="p-6">
          <ErrorState message={projectError || 'Project unavailable'} />
        </div>
      </ProjectLayout>
    );
  }

  const projectName = project.name || 'Project';

  return (
    <ProjectLayout projectId={projectId} projectName={projectName}>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <DesignerWorkspace
          projectId={projectId}
          projectName={projectName}
          viewerRole={role}
          clientName={project.clientName}
          designerName={project.designerName}
          storedDesignStatus={project.designStatus}
          onChangeStatus={changeStatus}
        />
      </div>
    </ProjectLayout>
  );
}
