import { useLocation, useRoute } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProjectSetupWizard } from '@/components/projects/setup-wizard/ProjectSetupWizard';

/**
 * Standalone page for the Project Setup Wizard.
 *
 * Routes:
 *   /projects/setup            → fresh start
 *   /projects/setup/:draftId   → resume an existing draft
 *
 * The wizard handles its own persistence and navigation; this page is
 * just the framing.
 */
export default function ProjectSetup() {
  const [, navigate] = useLocation();
  const [, params] = useRoute('/projects/setup/:draftId');
  const draftId = params?.draftId;

  return (
    <AppLayout>
      <ProjectSetupWizard
        draftId={draftId}
        onPublished={(projectId) => navigate(`/projects/${projectId}/overview`)}
        onCancel={() => navigate('/projects')}
      />
    </AppLayout>
  );
}
