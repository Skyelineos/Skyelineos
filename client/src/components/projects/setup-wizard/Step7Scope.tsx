import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import type { ProjectSetupDraft } from '@/types/projectSetup';

/**
 * Step 7 — Scope statement &amp; special considerations.
 *
 * The scope statement is the ONE field a subcontractor reads to
 * understand what they're bidding on without having to dig through plans.
 * It's required (block-level) because subs literally can't bid without
 * project context.
 *
 * Special considerations is a free-form catch-all for the things that
 * trip up a build but don't fit elsewhere ("no nails in red oak",
 * "owner doing landscaping", "do not touch the wisteria on the south side").
 */

interface Props {
  draft: ProjectSetupDraft;
  onChange: (next: ProjectSetupDraft) => void;
}

export function Step7Scope({ draft, onChange }: Props) {
  const patch = (p: Partial<ProjectSetupDraft>) => onChange({ ...draft, ...p });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-semibold text-[#141414]">Scope &amp; special considerations</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          The project in your own words. Subs read this before they look at plans — make it count.
        </p>
      </div>

      <div>
        <Label htmlFor="proj-scope">
          Scope statement <span className="text-red-500 font-bold">*</span>
        </Label>
        <Textarea
          id="proj-scope"
          rows={6}
          value={draft.scopeStatement || ''}
          onChange={e => patch({ scopeStatement: e.target.value })}
          placeholder="e.g. New 4,200 sqft single-family residence on a 1-acre lot. Walk-out basement, 4 bed / 3.5 bath, attached 3-car garage. Custom Tudor exterior with stone accent. Inside, modern transitional with white-oak floors throughout the main level. Detached workshop in year 2."
          className="mt-1.5 font-sans text-sm leading-relaxed"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          Aim for 3–6 sentences. Style, scale, floor count, lot context, anything unusual.
        </p>
      </div>

      <div>
        <Label htmlFor="proj-considerations" className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          Special considerations <span className="text-gray-400 text-xs font-normal">(optional)</span>
        </Label>
        <Textarea
          id="proj-considerations"
          rows={3}
          value={draft.specialConsiderations || ''}
          onChange={e => patch({ specialConsiderations: e.target.value })}
          placeholder="e.g. Owner doing their own landscaping. No nails in the reclaimed red oak — pre-drill and trim screw. Existing wisteria on south side must be preserved."
          className="mt-1.5 font-sans text-sm leading-relaxed"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          The "weird stuff" subs need to know about. Surfaced prominently in their bid invitation.
        </p>
      </div>
    </div>
  );
}
