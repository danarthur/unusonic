/**
 * Aion: Generate a follow-up draft for a deal.
 *
 * POST /api/aion/draft-follow-up
 * Body: { context: AionDealContext, workspaceId: string }
 *
 * Requires authenticated session + "active" Aion tier.
 * Returns: { draft: string, channel: 'sms' | 'email' }
 */

import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel } from '../lib/models';
import { createClient } from '@/shared/api/supabase/server';
import { canExecuteAionAction, recordAionAction } from '@/features/intelligence/lib/aion-gate';
import { getAionConfigForWorkspace } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import type { AionVoiceConfig } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import type { AionDealContext } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let context: AionDealContext;
  let workspaceId: string;
  try {
    const body = await req.json();
    context = body.context;
    workspaceId = body.workspaceId;
    if (!context || !workspaceId) throw new Error('Missing fields');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 3. Tier gate
  const gate = await canExecuteAionAction(workspaceId, 'active');
  if (!gate.allowed) {
    return NextResponse.json(
      { error: gate.reason === 'aion_action_limit_reached' ? 'Monthly Aion action limit reached' : 'Upgrade your plan to use Aion drafts' },
      { status: 403 },
    );
  }

  // 4. Load workspace Aion config (voice + kill switch)
  const aionConfig = await getAionConfigForWorkspace(workspaceId);
  if (aionConfig.kill_switch) {
    return NextResponse.json({ error: 'Aion is paused for this workspace' }, { status: 403 });
  }

  // 5. Determine channel
  const channel: 'sms' | 'email' =
    context.followUp.suggested_channel === 'email' ? 'email' : 'sms';

  // 6. Build system prompt with workspace voice
  const systemPrompt = buildSystemPrompt(context, channel, aionConfig.voice ?? null);

  // 7. Generate
  try {
    const { text } = await generateText({
      model: getModel('fast'),
      system: systemPrompt,
      prompt: `Write a ${channel === 'sms' ? 'text message' : 'short email'} follow-up for this deal. Reason: ${context.followUp.reason}`,
      maxOutputTokens: 200,
      temperature: 0.6,
    });

    // 8. Record usage
    await recordAionAction(workspaceId);

    return NextResponse.json({ draft: text.trim(), channel });
  } catch (err) {
    console.error('[aion/draft-follow-up] Generation error:', err);
    return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
  }
}

function buildSystemPrompt(ctx: AionDealContext, channel: 'sms' | 'email', voice: AionVoiceConfig | null): string {
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
