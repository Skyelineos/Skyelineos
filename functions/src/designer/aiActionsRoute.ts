import { Application } from 'express';
import admin from 'firebase-admin';

const ACTIONS: Record<string, {
  label: string;
  buildPrompt: (ctx: any, data: any) => string;
}> = {
  summarizeRoom: {
    label: 'Summarize Room',
    buildPrompt: (ctx, data) => `You are an assistant for Skyeline Homes, a custom home builder. Summarize the current design status of the "${ctx.roomName || 'room'}" room in plain, friendly language for an internal team member.

Room data:
- Selections: ${JSON.stringify(data.selections || [])}
- Decisions: ${JSON.stringify(data.decisions || [])}
- Mood board items: ${data.moodBoardCount || 0}
- Open items: ${data.openItems || 0}

Write 2-4 sentences covering: what's been selected/decided, what's still open, and any notable items. Be concise.`,
  },
  summarizeMoodBoard: {
    label: 'Summarize Mood Board',
    buildPrompt: (ctx, data) => `You are a design-forward assistant for Skyeline Homes. Describe the design direction conveyed by this mood board in 2-3 sentences. Focus on style, palette, and mood.

Mood board items: ${JSON.stringify(data.items || [])}`,
  },
  extractDecisions: {
    label: 'Extract Decisions',
    buildPrompt: (ctx, data) => `You are an assistant for a custom home builder. Review this discussion thread and extract any design decisions that have been made. Format as a bulleted list. If none, say so.

Messages:
${(data.messages || []).map((m: any) => `${m.senderName || m.authorName || 'User'}: ${m.text}`).join('\n')}`,
  },
  createSelectionChecklist: {
    label: 'Create Selection Checklist',
    buildPrompt: (ctx, data) => `You are a construction design coordinator. Based on the room type "${ctx.roomName || 'room'}", create a practical checklist of selections this room typically needs. Mark any that are already selected from the list below.

Already selected: ${JSON.stringify(data.selections?.map((s: any) => s.itemName || s.label || s.name) || [])}

Format as a markdown checklist. Focus on real items (flooring, fixtures, tile, hardware, paint, etc.).`,
  },
  findUnansweredQuestions: {
    label: 'Find Unanswered Questions',
    buildPrompt: (ctx, data) => `Review this design discussion and identify any questions from the client or designer that appear to have no answer. List them as a bulleted list. If all questions are answered, say so.

Messages:
${(data.messages || []).map((m: any) => `${m.senderName || m.authorName || 'User'}: ${m.text}`).join('\n')}`,
  },
  flagTimelineRisks: {
    label: 'Flag Timeline Risks',
    buildPrompt: (ctx, data) => `You are a construction project manager assistant. Review these open design selections for the "${ctx.roomName || 'room'}" room and flag any that may pose a timeline risk (long lead times, requires early ordering, custom fabrication, etc.).

Open selections: ${JSON.stringify(data.openSelections || [])}
Project stage: ${data.projectStage || 'unknown'}

List each risk item and why it matters for scheduling.`,
  },
  findMissingProductLinks: {
    label: 'Find Missing Product Links',
    buildPrompt: (ctx, data) => `Review these selections and identify any that are missing a product URL, spec sheet, or vendor link.

Selections: ${JSON.stringify(data.selections || [])}

List each missing-link item with its name. If all have links, say so.`,
  },
  identifyBudgetOverages: {
    label: 'Identify Budget Overages',
    buildPrompt: (ctx, data) => `Review these selections and identify any that exceed their listed allowance or budget. For each overage, show the selection name, allowance, actual, and the overage amount.

Selections with budgets: ${JSON.stringify(data.selections || [])}

If none are over budget, say so.`,
  },
  generateClientDesignSummary: {
    label: 'Generate Client Design Summary',
    buildPrompt: (ctx, data) => `You are a professional design coordinator for Skyeline Homes. Write a warm, polished client-facing summary of the design selections for the "${ctx.roomName || 'room'}" room. This will be sent to the homeowner.

Selections made: ${JSON.stringify(data.selections || [])}
Decisions: ${JSON.stringify(data.decisions || [])}

Write 1-2 paragraphs in a warm, professional tone that makes the homeowner excited about their choices.`,
  },
  moveDiscussionToRoom: {
    label: 'Move Discussion To Room',
    buildPrompt: (ctx, data) => `Review these general project messages and suggest which ones are specifically relevant to the "${ctx.roomName || 'room'}" room. For each suggested message, briefly explain why.

General messages: ${JSON.stringify(data.messages || [])}
Room: ${ctx.roomName || 'unknown'}`,
  },
};

// Design channel name convention matches portalService.ts
const designChannelName = (roomId: string) => `design-${roomId}`.toLowerCase();

export function registerDesignerAiActionsRoute(app: Application, db: admin.firestore.Firestore) {
  app.post('/api/designer/ai/:action', async (req: any, res: any) => {
    try {
      const { action } = req.params;
      const { projectId, roomId, roomName, moodBoardId } = req.body;

      const actionDef = ACTIONS[action];
      if (!actionDef) {
        return res.status(400).json({ error: `Unknown action: ${action}` });
      }

      // Gather context data from Firestore
      const data: any = {};
      const ctx = { projectId, roomId, roomName, moodBoardId };

      if (projectId) {
        if (roomId) {
          // Fetch selections for this room (project-level collection, filtered by roomId)
          const selectionsSnap = await db
            .collection('projects').doc(projectId)
            .collection('selections')
            .where('roomId', '==', roomId)
            .get();
          data.selections = selectionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          data.openItems = data.selections.filter(
            (s: any) => s.designStatus && s.designStatus !== 'approved' && s.designStatus !== 'notApplicable'
          ).length;
          data.openSelections = data.selections.filter(
            (s: any) => !s.designStatus || s.designStatus === 'notStarted' || s.designStatus === 'inProgress'
          );

          // Fetch design decisions for this room (project-level collection, filtered by roomId)
          const decisionsSnap = await db
            .collection('projects').doc(projectId)
            .collection('designDecisions')
            .where('roomId', '==', roomId)
            .get();
          data.decisions = decisionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          // Fetch discussion messages from the room's design channel
          // Channel name convention: design-{roomId}  (see portalService.ts)
          const channelName = designChannelName(roomId);
          const channelsSnap = await db
            .collection('projects').doc(projectId)
            .collection('channels')
            .where('name', '==', channelName)
            .limit(1)
            .get();

          if (!channelsSnap.empty) {
            const channelId = channelsSnap.docs[0].id;
            const messagesSnap = await db
              .collection('projects').doc(projectId)
              .collection('channels').doc(channelId)
              .collection('messages')
              .orderBy('createdAt', 'asc')
              .limit(50)
              .get();
            data.messages = messagesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          } else {
            data.messages = [];
          }
        }

        // Mood board items — projects/{id}/moodBoards/{boardId}/items
        if (moodBoardId) {
          const mbSnap = await db
            .collection('projects').doc(projectId)
            .collection('moodBoards').doc(moodBoardId)
            .collection('items')
            .get();
          data.items = mbSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          data.moodBoardCount = data.items.length;
        }
      }

      const prompt = actionDef.buildPrompt(ctx, data);

      // Call Claude — same pattern as existing routes in index.ts
      const Anthropic = require('@anthropic-ai/sdk');
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
      }
      const client = new Anthropic({ apiKey });
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
      return res.json({ ok: true, result: text, action, label: actionDef.label });

    } catch (err: any) {
      console.error('Designer AI action error:', err);
      return res.status(500).json({ error: err.message || 'AI action failed' });
    }
  });
}
