/**
 * Core Aion tools: voice config, memory, follow-up queue, drafting, search.
 * These form the original "follow-up skill" — the foundation of Aion's capabilities.
 */

import { generateText, tool } from 'ai';
import { getModel } from '../../lib/models';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { searchMemory } from '../../lib/embeddings';
import { envelope } from '../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../lib/substrate-counts';
import { getToneAnchor } from '../../lib/tone-anchoring';
import {
  getAionConfigForWorkspace,
  updateAionConfigForWorkspace,
  type AionConfig,
  type AionVoiceConfig,
  type AionFollowUpRule,
} from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import {
  getFollowUpQueue,
  getDealContextForAion,
  getFollowUpForDeal,
  dismissFollowUp,
  snoozeFollowUp,
  logFollowUpAction,
  type AionDealContext,
} from '@/app/(dashboard)/(features)/productions/actions/follow-up-actions';
import type { AionToolContext } from './types';

// =============================================================================
// Draft prompt builder (shared with regenerate_draft)
// =============================================================================

export function buildDraftPrompt(ctx: AionDealContext, channel: 'sms' | 'email', voice: AionVoiceConfig | null, memoryContext?: string[], vocabulary?: Array<{ from: string; to: string; count: number }>, draftingRules?: AionFollowUpRule[]): string {
  const parts: string[] = [
    'You are a follow-up message assistant for an event production company.',
    `Write a ${channel === 'sms' ? 'text message (under 60 words, casual tone)' : 'short email body (under 100 words, professional tone)'}.`,
  ];

  if (voice?.description || voice?.example_message || voice?.guardrails) {
    parts.push('', '--- How This Company Communicates ---');
    if (voice.description) parts.push(`Voice: ${voice.description}`);
    if (voice.example_message) parts.push('', 'Example of a good follow-up from this company:', voice.example_message);
    if (voice.guardrails) parts.push('', `Strict rules from the user (override all other guidance): ${voice.guardrails}`);
    parts.push('');
  }

  if (vocabulary && vocabulary.length > 0) {
    parts.push('', '--- Vocabulary (always apply) ---');
    for (const v of vocabulary) {
      parts.push(`- Say "${v.to}" instead of "${v.from}"`);
    }
  }

  if (draftingRules && draftingRules.length > 0) {
    parts.push('', '--- Follow-Up Playbook Rules (company-specific, always apply) ---');
    for (const rule of draftingRules) {
      parts.push(`- ${rule.rule}`);
    }
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
  if (ctx.client?.contact_first_name) parts.push(`Client first name: ${ctx.client.contact_first_name}`);
  if (ctx.client?.name) parts.push(`Company/client: ${ctx.client.name}`);
  if (ctx.client && ctx.client.past_deals_count > 1) parts.push(`This is a returning client (${ctx.client.past_deals_count} deals total)`);
  if (ctx.deal.title) parts.push(`Event: ${ctx.deal.title}`);
  if (ctx.deal.event_date) parts.push(`Event date: ${ctx.deal.event_date}`);
  if (ctx.deal.event_archetype) parts.push(`Event type: ${ctx.deal.event_archetype}`);
  parts.push(`Deal status: ${ctx.deal.status}`);

  if (ctx.proposal) {
    parts.push('', '--- Proposal ---');
    parts.push(`Proposal status: ${ctx.proposal.status ?? 'unknown'}`);
    if (ctx.proposal.total != null) parts.push(`Proposal total: $${ctx.proposal.total.toLocaleString()}`);
    if (ctx.proposal.view_count > 0) {
      parts.push(`Proposal views: ${ctx.proposal.view_count}`);
      if (ctx.proposal.last_viewed_at) parts.push(`Last viewed: ${ctx.proposal.last_viewed_at}`);
    }
    if (ctx.proposal.item_summary.length > 0) parts.push(`Key items: ${ctx.proposal.item_summary.join(', ')}`);
  }

  if (ctx.followUp.recent_log.length > 0) {
    parts.push('', '--- Recent Follow-Up History ---');
    for (const entry of ctx.followUp.recent_log) parts.push(`- ${entry}`);
  }

  if (memoryContext && memoryContext.length > 0) {
    parts.push('', '--- What You Know About This Client ---');
    for (const mem of memoryContext) {
      parts.push(`- ${mem}`);
    }
  }

  parts.push('', `Reason this deal needs follow-up: ${ctx.followUp.reason}`);
  return parts.join('\n');
}

// =============================================================================
// Tool definitions
// =============================================================================

export function createCoreTools(ctx: AionToolContext) {
  const { workspaceId, userId, pageContext, getConfig, refreshConfig, setConfigUpdates } = ctx;

  const save_voice_config = tool({
    description:
      'Save the user\'s communication style, example message, or guardrail rules. Call this whenever the user describes how they talk to clients, pastes an example message, or states rules.',
    inputSchema: z.object({
      description: z.string().optional().describe('How the user talks to clients — tone, style, formality'),
      example_message: z.string().optional().describe('A real follow-up message the user is proud of'),
      guardrails: z.string().optional().describe('Rules — things Aion should always or never do'),
      onboarding_complete: z.boolean().optional().describe('Set to true when the user has approved a test draft or said they are done with setup'),
    }),
    execute: async (params) => {
      const voiceUpdate: Partial<AionVoiceConfig> = {};
      if (params.description) voiceUpdate.description = params.description;
      if (params.example_message) voiceUpdate.example_message = params.example_message;
      if (params.guardrails) voiceUpdate.guardrails = params.guardrails;

      const update: Partial<AionConfig> = {};
      if (Object.keys(voiceUpdate).length > 0) update.voice = voiceUpdate as AionVoiceConfig;
      if (params.onboarding_complete) update.onboarding_state = 'complete';

      await updateAionConfigForWorkspace(workspaceId, update);
      await refreshConfig();
      setConfigUpdates(update);

      const savedFields = Object.keys(voiceUpdate);
      return { saved: true, updated_fields: savedFields, voice: getConfig().voice };
    },
  });

  const save_memory = tool({
    description:
      'Remember a learned fact about this workspace or user. Use "vocabulary" for word substitutions ("say confirm not lock in"), "pattern" for behavioral rules ("for corporate clients, always mention the PO number"), and "fact" for episodic knowledge about clients or deals ("Sarah prefers email", "Johnson always pays late"). Set personal=true for facts that only apply to the current user (their preferences, their clients, their habits).',
    inputSchema: z.object({
      scope: z.enum(['vocabulary', 'pattern', 'fact']).describe('Type of memory: vocabulary (word subs), pattern (behavioral rules), fact (episodic knowledge about clients/deals)'),
      fact: z.string().describe('The fact, pattern, or description to remember'),
      personal: z.boolean().optional().describe('If true, this memory is scoped to the current user only. Default false = workspace-wide.'),
      entity_id: z.string().optional().describe('Entity ID this memory is about — a specific person, company, or venue. Search for the entity first to get their ID.'),
      vocabulary_from: z.string().optional().describe('For vocabulary scope: the word/phrase to replace'),
      vocabulary_to: z.string().optional().describe('For vocabulary scope: the replacement word/phrase'),
    }),
    execute: async (params) => {
      if (params.scope === 'fact') {
        try {
          const { getSystemClient } = await import('@/shared/api/supabase/system');
          const system = getSystemClient();
          await system.schema('cortex').rpc('save_aion_memory', {
            p_workspace_id: workspaceId,
            p_scope: 'episodic',
            p_fact: params.fact,
            p_source: 'aion_chat',
            // RPC signature expects `undefined` not `null` for the optional params
            p_user_id: params.personal ? userId : undefined,
            p_entity_id: params.entity_id ?? undefined,
          });
        } catch (err) {
          console.error('[aion/chat] Failed to save episodic memory:', err);
        }
        return { saved: true, fact: params.fact, scope: 'episodic', personal: params.personal ?? false };
      }

      const current = getConfig().learned ?? {};

      if (params.scope === 'vocabulary' && params.vocabulary_from && params.vocabulary_to) {
        const vocab = current.vocabulary ?? [];
        const existing = vocab.find((v) => v.from === params.vocabulary_from);
        if (existing) {
          existing.to = params.vocabulary_to!;
          existing.count += 1;
        } else {
          vocab.push({ from: params.vocabulary_from!, to: params.vocabulary_to!, count: 1 });
        }
        await updateAionConfigForWorkspace(workspaceId, { learned: { ...current, vocabulary: vocab } });
      } else if (params.scope === 'pattern') {
        const patterns = current.patterns ?? [];
        if (!patterns.includes(params.fact)) {
          patterns.push(params.fact);
        }
        await updateAionConfigForWorkspace(workspaceId, { learned: { ...current, patterns } });
      }

      await refreshConfig();
      return { saved: true, fact: params.fact, scope: params.scope };
    },
  });

  const save_follow_up_rule = tool({
    description:
      'Save a follow-up rule the user has taught you about their company\'s follow-up process. ' +
      'Categories: "timing" (when to follow up, how long to wait between touches), ' +
      '"channel" (sms vs email vs call preferences, per event type or client type), ' +
      '"drafting" (what to include/exclude in follow-up messages, tone per context), ' +
      '"backoff" (when to stop following up, max attempts, cooling off periods), ' +
      '"scheduling" (blocked days/times, preferred send windows). ' +
      'Call this whenever the user describes their follow-up process, timing, or preferences. ' +
      'Always ask WHY before saving — the rationale helps apply the rule correctly in edge cases.',
    inputSchema: z.object({
      category: z.enum(['timing', 'channel', 'drafting', 'backoff', 'scheduling']).describe('Rule category'),
      rule: z.string().describe('The rule in natural language, as the user described it'),
      rationale: z.string().optional().describe('Why the user follows this rule — ask them if they did not volunteer it'),
      event_type: z.string().optional().describe('Applies only to this event type: wedding, corporate, festival, etc.'),
      client_type: z.string().optional().describe('Applies only to: returning, new, vip'),
      deal_stage: z.string().optional().describe('Applies only to: inquiry, proposal, contract_sent'),
      signal: z.string().optional().describe('Applies when a specific signal is present: hot_lead, stalled, deadline_close'),
      days: z.number().optional().describe('Number of days (for timing/backoff rules)'),
      channel: z.enum(['sms', 'email', 'call']).optional().describe('Preferred channel (for channel rules)'),
      max_attempts: z.number().optional().describe('Max follow-up attempts before stopping (for backoff rules)'),
      blocked_days: z.array(z.string()).optional().describe('Days to never follow up: sunday, saturday, etc.'),
    }),
    execute: async (params) => {
      const playbook = getConfig().follow_up_playbook ?? { rules: [], version: 0 };

      const newRule: AionFollowUpRule = {
        id: crypto.randomUUID(),
        category: params.category,
        rule: params.rule,
        rationale: params.rationale,
        conditions: (params.event_type || params.client_type || params.deal_stage || params.signal) ? {
          event_type: params.event_type,
          client_type: params.client_type,
          deal_stage: params.deal_stage,
          signal: params.signal,
        } : undefined,
        structured: (params.days != null || params.channel || params.max_attempts || params.blocked_days) ? {
          days: params.days,
          channel: params.channel,
          max_attempts: params.max_attempts,
          blocked_days: params.blocked_days,
        } : undefined,
        created_at: new Date().toISOString(),
        source: 'aion_chat',
      };

      const updatedRules = [...playbook.rules, newRule];
      await updateAionConfigForWorkspace(workspaceId, {
        follow_up_playbook: { rules: updatedRules, version: playbook.version + 1 },
      });
      await refreshConfig();

      return {
        saved: true,
        rule: newRule,
        total_rules: updatedRules.length,
        category: params.category,
      };
    },
  });

  const delete_follow_up_rule = tool({
    description:
      'Remove a follow-up rule. Use when the user says "forget that rule", "remove the Sunday rule", or "that\'s no longer how we do it".',
    inputSchema: z.object({
      rule_id: z.string().optional().describe('The rule ID to remove, if known'),
      description: z.string().optional().describe('Natural language description of the rule to find and remove'),
    }),
    execute: async (params) => {
      const playbook = getConfig().follow_up_playbook ?? { rules: [], version: 0 };
      if (playbook.rules.length === 0) return { removed: false, reason: 'No rules configured.' };

      let ruleToRemove: AionFollowUpRule | undefined;

      if (params.rule_id) {
        ruleToRemove = playbook.rules.find((r) => r.id === params.rule_id);
      } else if (params.description) {
        // Fuzzy match: find the rule whose text most closely matches
        const desc = params.description.toLowerCase();
        ruleToRemove = playbook.rules.find((r) =>
          r.rule.toLowerCase().includes(desc) || desc.includes(r.rule.toLowerCase())
        );
      }

      if (!ruleToRemove) return { removed: false, reason: 'Could not find a matching rule.', existing_rules: playbook.rules.map((r) => ({ id: r.id, category: r.category, rule: r.rule })) };

      const updatedRules = playbook.rules.filter((r) => r.id !== ruleToRemove!.id);
      await updateAionConfigForWorkspace(workspaceId, {
        follow_up_playbook: { rules: updatedRules, version: playbook.version + 1 },
      });
      await refreshConfig();

      return { removed: true, rule: ruleToRemove.rule, remaining: updatedRules.length };
    },
  });

  const get_follow_up_queue = tool({
    description:
      'Get the list of deals that need follow-up attention. Call this when the user asks what needs attention, what deals are pending, or wants to see their queue.',
    inputSchema: z.object({}),
    execute: async () => {
      const queue = await getFollowUpQueue();
      const items = queue.slice(0, 5).map((item) => ({
        dealId: item.deal_id,
        dealTitle: (item.context_snapshot as any)?.deal_title ?? 'Untitled deal',
        reason: item.reason,
        priority: item.priority_score,
      }));
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(items, searched, {
        reason: items.length === 0 ? 'no_follow_up_queue' : 'has_data',
      });
    },
  });

  const draft_follow_up = tool({
    description:
      'Generate a follow-up draft message for a specific deal. If no dealId is provided, drafts for the highest-priority deal in the queue.',
    inputSchema: z.object({
      dealId: z.string().optional().describe('The deal ID to draft for. Omit to use the top-priority deal.'),
    }),
    execute: async (params) => {
      let targetDealId = params.dealId;
      // Fall back to page context if viewing a deal
      if (!targetDealId && (pageContext?.type === 'deal' || pageContext?.type === 'proposal')) {
        targetDealId = pageContext.entityId ?? undefined;
      }
      let queueItem = null;

      if (!targetDealId) {
        const queue = await getFollowUpQueue();
        if (queue.length === 0) return { error: 'No deals in the follow-up queue.' };
        queueItem = queue[0];
        targetDealId = queueItem.deal_id;
      } else {
        queueItem = await getFollowUpForDeal(targetDealId);
      }

      const dealContext = await getDealContextForAion(
        targetDealId,
        queueItem ?? { reason: 'Requested by user', reason_type: 'manual', suggested_channel: 'sms' } as any,
      );
      if (!dealContext) return { error: 'Could not load deal context.' };

      // Enrich draft with semantic search and entity memories
      let memoryContext: string[] = [];
      try {
        if (dealContext.entityIds.length > 0) {
          const [searchResults, entityMemories] = await Promise.all([
            searchMemory(workspaceId, `${dealContext.deal.title ?? ''} ${dealContext.client?.name ?? ''} follow-up`.trim(), {
              entityIds: dealContext.entityIds,
              sourceTypes: ['deal_note', 'follow_up'],
              limit: 3,
              threshold: 0.35,
            }).catch(() => []),
            // Query episodic memories about these entities
            (async () => {
              const supabase = await createClient();
              const { data } = await supabase
                .schema('cortex')
                .from('aion_memory')
                .select('fact')
                .eq('workspace_id', workspaceId)
                .in('entity_id', dealContext.entityIds)
                .order('updated_at', { ascending: false })
                .limit(5);
              return (data as any[] | null)?.map((r: any) => r.fact) ?? [];
            })().catch(() => []),
          ]);

          memoryContext = [
            ...searchResults.map((r) => r.content.slice(0, 200)),
            ...entityMemories,
          ];
        }
      } catch {
        // Non-blocking — drafts work without memory enrichment
      }

      // Apply playbook channel and drafting rules
      const config = getConfig();
      const playbookRules = config.follow_up_playbook?.rules ?? [];
      let channel: 'sms' | 'email' = dealContext.followUp.suggested_channel === 'email' ? 'email' : 'sms';

      // Channel rules from playbook (entity prefs already in memoryContext)
      const channelRule = playbookRules.find((r) => {
        if (r.category !== 'channel' || !r.structured?.channel) return false;
        if (r.conditions?.event_type && dealContext.deal.event_archetype &&
            !dealContext.deal.event_archetype.toLowerCase().includes(r.conditions.event_type.toLowerCase())) return false;
        if (r.conditions?.deal_stage && r.conditions.deal_stage !== dealContext.deal.status) return false;
        return true;
      });
      if (channelRule?.structured?.channel === 'sms' || channelRule?.structured?.channel === 'email') {
        channel = channelRule.structured.channel;
      }

      // Filter drafting rules that apply to this deal context
      const draftingRules = playbookRules.filter((r) => {
        if (r.category !== 'drafting') return false;
        if (r.conditions?.event_type && dealContext.deal.event_archetype &&
            !dealContext.deal.event_archetype.toLowerCase().includes(r.conditions.event_type.toLowerCase())) return false;
        if (r.conditions?.client_type === 'returning' && (dealContext.client?.past_deals_count ?? 0) <= 1) return false;
        if (r.conditions?.client_type === 'new' && (dealContext.client?.past_deals_count ?? 0) > 1) return false;
        if (r.conditions?.deal_stage && r.conditions.deal_stage !== dealContext.deal.status) return false;
        return true;
      });

      const draftPrompt = buildDraftPrompt(dealContext, channel, config.voice ?? null, memoryContext, config.learned?.vocabulary, draftingRules);

      // §3.4 U3 tone anchoring — prepend the user's observed sent-style.
      // dealContext.entityIds is ordered [organization_id, main_contact_id,
      // venue_id] (filtered to non-null); the first non-null id is the
      // recipient to probe. If that id has <3 outbound samples, getToneAnchor
      // falls back to workspace-wide, then to a default-voice preamble that
      // flags the absence honestly.
      const toneRecipient = dealContext.entityIds[0] ?? null;
      const toneAnchor = await getToneAnchor(workspaceId, toneRecipient);
      const systemPrompt = `${toneAnchor.preamble}\n\n---\n\n${draftPrompt}`;

      const { text: draftText } = await generateText({
        model: getModel('fast'),
        system: systemPrompt,
        prompt: `Write a ${channel === 'sms' ? 'text message' : 'short email'} follow-up for this deal. Reason: ${dealContext.followUp.reason}`,
        maxOutputTokens: 200,
        temperature: 0.6,
      });

      return {
        draft: draftText.trim(),
        dealId: targetDealId,
        dealTitle: dealContext.deal.title ?? 'Untitled deal',
        channel,
        toneTier: toneAnchor.tier,
        toneSamples: toneAnchor.samples,
      };
    },
  });

  const regenerate_draft = tool({
    description:
      'Regenerate a follow-up draft with user feedback applied. Call when the user says "too formal", "shorter", "longer", "say X not Y", or gives other feedback on a draft.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID to regenerate for'),
      feedback: z.string().describe('The user feedback to apply'),
    }),
    execute: async (params) => {
      const queueItem = await getFollowUpForDeal(params.dealId);
      const dealContext = await getDealContextForAion(
        params.dealId,
        queueItem ?? { reason: 'Requested by user', reason_type: 'manual', suggested_channel: 'sms' } as any,
      );
      if (!dealContext) return { error: 'Could not load deal context.' };

      // Enrich draft with semantic search and entity memories
      let memoryContext: string[] = [];
      try {
        if (dealContext.entityIds.length > 0) {
          const [searchResults, entityMemories] = await Promise.all([
            searchMemory(workspaceId, `${dealContext.deal.title ?? ''} ${dealContext.client?.name ?? ''} follow-up`.trim(), {
              entityIds: dealContext.entityIds,
              sourceTypes: ['deal_note', 'follow_up'],
              limit: 3,
              threshold: 0.35,
            }).catch(() => []),
            (async () => {
              const supabase = await createClient();
              const { data } = await supabase
                .schema('cortex')
                .from('aion_memory')
                .select('fact')
                .eq('workspace_id', workspaceId)
                .in('entity_id', dealContext.entityIds)
                .order('updated_at', { ascending: false })
                .limit(5);
              return (data as any[] | null)?.map((r: any) => r.fact) ?? [];
            })().catch(() => []),
          ]);

          memoryContext = [
            ...searchResults.map((r) => r.content.slice(0, 200)),
            ...entityMemories,
          ];
        }
      } catch {
        // Non-blocking — drafts work without memory enrichment
      }

      // Apply playbook channel and drafting rules
      const regenConfig = getConfig();
      const regenPlaybookRules = regenConfig.follow_up_playbook?.rules ?? [];
      let channel: 'sms' | 'email' = dealContext.followUp.suggested_channel === 'email' ? 'email' : 'sms';

      const regenChannelRule = regenPlaybookRules.find((r) => {
        if (r.category !== 'channel' || !r.structured?.channel) return false;
        if (r.conditions?.event_type && dealContext.deal.event_archetype &&
            !dealContext.deal.event_archetype.toLowerCase().includes(r.conditions.event_type.toLowerCase())) return false;
        if (r.conditions?.deal_stage && r.conditions.deal_stage !== dealContext.deal.status) return false;
        return true;
      });
      if (regenChannelRule?.structured?.channel === 'sms' || regenChannelRule?.structured?.channel === 'email') {
        channel = regenChannelRule.structured.channel;
      }

      const regenDraftingRules = regenPlaybookRules.filter((r) => {
        if (r.category !== 'drafting') return false;
        if (r.conditions?.event_type && dealContext.deal.event_archetype &&
            !dealContext.deal.event_archetype.toLowerCase().includes(r.conditions.event_type.toLowerCase())) return false;
        if (r.conditions?.client_type === 'returning' && (dealContext.client?.past_deals_count ?? 0) <= 1) return false;
        if (r.conditions?.client_type === 'new' && (dealContext.client?.past_deals_count ?? 0) > 1) return false;
        if (r.conditions?.deal_stage && r.conditions.deal_stage !== dealContext.deal.status) return false;
        return true;
      });

      const draftPrompt = buildDraftPrompt(dealContext, channel, regenConfig.voice ?? null, memoryContext, regenConfig.learned?.vocabulary, regenDraftingRules)
        + `\n\nUser feedback on previous draft: ${params.feedback}\nApply this feedback to the new draft.`;

      const { text: draftText } = await generateText({
        model: getModel('fast'),
        system: draftPrompt,
        prompt: 'Rewrite the follow-up message incorporating the feedback.',
        maxOutputTokens: 200,
        temperature: 0.6,
      });

      return { draft: draftText.trim(), dealId: params.dealId, dealTitle: dealContext.deal.title ?? 'Untitled deal', channel };
    },
  });

  const log_follow_up_action_tool = tool({
    description:
      'Record that the user contacted a client or took an action on a deal.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID'),
      actionType: z.string().describe('Type of action: call_logged, sms_sent, email_sent, meeting_scheduled, other'),
      channel: z.string().describe('Communication channel: call, sms, email, in_person'),
      summary: z.string().optional().describe('Brief summary of what happened'),
    }),
    execute: async (params) => {
      const result = await logFollowUpAction(params.dealId, params.actionType, params.channel, params.summary);
      return { logged: result.success };
    },
  });

  const dismiss_follow_up_tool = tool({
    description: 'Dismiss a deal from the follow-up queue.',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID to dismiss'),
    }),
    execute: async (params) => {
      const queueItem = await getFollowUpForDeal(params.dealId);
      if (!queueItem) return { dismissed: false, reason: 'No pending queue item for this deal.' };
      const result = await dismissFollowUp(queueItem.id);
      return { dismissed: result.success, dealId: params.dealId };
    },
  });

  const snooze_follow_up = tool({
    description: 'Snooze a deal in the follow-up queue for a number of days. Use when the user says "remind me later", "snooze this", or "come back to this in X days".',
    inputSchema: z.object({
      dealId: z.string().describe('The deal ID to snooze'),
      days: z.number().optional().describe('Number of days to snooze, default 3'),
    }),
    execute: async (params) => {
      const queueItem = await getFollowUpForDeal(params.dealId);
      if (!queueItem) return { snoozed: false, reason: 'No pending queue item for this deal.' };
      const result = await snoozeFollowUp(queueItem.id, params.days ?? 3);
      return { snoozed: result.success, dealId: params.dealId, days: params.days ?? 3 };
    },
  });

  const get_current_config = tool({
    description: 'Retrieve the current voice configuration and learned rules.',
    inputSchema: z.object({}),
    execute: async () => {
      const config = getConfig();
      const rules: string[] = [];
      const voice = config.voice;
      if (voice?.description) rules.push(`Voice: ${voice.description}`);
      if (voice?.example_message) {
        const preview = voice.example_message.length > 80 ? voice.example_message.slice(0, 80) + '...' : voice.example_message;
        rules.push(`Example on file: "${preview}"`);
      }
      if (voice?.guardrails) rules.push(`Rules: ${voice.guardrails}`);

      const learned = config.learned;
      if (learned?.vocabulary?.length) {
        for (const sub of learned.vocabulary) rules.push(`Say "${sub.to}" instead of "${sub.from}"`);
      }
      if (learned?.patterns?.length) {
        for (const pattern of learned.patterns) rules.push(pattern);
      }

      const playbook = config.follow_up_playbook;
      if (playbook?.rules?.length) {
        rules.push('--- Follow-up playbook ---');
        const categories = ['timing', 'channel', 'drafting', 'backoff', 'scheduling'] as const;
        for (const cat of categories) {
          const catRules = playbook.rules.filter((r) => r.category === cat);
          if (catRules.length === 0) continue;
          rules.push(`${cat}:`);
          for (const r of catRules) {
            const condStr = r.conditions ? ` [${Object.entries(r.conditions).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join(', ')}]` : '';
            rules.push(`  - ${r.rule}${condStr}`);
            if (r.rationale) rules.push(`    Why: ${r.rationale}`);
          }
        }
      }

      try {
        const supabase = await createClient();
        // Workspace-wide memories (user_id IS NULL)
        const { data: wsMemories } = await supabase
          .schema('cortex').from('aion_memory').select('fact')
          .eq('workspace_id', workspaceId).eq('scope', 'episodic')
          .is('user_id', null)
          .order('updated_at', { ascending: false }).limit(10);
        if (wsMemories?.length) {
          rules.push('--- Workspace memories ---');
          for (const m of wsMemories as Array<{ fact: string }>) rules.push(m.fact);
        }
        // User-specific memories
        const { data: userMemories } = await supabase
          .schema('cortex').from('aion_memory').select('fact')
          .eq('workspace_id', workspaceId).eq('scope', 'episodic')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false }).limit(10);
        if (userMemories?.length) {
          rules.push('--- Your personal memories ---');
          for (const m of userMemories as Array<{ fact: string }>) rules.push(m.fact);
        }
      } catch { /* cortex.aion_memory may not exist yet */ }

      const searched = await getSubstrateCounts(workspaceId);
      const hasConfig = Boolean(config.voice?.description) || rules.length > 0;
      return envelope({ voice: config.voice, learned: config.learned, rules }, searched, {
        reason: hasConfig ? 'has_data' : 'no_config_yet',
      });
    },
  });

  return {
    save_voice_config,
    save_memory,
    save_follow_up_rule,
    delete_follow_up_rule,
    get_follow_up_queue,
    draft_follow_up,
    regenerate_draft,
    log_follow_up_action: log_follow_up_action_tool,
    dismiss_follow_up: dismiss_follow_up_tool,
    snooze_follow_up,
    get_current_config,
  };
}
