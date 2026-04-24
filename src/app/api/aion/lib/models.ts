/**
 * Aion Model Registry & Intent-Based Router
 *
 * Intent classification with conversation context awareness.
 * No LLM classifier — deterministic, runs in <1ms.
 *
 * Tiers:
 *   Fast  (Haiku 4.5)  — greetings, single-tool reads, draft generation
 *   Standard (Sonnet 4) — write operations, multi-tool chains, analysis
 *   Heavy (Opus 4)      — deep analysis, strategic recommendations (user-initiated)
 *
 * Key design decisions:
 *   - Confirmations inherit the tier of the action being confirmed
 *   - Any message likely to trigger write tools → Sonnet minimum
 *   - Multi-step requests (conjunctions) → Sonnet
 *   - When uncertain, route UP not down (tool-calling failures are worse than cost)
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolve the Anthropic API key in a way that survives the Claude Desktop
 * install poisoning process.env with `ANTHROPIC_API_KEY=` (empty string) and
 * `ANTHROPIC_BASE_URL=https://api.anthropic.com` (missing /v1). Next.js loads
 * .env.local into process.env but does NOT override variables that are
 * already set (even to empty string), so we parse .env.local directly when
 * the shell-provided value is empty.
 */
function resolveAnthropicApiKey(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  try {
    // Only runs if shell env poisoned the var. Next dev + node runtime only —
    // edge runtime would need a different approach, but chat route runs on
    // nodejs per `export const runtime = 'nodejs'` in route.ts.
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^ANTHROPIC_API_KEY\s*=\s*(.+)$/.exec(line);
      if (m) return m[1].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

/**
 * Explicit baseURL + apiKey guard against a stray shell env poisoning from
 * the Claude Desktop install (observed 2026-04-21):
 *   ANTHROPIC_BASE_URL=https://api.anthropic.com  (no /v1 → 404 on every call)
 *   ANTHROPIC_API_KEY=                            (empty → "x-api-key header is required")
 * The SDK's auto-loader picks those up first and never falls through to
 * .env.local. Pinning both values here isolates the app from the shell env.
 */
const anthropic = createAnthropic({
  baseURL: 'https://api.anthropic.com/v1',
  apiKey: resolveAnthropicApiKey(),
});

// ── Model IDs ────────────────────────────────────────────────────────────────

// TEMPORARY (2026-04-21): Anthropic API key for this workspace has access to
// Haiku 4.5 but returns 404 on Sonnet 4.5 / Opus 4.5 / Sonnet 4.6 / Opus 4.7.
// Routing all tiers through Haiku until org-level model access is sorted.
// Flip `standard` back to 'claude-sonnet-4-5' and `heavy` to 'claude-opus-4-5'
// (or 4-6 aliases) once the dashboard confirms access.
export const MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  standard: 'claude-haiku-4-5-20251001',
  heavy: 'claude-haiku-4-5-20251001',
} as const;

export type ModelTier = keyof typeof MODELS;

// ── Provider instances ───────────────────────────────────────────────────────

export function getModel(tier: ModelTier) {
  return anthropic(MODELS[tier]);
}

// ── Intent Classification ───────────────────────────────────────────────────

type Intent =
  | 'greeting'          // hi, hey, thanks, bye
  | 'confirmation'      // yes, do it, confirm, go ahead
  | 'rejection'         // no, cancel, nevermind
  | 'simple_lookup'     // show me X, what is Y (single read tool)
  | 'draft_request'     // write a follow-up, draft an email
  | 'write_action'      // create, update, assign, send, publish, confirm crew
  | 'multi_step'        // compound requests joined by "and"/"then"
  | 'analysis'          // analyze, compare, recommend, trend
  | 'strategic'         // user explicitly wants deep thinking
  | 'config'            // voice setup, teach me, remember this
  | 'conversational'    // general chat, questions, context-dependent

// ── Pattern matchers ────────────────────────────────────────────────────────

const GREETING = /^(hi|hey|hello|thanks|thank you|good (morning|afternoon|evening)|bye|goodbye|cheers|yo|sup)\b/i;

const CONFIRMATION = /^(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|confirm|approved?|send it|ship it|let'?s go|absolutely|please do|go for it)\s*[.!]?$/i;

const REJECTION = /^(no|nah|nope|cancel|never\s?mind|stop|don'?t|forget it|skip|back)\s*[.!]?$/i;

const WRITE_VERBS = /\b(create|add|assign|update|change|set|move|mark|confirm|publish|send|dispatch|remove|delete|schedule|book|log)\b/i;

const DRAFT_VERBS = /\b(draft|write|compose|prepare|generate).{0,20}\b(follow[- ]?up|email|message|sms|text|note|reply)\b/i;

const ANALYSIS_SIGNALS = /\b(analyz|recommend|compar|trend|insight|breakdown|summariz|evaluat|assess|audit|review (my|the|our))\b/i;

const STRATEGIC_SIGNALS = /\b(think (hard|deeply|carefully)|deep (analysis|dive)|opus|thorough|comprehensive|strateg|forecast|optimiz|long[- ]term|big picture)\b/i;

const CONFIG_SIGNALS = /\b(voice|tone|style|teach|learn|remember|forget|vocabulary|guardrail|onboarding|settings?|config)\b/i;

const MULTI_STEP_CONJUNCTIONS = /\b(and then|then also|after that|also |, and |& also)\b/i;

/** Detects compound requests: "create X and assign Y", "show me deals and update Z" */
function hasMultipleIntents(msg: string): boolean {
  if (MULTI_STEP_CONJUNCTIONS.test(msg)) return true;
  // Multiple write verbs → multi-step
  const writeMatches = msg.match(new RegExp(WRITE_VERBS.source, 'gi'));
  return (writeMatches?.length ?? 0) >= 2;
}

/** Previous assistant message offered confirmation chips */
function lastAssistantAskedForConfirmation(previousMessages: PreviousMessage[]): boolean {
  if (previousMessages.length === 0) return false;
  const lastAssistant = [...previousMessages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return false;
  const content = lastAssistant.content.toLowerCase();
  return content.includes('[confirm') || content.includes('confirm|') || content.includes('cancel|') ||
    content.includes('shall i') || content.includes('should i') || content.includes('want me to') ||
    content.includes('go ahead');
}

/** Previous assistant message used write-category tools */
function lastTurnInvolvedWriteTools(previousMessages: PreviousMessage[]): boolean {
  if (previousMessages.length === 0) return false;
  const lastAssistant = [...previousMessages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return false;
  const content = lastAssistant.content.toLowerCase();
  return content.includes('created') || content.includes('updated') || content.includes('assigned') ||
    content.includes('published') || content.includes('sent') || content.includes('confirmed');
}

function classifyIntent(msg: string, previousMessages: PreviousMessage[]): Intent {
  const trimmed = msg.trim();

  // Exact-match intents (short, unambiguous)
  if (CONFIRMATION.test(trimmed)) {
    return lastAssistantAskedForConfirmation(previousMessages) ? 'confirmation' : 'greeting';
  }
  if (REJECTION.test(trimmed)) return 'rejection';
  if (trimmed.length < 40 && GREETING.test(trimmed)) return 'greeting';

  // Strategic (user explicitly asks for depth)
  if (STRATEGIC_SIGNALS.test(trimmed)) return 'strategic';

  // Multi-step detection (before individual intents)
  if (hasMultipleIntents(trimmed)) return 'multi_step';

  // Draft requests (before write detection — drafting uses Haiku)
  if (DRAFT_VERBS.test(trimmed)) return 'draft_request';

  // Write actions
  if (WRITE_VERBS.test(trimmed)) return 'write_action';

  // Analysis
  if (ANALYSIS_SIGNALS.test(trimmed)) return 'analysis';

  // Config/teaching
  if (CONFIG_SIGNALS.test(trimmed)) return 'config';

  // Simple lookups — short questions that are purely informational
  if (trimmed.length < 200 && /^(who|what|when|where|how many|how much|list|show|is |are |did |does |do |has |have |get |check )\b/i.test(trimmed)) {
    // But not if they contain write verbs buried inside
    if (!WRITE_VERBS.test(trimmed)) return 'simple_lookup';
  }

  return 'conversational';
}

// ── Tier mapping ────────────────────────────────────────────────────────────

const INTENT_TO_TIER: Record<Intent, ModelTier> = {
  greeting: 'fast',
  confirmation: 'standard',    // confirmations trigger write tools → needs reliable tool-calling
  rejection: 'fast',
  simple_lookup: 'fast',
  draft_request: 'fast',       // Haiku handles drafting well
  write_action: 'standard',    // write ops need Sonnet's tool-calling reliability
  multi_step: 'standard',      // compound requests need planning
  analysis: 'standard',
  strategic: 'heavy',
  config: 'standard',          // voice config involves multi-turn tool calls
  conversational: 'fast',      // pure chat without tool needs
};

// ── Router input ────────────────────────────────────────────────────────────

export type PreviousMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type RouterInput = {
  /** The user's latest message */
  message: string;
  /** Total number of messages in conversation */
  messageCount: number;
  /** Number of tool definitions available */
  toolCount: number;
  /** Recent messages for conversation context (last 4 is sufficient) */
  previousMessages?: PreviousMessage[];
  /** Which page the user is on */
  pageType?: string | null;
  /** User's workspace role */
  userRole?: string;
  /** Whether the user has write permissions */
  canWrite?: boolean;
};

/**
 * Select model tier based on intent classification + conversation context.
 * Deterministic, runs in <1ms, no LLM calls.
 */
export function selectModelTier(input: RouterInput): ModelTier {
  const { message, messageCount, previousMessages = [], pageType, userRole, canWrite } = input;
  const trimmed = message.trim();

  // Empty or whitespace → fast (will be handled as greeting by route)
  if (!trimmed) return 'fast';

  // Classify intent
  const intent = classifyIntent(trimmed, previousMessages);
  let tier = INTENT_TO_TIER[intent];

  // ── Context-based adjustments ───────────────────────────────────────────

  // Conversational messages in long conversations likely need context → upgrade
  if (intent === 'conversational' && messageCount > 10) {
    tier = 'standard';
  }

  // Confirmations after write tool usage → must be standard for tool reliability
  if (intent === 'confirmation' && lastTurnInvolvedWriteTools(previousMessages)) {
    tier = 'standard';
  }

  // Simple lookups in long conversations may reference earlier context → upgrade
  if (intent === 'simple_lookup' && messageCount > 15) {
    tier = 'standard';
  }

  // ── Platform context adjustments ────────────────────────────────────────

  // Deal page + ambiguous verb: "add Sarah" on a deal page means assign_crew (write)
  // The intent classifier may see this as conversational, but page context reveals the write intent
  if (pageType === 'deal' && (intent === 'conversational' || intent === 'simple_lookup') && WRITE_VERBS.test(trimmed)) {
    tier = 'standard';
  }

  // CRM page with no specific entity selected — queries tend to chain multiple tools
  if (pageType === 'crm' && (intent === 'conversational' || intent === 'simple_lookup')) {
    tier = 'standard';
  }

  // Dashboard/lobby analytics — multi-tool chains (pipeline + revenue + concentration)
  if ((pageType === 'lobby' || pageType === 'dashboard') && intent === 'simple_lookup' && /\b(revenue|pipeline|deals|clients?|trend|month|quarter)\b/i.test(trimmed)) {
    tier = 'standard';
  }

  // Proposal page + any write intent — financial precision, visible to clients
  if (pageType === 'proposal' && (intent === 'write_action' || intent === 'draft_request')) {
    tier = 'standard';
  }

  // Read-only user asking for strategic analysis — cap at standard (can't act on Opus recommendations)
  if (canWrite === false && intent === 'strategic') {
    tier = 'standard';
  }

  // Operational streak: 3+ recent assistant messages with tool indicators → maintain standard
  // Prevents mid-flow degradation when user asks a casual question between operations
  if (tier === 'fast' && hasOperationalStreak(previousMessages)) {
    tier = 'standard';
  }

  return tier;
}

/** Detects whether recent conversation has been tool-heavy (operational mode) */
function hasOperationalStreak(previousMessages: PreviousMessage[]): boolean {
  const assistantMsgs = previousMessages.filter(m => m.role === 'assistant');
  if (assistantMsgs.length < 2) return false;
  // Check if most recent assistant messages reference tool activity
  const toolIndicators = /\b(created|updated|assigned|confirmed|published|sent|found|showing|here'?s|retrieved)\b/i;
  const recentWithTools = assistantMsgs.slice(-3).filter(m => toolIndicators.test(m.content));
  return recentWithTools.length >= 2;
}

/** Exposed for testing */
export { classifyIntent, type Intent };

// ── Fallback wrapper ─────────────────────────────────────────────────────────

/**
 * Try primary model, fall back to fast model on failure.
 * Returns the model instance and whether it's degraded.
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<{ result: T; degraded: boolean }> {
  try {
    return { result: await primary(), degraded: false };
  } catch (err: any) {
    const status = err?.status ?? err?.statusCode;
    // Retry-worthy errors: rate limit, server error, timeout
    if (status === 429 || status === 500 || status === 503 || err?.code === 'ETIMEDOUT') {
      try {
        return { result: await fallback(), degraded: true };
      } catch {
        throw err; // Both failed — throw original
      }
    }
    throw err; // Non-retryable error
  }
}
