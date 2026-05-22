import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Star, MessageSquare, Save } from 'lucide-react';

interface SelectionOption {
  id: string;
  name: string;
  imageUrl?: string;
  vendor?: string;
  price?: number;
  notes?: string;
}

interface Props {
  projectId: string;
  selectionId: string;
  designerUid: string;
  designerName: string;
  options: SelectionOption[];
  /** Existing recommendation, if any */
  initialRecommendedOptionId?: string;
  initialRecommendationNote?: string;
  /** Whether the recommendation has been delivered to the client yet */
  initialPublished?: boolean;
}

/**
 * Designer-side: attach a recommendation to any selection.
 *
 * - Pick which of the curated options is the designer's #1 recommendation
 *   (visible to the client as a gold star + "Skyeline Design recommends" note)
 * - Add a short note explaining why
 * - Publish or save as draft
 *
 * Writes to:
 *   projects/{projectId}/selections/{selectionId}
 *     recommendedOptionId, recommendationNote, recommendationBy, recommendationAt, recommendationPublished
 */
export default function DesignerRecommendationPanel({
  projectId,
  selectionId,
  designerUid,
  designerName,
  options,
  initialRecommendedOptionId,
  initialRecommendationNote = '',
  initialPublished = false,
}: Props) {
  const [pickedOptionId, setPickedOptionId] = useState<string | undefined>(initialRecommendedOptionId);
  const [note, setNote] = useState(initialRecommendationNote);
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(initialPublished);
  const { toast } = useToast();

  const save = async (publish: boolean) => {
    if (!pickedOptionId) {
      toast({ title: 'Pick an option first', description: 'Choose which option is your recommendation.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, `projects/${projectId}/selections/${selectionId}`), {
        recommendedOptionId: pickedOptionId,
        recommendationNote: note.trim() || null,
        recommendationBy: designerUid,
        recommendationByName: designerName,
        recommendationAt: serverTimestamp(),
        recommendationPublished: publish,
        // If publishing, also flip client approval status so it shows up in their queue
        ...(publish ? { clientApprovalStatus: 'Checking w/ Client' } : {}),
        updatedAt: serverTimestamp(),
      });
      setPublished(publish);
      toast({
        title: publish ? 'Recommendation sent to client' : 'Saved as draft',
        description: publish
          ? "The client will see your pick the next time they open Selections."
          : 'Click Send to make this visible to the client.',
      });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#C9A96E]/40 bg-[#FBF7EE]/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-[#C9A96E] fill-[#C9A96E]" />
        <h4 className="text-sm font-semibold text-[#8a6a3a]">Your recommendation</h4>
        {published && (
          <span className="ml-auto text-[10px] uppercase tracking-wide font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            Live to client
          </span>
        )}
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-gray-500">Add options to this selection first, then come back to recommend one.</p>
      ) : (
        <>
          {/* Pick a single option */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setPickedOptionId(o.id)}
                className={`text-left rounded-lg border-2 p-2 transition-colors ${
                  pickedOptionId === o.id
                    ? 'border-[#C9A96E] bg-white'
                    : 'border-transparent bg-white/50 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {o.imageUrl ? (
                    <img src={o.imageUrl} alt={o.name} className="w-12 h-12 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-gray-100 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{o.name}</p>
                    {o.vendor && <p className="text-[11px] text-gray-500 truncate">{o.vendor}</p>}
                    {typeof o.price === 'number' && (
                      <p className="text-[11px] text-gray-700 font-medium mt-0.5">${o.price.toLocaleString()}</p>
                    )}
                  </div>
                  {pickedOptionId === o.id && (
                    <Star className="w-4 h-4 text-[#C9A96E] fill-[#C9A96E] flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Why this one?
              <span className="text-gray-400 font-normal">(optional — client will see this)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="e.g. The matte black faucet ties into the cabinet hardware you picked in the master bath."
              className="w-full text-sm rounded-md border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C9A96E] focus:border-transparent resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">{note.length}/400</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !pickedOptionId}
              onClick={() => save(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              disabled={saving || !pickedOptionId}
              onClick={() => save(true)}
              className="text-xs px-3 py-1.5 rounded-md bg-[#C9A96E] text-white hover:bg-[#b89858] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              <Save className="w-3 h-3" />
              {published ? 'Update for client' : 'Send to client'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
