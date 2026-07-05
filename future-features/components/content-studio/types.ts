// Content Studio data model — drafts → approval → publish → analytics.
// Firestore path: contentDrafts/{draftId}

export type ContentType = 'photo' | 'carousel' | 'reel' | 'story';
export type ContentStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'scheduled' | 'published' | 'failed';
export type ContentPhase = 'foundation' | 'framing' | 'mep' | 'drywall' | 'finishes' | 'exterior' | 'completed' | 'design' | 'other';
export type ContentPlatform = 'instagram' | 'facebook' | 'pinterest' | 'blog';

export interface ContentMedia {
  url: string;
  storagePath: string;
  type: 'photo' | 'video';
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  // AI-generated metadata
  aiTags?: string[];
  aiPhase?: ContentPhase;
  aiSubject?: string;     // e.g. "Kitchen", "Front exterior", "Foundation pour"
  aiConfidence?: 'high' | 'medium' | 'low';
}

export interface ContentDraft {
  id: string;
  type: ContentType;
  media: ContentMedia[];
  caption: string;
  hashtags: string[];
  category?: ContentPhase;
  projectId?: string;
  projectName?: string;
  // Lifecycle
  status: ContentStatus;
  scheduledFor?: any;        // Firestore Timestamp
  publishedAt?: any;
  publishedToPlatforms?: Partial<Record<ContentPlatform, {
    postId: string;
    url: string;
    publishedAt: any;
  }>>;
  // Insights (pulled after publish)
  insights?: {
    likes?: number;
    reach?: number;
    impressions?: number;
    comments?: number;
    saves?: number;
    shares?: number;
    profileVisits?: number;
    fetchedAt?: any;
  };
  // Approval
  createdBy: string;
  createdByName?: string;
  approvedBy?: string;
  approvedAt?: any;
  rejectedReason?: string;
  // AI metadata
  aiSuggestedCaption?: string;
  aiSuggestedHashtags?: string[];
  // Timestamps
  createdAt?: any;
  updatedAt?: any;
}

export interface CaptionTemplate {
  id: string;
  name: string;
  body: string;       // template with {placeholders}
  hashtags: string[];
  category?: ContentPhase;
  createdBy: string;
  createdAt?: any;
}
