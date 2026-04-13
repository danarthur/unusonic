/**
 * Conversation Summarization for Aion
 *
 * Rolling summary strategy: recent messages stay verbatim, older messages
 * get compressed into a structured summary block using Haiku (fast + cheap).
 *
 * The summary is prepended as a system-level context block.
 * Original messages are never deleted — summary is a read optimization.
 */

import { generateText } from 'ai';
import { getModel } from './models';

// ── Configuration ────────────────────────────────────────────────────────────

/** Keep this many recent messages verbatim (not summarized) */
const KEEP_RECENT = 20;

/** Trigger summarization when total messages exceed this count */
const SUMMARIZE_THRESHOLD = 30;

/** Rough token estimate per message (content + overhead) */
const AVG_TOKENS_PER_MESSAGE = 150;

/** Max tokens for the summary output */
const SUMMARY_MAX_TOKENS = 1000;

// ── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SummarizedHistory = {
  /** Summary of older messages (null if not needed) */
  summary: string | null;
  /** Recent messages to send verbatim */
  recentMessages: ChatMessage[];
  /** Whether summarization was performed this turn */
  didSummarize: boolean;
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Prepare conversation history for the LLM.
 * If history is short, returns all messages as-is.
 * If history is long, summarizes older messages and returns summary + recent.
 *
 * @param messages - Full conversation history
 * @param existingSummary - Previously stored summary (from DB), if any
 * @returns Summary block + recent messages ready for the LLM
 */
export async function prepareConversationHistory(
  messages: ChatMessage[],
  existingSummary: string | null = null,
): Promise<SummarizedHistory> {
  // Short conversation — no summarization needed
  if (messages.length <= SUMMARIZE_THRESHOLD) {
    return {
      summary: existingSummary,
      recentMessages: messages,
      didSummarize: false,
    };
  }

  // Split into old (to summarize) and recent (to keep verbatim)
  const oldMessages = messages.slice(0, -KEEP_RECENT);
  const recentMessages = messages.slice(-KEEP_RECENT);

  // Build the summary
  const summary = await summarizeMessages(oldMessages, existingSummary);

  return {
    summary,
    recentMessages,
    didSummarize: true,
  };
}

/**
 * Estimate total token usage for a message array.
 * Rough estimate — used for monitoring, not precise budgeting.
 */
export function estimateTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4) + 10, 0);
}

// ── Internal ─────────────────────────────────────────────────────────────────

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer for an AI assistant called Aion that helps with event production operations (deals, crew, proposals, invoices, follow-ups).

Summarize the conversation history into a structured block that preserves:
- Key facts discussed (client names, deal names, dates, amounts)
- Decisions made or confirmed
- Actions taken (drafts sent, crew assigned, deals updated)
- User preferences or corrections expressed
- Current state of any ongoing task

Format as a concise bulleted list. Use specific names, IDs, and numbers — never generalize.
Do not include greetings, pleasantries, or filler.
Keep under 500 words.`;

async function summarizeMessages(
  messages: ChatMessage[],
  existingSummary: string | null,
): Promise<string> {
  // Build the prompt — include existing summary for incremental compression
  const parts: string[] = [];

  if (existingSummary) {
    parts.push('Previous conversation summary:', existingSummary, '', 'New messages to incorporate:');
  }

  for (const msg of messages) {
    parts.push(`${msg.role === 'user' ? 'User' : 'Aion'}: ${msg.content}`);
  }

  try {
    const { text } = await generateText({
      model: getModel('fast'), // Haiku — cheap and fast for compression
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: parts.join('\n'),
      maxOutputTokens: SUMMARY_MAX_TOKENS,
      temperature: 0.3, // Low temperature for factual compression
    });

    return text.trim();
  } catch (err) {
    console.error('[aion/summarize] Failed to summarize:', err);
    // On failure, return existing summary or a basic fallback
    return existingSummary ?? '(Earlier conversation context unavailable)';
  }
}
