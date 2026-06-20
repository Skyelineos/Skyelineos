// Project-scoped Communication Center. Same panel as the global hub, filtered to
// this project's conversations only. Mirrors ProjectRFIs.tsx.

import { useRoute } from 'wouter';
import { useState } from 'react';
import { ProjectLayout } from '@/components/layout/ProjectLayout';
import { CommunicationPanel } from '@/components/communications/CommunicationPanel';
import { CommDigest } from '@/components/communications/CommDigest';
import { useOptimizedProject } from '@/hooks/useOptimizedProjects';
import { ProjectDetailSkeleton } from '@/components/projects/ProjectSkeleton';

export default function ProjectCommunications() {
  const [, params] = useRoute('/projects/:id/communications');
  const projectId = params?.id;
  const { project, isLoading, error } = useOptimizedProject(projectId);
  const [tab, setTab] = useState<'conversations' | 'digest'>('conversations');

  if (!projectId) return null;
  if (isLoading) {
    return (
      <ProjectLayout projectId={projectId} projectName="Loading...">
        <div className="p-6"><ProjectDetailSkeleton /></div>
      </ProjectLayout>
    );
  }
  if (error || !project) {
    return (
      <ProjectLayout projectId={projectId} projectName="Project Not Found">
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Project Not Found</h2>
        </div>
      </ProjectLayout>
    );
  }
  return (
    <ProjectLayout projectId={projectId} projectName={project.name}>
      <div className="p-4 md:p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold font-heading text-brand-black">Communication</h1>
          <p className="text-sm text-brand-dark-gray-blue">Every conversation, call, and meeting for this project.</p>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {([['conversations', 'Conversations'], ['digest', 'Action Items & Decisions']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
                    className={`px-3 py-1.5 rounded-md ${tab === key ? 'bg-[#C9A96E] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'conversations'
          ? <CommunicationPanel subjectFilter={{ type: 'project', id: projectId }} subjectLabel={project.name} height="h-[640px]" />
          : <CommDigest subjectRef={{ type: 'project', id: projectId }} />}
      </div>
    </ProjectLayout>
  );
}
