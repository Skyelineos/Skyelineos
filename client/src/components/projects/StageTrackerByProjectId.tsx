import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ProjectStageTracker, deriveStageFromProject } from './ProjectStageTracker';

// Self-fetching wrapper so the tracker can be dropped into ProjectLayout
// and show on every project sub-page without each page wiring it up
// manually.
export function StageTrackerByProjectId({ projectId, compact }: { projectId: string; compact?: boolean }) {
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(doc(db, 'projects', projectId), snap => setProject(snap.exists() ? { id: snap.id, ...snap.data() } : null));
  }, [projectId]);

  if (!project) return null;
  return (
    <ProjectStageTracker
      projectId={projectId}
      stage={deriveStageFromProject(project)}
      compact={compact}
    />
  );
}
