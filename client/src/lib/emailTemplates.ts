import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Portal-invite email templates ────────────────────────────────────────────
// A single Firestore collection (`emailTemplates`) is the source of truth for
// every selectable invite template. The three built-ins below are seeded once
// (guarded by a marker doc so a deleted built-in stays deleted); GC/admins can
// upload their own per stage, and either kind can be deleted. The backend
// `/api/send-portal-invite` route reads the chosen doc, substitutes the
// placeholders, and sends via SendGrid — so the same render path serves
// built-in and uploaded templates alike.
//
// Placeholders substituted at send time:
//   {{firstName}}  → the client's first name (falls back to "there")
//   {{inviteLink}} → the one-time /sign-in?invite=<token> sign-up link
//   {{logoUrl}}    → the hosted Skyeline Homes logo

export type TemplateStage = 'lead' | 'estimate' | 'project';
export type TemplateSource = 'builtin' | 'upload';

export interface EmailTemplate {
  id: string;
  stage: TemplateStage;
  name: string;
  subject: string;
  html: string;
  source: TemplateSource;
}

export const LOGO_URL =
  'https://skyelineos.web.app/logos/logo-transparent-cropped.png';

export const STAGES: { value: TemplateStage; label: string; blurb: string }[] = [
  { value: 'lead', label: 'New Lead', blurb: 'Just entered the pipeline — first touch.' },
  { value: 'estimate', label: 'Estimate Ready', blurb: 'Has an estimate waiting to be reviewed.' },
  { value: 'project', label: 'Active Project', blurb: 'In an active build — track progress.' },
];

export function stageLabel(stage: TemplateStage): string {
  return STAGES.find(s => s.value === stage)?.label || stage;
}

// Shared, email-client-safe HTML shell. Table-based outer layout for Outlook,
// white card, centered logo, gold CTA. Body copy + CTA label vary per stage.
function buildHtml(opts: { heading: string; body: string; ctaLabel: string }): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #ececec;overflow:hidden;">
            <tr>
              <td align="center" style="padding:32px 32px 8px;">
                <img src="{{logoUrl}}" alt="Skyeline Homes" width="220" style="display:block;width:220px;max-width:70%;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:8px 36px 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                <h1 style="color:#141414;font-size:22px;line-height:1.3;margin:16px 0 12px;font-weight:700;">${opts.heading}</h1>
                <div style="color:#3a3a3a;font-size:15px;line-height:1.6;">${opts.body}</div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 36px 28px;">
                <a href="{{inviteLink}}" style="background:#C9A96E;color:#141414;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;display:inline-block;font-size:15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${opts.ctaLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                <p style="color:#8a8a8a;font-size:12px;line-height:1.6;margin:0;border-top:1px solid #eee;padding-top:16px;">
                  If the button doesn't work, copy and paste this link into your browser:<br />
                  <a href="{{inviteLink}}" style="color:#8a6a3a;word-break:break-all;">{{inviteLink}}</a><br /><br />
                  This invitation is valid for 30 days.<br />— The Skyeline Homes Team
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// The three built-in templates I ship today. Stable ids so the seed is idempotent.
export const BUILTIN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'builtin-lead',
    stage: 'lead',
    name: 'New Lead — Welcome',
    source: 'builtin',
    subject: 'Welcome to Skyeline Homes — your private project portal',
    html: buildHtml({
      heading: 'Welcome to Skyeline Homes',
      body:
        `<p style="margin:0 0 14px;">Hi {{firstName}},</p>` +
        `<p style="margin:0 0 14px;">Thank you for considering Skyeline Homes to build your custom home. We've set up a private portal just for you — one place to follow every step of the journey from first idea to move-in day.</p>` +
        `<p style="margin:0 0 14px;">Inside your portal you'll be able to message our team, review plans and selections, and watch your project come together in real time. There's nothing to install — just create your account and you're in.</p>`,
      ctaLabel: 'Create your portal account',
    }),
  },
  {
    id: 'builtin-estimate',
    stage: 'estimate',
    name: 'Estimate Ready — Review',
    source: 'builtin',
    subject: 'Your Skyeline Homes estimate is ready to review',
    html: buildHtml({
      heading: 'Your estimate is ready',
      body:
        `<p style="margin:0 0 14px;">Hi {{firstName}},</p>` +
        `<p style="margin:0 0 14px;">Great news — your detailed Skyeline Homes estimate is prepared and waiting for you in your portal. You can review every line item, see how the pricing breaks down, and explore your selections at your own pace.</p>` +
        `<p style="margin:0 0 14px;">Have a question or want to adjust something? Message us right from the portal and we'll take care of it. Set up your account below to take a look.</p>`,
      ctaLabel: 'Review your estimate',
    }),
  },
  {
    id: 'builtin-project',
    stage: 'project',
    name: 'Active Project — Track Progress',
    source: 'builtin',
    subject: 'Track your Skyeline Homes build in your portal',
    html: buildHtml({
      heading: 'Follow your build, every step',
      body:
        `<p style="margin:0 0 14px;">Hi {{firstName}},</p>` +
        `<p style="margin:0 0 14px;">Your home is underway, and your portal is the best seat in the house. Follow the schedule, see site photos as the work happens, track your selections, and keep every invoice and document in one organized place.</p>` +
        `<p style="margin:0 0 14px;">You can also message our team directly whenever a question comes up. Create your account below to start tracking your project.</p>`,
      ctaLabel: 'Open your project portal',
    }),
  },
];

