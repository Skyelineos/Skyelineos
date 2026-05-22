/**
 * Sends the daily Selection Reminder digest email.
 *
 * Provider: SendGrid (set SENDGRID_API_KEY in Functions config).
 * Switch to Resend / Postmark / SES by replacing the body of sendTransactionalEmail.
 */
import * as functions from 'firebase-functions';
import { sendTransactionalEmail } from './sendTransactionalEmail';

interface ReminderItem {
  item: string;
  room: string;
  phase: string;
  daysUntilDue: number;
  dueDate: string; // ISO
}

interface Args {
  toEmail: string;
  toName: string;
  role: 'client' | 'designer' | 'builder';
  projectName: string;
  projectId: string;
  items: ReminderItem[];
}

export async function sendSelectionReminderEmail(args: Args): Promise<void> {
  const { toEmail, toName, role, projectName, projectId, items } = args;

  const overdue = items.filter(i => i.daysUntilDue < 0);
  const dueSoon = items.filter(i => i.daysUntilDue >= 0);

  const subject =
    overdue.length > 0
      ? `${overdue.length} overdue selection${overdue.length === 1 ? '' : 's'} on ${projectName}`
      : `${items.length} upcoming selection${items.length === 1 ? '' : 's'} on ${projectName}`;

  const portal = role === 'client' ? 'client-portal' : role === 'designer' ? 'designer-portal' : 'builder';
  const link = `https://app.skyelineos.com/${portal}/selections?project=${projectId}`;

  const intro =
    role === 'client'
      ? "Here's where your design selections stand:"
      : role === 'designer'
      ? "Selections waiting on you across this project:"
      : "Selections coming up on your project:";

  const itemRow = (i: ReminderItem) => {
    const isOverdue = i.daysUntilDue < 0;
    const dueLabel = isOverdue
      ? `${Math.abs(i.daysUntilDue)}d overdue`
      : i.daysUntilDue === 0
      ? 'due today'
      : `due in ${i.daysUntilDue}d`;
    const tone = isOverdue ? '#B91C1C' : i.daysUntilDue <= 7 ? '#B45309' : '#525252';
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #EAEAEA;vertical-align:top;">
          <div style="font-size:14px;color:#171717;font-weight:500;">${escape(i.item)}</div>
          <div style="font-size:12px;color:#666;margin-top:2px;">${escape(i.room)} · ${escape(i.phase)}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #EAEAEA;vertical-align:top;text-align:right;font-size:12px;font-weight:600;color:${tone};white-space:nowrap;">
          ${dueLabel}
        </td>
      </tr>
    `;
  };

  const html = `
    <!doctype html>
    <html><body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
        <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #EAEAEA;">
          <div style="padding:20px 24px;background:#1F3864;color:#fff;">
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;opacity:.75;">Skyeline OS</div>
            <div style="font-size:20px;font-weight:600;margin-top:4px;">${escape(subject)}</div>
          </div>
          <div style="padding:20px 24px;">
            <p style="font-size:14px;color:#333;margin:0 0 16px 0;">Hi ${escape(toName)},</p>
            <p style="font-size:14px;color:#333;margin:0 0 16px 0;">${intro}</p>
            ${overdue.length > 0 ? `
              <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
                <div style="font-size:13px;font-weight:600;color:#991B1B;">${overdue.length} overdue</div>
                <div style="font-size:12px;color:#7F1D1D;margin-top:2px;">Your build phase may be waiting on these.</div>
              </div>
            ` : ''}
            <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:8px;">
              ${items.map(itemRow).join('')}
            </table>
            <div style="text-align:center;margin:24px 0 8px 0;">
              <a href="${link}" style="display:inline-block;background:#C9A96E;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
                Open Selections
              </a>
            </div>
            <p style="font-size:11px;color:#999;margin:16px 0 0 0;text-align:center;">
              You can adjust which selection emails you receive in your portal settings.
            </p>
          </div>
        </div>
      </div>
    </body></html>
  `;

  await sendTransactionalEmail({
    toEmail,
    toName,
    subject,
    html,
  });
  functions.logger.info('Sent selection reminder email', { toEmail, projectId, role, itemCount: items.length });
}

function escape(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
