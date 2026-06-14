import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProjectChat } from '@/components/messaging/ProjectChat';

interface ProjLite { id: string; name: string }

export default function Messages() {
  const [projects, setProjects] = useState<ProjLite[]>([]);
  const [projectId, setProjectId] = useState<string>('');

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || (d.data() as any).clientName || 'Untitled project' }));
      setProjects(rows);
      setProjectId(prev => prev || rows[0]?.id || '');
    }, () => {});
  }, []);

  return (
    <AppLayout>
      <div className="h-full">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold font-heading text-brand-black">Messages</h1>
            <p className="text-brand-dark-gray-blue">Project communications — channels per project</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Project</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white min-w-[220px]"
            >
              {projects.length === 0 && <option value="">No projects</option>}
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        {projectId
          ? <ProjectChat projectId={projectId} />
          : <p className="text-sm text-gray-500">No projects yet.</p>}
      </div>
    </AppLayout>
  );
}
