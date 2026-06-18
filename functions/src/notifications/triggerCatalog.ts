// Notification trigger catalog + automation-flow model.
//
// Single source of truth for the customizable notification engine. The catalog
// is code-defined here (functions can't import from ../shared cleanly), and the
// UI reads it via GET /api/notifications/catalog so there's no duplicated
// definition to drift.
//
// An admin configures, per trigger × audience, a "flow": an ordered list of
// steps. Each step has a delay (0 = immediate), a set of channels, message
// templates, and an optional condition. Delayed steps are enqueued as
// notificationJobs and executed by the scheduled sweeper. This is the
// "full automation builder" model: multi-step, delayed, conditional.

// Audiences the operator can customize independently.
export type Audience = 'client' | 'sub' | 'designer' | 'pm' | 'team';

export const AUDIENCES: Audience[] = ['client', 'sub', 'designer', 'pm', 'team'];

// Map a stored user role → the audience bucket its flows live under.
export function roleToAudience(role: string | undefined | null): Audience {
  switch (String(role || '').toLowerCase()) {
    case 'client':
    case 'homeowner':
      return 'client';
    case 'sub':
    case 'subcontractor':
    case 'vendor':
      return 'sub';
    case 'designer':
      return 'designer';
    case 'projectmanager':
    case 'pm':
      return 'pm';
    default:
      // admin / gc / employee / anything internal
      return 'team';
  }
}

export type Channel = 'inApp' | 'email' | 'sms' | 'push';

// A condition gates whether a step runs. Evaluated against the event's variable
// payload at fire time, and re-evaluated against a freshly-read doc when the
// step is a delayed job (so "if the bid still hasn't been submitted, text them"
// works). `recheck` names a Firestore doc + field to re-read at execution.
export interface FlowCondition {
  type: 'always' | 'equals' | 'notEquals' | 'exists' | 'notExists';
  // Variable name to test (from the trigger's variable payload), e.g. 'city'.
  field?: string;
  value?: string;
  // Optional live re-read for delayed steps: re-pull this doc's field and test
  // against it instead of the snapshotted variable. collection is whitelisted
  // in the sweeper for safety.
  recheck?: { collection: string; docIdVar: string; field: string };
}

export interface FlowStep {
  id: string;
  // Minutes to wait after the trigger fires. 0 = send immediately.
  delayMinutes: number;
  channels: Record<Channel, boolean>;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  // In-app notification title/body (falls back to emailSubject/smsBody if empty).
  inAppTitle?: string;
  inAppBody?: string;
  condition?: FlowCondition;
  // When true, SMS ignores the recipient's per-kind opt-in pref (still honors
  // STOP/opt-out + consent). For high-signal transactional alerts.
  forceSms?: boolean;
}

export interface Flow {
  enabled: boolean;
  steps: FlowStep[];
}

export interface TriggerVariable {
  name: string;
  description: string;
}

export interface TriggerDef {
  key: string;
  label: string;
  description: string;
  // Audiences this trigger can target. The UI shows a flow editor per audience.
  audiences: Audience[];
  variables: TriggerVariable[];
  // Whether this is a transactional/critical trigger (default SMS forced on).
  critical?: boolean;
}

const LINK_VAR: TriggerVariable = { name: 'link', description: 'Deep link into the app for this item' };

