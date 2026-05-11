import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { ProjectReviewModal } from './ProjectReviewModal';

interface Props {
  projectId: string;
  projectName?: string;
  projectStatus?: string;
  contactId?: string;
}

// Shows a friendly "rate your project" prompt to the client in their portal
// when the project is at status `completed` or `closeout` AND they haven't
// submitted a review yet. Hides once a review exists for this client+project.
export function ProjectReviewBanner({ projectId, projectName, projectStatus, contactId }: Props) {
  const { user } = useAuth();
  const [alreadyReviewed, setAlreadyReviewed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  const eligibleStatus = projectStatus === 'completed' || projectStatus === 'closeout' || projectStatus === 'punch_list';

  useEffect(() => {
    if (!eligibleStatus || !projectId || !user) {
      setAlreadyReviewed(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const uid = user.firebaseUid || user.id?.toString() || '';
        const snap = await getDocs(query(
          collection(db, 'projectReviews'),
          where('projectId', '==', projectId),
          where('clientUid', '==', uid),
        ));
        if (cancelled) return;
        setAlreadyReviewed(!snap.empty);
      } catch {
        // Permission issue or no record yet — treat as not reviewed; failure
        // to load shouldn't block the prompt from appearing.
        setAlreadyReviewed(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, eligibleStatus, user]);

  if (!eligibleStatus || alreadyReviewed === null || alreadyReviewed) return null;

  return (
    <>
      <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 mb-4 flex items-center gap-3">
        <Star className="w-5 h-5 text-amber-500 fill-current flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">How did we do?</p>
          <p className="text-xs text-amber-700/80">
            Your project is wrapping up — share a quick rating for the project and the Skyeline Homes team.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1.5 text-white"
          style={{ backgroundColor: '#C9A96E' }}
        >
          <Star className="w-3.5 h-3.5" />
          Leave Review
        </Button>
      </div>
      <ProjectReviewModal
        open={open}
        onClose={() => { setOpen(false); setAlreadyReviewed(true); }}
        projectId={projectId}
        projectName={projectName}
        contactId={contactId}
      />
    </>
  );
}
