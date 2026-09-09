// Telegram Callback Handler for AP Invoice Review
// ================================================
//
// Processes inline keyboard button presses from Telegram for invoice review.
// Called via POST /api/ap/telegram-callback (public endpoint — no Firebase auth).
//
// Supported callback_data patterns:
//   ap_approve:{docId}           → sets status to 'approved'
//   ap_reject:{docId}            → sets status to 'rejected'
//   ap_edit_job:{docId}          → sends job selection keyboard
//   ap_edit_trade:{docId}        → sends trade selection keyboard
//   ap_set_job:{docId}:{jobName} → sets jobName on the invoice
//   ap_set_trade:{docId}:{trade} → sets trade on the invoice

import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { KNOWN_PROJECTS, VALID_TRADES } from './invoiceEmailScanner';

// Bot token is bound to the api Express function via the secrets array in index.ts.
// Access it via process.env.
function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || '';
}

// ── Telegram API helpers ──────────────────────────────────────────────────────

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
    });
  } catch (e) {
    console.error('[apCallback] answerCallbackQuery error:', e);
  }
}

async function editMessage(
  botToken: string,
  chatId: string | number,
  messageId: number,
  text: string,
  inlineKeyboard?: any[][],
): Promise<void> {
  try {
    const body: any = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    };
    if (inlineKeyboard) {
      body.reply_markup = { inline_keyboard: inlineKeyboard };
    } else {
      body.reply_markup = { inline_keyboard: [] };
    }
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[apCallback] editMessage error:', e);
  }
}

