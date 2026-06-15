// "Recommended For You" — the friendly front layer that bridges the Design Style
// Discovery quiz to the heavy selections engine. Each recommendation is a single
// rendering we put in front of the homeowner ("here's the look we'd pull for your
// kitchen counters"). They either Love it or say Not for me and redirect us with
// their own photo. Designers can add/override recommendations too.
//
// Stored at projects/{projectId}/selectionRecommendations/{recId}. Auto-generated
// docs use a deterministic id (`auto__{styleQuestionId}`) so re-running generation
// is idempotent and never clobbers a client's response. Designer-added docs use a
// random id.
//
// NOTE: this layer deliberately does NOT modify the Selection engine. "Loved"
// recommendations become real seeded selection options in a later slice.

export type RecommendationStatus =
  | 'pending'      // shown, awaiting client response
  | 'loved'        // client kept the recommendation
  | 'removed'      // client said "not for me" → owes us a photo (task created)
  | 'photo_added'; // client uploaded what they'd like instead

export type RecommendationSource = 'auto' | 'designer';

export interface SelectionRecommendation {
  id: string;
  projectId: string;
  // What this recommendation is for (mirrors the quiz "area" + option).
  category: string;                // e.g. 'Kitchen', 'Flooring', 'Exterior'
  room?: string | null;            // optional finer location
  title: string;                   // the recommended option, e.g. 'Quartz'
  description?: string | null;
  source: RecommendationSource;
  styleQuestionId?: string | null; // e.g. 'kitchen-counters' (auto only)
  styleOptionId?: string | null;   // e.g. 'quartz' (auto only)
  imageUrl?: string | null;        // hero rendering — empty until renderings exist
  linkedSelectionId?: string | null;

  status: RecommendationStatus;

  // Client redirect (Not for me → upload a photo of what they'd like instead).
  clientPhotoUrl?: string | null;
  clientPhotoPath?: string | null;
  clientNote?: string | null;
  clientRespondedAt?: any;

  // Task bridge — set by the recommendationTaskBridge Cloud Function.
  taskId?: string | null;

  sortOrder?: number;
  createdAt?: any;
  updatedAt?: any;
}
