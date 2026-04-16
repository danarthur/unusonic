/**
 * Shared draft generation for Aion follow-up messages.
 *
 * Extracted from /api/aion/draft-follow-up so both the direct route
 * and the dispatch API (Phase 2) can reuse the same logic.
 *
 * Does NOT include auth, tier gating, or kill-switch checks — callers
 * must handle those before calling.
 */

import { generateText } from 'ai';
import { getModel } from './models';
import type { AionDealContext } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import type { AionVoiceConfig } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';

export type DraftResult = {
  draft: string;
  channel: 'sms' | 'email';
};

/**
 * Generate a follow-up draft for a deal using the fast model.
 * Returns the draft text and resolved channel.
 */
export async function generateFollowUpDraft(opts: {
  context: AionDealContext;
  voice: AionVoiceConfig | null;
  channelOverride?: 'sms' | 'email';
}): Promise<DraftResult> {
  const { context, voice, channelOverride } = opts;

  const channel: 'sms' | 'email' =
    channelOverride ?? (context.followUp.suggested_channel === 'email' ? 'email' : 'sms');

  const systemPrompt = buildFollowUpPrompt(context, channel, voice);

  const { text } = await generateText({
    model: getModel('fast'),
    system: systemPrompt,
    prompt: `Write a ${channel === 'sms' ? 'text message' : 'short email'} follow-up for this deal. Reason: ${context.followUp.reason}`,
    maxOutputTokens: 200,
    temperature: 0.6,
  });

  return { draft: text.trim(), channel };
}

/**
 * Build the system prompt for follow-up draft generation.
 * Injects deal context + optional workspace voice config.
 */
export function buildFollowUpPrompt(
  ctx: AionDealContext,
  channel: 'sms' | 'email',
  voice: AionVoiceConfig | null,
): string {
  const parts: string[] = [
    'You are a follow-up message assistant for an event production company.',
    `Write a ${channel === 'sms' ? 'text message (under 60 words, casual tone)' : 'short email body (under 100 words, professional tone)'}.`,
  ];

  // Inject workspace voice if configured
  if (voice?.description || voice?.example_message || voice?.guardrails) {
    parts.push('', '--- How This Company Communicates ---');
    if (voice.description) {
      parts.push(`Voice: ${voice.description}`);
    }
    if (voice.example_message) {
      parts.push('', 'Example of a good follow-up from this company:', voice.example_message);
    }
    if (voice.guardrails) {
      parts.push('', `Strict rules from the user (override all other guidance): ${voice.guardrails}`);
    }
    parts.push('');
  }

  parts.push(
    '',
    'General rules (apply when not overridden by the user\'s rules above):',
    '- One clear ask or next step at the end',
    '- Never use exclamation marks',
    '- Sound like a real person, not a template or AI',
    '- Never mention any CRM, system, or software',
    '- Do not include a subject line, greeting formula, or sign-off — just the message body',
    '- Reference specific details from the context below when relevant',
  );

  parts.push('', '--- Deal Context ---');

  if (ctx.client?.contact_first_name) {
    parts.push(`Client first name: ${ctx.client.contact_first_name}`);
  }
  if (ctx.client?.name) {
    parts.push(`Company/client: ${ctx.client.name}`);
  }
  if (ctx.client && ctx.client.past_deals_count > 1) {
    parts.push(`This is a returning client (${ctx.client.past_deals_count} deals total)`);
  }
  if (ctx.deal.title) {
    parts.push(`Event: ${ctx.deal.title}`);
  }
  if (ctx.deal.event_date) {
    parts.push(`Event date: ${ctx.deal.event_date}`);
  }
  if (ctx.deal.event_archetype) {
    parts.push(`Event type: ${ctx.deal.event_archetype}`);
  }
  parts.push(`Deal status: ${ctx.deal.status}`);

  if (ctx.proposal) {
    parts.push('', '--- Proposal ---');
    parts.push(`Proposal status: ${ctx.proposal.status ?? 'unknown'}`);
    if (ctx.proposal.total != null) {
      parts.push(`Proposal total: $${ctx.proposal.total.toLocaleString()}`);
    }
    if (ctx.proposal.view_count > 0) {
      parts.push(`Proposal views: ${ctx.proposal.view_count}`);
      if (ctx.proposal.last_viewed_at) {
        parts.push(`Last viewed: ${ctx.proposal.last_viewed_at}`);
      }
    }
    if (ctx.proposal.item_summary.length > 0) {
      parts.push(`Key items: ${ctx.proposal.item_summary.join(', ')}`);
    }
  }

  if (ctx.followUp.recent_log.length > 0) {
    parts.push('', '--- Recent Follow-Up History ---');
    for (const entry of ctx.followUp.recent_log) {
      parts.push(`- ${entry}`);
    }
  }

  parts.push('', `Reason this deal needs follow-up: ${ctx.followUp.reason}`);

  return parts.join('\n');
}
