// DailyDigest — Tyler's morning view across ALL active projects.
//
// Renders a DailyWorkflowCard for each active project side-by-side. Designed
// to be the "first thing Tyler opens with coffee" page — scannable, dense, no
// filler. Defaults to a responsive grid; on mobile it stacks.

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/common/PageHeader';
import { DailyWorkflowCard } from '@/components/workflow/DailyWorkflowCard';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/authFetch';

interface DigestResponse {
  date: string;
  projectCount: number;
  projects: any[]; // shape matches DailyWorkflowCard.initialWorkflow
}

export default function DailyDigest() {
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/daily-digest');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDigest(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load digest');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-[1800px] mx-auto">
        <PageHeader
          title="Daily Digest"
          subtitle={today}
          actions={
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          }
        />

        {loading && !digest && (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading active projects…
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-600 py-4 border border-red-200 rounded bg-red-50 px-3">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {digest && digest.projects.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No active projects. Add a project or generate a task list to get started.
          </div>
        )}

        {digest && digest.projects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {digest.projects.map((p) => (
              <DailyWorkflowCard
                key={p.projectId}
                projectId={p.projectId}
                initialWorkflow={p}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
