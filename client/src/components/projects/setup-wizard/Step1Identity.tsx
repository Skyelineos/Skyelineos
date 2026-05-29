import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectSetupDraft } from '@/types/projectSetup';

/**
 * Step 1 — Project identity.
 *
 * The minimum a project needs before any role can do anything useful:
 *   - A name (so people can find it in lists)
 *   - A jobsite address (subs need this to bid)
 *   - Square footage (drives budgeting / per-sqft math)
 *   - Target completion (drives schedule + client expectation)
 *
 * All four fields are validated by the completeness scorer; address +
 * name are blockers, sqft + target are warnings.
 */

interface Props {
  draft: ProjectSetupDraft;
  onChange: (next: ProjectSetupDraft) => void;
}

export function Step1Identity({ draft, onChange }: Props) {
  const patch = (p: Partial<ProjectSetupDraft>) => onChange({ ...draft, ...p });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-semibold text-[#141414]">Project basics</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          The foundation everyone else builds on — what the project is, where it lives, and when it's expected.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="proj-name">
            Project name <span className="text-red-500 font-bold">*</span>
          </Label>
          <Input
            id="proj-name"
            value={draft.name}
            onChange={e => patch({ name: e.target.value })}
            placeholder="e.g. Gardanier residence"
            className="mt-1.5"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            How this project shows up in lists for you, the client, and your team.
          </p>
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="proj-address">
            Jobsite address <span className="text-red-500 font-bold">*</span>
          </Label>
          <Input
            id="proj-address"
            value={draft.address}
            onChange={e => patch({ address: e.target.value })}
            placeholder="e.g. 482 N 1500 W, Mapleton UT"
            className="mt-1.5"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Subs need this to bid intelligently — and clients use it to ground every status update.
          </p>
        </div>

        <div>
          <Label htmlFor="proj-sqft">Square footage</Label>
          <Input
            id="proj-sqft"
            type="number"
            min={0}
            step={50}
            value={draft.squareFootage || ''}
            onChange={e => patch({ squareFootage: parseInt(e.target.value, 10) || 0 })}
            placeholder="e.g. 4200"
            className="mt-1.5"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Drives sqft-based estimates + allowance math.
          </p>
        </div>

        <div>
          <Label htmlFor="proj-target">Target completion</Label>
          <Input
            id="proj-target"
            type="date"
            value={draft.targetCompletion || ''}
            onChange={e => patch({ targetCompletion: e.target.value })}
            className="mt-1.5"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Shows up in the client portal as the move-in date.
          </p>
        </div>
      </div>
    </div>
  );
}
