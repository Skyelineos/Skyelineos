// Communication Center — the unified hub. One place to see every conversation
// across leads, clients, and projects. Thin wrapper around CommunicationPanel
// (the same component the per-project / per-client surfaces use).
//
// Phase 1/2 search is a client-side filter over the most-recently-active threads
// and previews. A backend/full-text index is deferred (see
// docs/communication-center-schema.md "Search").

import { useMemo } from 'react';
import { useSearch } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { CommunicationPanel } from '@/components/communications/CommunicationPanel';

export default function CommunicationCenter() {
  const searchStr = useSearch();
  // Deep-link: /communications?thread=<id> (used by mention notifications).
  const initialThreadId = useMemo(() => new URLSearchParams(searchStr).get('thread') || undefined, [searchStr]);

  return (
    <AppLayout>
      <div className="h-full">
        <div className="mb-4">
          <h1 className="text-3xl font-bold font-heading text-brand-black">Communication Center</h1>
          <p className="text-brand-dark-gray-blue">Every conversation — lead to warranty — in one place.</p>
        </div>
        <CommunicationPanel initialThreadId={initialThreadId} />
      </div>
    </AppLayout>
  );
}
