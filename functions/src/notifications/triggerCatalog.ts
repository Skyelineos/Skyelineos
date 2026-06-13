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
          channels: { inApp: true, email: true, sms: false, push: true },
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
    default:
      return {
        enabled: true,
        steps: [immediateStep({ forceSms: critical })],
      };
  }
}
