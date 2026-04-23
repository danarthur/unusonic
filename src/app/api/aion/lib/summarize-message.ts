/**
 * Message ai_summary generation — Phase 3 Sprint 1 Week 3. Plan §3.2.
 *
 * Produces a one-line paraphrase of an inbound/outbound message body
 * (reserved ops.messages.ai_summary column). Used by the CitationPill
 * hover card so Aion can show "Sarah pushed back on the wireless
 * upgrade pricing" instead of a raw 400-char body_text cut.
 *
 * Haiku one-shot. Fire-and-forget at ingestion time once Week 3 webhook
 * wiring lands; admin-driven backfill on historical rows.
 *
 * Cost envelope (see summarizeMessageCostEstimate below):
 *   Haiku 4.5 input:  $0.80 / M tokens
 *   Haiku 4.5 output: $4.00 / M tokens
 *   Avg message:      ~150 input tokens, ~25 output tokens
 *   Per message:      ~$0.00022 (0.02¢)
 *   1000 messages:    ~$0.22
 */

import 'server-only';
import { generateText } from 'ai';
import { getModel } from './models';

const SYSTEM = `You write one-line paraphrases of business email / SMS messages. The paraphrase gives the reader the gist in under 15 words. Output ONLY the paraphrase — no quotes, no prefix, no framing.

Rules:
- Under 15 words, one sentence
- Past tense, third person when the sender is the subject ("Sarah asked…", "Becca pushed back on…")
- Lead with the subject when clear; otherwise lead with the action
- Keep it flat and specific — do NOT invent detail not in the body`;

type SummarizeInput = {
  bodyText: string;
  fromName?: string | null;
  direction?: 'inbound' | 'outbound';
};

// Haiku 4.5 pricing (2026-01 Anthropic rate card). Update here when the
// pricing sheet changes so the cost estimator stays honest.
export const HAIKU_INPUT_USD_PER_MTOK = 0.8;
export const HAIKU_OUTPUT_USD_PER_MTOK = 4.0;

// ~4 characters per token as a stable conservative estimate.
const CHARS_PER_TOKEN = 4;

// Hard cap on body prompt length — keeps cost bounded even if someone
// pastes a 10k-char email chain. Cut on sentence boundary where possible.
const MAX_BODY_CHARS = 2000;

function capBody(text: string): string {
  if (text.length <= MAX_BODY_CHARS) return text;
  const window = text.slice(0, MAX_BODY_CHARS);
  const lastPunct = window.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (lastPunct && lastPunct[0].length >= MAX_BODY_CHARS * 0.5) return lastPunct[0];
  const lastSpace = window.lastIndexOf(' ');
  return lastSpace > MAX_BODY_CHARS * 0.5 ? window.slice(0, lastSpace) : window;
}

/**
 * Generate a one-line paraphrase for a message body. Returns null if the
 * body is empty or the model returns nothing usable. Never throws.
 */
export async function summarizeMessage(input: SummarizeInput): Promise<string | null> {
  const body = (input.bodyText ?? '').trim();
  if (!body) return null;
  const capped = capBody(body);

  try {
    const model = getModel('fast');
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: [
        input.fromName ? `Sender: ${input.fromName}` : null,
        input.direction ? `Direction: ${input.direction}` : null,
        '',
        'Message body:',
        capped,
      ].filter((x) => x !== null).join('\n'),
      maxOutputTokens: 64,
    });
    const trimmed = text.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '');
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    console.error('[aion/summarize-message] Haiku call failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Estimate the total cost (USD) of summarizing `messageCount` messages of
 * average body length `avgBodyChars`. Used by the backfill UI to show
 * "this will cost ~$X" before the admin hits run.
 */
export function summarizeMessageCostEstimate(args: {
  messageCount: number;
  avgBodyChars: number;
}): { inputTokens: number; outputTokens: number; usd: number } {
  // Prompt is roughly: body + ~40 tokens of system + fromName/direction headers.
  const promptTokensPerMessage =
    Math.min(args.avgBodyChars, MAX_BODY_CHARS) / CHARS_PER_TOKEN + 60;
  // Output cap is 64 tokens; assume average utilization ~25 tokens for a
  // one-line paraphrase.
  const outputTokensPerMessage = 25;

  const inputTokens = Math.ceil(promptTokensPerMessage * args.messageCount);
  const outputTokens = outputTokensPerMessage * args.messageCount;
  const usd =
    (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_MTOK;
  return { inputTokens, outputTokens, usd };
}