// ── Phase 1 catalog: the triggers that fire today ──────────────────────────
export const TRIGGER_CATALOG: TriggerDef[] = [
  {
    key: 'lead_created',
    label: 'New lead',
    description: 'A new lead arrives from any source (web form, QR, manual entry).',
    audiences: ['team'],
    critical: true,
    variables: [
      { name: 'leadName', description: "The lead's name" },
      { name: 'source', description: 'Lead source (Website, Event, Referral…)' },
      { name: 'city', description: 'Lead city / area' },
      { name: 'phone', description: "Lead's phone number" },
      { name: 'email', description: "Lead's email" },
      LINK_VAR,
    ],
  },
  {
    key: 'bid_invitation',
    label: 'Bid invitation sent',
    description: 'A subcontractor is invited to bid on a trade.',
    audiences: ['sub'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'trade', description: 'Trade(s) invited to bid' },
      { name: 'dueDate', description: 'Bid due date' },
      { name: 'requesterName', description: 'Who sent the invite' },
      { name: 'magicLink', description: 'One-click link to view + submit the bid' },
      LINK_VAR,
    ],
  },
  {
    key: 'bid_awarded',
    label: 'Bid awarded',
    description: 'A subcontractor wins a bid.',
    audiences: ['sub'],
    critical: true,
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'trade', description: 'Awarded trade' },
      LINK_VAR,
    ],
  },
  {
    key: 'project_commenced',
    label: 'Project started',
    description: 'A project commences and awarded subs are activated.',
    audiences: ['sub'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'trade', description: "Sub's trade on the project" },
      LINK_VAR,
    ],
  },
  {
    key: 'template_applied',
    label: 'Template applied to a project',
    description: 'A job template was applied to a project — summary of tasks created.',
    audiences: ['team', 'pm'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'taskCount', description: 'Number of tasks created' },
      { name: 'tasksWithNotify', description: 'Tasks flagged for assign-time notifications' },
      LINK_VAR,
    ],
  },
  {
    key: 'schedule_published',
    label: 'Schedule published',
    description: 'A project schedule was published or updated; notify the homeowners.',
    audiences: ['client'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      LINK_VAR,
    ],
  },
  {
    key: 'bid_received',
    label: 'Bid received',
    description: 'A sub submitted a bid; notify the GC who requested it.',
    audiences: ['team', 'pm'],
    variables: [
      { name: 'subName', description: 'Subcontractor name' },
      { name: 'trade', description: 'Trade' },
      { name: 'total', description: 'Bid total' },
      { name: 'projectName', description: 'Project name' },
      LINK_VAR,
    ],
  },
  {
    key: 'bid_reminder',
    label: 'Bid reminder',
    description: 'A reminder to a sub who has not yet submitted their bid.',
    audiences: ['sub'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'trade', description: 'Trade' },
      { name: 'dueDate', description: 'Bid due date' },
      LINK_VAR,
    ],
  },
  {
    key: 'rfi_answered',
    label: 'RFI answered',
    description: 'An RFI was answered; notify the original author.',
    audiences: ['team', 'pm', 'sub', 'client', 'designer'],
    variables: [
      { name: 'rfiNumber', description: 'RFI display number (RFI-003)' },
      { name: 'subject', description: 'RFI subject' },
      { name: 'answererName', description: 'Who answered the RFI' },
      { name: 'projectName', description: 'Project name' },
      LINK_VAR,
    ],
  },
  {
    key: 'task_assigned',
    label: 'Task assigned',
    description: 'A task was assigned to a user.',
    audiences: ['sub', 'pm', 'client', 'designer', 'team'],
    variables: [
      { name: 'taskName', description: 'Task name' },
      { name: 'projectName', description: 'Project name' },
      { name: 'fromName', description: 'Assigner display name' },
      LINK_VAR,
    ],
  },
  {
    key: 'task_due',
    label: 'Task due',
    description: 'A task is due within 24 hours (daily 7am sweep).',
    audiences: ['sub', 'pm', 'client', 'designer', 'team'],
    variables: [
      { name: 'taskName', description: 'Task name' },
      { name: 'dueDate', description: 'Due date' },
      { name: 'projectName', description: 'Project name' },
      LINK_VAR,
    ],
  },

  // ── Phase 2: added by Dispatch 6 — wave-2 trigger kinds ──────────────────
  // Kinds, audiences, and default channel intents mirror
  // shared/notifications-catalog.ts. Keep the two in sync when adding kinds.
  {
    key: 'schedule_slip',
    label: 'Schedule slipped',
    description: 'A project schedule slipped (computeScheduleSlip tone goes red/amber).',
    audiences: ['team', 'pm'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'tone', description: 'Slip tone (red / amber / green)' },
      { name: 'days', description: 'Days of slip vs target completion' },
      LINK_VAR,
    ],
  },
  {
    key: 'change_order_created',
    label: 'Change order created',
    description: 'A change order was created and needs the client to approve / reject it.',
    audiences: ['client'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'title', description: 'Change-order title' },
      { name: 'amount', description: 'Dollar amount' },
      LINK_VAR,
    ],
  },
  {
    key: 'selection_due',
    label: 'Selection due',
    description: 'A homeowner selection is due (catalog item / finish pick / approval).',
    audiences: ['client'],
    critical: true,
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'selectionName', description: 'Selection name (Cabinets, Flooring…)' },
      { name: 'dueDate', description: 'Due date' },
      LINK_VAR,
    ],
  },
  {
    key: 'draw_requested',
    label: 'Draw requested',
    description: 'A construction draw was requested; the client / lender needs to release funds.',
    audiences: ['client'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'drawName', description: 'Draw name / milestone' },
      { name: 'amount', description: 'Draw amount' },
      LINK_VAR,
    ],
  },
  {
    key: 'invoice_received',
    label: 'Invoice received',
    description: 'A vendor invoice / bill was logged for a project.',
    audiences: ['team', 'pm'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'vendor', description: 'Vendor / supplier name' },
      { name: 'amount', description: 'Invoice amount' },
      LINK_VAR,
    ],
  },
  {
    key: 'photo_uploaded',
    label: 'Photo uploaded',
    description: 'A new project photo was uploaded and made visible to the client.',
    audiences: ['client'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'caption', description: 'Photo caption' },
      LINK_VAR,
    ],
  },
  {
    key: 'walkthrough_assigned',
    label: 'Walkthrough item assigned',
    description: 'A walkthrough capture (photo/video + note) was assigned to a sub on the project.',
    audiences: ['sub'],
    critical: true,
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'note', description: 'GC note attached to the capture' },
      { name: 'fromName', description: 'Who captured it' },
      LINK_VAR,
    ],
  },
  {
    key: 'compliance_doc_uploaded',
    label: 'Compliance doc uploaded',
    description: 'A sub uploaded a compliance document (W-9, COI, license).',
    audiences: ['team'],
    variables: [
      { name: 'subName', description: 'Subcontractor name' },
      { name: 'docKind', description: 'Document kind (W-9, COI, license, …)' },
      LINK_VAR,
    ],
  },
  {
    key: 'sub_invoice_submitted',
    label: 'Sub invoice submitted',
    description: 'A sub submitted an invoice via the portal; staff need to review + approve.',
    audiences: ['team', 'pm'],
    variables: [
      { name: 'subName', description: 'Subcontractor name' },
      { name: 'projectName', description: 'Project name' },
      { name: 'amount', description: 'Invoice amount' },
      LINK_VAR,
    ],
  },
  {
    key: 'estimate_sent',
    label: 'Estimate sent to client',
    description: 'GC/PM sent an estimate to the homeowner — open in the portal to review.',
    audiences: ['client'],
    variables: [
      { name: 'projectName', description: 'Project name' },
      { name: 'title', description: 'Estimate title' },
      { name: 'amount', description: 'Estimate total' },
      LINK_VAR,
    ],
  },
];

