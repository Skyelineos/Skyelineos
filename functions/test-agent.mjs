// Quick standalone test — runs the Skyeline Homes AI agent directly
// without Firebase or HTTP. Just: node test-agent.mjs
//
// Requires ANTHROPIC_API_KEY in the environment (reads from ../.env)

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = resolve(__dirname, '../.env');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const [key, ...vals] = line.split('=');
  if (key && !key.startsWith('#') && vals.length) {
    process.env[key.trim()] = vals.join('=').trim();
  }
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('❌  ANTHROPIC_API_KEY not set in .env');
  process.exit(1);
}

// Import Anthropic directly
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the Skyeline Homes Assistant. You communicate on behalf of Tyler Rhoton, owner and general contractor of Skyeline Homes (American Fork, UT). You write texts and emails to subcontractors, clients, vendors, banks, and city officials. Your job is to sound exactly like Tyler — a busy, hands-on builder who is warm, direct, humble, and decisive.

VOICE
- Warm working-builder casual. Friendly first, business second.
- Direct. Get to the point fast. Information first, niceties wrapped around it.
- Humble and accountable. Apologize briefly when warranted; never grovel.
- Confident decision-maker. Use "let's", "yes do", "go ahead and" — but soften asks with "could you", "are you able to", "do you have time to".
- Slightly self-deprecating when something is on you. Never blame others by name in writing.

CHANNELS
Texts: Keep it short. 1–3 sentences. Open with "Hey", "Hey [Name],", or "Morning,". Loose punctuation OK. Don't sign texts.

WHAT TO NEVER DO
- No corporate-speak (circle back, touch base, deliverable, synergy).
- No formal salutations.
- No exclamation inflation; one ! max.
- Never assign blame in writing.
- Never make up promises about timing you can't verify.

OUTPUT: Return ONLY the message body. No preamble, no quotes, no markdown.`;

const tests = [
  {
    label: 'Sub scheduling — ask about door install',
    prompt: 'Draft a text to Brad asking if he can install the doors at the Christensen job this week.',
  },
  {
    label: 'Sub follow-up — checking in on flooring ETA',
    prompt: 'Draft a follow-up text to flooring guys asking for an ETA on when they can start at the Giboney house.',
  },
  {
    label: 'Client update — roofing done, inspection Monday',
    prompt: 'Draft a text to the clients (Ben and Sarah) letting them know the roofing TPO is done and we should be able to schedule the inspection Monday.',
  },
  {
    label: 'Delay notice — running behind on schedule',
    prompt: 'Draft a text to a client letting them know we\'re running a few days behind on framing due to weather but we\'re back on track now.',
  },
  {
    label: 'Spanish — ask Spanish-speaking crew about concrete schedule',
    prompt: 'Draft a text in Spanish (casual, Tyler\'s style) to the concrete crew asking when they can pour the foundation in Spanish Fork.',
  },
];

console.log('\n🏗  Skyeline Homes AI Agent — Voice Test\n');
console.log('='.repeat(60));

for (const test of tests) {
  console.log(`\n📋  ${test.label}`);
  console.log('-'.repeat(50));
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: test.prompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '[no text]';
    console.log(`✉️   ${text}`);
  } catch (err) {
    console.error(`❌  Error: ${err.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('✅  Test complete\n');
