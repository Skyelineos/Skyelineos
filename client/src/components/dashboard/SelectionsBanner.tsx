import React from 'react';
import { useLocation } from 'wouter';
import { AlertTriangle, X } from 'lucide-react';
import { useSelectionsSummary, PhaseDeadlines } from '@/hooks/useSelectionsSummary';

interface Props {
  projectId: string;
  phaseDeadlines?: PhaseDeadlines;
  /** Optional callback for the close button. Banner persists until either reload or this resets. */
  onDismiss?: () => void;
}

const DISMISS_KEY_PREFIX = 'sky_selections_banner_dismissed_';

/**
 * Persistent top-of-portal banner that warns when selections are overdue.
 *
 * Auto-hides when nothing is overdue. Client can dismiss for the session
 * (stored in sessionStorage so it returns on next login).
 */
export default function SelectionsBanner({ projectId, phaseDeadlines, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const s = useSelectionsSummary(projectId, phaseDeadlines);
  const [dismissed, setDismissed] = React.useState(false);

  // Restore dismissed state for this project + day
  React.useEffect(() => {
    const key = `${DISMISS_KEY_PREFIX}${projectId}_${new Date().toDateString()}`;
    if (typeof window !== 'undefined' && sessionStorage.getItem(key) === '1') {
      setDismissed(true);
    }
  }, [projectId]);

  if (s.loading || dismissed || s.overdue === 0) return null;

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    const key = `${DISMISS_KEY_PREFIX}${projectId}_${new Date().toDateString()}`;
    if (typeof window !== 'undefined') sessionStorage.setItem(key, '1');
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      role="alert"
      className="bg-red-50 border-b border-red-200 px-4 py-3 cursor-pointer hover:bg-red-100/70 transition-colors"
      onClick={() => navigate('/client-portal/selections')}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0" />
          <div className="text-sm min-w-0">
            <span className="font-semibold text-red-800">
              {s.overdue} selection{s.overdue === 1 ? '' : 's'} overdue
            </span>
            <span className="text-red-700 ml-2 hidden sm:inline">
              — your build phase may be waiting on these decisions.
            </span>
            <span className="text-red-700 ml-2 underline font-medium">
              Review now
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss banner for today"
          className="p-1 rounded-md hover:bg-red-200/70 text-red-700 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
