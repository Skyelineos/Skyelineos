// Feedback system endpoint.
//
// POST /api/feedback
//   Accepts optional screenshot upload via multipart/form-data.
//   Saves a record to Firestore `feedback_queue`.
//   If a screenshot is provided, uploads it to Firebase Storage at
//   feedback/{docId}/{filename} and stores the signed URL.
//   Sends an immediate Telegram notification to Tyler.
//
// POST /api/feedback/guest  (no auth required)
//   Same as above but for subcontractors / guests who aren't signed in.
//   Caller provides { guestName, category, description } as JSON.
//
// Firestore schema (feedback_queue/{docId}):
//   category       'bug' | 'feature' | 'design'
//   description    string
//   screenshotUrl  string | null
//   screenshotPath string | null  (Storage path)
//   submittedBy    { name, role, userId }
//   status         'pending'
//   createdAt      Timestamp
//   reviewedAt     null

import type { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import multer from 'multer';

// ── Telegram helper ──────────────────────────────────────────────────────────

async function sendTelegramNotification(
  category: string,
  description: string,
  submitterName: string,
  submitterRole: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[feedback] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping Telegram notification');
    return;
  }

  const categoryLabel =
    category === 'bug'     ? '🐛 Bug'             :
    category === 'feature' ? '💡 Feature Idea'    :
    category === 'design'  ? '🎨 Design Feedback' :
    category;

  const text =
    `🔔 *New Feedback — ${categoryLabel}*\n` +
    `From: ${submitterName} (${submitterRole})\n\n` +
    `${description.slice(0, 3800)}`; // Telegram cap ~4096 chars

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[feedback] Telegram API error:', res.status, body);
    }
  } catch (err) {
    console.error('[feedback] Failed to send Telegram notification:', err);
  }
}

// ── Multer — memory storage so we can pipe bytes to Firebase Storage ─────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ── Route registration ────────────────────────────────────────────────────────

export function registerFeedbackRoutes(app: Express): void {
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  // ── POST /api/feedback (authenticated users) ─────────────────────────────
  app.post(
    '/api/feedback',
    upload.single('screenshot'),
    async (req: any, res: Response) => {
      try {
        const { category, description } = req.body as {
          category?: string;
          description?: string;
        };

        if (!description?.trim()) {
          return res.status(400).json({ error: 'Description is required' });
        }

        const validCategories = ['bug', 'feature', 'design'];
        const normalizedCategory = (category || 'bug').toLowerCase();
        if (!validCategories.includes(normalizedCategory)) {
          return res.status(400).json({ error: 'Invalid category' });
        }

        // req.user is populated by the authMiddleware gate in index.ts
        const user = req.userProfile || req.user;
        const submittedBy = {
          name: user?.name || user?.email || 'Unknown',
          role: user?.role || 'staff',
          userId: user?.id || user?.uid || null,
        };

        // Create Firestore doc first to get the ID
        const docRef = db.collection('feedback_queue').doc();
        const docId = docRef.id;

        // Handle optional screenshot upload
        let screenshotUrl: string | null = null;
        let screenshotPath: string | null = null;

        if (req.file) {
          const { buffer, mimetype, originalname } = req.file;
          const safeFilename = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
          screenshotPath = `feedback/${docId}/${safeFilename}`;

          try {
            await bucket.file(screenshotPath).save(buffer, {
              contentType: mimetype,
              resumable: false,
              metadata: { cacheControl: 'private, max-age=3600' },
            });

            // 7-day signed URL
            const [signedUrl] = await bucket.file(screenshotPath).getSignedUrl({
              action: 'read',
              expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
            });
            screenshotUrl = signedUrl;
          } catch (err) {
            console.error('[feedback] Storage upload failed:', err);
            // Non-fatal — save the doc without the screenshot
            screenshotPath = null;
          }
        }

        // Save to Firestore
        await docRef.set({
          category: normalizedCategory,
          description: description.trim(),
          screenshotUrl,
          screenshotPath,
          submittedBy,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedAt: null,
        });

        // Telegram notification (non-blocking, fire-and-forget)
        sendTelegramNotification(
          normalizedCategory,
          description.trim(),
          submittedBy.name,
          submittedBy.role,
        ).catch(() => { /* already logged inside */ });

        return res.json({ success: true, id: docId });
      } catch (err: any) {
        console.error('[feedback] POST /api/feedback error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // ── POST /api/feedback/guest (unauthenticated — registered BEFORE auth gate) ─
  // This is registered as a separate public route in index.ts before the
  // /api authMiddleware. The function is exported separately so index.ts can
  // call it in the public-routes section.
}

// Separate export for the public guest route so it can be registered before
// the /api auth middleware gate in index.ts.
export function registerGuestFeedbackRoute(app: Express): void {
  const db = admin.firestore();

  app.post('/api/feedback/guest', async (req: Request, res: Response) => {
    try {
      const { guestName, category, description } = req.body as {
        guestName?: string;
        category?: string;
        description?: string;
      };

      if (!guestName?.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }
      if (!description?.trim()) {
        return res.status(400).json({ error: 'Description is required' });
      }

      const validCategories = ['bug', 'feature', 'design'];
      const normalizedCategory = (category || 'bug').toLowerCase();
      if (!validCategories.includes(normalizedCategory)) {
        return res.status(400).json({ error: 'Invalid category' });
      }

      const submittedBy = {
        name: guestName.trim(),
        role: 'subcontractor',
        userId: null,
      };

      const docRef = db.collection('feedback_queue').doc();

      await docRef.set({
        category: normalizedCategory,
        description: description.trim(),
        screenshotUrl: null,
        screenshotPath: null,
        submittedBy,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedAt: null,
      });

      // Telegram notification (fire-and-forget)
      sendTelegramNotification(
        normalizedCategory,
        description.trim(),
        submittedBy.name,
        submittedBy.role,
      ).catch(() => { /* already logged inside */ });

      return res.json({ success: true, id: docRef.id });
    } catch (err: any) {
      console.error('[feedback] POST /api/feedback/guest error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
}
