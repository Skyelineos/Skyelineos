// Skyeline Homes Voice AI Receptionist — types
//
// The voice agent is structured like the SMS agent: a Twilio webhook entry
// point, a typed response shape from the AI ("ANSWER" / "TRANSFER" / etc.),
// and a Firestore-backed call log that gets enriched once Twilio finishes the
// recording + transcription.
//
// Schema lives next to the SMS schema so future migrations can copy this
// alongside the SMS tables.

export type CallDisposition =
  | 'ANSWERED_BY_AI'   // AI handled the whole call, no transfer
  | 'TRANSFERRED'      // AI handed off to Tyler mid-call
  | 'VOICEMAIL'        // Caller left a recording / message
  | 'MISSED'           // No useful audio captured (hangup / silence)
  | 'IN_PROGRESS';     // Call is still live; updated by callback handlers

// Sentiment buckets emitted by the post-call extractor. We keep this small
// and human-readable so the UI can color rows + decide whether to ping Tyler.
export type CallSentiment = 'positive' | 'neutral' | 'urgent' | 'negative';

// What the AI decided to do for a given speech turn. The TwiML generator
// branches on this and the route reads spokenResponse aloud or transfers.
export interface VoiceAIResponse {
  type: 'ANSWER' | 'TRANSFER' | 'TAKE_MESSAGE' | 'URGENT_TRANSFER';
  // What to say out loud. Short, natural — phone-appropriate.
  spokenResponse: string;
  // Why we're transferring. Surfaced to Tyler before connecting and stored
  // on the call log for the activity feed.
  transferReason?: string;
  // Free-form note the agent wants written into the project communication
  // thread. Used for TAKE_MESSAGE and ANSWER paths.
  logNote?: string;
}

export interface CallLog {
  id?: string;                     // Firestore doc id == Twilio CallSid
  callSid: string;
  from: string;                    // E.164
  to: string;                      // E.164 (the Skyeline Twilio number)
  contactId?: string | null;       // sms_contacts/{id} if matched
  contactName?: string | null;
  contactRole?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  disposition: CallDisposition;
  recordingUrl?: string | null;
  recordingDuration?: number | null;
  transcript?: string | null;
  aiSummary?: string | null;
  actionItems?: string[];          // Extracted by post-call processor
  sentiment?: CallSentiment | null;
  transferReason?: string | null;
  duration?: number | null;        // Seconds, set when call completes
  // Conversation turns the AI handled inline (before transfer / hangup).
  turns?: CallTurn[];
  // What name the caller gave us if they weren't in the roster.
  capturedName?: string | null;
  // True once the post-call extractor has run.
  postProcessed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CallTurn {
  speaker: 'caller' | 'assistant';
  text: string;
  // For 'assistant' turns: which response type drove the TwiML. Helps debug
  // why a call was transferred or held on the AI.
  responseType?: VoiceAIResponse['type'];
  at?: string;
}