const SEED_MARKER = { col: 'emailTemplates_meta', id: 'seed_v1' };

// Idempotently writes the built-in templates once. A marker doc guards re-seeding
// so that a built-in the user later deletes does not get resurrected.
export async function ensureSeedTemplates(): Promise<void> {
  const markerRef = doc(db, SEED_MARKER.col, SEED_MARKER.id);
  const marker = await getDoc(markerRef);
  if (marker.exists()) return;

  const batch = writeBatch(db);
  for (const t of BUILTIN_TEMPLATES) {
    batch.set(doc(db, 'emailTemplates', t.id), {
      stage: t.stage,
      name: t.name,
      subject: t.subject,
      html: t.html,
      source: t.source,
      createdAt: serverTimestamp(),
    });
  }
  batch.set(markerRef, { seededAt: serverTimestamp() });
  await batch.commit();
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  const snap = await getDocs(collection(db, 'emailTemplates'));
  const items: EmailTemplate[] = snap.docs.map(d => {
    const data = d.data() as any;
    return {
      id: d.id,
      stage: (data.stage || 'lead') as TemplateStage,
      name: data.name || '(untitled)',
      subject: data.subject || '',
      html: data.html || '',
      source: (data.source || 'upload') as TemplateSource,
    };
  });
  const order: Record<TemplateStage, number> = { lead: 0, estimate: 1, project: 2 };
  return items.sort(
    (a, b) => order[a.stage] - order[b.stage] || a.name.localeCompare(b.name),
  );
}

export async function createTemplate(input: {
  stage: TemplateStage;
  name: string;
  subject: string;
  html: string;
  createdBy?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'emailTemplates'), {
    stage: input.stage,
    name: input.name.trim(),
    subject: input.subject.trim(),
    html: input.html,
    source: 'upload',
    createdBy: input.createdBy || '',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, 'emailTemplates', id));
}

// Client-side preview substitution — mirrors the server's render so the
// management dialog can show a faithful preview.
export function renderPreview(
  html: string,
  vars: { firstName?: string; inviteLink?: string },
): string {
  return html
    .replace(/\{\{\s*firstName\s*\}\}/g, vars.firstName || 'there')
    .replace(/\{\{\s*inviteLink\s*\}\}/g, vars.inviteLink || '#')
    .replace(/\{\{\s*logoUrl\s*\}\}/g, LOGO_URL);
}
