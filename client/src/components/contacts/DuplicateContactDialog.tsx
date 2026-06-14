import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, GitMerge, UserPlus, X } from 'lucide-react';
import { describeMatch, type DuplicateCandidate, type DuplicateMatch } from '@/lib/contacts/duplicateDetection';

// Shared duplicate-resolution modal for both the Lead and Add-Contact channels.
// When a new entry looks like an existing contact, the operator chooses to:
//   • Merge   — fill the existing record's blank fields from the new entry (no
//               new record created); resolves with { action: 'merge', match }.
//   • Create  — make a new record anyway, optionally noting what's different;
//               resolves with { action: 'create', differenceNote }.
//   • Cancel  — go back and edit; resolves with { action: 'cancel' }.

export type DuplicateResolution =
  | { action: 'merge'; match: DuplicateMatch }
  | { action: 'create'; differenceNote?: string }
  | { action: 'cancel' };

function ComparisonRow({ label, existing, incoming, matched }: {
  label: string;
  existing: string;
  incoming: string;
  matched: boolean;
}) {
  if (!existing && !incoming) return null;
  return (
    <div className="grid grid-cols-[80px_1fr_1fr] gap-2 text-sm py-1">
      <span className="text-gray-500">{label}</span>
      <span className={matched ? 'font-medium text-amber-700' : 'text-gray-700'}>
        {existing || <span className="text-gray-300">—</span>}
      </span>
      <span className={matched ? 'font-medium text-amber-700' : 'text-gray-700'}>
        {incoming || <span className="text-gray-300">—</span>}
      </span>
    </div>
  );
}

export function DuplicateContactDialog({
  open,
  candidate,
  matches,
  entityLabel = 'contact',
  onResolve,
}: {
  open: boolean;
  candidate: DuplicateCandidate;
  matches: DuplicateMatch[];
  /** "lead" or "contact" — used in the copy. */
  entityLabel?: string;
  onResolve: (resolution: DuplicateResolution) => void;
}) {
  const [differenceNote, setDifferenceNote] = useState('');
  const incomingName = candidate.name || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
  const hasStrong = matches.some(m => m.strength === 'strong');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onResolve({ action: 'cancel' }); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Possible duplicate {entityLabel}
          </DialogTitle>
          <DialogDescription>
            {matches.length === 1 ? 'An existing contact' : `${matches.length} existing contacts`} look like the {entityLabel} you’re
            adding{hasStrong ? ' (matching email or phone)' : ''}. Merge into one, create a new {entityLabel} anyway, or go back and edit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold truncate">{m.name}</span>
                  {m.role && <Badge variant="outline" className="capitalize">{m.role}</Badge>}
                  <Badge className={m.strength === 'strong' ? 'bg-red-100 text-red-700 hover:bg-red-100' : 'bg-amber-100 text-amber-700 hover:bg-amber-100'}>
                    {m.strength === 'strong' ? 'Likely match' : 'Possible match'}
                  </Badge>
                </div>
                <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => onResolve({ action: 'merge', match: m })}>
                  <GitMerge className="h-3.5 w-3.5" /> Merge
                </Button>
              </div>
              <p className="text-xs text-amber-700 mt-1">Matched on: {describeMatch(m.matchedOn)}</p>

              <Separator className="my-2" />
              <div className="grid grid-cols-[80px_1fr_1fr] gap-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <span></span><span>Existing</span><span>New</span>
              </div>
              <ComparisonRow label="Name" existing={m.name} incoming={incomingName} matched={m.matchedOn.includes('name')} />
              <ComparisonRow label="Email" existing={m.email} incoming={candidate.email || ''} matched={m.matchedOn.includes('email')} />
              <ComparisonRow label="Phone" existing={m.phone} incoming={candidate.phone || ''} matched={m.matchedOn.includes('phone')} />
              <ComparisonRow label="Address" existing={m.address} incoming={candidate.address || ''} matched={m.matchedOn.includes('address')} />
              <ComparisonRow label="Company" existing={m.company} incoming={candidate.company || ''} matched={false} />
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="difference-note" className="text-sm">
            Creating a new {entityLabel} anyway? Note what’s different (optional)
          </Label>
          <Textarea
            id="difference-note"
            placeholder="e.g. Different person, same household — spouse / second home / new project at same address"
            value={differenceNote}
            onChange={(e) => setDifferenceNote(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onResolve({ action: 'cancel' })} className="gap-1">
            <X className="h-4 w-4" /> Cancel &amp; edit
          </Button>
          <Button
            onClick={() => onResolve({ action: 'create', differenceNote: differenceNote.trim() || undefined })}
            className="gap-1"
          >
            <UserPlus className="h-4 w-4" /> Create new {entityLabel} anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
