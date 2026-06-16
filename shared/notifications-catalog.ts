// Single source of truth for every notification trigger kind, the audience
// each one targets, and the default channel-eligibility for that kind.
//
// Both `client/` and `functions/` import from here so the kind list cannot drift
// between the place a trigger fires (client) and the place it fans out (server
// /api/notifications/fire + Cloud Function dispatcher).
//
// The 5 phase-1 kinds (lead_created, bid_invitation, bid_awarded,
// project_commenced, task_due) live here AND in
// `functions/src/notifications/triggerCatalog.ts` because the server-side flow
// model has more shape (multi-step / delays / templates). This catalog is the
// thinner per-kind summary the UI uses to draw the user-prefs matrix.

// ── Audience kinds the resolver knows how to expand ────────────────────────
//
//   staff_on_project   admin + gc + the project's PM
//   client_of_project  the project's linked client users (homeowners)
//   sub_on_project     awarded subs on the project
//   single_uid         the caller pinned the target uid directly
//   project_team       all staff_on_project + all client_of_project + subs
//
// These are server-resolved — the client cannot just pass a list of uids.
export type AudienceKind =
  | 'staff_on_project'
  | 'client_of_project'
  | 'sub_on_project'
  | 'single_uid'
  | 'project_team';

// Channels the dispatcher knows about. SMS opt-out / consent still apply
// regardless of admin or per-user channel toggles.
export type ChannelKind = 'in_app' | 'email' | 'sms' | 'push';

// Default channel disposition. 'default' = channel ON unless user opts out.
// 'opt_in' = channel OFF unless user opts in.
export type ChannelDefault = 'default' | 'opt_in' | 'off';

export interface TriggerKindSpec {
  audience: AudienceKind;
  channels: Partial<Record<ChannelKind, ChannelDefault>>;
  /** Short category label used by the prefs UI grouping. */
  category: 'Project milestones' | 'Decisions you owe' | 'Money' | 'Other';
  /** Human label shown in the UI. */
  label: string;
}

export const TRIGGER_KINDS: Record<string, TriggerKindSpec> = {
  // ── Phase 1 — already in production ────────────────────────────────────
  lead_created: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'default', push: 'default' },
    category: 'Other',
    label: 'New lead arrived',
  },
  bid_invitation: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'default', push: 'default' },
    category: 'Other',
    label: 'Bid invitation sent',
  },
  bid_awarded: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'default', push: 'default' },
    category: 'Other',
    label: 'Bid awarded',
  },
  project_commenced: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Project milestones',
    label: 'Project started',
  },
  task_due: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Other',
    label: 'Task due',
  },
  task_assigned: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Other',
    label: 'Task assigned to you',
  },
  rfi_answered: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Decisions you owe',
    label: 'Your RFI was answered',
  },
  bid_received: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Other',
    label: 'New bid received',
  },
  bid_reminder: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Other',
    label: 'Bid reminder',
  },
  template_applied: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'opt_in', sms: 'opt_in', push: 'default' },
    category: 'Other',
    label: 'Template applied to a project',
  },
  schedule_published: {
    audience: 'client_of_project',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Project milestones',
    label: 'Your project schedule updated',
  },

  // ── Phase 2 — added by Dispatch 6 (per audit Section 7.2) ──────────────
  schedule_slip: {
    audience: 'staff_on_project',
    channels: { in_app: 'default', email: 'opt_in', sms: 'opt_in', push: 'default' },
    category: 'Project milestones',
    label: 'Schedule slipped',
  },
  change_order_created: {
    audience: 'client_of_project',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Decisions you owe',
    label: 'Change order needs your approval',
  },
  selection_due: {
    audience: 'client_of_project',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Decisions you owe',
    label: 'Selection due',
  },
  draw_requested: {
    audience: 'client_of_project',
    channels: { in_app: 'default', email: 'default', sms: 'opt_in', push: 'default' },
    category: 'Money',
    label: 'Draw requested',
  },
  invoice_received: {
    audience: 'staff_on_project',
    channels: { in_app: 'default', email: 'opt_in', sms: 'opt_in', push: 'default' },
    category: 'Money',
    label: 'Invoice received',
  },
  photo_uploaded: {
    audience: 'client_of_project',
    channels: { in_app: 'default', email: 'opt_in', sms: 'opt_in', push: 'default' },
    category: 'Other',
    label: 'New photo on your project',
  },
  walkthrough_assigned: {
    audience: 'single_uid',
    channels: { in_app: 'default', email: 'opt_in', sms: 'default', push: 'default' },
    category: 'Other',
    label: 'Walkthrough item assigned to you',
  },

  // ── Stubbed by Stream 4 — register so theirs work ──────────────────────
  compliance_doc_uploaded: {
    audience: 'staff_on_project',
    channels: { in_app: 'default', email: 'opt_in', sms: 'opt_in', push: 'default' },
    category: 'Other',
    label: 'Compliance doc uploaded',
  },
  sub_invoice_submitted: {
    audience: 'staff_on_project',
    channels: { in_app: 'default', email: 'opt_in', sms: 'opt_in', push: 'default' },
    category: 'Money',
    label: 'Sub submitted an invoice',
  },
} as const;

export type TriggerKind = keyof typeof TRIGGER_KINDS;

export const TRIGGER_KIND_LIST: TriggerKind[] =
  Object.keys(TRIGGER_KINDS) as TriggerKind[];

export const PREFS_CATEGORY_ORDER: TriggerKindSpec['category'][] = [
  'Project milestones',
  'Decisions you owe',
  'Money',
  'Other',
];

/** Pref-matrix shape persisted on the user document. */
export type UserNotificationPrefs = Partial<
  Record<TriggerKind, Partial<Record<ChannelKind, boolean>>>
>;

/** Resolve the effective per-channel boolean for a (kind, channel) pair given
 *  user prefs. `undefined` from prefs falls back to the catalog default. */
export function isChannelEnabledForUser(
  kind: TriggerKind,
  channel: ChannelKind,
  prefs: UserNotificationPrefs | undefined | null,
): boolean {
  const userOverride = prefs?.[kind]?.[channel];
  if (typeof userOverride === 'boolean') return userOverride;
  const spec = TRIGGER_KINDS[kind];
  const def = spec?.channels[channel];
  if (def === 'default') return true;
  if (def === 'opt_in') return false;
  if (def === 'off') return false;
  return false;
}
