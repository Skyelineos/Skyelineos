import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { ChevronLeft, AlertTriangle } from 'lucide-react';
import TakeoffStudio from '@/components/takeoff/TakeoffStudio';

const ALLOWED_ROLES = ['admin', 'gc', 'project_manager', 'designer'];

export default function ProjectTakeoff() {
  const [, params] = useRoute('/projects/:id/takeoff');
  const projectId = params?.id;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (snap.exists()) {
          setProject({ id: snap.id, ...snap.data() });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

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
                The Takeoff tool is available to GCs, project managers, designers, and admins.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="p-8">
          <p className="text-sm text-gray-600">Project not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation('/projects')}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to projects
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-screen">
        <div className="flex items-center gap-3 p-4 border-b bg-white">
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/projects/${projectId}`)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {project.name}
          </Button>
          <span className="text-sm text-gray-500">/ Takeoff</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <TakeoffStudio
            projectId={projectId!}
            projectName={project.name}
            onPushToEstimate={(items) => {
              toast({
                title: 'Pushed to estimate',
                description: `${items.length} item(s) added. Open Estimates to review.`,
              });
              // Future: route to EstimateBuilder with prefilled line items.
            }}
          />
        </div>
      </div>
    </AppLayout>
  );
}
