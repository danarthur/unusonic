/**
 * Session title generator.
 *
 * Fires fire-and-forget after the first assistant turn of a session. Calls
 * Haiku with a tight prompt (3–6 words, Title Case, no trailing punctuation)
 * and writes the result via cortex.set_aion_session_title. The RPC silently
 * no-ops against title_locked=true sessions, so a user rename during
 * generation never loses.
 *
 * Matches ChatGPT / LibreChat / Open WebUI pattern — async, cheap model,
 * short prompt, hard word cap, Title Case convention. Word-cap is enforced
 * both in the prompt AND by client-side trimming as a belt-and-suspenders.
 *
 * Design: docs/reference/aion-deal-chat-design.md + 2026-04-21 design pass
 * §2 (title generation).
 */

import 'server-only';
import { generateText } from 'ai';
import { getModel } from './models';
import { createClient } from '@/shared/api/supabase/server';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type GenerateTitleInput = {
  sessionId: string;
  userMessage: string;
  assistantReply: string;
};

/**
 * Generate and persist a title for a session that currently has none.
 * Idempotent — checks the session state first and bails if a title is
 * already set OR locked. Never throws; callers should `void` the promise.
 *
 * Scope-placeholder rule: scoped sessions (deal, event) are created with
 * their scope entity's title pre-populated so the sidebar group header
 * renders instantly. But that's a *placeholder*, not a real thread name —
 * if we leave it, every deal-card thread gets the deal's name regardless
 * of the conversation topic (cross-reference questions ended up labeled
 * "Alex & Christine's Wedding" when they were actually about Ally &
 * Emily). When the current title exactly matches the scope entity's
 * title, we treat it as placeholder and regenerate from content.
 */
export async function generateSessionTitle(input: GenerateTitleInput): Promise<void> {
  try {
    const state = await readSessionState(input.sessionId);
    if (state.locked) return;
    const currentTitle = (state.title ?? '').trim();

    // Three regenerate cases:
    //   1. No title → always generate
    //   2. Title is just the scope entity's current title → placeholder, replace
    //   3. Title was previously generated but somehow matches scope — keep regen
    const scopeTitle = (state.scopeEntityTitle ?? '').trim();
    const isPlaceholder = !!scopeTitle && currentTitle === scopeTitle;
    if (currentTitle.length > 0 && !isPlaceholder) return;

    const raw = await generateTitleFromMessages(input.userMessage, input.assistantReply);
    const normalized = normalizeTitle(raw);
    if (!normalized) return;

    await persistTitle(input.sessionId, normalized);
  } catch (err) {
    // Fire-and-forget path — surface in dev logs but never bubble.
    console.error('[generate-title] failed', {
      sessionId: input.sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

// The prompt is deliberately constrained. Each clause earns its keep:
//   - "3 to 6 words" — word cap (Field Expert pass §2)
//   - "Title Case"   — matches shipped ChatGPT style
//   - "No quotes"    — common failure mode otherwise
//   - "No trailing punctuation" — another common failure mode
//   - "Don't start with 'Chat'" — avoids "Chat About …" anti-pattern
//   - Output ONLY — reduces chance of preamble
const TITLE_SYSTEM = `You write short titles for chat threads. Output ONLY the title — no quotes, no prefix, no explanation.

Rules:
- 3 to 6 words
- Title Case
- No trailing punctuation
- Don't start with "Chat", "About", or "Regarding"
- Focus on the topic, not the action`;

async function generateTitleFromMessages(
  userMessage: string,
  assistantReply: string,
): Promise<string> {
  const model = getModel('fast'); // Haiku — cheap, fast, sufficient
  const { text } = await generateText({
    model,
    system: TITLE_SYSTEM,
    prompt: [
      'First user message:',
      userMessage.slice(0, 500),
      '',
      'First assistant reply:',
      assistantReply.slice(0, 500),
    ].join('\n'),
    maxOutputTokens: 24,
    temperature: 0.2,
  });
  return text ?? '';
}

// ---------------------------------------------------------------------------
// Title normalization
// ---------------------------------------------------------------------------

/**
 * Belt-and-suspenders sanitation — even with the prompt rules, models
 * occasionally slip in quotes, trailing punctuation, or "Chat About" prefixes.
 * This normalizer catches those and caps length at 6 words.
 */
function normalizeTitle(raw: string): string | null {
  let t = (raw ?? '').trim();
  if (!t) return null;

  // Strip wrapping quotes (single or double, smart or straight)
  t = t.replace(/^["'\u2018\u2019\u201C\u201D]+|["'\u2018\u2019\u201C\u201D]+$/g, '').trim();
  // Trailing punctuation
  t = t.replace(/[.,;:!?\u2026]+$/g, '').trim();
  // Kill "Chat About ", "Chat on ", "Regarding ", "About " prefixes
  t = t.replace(/^(chat\s+(about|on|regarding)|regarding|about)\s+/i, '').trim();

  if (!t) return null;

  // Enforce the word cap. Split on whitespace; keep first 6 tokens.
  const words = t.split(/\s+/);
  if (words.length > 6) t = words.slice(0, 6).join(' ');

  // Guard against empty-after-sanitize OR a one-token garbage answer
  if (t.length < 2) return null;

  return t;
}

// ---------------------------------------------------------------------------
// DB reads + writes
// ---------------------------------------------------------------------------

type SessionState = {
  title: string | null;
  locked: boolean;
  /** Live title of the session's scope entity (e.g. the deal's current
   *  title). Used to detect placeholder-match and regenerate over it. */
  scopeEntityTitle: string | null;
};

async function readSessionState(sessionId: string): Promise<SessionState> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cortex not in generated PostgREST types
  const { data } = await (supabase as any)
    .schema('cortex')
    .from('aion_sessions')
    .select('title, title_locked, scope_type, scope_entity_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (!data) return { title: null, locked: false, scopeEntityTitle: null };

  let scopeEntityTitle: string | null = null;
  if (data.scope_type === 'deal' && data.scope_entity_id) {
    const { data: deal } = await supabase
      .from('deals')
      .select('title')
      .eq('id', data.scope_entity_id)
      .maybeSingle();
    scopeEntityTitle = ((deal as { title: string | null } | null)?.title) ?? null;
  }
  // scope_type='event' will join ops.events once that path ships (Phase 3).

  return {
    title: (data.title as string | null) ?? null,
    locked: Boolean(data.title_locked),
    scopeEntityTitle,
  };
}

async function persistTitle(sessionId: string, title: string): Promise<void> {
  const supabase = await createClient();
  // p_lock = false: this is a generated title, not a user rename. The RPC
  // silently no-ops if title_locked is already true (user renamed mid-gen).
  const { error } = await supabase.schema('cortex').rpc('set_aion_session_title', {
    p_session_id: sessionId,
    p_title: title,
    p_lock: false,
  });
  if (error) {
    throw new Error(`set_aion_session_title failed: ${error.message}`);
  }
}