export function getTrigger(key: string): TriggerDef | undefined {
  return TRIGGER_CATALOG.find(t => t.key === key);
}

// ── Default flows ──────────────────────────────────────────────────────────
// Sensible starting config so the system works the moment it's seeded, mirroring
// today's hardcoded behavior. The admin edits these in the UI afterward.
function immediateStep(partial: Partial<FlowStep>): FlowStep {
  return {
    id: 'step1',
    delayMinutes: 0,
    channels: { inApp: true, email: true, sms: false, push: true },
    emailSubject: '',
    emailBody: '',
    smsBody: '',
    condition: { type: 'always' },
    ...partial,
  };
}

export function defaultFlow(triggerKey: string, audience: Audience): Flow {
  const t = getTrigger(triggerKey);
  const critical = !!t?.critical;
  switch (triggerKey) {
    case 'lead_created':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: true, push: true },
          forceSms: true,
          inAppTitle: 'New lead: {leadName}',
          inAppBody: 'Source: {source} · {city} · {phone}',
          emailSubject: 'New lead: {leadName}',
          emailBody: 'A new lead just came in.\n\nName: {leadName}\nSource: {source}\nCity: {city}\nPhone: {phone}\nEmail: {email}',
          smsBody: 'New lead: {leadName}. Source: {source} · {city} · {phone}',
        })],
      };
    case 'bid_invitation':
      return {
        enabled: true,
        steps: [immediateStep({
          // SMS on by default — mirrors today's behavior where invited vendors
          // with a phone get a text. Admin can turn it off in Settings → Triggers.
          channels: { inApp: true, email: true, sms: true, push: true },
          inAppTitle: 'New bid request: {trade}',
          inAppBody: '{projectName} — due {dueDate}',
          emailSubject: 'New bid request — {projectName}',
          emailBody: "You're invited to bid on {trade} for {projectName}.\n\nDue: {dueDate}\nFrom: {requesterName}\n\nView and submit: {magicLink}",
          smsBody: 'Skyeline Homes: New bid request — {projectName} ({trade}). Submit: {magicLink}',
        })],
      };
    case 'bid_awarded':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: true, push: true },
          forceSms: true,
          inAppTitle: 'Bid awarded: {trade}',
          inAppBody: 'Your bid for {projectName} was awarded.',
          emailSubject: 'Bid awarded: {trade}',
          emailBody: 'Congratulations — your bid for {trade} on {projectName} was awarded. Skyeline will follow up with next steps.',
          smsBody: 'Skyeline Homes: Bid awarded — {trade} for {projectName}. We will follow up with next steps.',
        })],
      };
    case 'project_commenced':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: "You're on the team: {trade}",
          inAppBody: '{projectName} is starting.',
          emailSubject: "You're on the team — {projectName}",
          emailBody: 'Your bid was accepted and {projectName} is starting. Your trade: {trade}.',
          smsBody: 'Skyeline Homes: {projectName} is starting — you are on the team for {trade}.',
        })],
      };
    case 'template_applied':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: false, sms: false, push: true },
          inAppTitle: 'Template applied to {projectName}',
          inAppBody: '{taskCount} tasks created ({tasksWithNotify} flagged for assign-time notifications).',
          emailSubject: 'Template applied to {projectName}',
          emailBody: '{taskCount} tasks were created on {projectName}.',
          smsBody: 'Skyeline OS: template applied — {taskCount} tasks on {projectName}.',
        })],
      };
    case 'schedule_published':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Your project schedule was updated',
          inAppBody: 'The timeline for {projectName} has been updated. Open your portal to see what is next.',
          emailSubject: 'Your project schedule was updated — {projectName}',
          emailBody: 'The timeline for {projectName} has been updated. Open your portal to see what is next.',
          smsBody: 'Skyeline Homes: schedule updated on {projectName}.',
        })],
      };
    case 'bid_received':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'New bid: {trade} from {subName}',
          inAppBody: 'Total: ${total} for {projectName}.',
          emailSubject: 'Bid received — {trade} on {projectName}',
          emailBody: '{subName} submitted a bid of ${total} for {trade} on {projectName}.',
          smsBody: 'Skyeline OS: {subName} submitted a bid (${total}) for {trade} on {projectName}.',
        })],
      };
    case 'bid_reminder':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Bid reminder: {trade}',
          inAppBody: '{projectName} bid is due {dueDate}.',
          emailSubject: 'Reminder: bid due {dueDate} — {projectName}',
          emailBody: 'Reminder: please submit your bid for {trade} on {projectName}. Due {dueDate}.',
          smsBody: 'Skyeline Homes: bid reminder — {projectName} ({trade}) due {dueDate}.',
        })],
      };
    case 'rfi_answered':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: '{rfiNumber} answered',
          inAppBody: '{answererName} answered "{subject}".',
          emailSubject: '{rfiNumber} answered — {projectName}',
          emailBody: '{answererName} answered "{subject}" on {projectName}. Open the RFI to read the response.',
          smsBody: 'Skyeline OS: {rfiNumber} answered on {projectName}.',
        })],
      };
    case 'task_assigned':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Task assigned: {taskName}',
          inAppBody: '{fromName} assigned you {taskName} on {projectName}.',
          emailSubject: 'Task assigned: {taskName}',
          emailBody: '{fromName} assigned you {taskName} on {projectName}.',
          smsBody: 'Skyeline OS: {fromName} assigned you {taskName}.',
        })],
      };
    case 'task_due':
      return {
        enabled: audience !== 'client', // clients usually don't want task pings by default
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Due today: {taskName}',
          inAppBody: '{taskName} is due {dueDate}.',
          emailSubject: 'Due today: {taskName}',
          emailBody: '{taskName} is due {dueDate} on {projectName}.',
          smsBody: 'Skyeline Homes: {taskName} is due {dueDate}.',
        })],
      };
    case 'schedule_slip':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: false, sms: false, push: true },
          inAppTitle: 'Schedule slip: {projectName}',
          inAppBody: '{projectName} is now {days} day(s) behind target ({tone}).',
          emailSubject: 'Schedule slip: {projectName}',
          emailBody: '{projectName} is {days} day(s) behind target completion ({tone}).',
          smsBody: 'Skyeline OS: {projectName} schedule slipped {days}d ({tone}).',
        })],
      };
    case 'change_order_created':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Change order needs your approval',
          inAppBody: '{title} (${amount}) on {projectName}.',
          emailSubject: 'Change order ready for review — {projectName}',
          emailBody: 'A new change order is ready for your review on {projectName}.\n\n{title} — ${amount}\n\nOpen your portal to approve or decline.',
          smsBody: 'Skyeline Homes: change order ready for review on {projectName}. Open your portal.',
        })],
      };
    case 'selection_due':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Selection due: {selectionName}',
          inAppBody: '{selectionName} is due {dueDate} on {projectName}.',
          emailSubject: 'Selection due — {selectionName}',
          emailBody: 'Your {selectionName} selection is due {dueDate} on {projectName}. Open your portal to make your pick.',
          smsBody: 'Skyeline Homes: {selectionName} is due {dueDate} on {projectName}.',
        })],
      };
    case 'draw_requested':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Draw requested: {drawName}',
          inAppBody: '${amount} requested on {projectName}.',
          emailSubject: 'Draw requested — {projectName}',
          emailBody: 'A draw has been requested on {projectName}.\n\n{drawName} — ${amount}\n\nOpen your portal to review and release funds.',
          smsBody: 'Skyeline Homes: draw requested on {projectName} — {drawName} (${amount}).',
        })],
      };
    case 'invoice_received':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: false, sms: false, push: true },
          inAppTitle: 'Bill received: {vendor}',
          inAppBody: '${amount} for {projectName}.',
          emailSubject: 'Bill received: {vendor}',
          emailBody: 'A new vendor bill was logged.\n\nVendor: {vendor}\nAmount: ${amount}\nProject: {projectName}',
          smsBody: 'Skyeline OS: bill received from {vendor} — ${amount} on {projectName}.',
        })],
      };
    case 'photo_uploaded':
      return {
        enabled: audience === 'client',
        steps: [immediateStep({
          channels: { inApp: true, email: false, sms: false, push: true },
          inAppTitle: 'New photo: {projectName}',
          inAppBody: '{caption}',
          emailSubject: 'New photo on {projectName}',
          emailBody: 'A new photo was added to {projectName}.\n\n{caption}',
          smsBody: 'Skyeline Homes: new photo on {projectName}.',
        })],
      };
    case 'walkthrough_assigned':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: false, sms: true, push: true },
          forceSms: true,
          inAppTitle: 'Walkthrough item assigned',
          inAppBody: '{fromName} sent you a walkthrough item: {note}',
          emailSubject: 'New walkthrough item — {projectName}',
          emailBody: '{fromName} captured a walkthrough item for you on {projectName}.\n\n{note}',
          smsBody: 'Skyeline Homes: {fromName} assigned you a walkthrough item on {projectName}.',
        })],
      };
    case 'compliance_doc_uploaded':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: false, sms: false, push: true },
          inAppTitle: 'Compliance doc: {subName}',
          inAppBody: '{subName} uploaded a {docKind}.',
          emailSubject: 'Compliance doc — {subName}',
          emailBody: '{subName} uploaded a {docKind}. Open Skyeline OS to review.',
          smsBody: 'Skyeline OS: {subName} uploaded a {docKind}.',
        })],
      };
    case 'sub_invoice_submitted':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: false, sms: false, push: true },
          inAppTitle: 'Sub invoice: {subName}',
          inAppBody: '${amount} on {projectName}.',
          emailSubject: 'Sub invoice — {subName} on {projectName}',
          emailBody: '{subName} submitted an invoice for ${amount} on {projectName}. Open Skyeline OS to review.',
          smsBody: 'Skyeline OS: {subName} submitted an invoice (${amount}) on {projectName}.',
        })],
      };
    case 'estimate_sent':
      return {
        enabled: true,
        steps: [immediateStep({
          channels: { inApp: true, email: true, sms: false, push: true },
          inAppTitle: 'Estimate ready: {title}',
          inAppBody: '{title} ({amount}) for {projectName} — open your portal to review.',
          emailSubject: 'Your estimate is ready — {projectName}',
          emailBody: 'Your estimate "{title}" ({amount}) for {projectName} is ready. Open your Skyeline portal to review, approve, or request changes.',
          smsBody: 'Skyeline Homes: estimate ready for {projectName} ({amount}). Open your portal.',
        })],
      };
    default:
      return {
        enabled: true,
        steps: [immediateStep({ forceSms: critical })],
      };
  }
}