async function sendMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  inlineKeyboard?: any[][],
): Promise<void> {
  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (inlineKeyboard) {
      body.reply_markup = { inline_keyboard: inlineKeyboard };
    }
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('[apCallback] sendMessage error:', e);
  }
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtAmount(amount: number | null): string {
  if (amount == null) return 'Unknown amount';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

// ── Build updated invoice summary text ────────────────────────────────────────
function buildSummaryText(data: any, statusLine: string): string {
  return (
    `📨 <b>AP Invoice — ${statusLine}</b>\n\n` +
    `<b>Vendor:</b> ${escHtml(data.vendor || 'Unknown')}\n` +
    `<b>Amount:</b> ${fmtAmount(data.amount)}\n` +
    `<b>Job:</b> ${escHtml(data.jobName || 'Unknown')}\n` +
    `<b>Trade:</b> ${escHtml(data.trade || 'Other')}\n` +
    `<b>Confidence:</b> ${data.confidence || 'low'}\n` +
    `<b>Subject:</b> ${escHtml(data.subject || '')}\n` +
    `<b>Invoice Date:</b> ${data.invoiceDate || 'N/A'}\n` +
    `<b>Due Date:</b> ${data.dueDate || 'N/A'}`
  );
}

// ── Main callback handler ─────────────────────────────────────────────────────
export async function handleTelegramCallback(req: Request, res: Response): Promise<void> {
  // Always respond 200 to Telegram immediately so it doesn't retry
  res.status(200).json({ ok: true });

  const update = req.body;
  const callbackQuery = update?.callback_query;
  if (!callbackQuery) return; // Not a callback update (could be a regular message)

  const callbackQueryId: string = callbackQuery.id;
  const chatId: number = callbackQuery.message?.chat?.id;
  const messageId: number = callbackQuery.message?.message_id;
  const data: string = callbackQuery.data || '';

  const botToken = getBotToken();
  if (!botToken) {
    console.error('[apCallback] TELEGRAM_BOT_TOKEN not set');
    return;
  }

  const db = admin.firestore();

  try {
    // ── Parse callback data ─────────────────────────────────────────────────
    if (data.startsWith('ap_approve:')) {
      const docId = data.slice('ap_approve:'.length);
      await answerCallbackQuery(botToken, callbackQueryId, '✅ Invoice approved');
      await db.collection('ap_invoices').doc(docId).update({
        status: 'approved',
        reviewedBy: 'telegram',
        reviewedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const snap = await db.collection('ap_invoices').doc(docId).get();
      const invoiceData = snap.data() || {};
      await editMessage(
        botToken,
        chatId,
        messageId,
        buildSummaryText(invoiceData, '✅ Approved'),
      );

    } else if (data.startsWith('ap_reject:')) {
      const docId = data.slice('ap_reject:'.length);
      await answerCallbackQuery(botToken, callbackQueryId, '❌ Invoice rejected');
      await db.collection('ap_invoices').doc(docId).update({
        status: 'rejected',
        reviewedBy: 'telegram',
        reviewedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const snap = await db.collection('ap_invoices').doc(docId).get();
      const invoiceData = snap.data() || {};
      await editMessage(
        botToken,
        chatId,
        messageId,
        buildSummaryText(invoiceData, '❌ Rejected'),
      );

    } else if (data.startsWith('ap_edit_job:')) {
      const docId = data.slice('ap_edit_job:'.length);
      await answerCallbackQuery(botToken, callbackQueryId, 'Select the correct job');
      // Build a keyboard with all known projects (2 per row)
      const rows: any[][] = [];
      for (let i = 0; i < KNOWN_PROJECTS.length; i += 2) {
        const row = [
          { text: KNOWN_PROJECTS[i], callback_data: `ap_set_job:${docId}:${KNOWN_PROJECTS[i]}` },
        ];
        if (KNOWN_PROJECTS[i + 1]) {
          row.push({
            text: KNOWN_PROJECTS[i + 1],
            callback_data: `ap_set_job:${docId}:${KNOWN_PROJECTS[i + 1]}`,
          });
        }
        rows.push(row);
      }
      rows.push([{ text: '❌ No Job Match', callback_data: `ap_set_job:${docId}:none` }]);
      await sendMessage(
        botToken,
        chatId,
        '🏗️ Select the correct job for this invoice:',
        rows,
      );

    } else if (data.startsWith('ap_edit_trade:')) {
      const docId = data.slice('ap_edit_trade:'.length);
      await answerCallbackQuery(botToken, callbackQueryId, 'Select the correct trade');
      // Build a keyboard with all valid trades (3 per row)
      const rows: any[][] = [];
      for (let i = 0; i < VALID_TRADES.length; i += 3) {
        const row: any[] = [];
        for (let j = 0; j < 3 && i + j < VALID_TRADES.length; j++) {
          row.push({
            text: VALID_TRADES[i + j],
            callback_data: `ap_set_trade:${docId}:${VALID_TRADES[i + j]}`,
          });
        }
        rows.push(row);
      }
      await sendMessage(
        botToken,
        chatId,
        '🔧 Select the correct trade for this invoice:',
        rows,
      );

    } else if (data.startsWith('ap_set_job:')) {
      const rest = data.slice('ap_set_job:'.length);
      const colonIdx = rest.indexOf(':');
      const docId = rest.slice(0, colonIdx);
      const jobName = rest.slice(colonIdx + 1);
      const resolvedJob = jobName === 'none' ? null : jobName;
      await answerCallbackQuery(botToken, callbackQueryId, `Job set to: ${resolvedJob || 'None'}`);
      await db.collection('ap_invoices').doc(docId).update({
        jobName: resolvedJob,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Update the original message if we have messageId in the doc
      const snap = await db.collection('ap_invoices').doc(docId).get();
      const invoiceData = snap.data() || {};
      if (invoiceData.telegramMessageId && invoiceData.status === 'pending_review') {
        await editMessage(
          botToken,
          chatId,
          invoiceData.telegramMessageId,
          buildSummaryText(invoiceData, '🟡 Pending Review (Job Updated)'),
          [
            [
              { text: '✅ Approve', callback_data: `ap_approve:${docId}` },
              { text: '❌ Reject', callback_data: `ap_reject:${docId}` },
            ],
            [
              { text: '✏️ Edit Job', callback_data: `ap_edit_job:${docId}` },
              { text: '🔧 Edit Trade', callback_data: `ap_edit_trade:${docId}` },
            ],
          ],
        );
      }

    } else if (data.startsWith('ap_set_trade:')) {
      const rest = data.slice('ap_set_trade:'.length);
      const colonIdx = rest.indexOf(':');
      const docId = rest.slice(0, colonIdx);
      const trade = rest.slice(colonIdx + 1);
      await answerCallbackQuery(botToken, callbackQueryId, `Trade set to: ${trade}`);
      await db.collection('ap_invoices').doc(docId).update({
        trade,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Update the original message
      const snap = await db.collection('ap_invoices').doc(docId).get();
      const invoiceData = snap.data() || {};
      if (invoiceData.telegramMessageId && invoiceData.status === 'pending_review') {
        await editMessage(
          botToken,
          chatId,
          invoiceData.telegramMessageId,
          buildSummaryText(invoiceData, '🟡 Pending Review (Trade Updated)'),
          [
            [
              { text: '✅ Approve', callback_data: `ap_approve:${docId}` },
              { text: '❌ Reject', callback_data: `ap_reject:${docId}` },
            ],
            [
              { text: '✏️ Edit Job', callback_data: `ap_edit_job:${docId}` },
              { text: '🔧 Edit Trade', callback_data: `ap_edit_trade:${docId}` },
            ],
          ],
        );
      }

    } else {
      // Unknown callback — just answer to prevent spinner
      await answerCallbackQuery(botToken, callbackQueryId);
    }
  } catch (e: any) {
    console.error('[apCallback] handler error:', e?.message || e);
    try {
      await answerCallbackQuery(botToken, callbackQueryId, '⚠️ An error occurred');
    } catch {}
  }
}
