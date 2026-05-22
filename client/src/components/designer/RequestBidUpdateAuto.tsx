import { usePreferredVendors } from '@/hooks/usePreferredVendors';
import RequestBidUpdate from './RequestBidUpdate';

interface Props {
  projectId: string;
  selectionId: string;
  selectionTitle: string;
  selectionCategory: string;
  selectionSpecs?: string;
  stage: 'rough' | 'final';
  projectName?: string;
  requesterName?: string;
}

/**
 * Convenience wrapper around RequestBidUpdate that fetches preferred vendors
 * for the given selection category, so callers don't have to wire up a query.
 */
export default function RequestBidUpdateAuto({
  projectId, selectionId, selectionTitle, selectionCategory,
  selectionSpecs = '', stage, projectName, requesterName,
}: Props) {
  const { data: vendors = [], isLoading } = usePreferredVendors(selectionCategory);
  if (isLoading) return null;
  return (
    <RequestBidUpdate
      projectId={projectId}
      selectionId={selectionId}
      selectionTitle={selectionTitle}
      selectionSpecs={selectionSpecs}
      stage={stage}
      preferredVendors={vendors}
      projectName={projectName}
      requesterName={requesterName}
    />
  );
}
