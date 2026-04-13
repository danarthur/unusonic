/**
 * Aion Conversational Chat Route — Tool-Calling Architecture
 *
 * POST /api/aion/chat
 * Body: { messages: AionChatMessage[], workspaceId: string }
 *
 * Thin orchestrator: auth, config, system prompt, tool assembly, generateText, response building.
 * Tool definitions live in ./tools/ modules.
 *
 * Returns: AionChatResponse { messages, configUpdates? }
 */

import { NextResponse } from 'next/server';
import { streamText, stepCountIs } from 'ai';
import { getModel, selectModelTier, classifyIntent, type RouterInput, type Intent } from '../lib/models';
import { logRoutingDecision } from '../lib/routing-logger';
import { prepareConversationHistory, estimateTokens } from '../lib/summarize';
import { createClient } from '@/shared/api/supabase/server';
import { canExecuteAionAction, recordAionAction } from '@/features/intelligence/lib/aion-gate';
import {
  getAionConfigForWorkspace,
  type AionConfig,
} from '@/app/(dashboard)/(features)/brain/actions/aion-config-actions';
import {
  getOnboardingState,
  type AionChatRequest,
  type AionChatResponse,
  type AionMessageContent,
  type AionPageContext,
  type SuggestionChip,
  type OnboardingState,
} from '@/app/(dashboard)/(features)/brain/lib/aion-chat-types';
import { getFollowUpQueue } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { getDealPipeline } from '@/widgets/dashboard/api/get-deal-pipeline';
import { getFinancialPulse } from '@/widgets/dashboard/api/get-financial-pulse';
import { createCoreTools } from './tools/core';
import { createKnowledgeTools } from './tools/knowledge';
import { createActionTools } from './tools/actions';
import { createEntityTools } from './tools/entity';
import { createProductionTools } from './tools/production';
import type { AionToolContext } from './tools/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

// =============================================================================
// Per-user rate limiting (in-memory sliding window)
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(userId, recent);
    return false;
  }
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return true;
}

// =============================================================================
// Intent-based tool filtering — only load tools relevant to the user's intent
// =============================================================================

function buildToolsForIntent(
  intent: Intent,
  toolCtx: AionToolContext,
  canWrite: boolean,
  pageType: string | null,
): Record<string, any> {
  // Always include core (voice config, memory, follow-ups, drafts) + knowledge (read-only lookups)
  const core = createCoreTools(toolCtx);
  const knowledge = createKnowledgeTools(toolCtx);

  switch (intent) {
    // Lightweight intents — core + knowledge only (no write/entity/production tools)
    case 'greeting':
    case 'rejection':
    case 'conversational':
    case 'simple_lookup':
      return { ...core, ...knowledge };

    // Draft requests — core has draft_follow_up + regenerate_draft, knowledge for context
    case 'draft_request':
      return { ...core, ...knowledge };

    // Config/teaching — core only (save_voice_config, save_memory, save_follow_up_rule)
    case 'config':
      return { ...core };

    // Write actions — need action + entity tools, plus knowledge for context lookups
    case 'write_action':
    case 'confirmation': {
      const actions = createActionTools(toolCtx);
      const entity = createEntityTools(toolCtx);
      // Include production tools when on a deal/event page
      if (pageType === 'deal' || pageType === 'event') {
        const production = createProductionTools(toolCtx);
        return { ...core, ...knowledge, ...actions, ...entity, ...production };
      }
      return { ...core, ...knowledge, ...actions, ...entity };
    }

    // Multi-step, analysis, strategic — full tool set
    case 'multi_step':
    case 'analysis':
    case 'strategic':
      return {
        ...core,
        ...knowledge,
        ...createActionTools(toolCtx),
        ...createEntityTools(toolCtx),
        ...createProductionTools(toolCtx),
      };

    default:
      return { ...core, ...knowledge };
  }
}

// =============================================================================
// Route handler
// =============================================================================

export async function POST(req: Request) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1b. Per-user rate limit
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Too many requests. Wait a moment.' },
      { status: 429, headers: { 'Retry-After': '10' } },
    );
  }

  // 2. Parse body
  let body: AionChatRequest;
  try {
    body = await req.json();
    if (!body.workspaceId || !Array.isArray(body.messages)) {
      throw new Error('Missing fields');
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { messages, workspaceId, pageContext, modelMode } = body;

  // 3. Tier gate
  const gate = await canExecuteAionAction(workspaceId, 'active');
  if (!gate.allowed) {
    const reason =
      gate.reason === 'aion_action_limit_reached'
        ? 'You have reached your monthly Aion action limit. Upgrade to continue.'
        : 'Upgrade your plan to use the Aion chat.';
    return NextResponse.json(respondText(reason));
  }

  // 4. Load workspace config + name + role
  let aionConfig = await getAionConfigForWorkspace(workspaceId);
  if (aionConfig.kill_switch) {
    return NextResponse.json(
      respondText('Aion is paused for this workspace. Resume it to continue.'),
    );
  }

  const workspaceName = await getWorkspaceName(workspaceId);
  const { getUserRole } = await import('@/shared/lib/permissions');
  const userRole = await getUserRole(user.id, workspaceId);
  const canWrite = userRole === 'owner' || userRole === 'admin' || userRole === 'member';
  const userName = user.user_metadata?.full_name ?? 'Unknown';

  // 5. Determine onboarding state
  const onboardingState = getOnboardingState(aionConfig);

  // 6. Handle init (empty conversation) — return greeting
  if (messages.length === 0) {
    const greeting = await buildGreeting(onboardingState, user.user_metadata?.full_name ?? null, workspaceId, pageContext);
    return NextResponse.json(greeting);
  }

  // 7. Build system prompt with workspace context + user identity
  const wsSnapshot = await getWorkspaceSnapshot(workspaceId);
  const userMemories = await getUserMemories(workspaceId, user.id);
  const systemPrompt = buildSystemPrompt(aionConfig, onboardingState, workspaceName, wsSnapshot, userName, userRole ?? 'viewer', userMemories, pageContext);

  // 8. Build the message history (with rolling summarization for long conversations)
  const allMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  // Load existing session summary for continuity
  let existingSummary: string | null = null;
  if (body.sessionId) {
    try {
      const { data: session } = await supabase
        .schema('cortex')
        .from('aion_sessions')
        .select('conversation_summary')
        .eq('id', body.sessionId)
        .maybeSingle();
      existingSummary = session?.conversation_summary ?? null;
    } catch {}
  }

  const { summary, recentMessages, didSummarize } = await prepareConversationHistory(allMessages, existingSummary);

  // Persist summary after summarization (fire-and-forget)
  if (didSummarize && summary && body.sessionId) {
    const sessionId = body.sessionId; // capture for the async closure (TS can't narrow across closure boundaries)
    (async () => {
      try {
        const { getSystemClient } = await import('@/shared/api/supabase/system');
        const system = getSystemClient();
        await system.schema('cortex').rpc('update_aion_session_summary', {
          p_session_id: sessionId,
          p_summary: summary,
          p_summarized_up_to: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[aion] Failed to persist session summary:', err);
      }
    })();
  }

  // Prepend summary as context if available
  const llmMessages = [
    ...(summary ? [{ role: 'user' as const, content: `[Previous conversation summary]\n${summary}` }, { role: 'assistant' as const, content: 'Understood. I have context from our earlier conversation.' }] : []),
    ...recentMessages,
  ];

  // 9. Assemble tools from modules
  let configUpdates: Partial<AionConfig> | undefined;

  const toolCtx: AionToolContext = {
    workspaceId,
    userId: user.id,
    userName,
    userRole: userRole ?? 'viewer',
    pageContext: pageContext ?? null,
    getConfig: () => aionConfig,
    refreshConfig: async () => { aionConfig = await getAionConfigForWorkspace(workspaceId); },
    canWrite,
    setConfigUpdates: (u) => { configUpdates = u; },
  };

  // 10. Classify intent + select model tier
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
  const recentContext = messages.slice(-4).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  const intent = classifyIntent(lastUserMessage.trim(), recentContext);

  // 10a. Build only the tool sets needed for this intent (saves ~3k tokens on simple queries)
  const toolSets = buildToolsForIntent(intent, toolCtx, canWrite, pageContext?.type ?? null);

  const routerInput: RouterInput = {
    message: lastUserMessage,
    messageCount: messages.length,
    toolCount: Object.keys(toolSets).length,
    previousMessages: recentContext,
    pageType: pageContext?.type ?? null,
    userRole: userRole ?? 'viewer',
    canWrite,
  };

  // 10b. Apply model mode override
  let modelTier = selectModelTier(routerInput);
  const isThinking = modelMode === 'thinking';
  if (modelMode === 'fast') {
    modelTier = 'fast';
  } else if (isThinking) {
    // Thinking mode: at least standard, prefer heavy for complex intents
    if (modelTier === 'fast') modelTier = 'standard';
  }

  // 10c. Log routing decision for analysis
  const logOutcome = logRoutingDecision({
    tier: modelTier,
    intent,
    messageLength: lastUserMessage.length,
    messageCount: messages.length,
    pageType: pageContext?.type ?? null,
    userRole: userRole ?? 'viewer',
    canWrite,
    workspaceId,
  });

  // 11. Stream response with tool-calling loop
  try {
    const allTools = toolSets;
    const result = streamText({
      model: getModel(modelTier),
      system: {
        role: 'system',
        content: systemPrompt,
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
            ...(isThinking ? { thinking: { type: 'enabled', budgetTokens: 10000 } } : {}),
          },
        },
      },
      messages: llmMessages,
      tools: allTools,
      toolChoice: 'auto',
      stopWhen: stepCountIs(10),
      maxOutputTokens: isThinking ? 4000 : 1500,
      ...(isThinking ? {} : { temperature: 0.6 }),
    });

    const encoder = new TextEncoder();
    const toolsCalled: string[] = [];
    const collectedText: string[] = [];
    const collectedToolResults: Array<{ toolName: string; output: any }> = [];
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Emit model tier so client can display it
          controller.enqueue(encoder.encode(`model:${modelTier}\n`));

          // Stream text deltas + tool call events via fullStream
          for await (const part of result.fullStream) {
            if (part.type === 'reasoning-delta') {
              // Extended thinking content — stream to client
              controller.enqueue(encoder.encode(`thinking:${(part as any).text ?? ''}\n`));
            } else if (part.type === 'text-delta') {
              const delta = (part as any).text ?? (part as any).delta ?? '';
              collectedText.push(delta);
              controller.enqueue(encoder.encode(`text:${delta}\n`));
            } else if (part.type === 'tool-call') {
              toolsCalled.push(part.toolName);
              const label = part.toolName.replace(/_/g, ' ');
              controller.enqueue(encoder.encode(`tool:${label}\n`));
            } else if (part.type === 'tool-result') {
              collectedToolResults.push({ toolName: (part as any).toolName, output: (part as any).output });
            }
          }

          await recordAionAction(workspaceId);

          // Token accounting (observability)
          const toolResultTokens = collectedToolResults.reduce(
            (sum, tr) => sum + Math.ceil(JSON.stringify(tr.output ?? {}).length / 4) + 10, 0,
          );
          const systemTokens = Math.ceil(systemPrompt.length / 4) + 10;
          const historyTokens = estimateTokens(llmMessages);
          const totalEstimate = systemTokens + historyTokens + toolResultTokens;
          if (totalEstimate > 10000) {
            console.warn(`[aion/chat] Token budget warning: ~${totalEstimate} (system: ${systemTokens}, history: ${historyTokens}, tools: ${toolResultTokens})`);
          }

          // Build structured response from collected stream data
          const finalText = collectedText.join('');
          const structuredResponse = buildResponseFromResult(
            { text: finalText, steps: [{ toolResults: collectedToolResults }] },
            configUpdates,
          );

          // Filter out text blocks (already streamed) and send structured blocks
          const blocks = structuredResponse.messages.filter(m => m.type !== 'text');
          controller.enqueue(encoder.encode(
            `structured:${JSON.stringify({ blocks, configUpdates: structuredResponse.configUpdates })}\n`
          ));

          // Log routing outcome
          logOutcome({ toolsCalled, success: true, durationMs: 0 });
        } catch (err) {
          console.error('[aion/chat] Stream error:', err);
          controller.enqueue(encoder.encode(`error:I had trouble processing that. Try again in a moment.\n`));
          logOutcome({ toolsCalled, success: false, durationMs: 0 });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[aion/chat] Generation error:', err);
    return NextResponse.json(
      respondText('I had trouble processing that. Try again in a moment.'),
    );
  }
}

// =============================================================================
// Response builder
// =============================================================================

function buildResponseFromResult(
  result: { text: string; steps: Array<{ toolResults: Array<{ toolName: string; output: any }> }> },
  configUpdates: Partial<AionConfig> | undefined,
): AionChatResponse {
  const msgs: AionMessageContent[] = [];

  if (result.text) {
    const { text, chips } = extractChips(result.text);
    if (text) msgs.push({ type: 'text', text });
    if (chips.length > 0) msgs.push({ type: 'suggestions', text: '', chips });
  }

  for (const step of result.steps) {
    for (const tr of step.toolResults) {
      const data = (tr.output ?? {}) as Record<string, any>;
      if (!data || data.error) continue;
      switch (tr.toolName) {
        case 'get_follow_up_queue':
          if (data.items?.length > 0) msgs.push({ type: 'follow_up_queue', text: '', items: data.items });
          break;
        case 'draft_follow_up':
        case 'regenerate_draft':
          if (data.draft) msgs.push({ type: 'draft_preview', text: '', draft: data.draft, dealId: data.dealId, dealTitle: data.dealTitle, channel: data.channel ?? 'sms' });
          break;
        case 'get_current_config':
          if (data.rules?.length > 0) msgs.push({ type: 'learned_summary', text: '', rules: data.rules });
          break;

        // ── Data visualization cards ──────────────────────────────
        case 'get_revenue_summary': {
          const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;
          const delta = data.revenueDelta ?? 0;
          msgs.push({
            type: 'scorecard', text: '', title: 'Financial Pulse',
            metrics: [
              { label: 'Revenue this month', value: fmt(data.revenueThisMonth ?? 0), detail: `${delta >= 0 ? '+' : ''}${Math.round(delta)}% vs last month`, trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' },
              { label: 'Revenue last month', value: fmt(data.revenueLastMonth ?? 0) },
              { label: 'Outstanding', value: fmt(data.outstandingTotal ?? 0), detail: `${data.outstandingCount ?? 0} proposals` },
              { label: 'Overdue', value: fmt(data.overdueTotal ?? 0), detail: `${data.overdueCount ?? 0} proposals`, trend: (data.overdueCount ?? 0) > 0 ? 'down' : 'flat' },
            ],
          });
          break;
        }
        case 'get_pipeline_summary': {
          const stages = data.stages as Array<{ label: string; count: number; totalValue: number }> | undefined;
          if (stages?.length) {
            msgs.push({
              type: 'chart', text: '', title: 'Deal Pipeline',
              chartType: 'bar',
              data: stages.map((s) => ({ label: s.label, value: s.count })),
            });
          }
          break;
        }
        case 'get_revenue_trend': {
          const months = data.months as Array<{ label: string; revenue: number }> | undefined;
          if (months?.length) {
            msgs.push({
              type: 'chart', text: '', title: 'Revenue Trend (6 months)',
              chartType: 'line',
              data: months.map((m) => ({ label: m.label, value: Math.round(m.revenue / 100) })),
              valuePrefix: '$',
            });
          }
          break;
        }
        case 'get_client_concentration': {
          const clients = data.clients as Array<{ name: string; revenue: number; percentage: number }> | undefined;
          if (clients?.length) {
            msgs.push({
              type: 'chart', text: '', title: 'Revenue by Client',
              chartType: 'donut',
              data: clients.map((c) => ({ label: c.name, value: Math.round(c.revenue / 100) })),
              valuePrefix: '$',
            });
          }
          break;
        }
        case 'get_client_insights': {
          msgs.push({
            type: 'scorecard', text: '', title: 'Client Insights',
            metrics: [
              { label: 'Total deals', value: String(data.totalDeals ?? 0) },
              { label: 'Win rate', value: `${data.winRate ?? 0}%`, trend: (data.winRate ?? 0) >= 50 ? 'up' : 'down' },
              { label: 'Avg deal size', value: `$${(data.avgDealSize ?? 0).toLocaleString()}` },
              { label: 'Outstanding', value: `$${Math.round((data.outstandingBalance ?? 0) / 100).toLocaleString()}`, detail: `${data.openInvoiceCount ?? 0} invoices` },
            ],
          });
          break;
        }
      }
    }
  }

  return { messages: msgs, configUpdates };
}

// =============================================================================
// System prompt builder
// =============================================================================

function buildSystemPrompt(config: AionConfig, onboardingState: OnboardingState, workspaceName?: string, snapshot?: WorkspaceSnapshot, userName?: string, userRole?: string, userMemories?: string[], pageContext?: AionPageContext): string {
  const voice = config.voice;
  const learned = config.learned;
  const vocabCount = learned?.vocabulary?.length ?? 0;
  const patternCount = learned?.patterns?.length ?? 0;
  const wsLabel = workspaceName && workspaceName !== 'your workspace' ? workspaceName : 'this workspace';

  const parts: string[] = [
    `You are Aion, the intelligence layer for ${wsLabel}'s event production operation.`,
    'You understand deals, crew, proposals, logistics, finance, and follow-ups as one connected system.',
    '',
    'Your personality: Professional, concise, production-industry-aware. Never use exclamation marks.',
    '',
    '=== WORKSPACE SNAPSHOT ===',
    `Active deals: ${snapshot?.activeDealCount ?? 'unknown'}`,
    `Pipeline value: ${snapshot?.pipelineValue ?? 'unknown'}`,
    `Revenue this month: ${snapshot?.revenueThisMonth ?? 'unknown'}`,
    `Follow-ups pending: ${snapshot?.pendingFollowUps ?? 0}`,
    `Proactive insights: ${snapshot?.pendingInsightCount ?? 0}`,
    `Outstanding invoices: ${snapshot?.outstandingInvoiceCount ?? 0} (${snapshot?.outstandingTotal ?? '$0'})`,
    '',
    '=== CURRENT USER ===',
    `Name: ${userName ?? 'Unknown'}`,
    `Role: ${userRole ?? 'viewer'}`,
    ...(userMemories && userMemories.length > 0
      ? ['Personal context:', ...userMemories.map((m) => `- ${m}`)]
      : []),
    'When the user asks about "my" deals, tasks, crew, or schedule — scope results to this user.',
    '',
    ...(pageContext?.type ? [
      '=== CURRENT PAGE ===',
      `The user is viewing: ${pageContext.type}${pageContext.label ? ` — "${pageContext.label}"` : ''}`,
      ...(pageContext.entityId ? [`${pageContext.type} ID: ${pageContext.entityId}`] : []),
      ...(pageContext.secondaryId ? [`${pageContext.secondaryType ?? 'secondary'} ID: ${pageContext.secondaryId}`] : []),
      'When the user says "this deal", "this event", "this person", etc. — they mean the one above.',
      'Use the ID above as the default when calling tools, unless they specify a different one.',
      '',
    ] : []),
    '=== VOICE CONFIG ===',
    `Voice: ${voice?.description || 'not yet configured'}`,
    `Example: ${voice?.example_message ? 'provided' : 'none'}`,
    `Guardrails: ${voice?.guardrails || 'none set'}`,
    `Onboarding: ${onboardingState}`,
    `Learned: ${vocabCount} vocabulary substitutions, ${patternCount} patterns`,
    ...(learned?.vocabulary && learned.vocabulary.length > 0
      ? ['', '=== VOCABULARY (always use these) ===', ...learned.vocabulary.map(v => `- Say "${v.to}" instead of "${v.from}"`)]
      : []),
    ...(learned?.patterns && learned.patterns.length > 0
      ? ['', '=== LEARNED PATTERNS (always follow) ===', ...learned.patterns.map(p => `- ${p}`)]
      : []),
  ];

  // Follow-up playbook injection
  const playbook = config.follow_up_playbook;
  const playbookRules = playbook?.rules ?? [];
  if (playbookRules.length > 0) {
    parts.push('', '=== FOLLOW-UP PLAYBOOK ===');
    parts.push(`${playbookRules.length} rules configured:`);
    const categories = ['timing', 'channel', 'drafting', 'backoff', 'scheduling'] as const;
    for (const cat of categories) {
      const catRules = playbookRules.filter((r) => r.category === cat);
      if (catRules.length === 0) continue;
      parts.push(`${cat}:`);
      for (const r of catRules) {
        const condParts: string[] = [];
        if (r.conditions?.event_type) condParts.push(`event: ${r.conditions.event_type}`);
        if (r.conditions?.client_type) condParts.push(`client: ${r.conditions.client_type}`);
        if (r.conditions?.deal_stage) condParts.push(`stage: ${r.conditions.deal_stage}`);
        const condStr = condParts.length > 0 ? ` (${condParts.join(', ')})` : '';
        parts.push(`  - ${r.rule}${condStr}`);
      }
    }
  } else {
    parts.push('', '=== FOLLOW-UP PLAYBOOK ===');
    parts.push('No follow-up rules configured yet. The user has not trained you on their follow-up process.');
  }

  parts.push(
    '',
    '=== CONVERSATION GUIDELINES ===',
    '- Ask one question at a time',
    '- Keep responses short — 2-3 sentences max',
    '- When the user teaches you something, call the appropriate tool to save it, then confirm what you learned',
    '- You have full read access to the knowledge graph: entities, deals, proposals, crew, events, invoices, relationships',
    '- When the user asks about a person, company, venue, deal, or event, search first, then get details',
    '- For contact info, use search_entities then get_entity_details',
    '- For crew questions, use get_deal_crew or check_crew_availability',
    '- For schedule questions, use get_entity_schedule or get_calendar_events',
    '- For financial questions, use get_entity_financial_summary or get_proposal_details',
    '- For reports and dashboards: use get_revenue_summary (financial scorecard), get_pipeline_summary (deal pipeline chart), get_revenue_trend (6-month revenue line chart), get_client_concentration (revenue by client donut chart), get_client_insights (client scorecard). These render as visual data cards with charts — use them when users ask for summaries, scorecards, reports, metrics, or dashboards.',
    '',
    '=== FOLLOW-UP TRAINING ===',
    'When the user describes how they handle follow-ups — timing, channels, rules, or exceptions — treat it like onboarding a new team member:',
    '1. Listen for the rule: timing ("wait 3 days"), channel ("text for weddings, email for corporate"), drafting ("always mention the event date"), backoff ("stop after 3 attempts"), scheduling ("never on Sundays")',
    '2. Ask WHY they follow this rule — the rationale helps you apply it correctly in edge cases',
    '3. Ask if it applies to all deals or only specific event types, client types, or deal stages',
    '4. Extract structured parameters (days, channel, max attempts, blocked days) alongside the natural language rule',
    '5. Save via save_follow_up_rule with the appropriate category',
    '6. Confirm what you saved in plain language and ask if there are more rules to cover',
    '',
    'Think like a new hire learning the ropes. Ask smart follow-up questions:',
    '- "What happens if they still don\'t respond after that?"',
    '- "Does that apply to all your shows or just weddings?"',
    '- "And if they\'ve been viewing the proposal — does that change the approach?"',
    '- "What\'s the point where you stop reaching out?"',
    '',
    'Never lecture about best practices. Learn THEIR process. Every company is different.',
    '',
    '=== ENTITY COMMUNICATION PREFERENCES ===',
    'When the user tells you something about how a specific person, company, or venue prefers to communicate:',
    '1. Use search_entities to find the entity and get their ID',
    '2. Save via save_memory with scope="fact" and the entity_id',
    '3. Confirm what you saved',
    '',
    'Examples of what to listen for:',
    '- "Janet at Acme prefers email" — search Janet at Acme, save with her entity_id',
    '- "The Smiths always take a week to decide, don\'t push them" — save to the Smith entity',
    '- "Always go through the coordinator at this venue" — save to the venue entity',
    '- "This client likes to be cc\'d on everything" — save to the client org entity',
    '',
    'These preferences override general playbook rules for that specific entity.',
    'When drafting for a deal, entity preferences take priority over workspace defaults.',
    '',
    '=== ENTITY MANAGEMENT ===',
    '- To add a new person (crew, freelancer, contact): use create_person. Creates a ghost entity (no account needed).',
    '- To add a new company (vendor, client, agency): use create_company.',
    '- To add a new venue: use create_venue.',
    '- To update any entity attributes (email, phone, job title, etc.): use update_entity.',
    '- To link entities (freelancer to org, vendor to workspace, contact at company): use link_entities.',
    '- To update a relationship (change tier, add notes, update job title): use update_relationship.',
    '- Relationship types: PARTNER (freelancer/collaborator), VENDOR, CLIENT, VENUE_PARTNER, ROSTER_MEMBER (employee/staff).',
    '',
    '=== PRODUCTION WORKFLOW ===',
    '- To hand off a won deal to production: use handoff_deal. Deal must be in won, contract_signed, or deposit_received status.',
    '- To build a show timeline: use create_ros_section for time blocks (Ceremony, Dinner), then create_ros_cue for individual moments.',
    '- To use a saved template: list_ros_templates to see options, then apply_ros_template to apply one.',
    '- To read the current timeline: use get_run_of_show.',
    '- To send crew their day sheet (crew list, timeline, venue): use send_day_sheet. This sends real emails.',
    '- To remind a specific crew member: use send_crew_reminder.',
    '',
    '=== FINANCE ===',
    '- To generate an invoice from an accepted proposal: use generate_invoice.',
    '- To record a payment: use record_payment with invoice ID, amount, and method.',
    '- To log an expense against an event: use log_expense.',
    '- To check invoice status or financial health: use get_entity_financial_summary or get_event_financials.',
    '',
    '- Use production vocabulary: "show" not "event", "crew" not "resources"',
    '- Never use exclamation marks',
    '- You can offer quick-reply options by ending your message with:',
    '  [chips: Label 1|value one, Label 2|value two, Label 3|value three]',
    '  Maximum 3 chips. Only include when there are clear, helpful options.',
    '',
    '=== ACTION SAFETY ===',
    'For actions that change data (creating deals, updating status, assigning crew, publishing proposals, sending emails):',
    '- Always confirm with the user before calling the tool',
    '- Present what you are about to do and offer: [chips: Confirm|confirm, Cancel|cancel]',
    '- Never create, update, or send without explicit user approval',
    '- Read-only tools can be called freely without confirmation',
  );

  if (onboardingState === 'no_voice') {
    parts.push('', '=== ONBOARDING ===', 'Ask about communication style. Save via save_voice_config.');
  } else if (onboardingState === 'no_example') {
    parts.push('', '=== ONBOARDING ===', 'Ask for an example follow-up message. Save via save_voice_config.');
  } else if (onboardingState === 'no_guardrails') {
    parts.push('', '=== ONBOARDING ===', 'Ask about rules. Save via save_voice_config.');
  } else if (onboardingState === 'needs_test_draft') {
    parts.push('', '=== ONBOARDING ===', 'Offer a test draft. Use draft_follow_up. After approval, call save_voice_config with onboarding_complete: true.');
  }

  return parts.join('\n');
}

// =============================================================================
// Greeting builder
// =============================================================================

async function buildGreeting(state: OnboardingState, userName: string | null, workspaceId?: string, pageContext?: AionPageContext): Promise<AionChatResponse> {
  const name = userName ? ` ${userName.split(' ')[0]}` : '';

  switch (state) {
    case 'no_voice':
      return {
        messages: [
          { type: 'text', text: `Hey${name}. I'm Aion — I help you follow up with clients, draft messages, and keep deals moving. The more you teach me about how you work, the better I get.\n\nLet's start with how you talk to clients. How would you describe your style?` },
          { type: 'suggestions', text: '', chips: [
            { label: 'Casual and friendly', value: 'I talk to clients casually and friendly. I use first names and keep things short.' },
            { label: 'Professional but warm', value: 'I keep it professional but warm. Friendly without being too casual.' },
            { label: 'Let me describe it', value: 'Let me describe my style in my own words.' },
          ]},
        ],
      };

    case 'no_example':
      return {
        messages: [{ type: 'text', text: `Welcome back${name}. I have your communication style on file. Can you paste me a follow-up message you have sent that you thought landed well? I will use it as a reference for tone and structure.` }],
      };

    case 'no_guardrails':
      return {
        messages: [
          { type: 'text', text: `Welcome back${name}. I have your voice and an example on file. One more thing — anything I should always or never do? Any rules?` },
          { type: 'suggestions', text: '', chips: [
            { label: 'No specific rules', value: 'No specific rules for now, just follow my style.' },
            { label: 'Let me list some', value: 'Let me tell you some rules.' },
          ]},
        ],
      };

    case 'needs_test_draft':
      return {
        messages: [
          { type: 'text', text: `Hey${name}. Your voice config is set up. Want me to draft a test message for one of your active deals so you can see how it sounds?` },
          { type: 'suggestions', text: '', chips: [
            { label: 'Yes, try one', value: 'Yes, draft a test message for my top priority deal.' },
            { label: 'Looks good, I am done', value: 'I am good for now.' },
          ]},
        ],
      };

    case 'configured': {
      const responseMessages: AionMessageContent[] = [];

      // Page-aware greeting: when user opens Aion from a specific page
      if (pageContext?.type === 'deal' && pageContext.entityId) {
        try {
          const deal = await import('@/app/(dashboard)/(features)/crm/actions/get-deal').then(m => m.getDeal(pageContext.entityId!));
          if (deal) {
            const dealTitle = deal.title || 'this deal';
            responseMessages.push({ type: 'text', text: `Hey${name}. You're on ${dealTitle}. What do you need?` });
            responseMessages.push({ type: 'suggestions', text: '', chips: [
              { label: 'Draft a follow-up', value: `Draft a follow-up for this deal.` },
              { label: 'Show me the crew', value: 'Who is on the crew for this deal?' },
              { label: 'Deal summary', value: 'Give me a summary of this deal.' },
            ]});
            return { messages: responseMessages };
          }
        } catch { /* fall through to default greeting */ }
      }

      if (pageContext?.type === 'entity' && pageContext.entityId) {
        try {
          const supabase = await createClient();
          const { data: entity } = await supabase.schema('directory').from('entities')
            .select('display_name, type').eq('id', pageContext.entityId).maybeSingle();
          if (entity) {
            const entityName = (entity as any).display_name;
            responseMessages.push({ type: 'text', text: `Hey${name}. You're looking at ${entityName}. How can I help?` });
            responseMessages.push({ type: 'suggestions', text: '', chips: [
              { label: 'Contact info', value: `What's the contact info for ${entityName}?` },
              { label: 'Deal history', value: `Show me the deal history for ${entityName}.` },
              { label: 'Financial summary', value: `What's the financial summary for ${entityName}?` },
            ]});
            return { messages: responseMessages };
          }
        } catch { /* fall through to default greeting */ }
      }

      try {
        const queue = await getFollowUpQueue();
        if (queue.length > 0) {
          const topItem = queue[0];
          const topTitle = (topItem.context_snapshot as any)?.deal_title ?? 'a deal';
          const topReason = topItem.reason;
          const greetingText = queue.length === 1
            ? `Hey${name}. You have 1 deal that needs follow-up. ${topTitle} — ${topReason.toLowerCase()}. Want me to draft something?`
            : `Hey${name}. You have ${queue.length} deals that need follow-up. ${topTitle} — ${topReason.toLowerCase()}. Want me to draft something?`;
          responseMessages.push({ type: 'text', text: greetingText });
          responseMessages.push({ type: 'suggestions', text: '', chips: [
            { label: 'Draft it', value: `Draft a follow-up for ${topTitle}.` },
            ...(queue.length > 1 ? [{ label: `Show me all ${queue.length}`, value: 'What needs attention today?' }] : []),
            { label: 'I already handled it', value: `I already handled ${topTitle}.` },
          ]});
        } else {
          responseMessages.push({ type: 'text', text: `Hey${name}. All caught up. I'm here if you need me.` });
          responseMessages.push({ type: 'suggestions', text: '', chips: [{ label: 'What have you learned', value: 'What have you learned about how I work?' }] });
        }
      } catch {
        responseMessages.push({ type: 'text', text: `Hey${name}. What can I help with?` });
      }

      // Surface proactive insights with urgency framing
      try {
        const { getPendingInsights, markInsightsSurfaced } = await import('@/app/(dashboard)/(features)/brain/actions/aion-insight-actions');
        const insights = await getPendingInsights(workspaceId ?? '', 5);
        if (insights.length > 0) {
          const urgent = insights.filter((i) => i.urgency === 'critical' || i.urgency === 'high');
          const rest = insights.filter((i) => i.urgency !== 'critical' && i.urgency !== 'high');

          const lines: string[] = [];
          if (urgent.length > 0) {
            lines.push('Needs attention now:');
            for (const i of urgent) {
              lines.push(`- ${i.title}`);
              if (i.suggestedAction) lines.push(`  → ${i.suggestedAction}`);
            }
          }
          if (rest.length > 0) {
            if (urgent.length > 0) lines.push('');
            lines.push(urgent.length > 0 ? 'Also worth noting:' : 'Something to keep an eye on:');
            for (const i of rest) {
              lines.push(`- ${i.title}`);
            }
          }

          responseMessages.push({ type: 'text', text: lines.join('\n') });

          // Build contextual chips based on top insight
          const topInsight = insights[0];
          const chips: Array<{ label: string; value: string }> = [
            { label: 'Tell me more', value: 'Tell me more about these insights' },
          ];
          if (topInsight.suggestedAction && topInsight.href) {
            chips.unshift({ label: topInsight.suggestedAction, value: `Help me with: ${topInsight.title}` });
          }
          chips.push({ label: 'Dismiss all', value: 'Dismiss all current insights' });
          responseMessages.push({ type: 'suggestions', text: '', chips });

          // Fire-and-forget: mark insights as surfaced
          const insightIds = insights.map((i: any) => i.id);
          markInsightsSurfaced(insightIds).catch(() => {});
        }
      } catch { /* insights not available yet — fine */ }

      const observation = await detectEditPatterns();
      if (observation) {
        responseMessages.push({ type: 'text', text: observation.text });
        responseMessages.push({ type: 'suggestions', text: '', chips: observation.chips });
      }

      // Page-context-aware greeting addition
      if (pageContext?.type === 'deal' && pageContext.entityId && workspaceId) {
        try {
          const { getFollowUpForDeal } = await import('@/app/(dashboard)/(features)/crm/actions/follow-up-actions');
          const queueItem = await getFollowUpForDeal(pageContext.entityId);
          if (queueItem) {
            const dealLabel = pageContext.label ?? 'this deal';
            responseMessages.push({
              type: 'text' as const,
              text: `I see you're looking at ${dealLabel}. It's in the follow-up queue — ${queueItem.reason?.toLowerCase() ?? 'needs attention'}. Want me to draft something?`,
            });
            responseMessages.push({ type: 'suggestions', text: '', chips: [
              { label: 'Draft a follow-up', value: `Draft a follow-up for this deal` },
              { label: 'Show details', value: `Tell me about this deal` },
            ]});
          }
        } catch {
          // Non-blocking
        }
      } else if (pageContext?.type === 'entity' && pageContext.label) {
        responseMessages.push({
          type: 'text' as const,
          text: `Looking at ${pageContext.label}. Ask me anything about them — deals, history, or draft a message.`,
        });
      }

      return { messages: responseMessages };
    }
  }
}

// =============================================================================
// Teaching moments — detect patterns from recent edit tracking
// =============================================================================

type EditObservation = { text: string; chips: SuggestionChip[] };

async function detectEditPatterns(): Promise<EditObservation | null> {
  try {
    const supabase = await createClient();
    const db = supabase;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db.schema('ops').from('follow_up_log')
      .select('draft_original, content, edit_classification, edit_distance')
      .not('draft_original', 'is', null).not('edit_classification', 'is', null)
      .gte('created_at', since).order('created_at', { ascending: false }).limit(20);

    if (error || !data || data.length < 3) return null;

    const entries = data as Array<{ draft_original: string; content: string | null; edit_classification: string; edit_distance: number }>;
    const counts = { approved_unchanged: 0, light_edit: 0, heavy_edit: 0 };
    for (const e of entries) { if (e.edit_classification in counts) counts[e.edit_classification as keyof typeof counts]++; }

    const total = entries.length;
    if (counts.approved_unchanged / total > 0.6 && total >= 5) return null;

    if (counts.heavy_edit / total > 0.5 && total >= 4) {
      return { text: `I noticed you've been making significant edits to my last ${total} drafts. Want to update my voice settings so I get closer to your style?`, chips: [
        { label: 'Yes, let me adjust', value: 'Let me update how you write.' },
        { label: 'No, they were one-offs', value: 'Those were special cases, keep going as you are.' },
      ]};
    }

    const edited = entries.filter((e) => e.content && e.draft_original);
    if (edited.length >= 3) {
      let shorter = 0, longer = 0;
      for (const e of edited) {
        if (e.content!.length < e.draft_original.length * 0.8) shorter++;
        if (e.content!.length > e.draft_original.length * 1.2) longer++;
      }
      if (shorter >= Math.ceil(edited.length * 0.6))
        return { text: `I noticed you've been shortening my drafts on the last ${shorter} messages. Should I keep them shorter going forward?`, chips: [{ label: 'Yes, shorter', value: 'Yes, keep drafts shorter going forward.' }, { label: 'No, those were one-offs', value: 'Those were one-offs, keep the current length.' }] };
      if (longer >= Math.ceil(edited.length * 0.6))
        return { text: `I noticed you've been adding more detail to my drafts recently. Should I write longer, more detailed messages?`, chips: [{ label: 'Yes, more detail', value: 'Yes, write longer and more detailed messages.' }, { label: 'No, those were one-offs', value: 'Those were one-offs, keep the current length.' }] };
    }
    return null;
  } catch { return null; }
}

// =============================================================================
// Helpers
// =============================================================================

function extractChips(text: string): { text: string; chips: SuggestionChip[] } {
  const chipMatch = text.match(/\[chips:\s*(.+)\]\s*$/);
  if (!chipMatch) return { text, chips: [] };
  const cleanText = text.replace(/\[chips:\s*.+\]\s*$/, '').trim();
  const chips: SuggestionChip[] = chipMatch[1].split(',').map((pair) => {
    const parts = pair.split('|').map((s) => s.trim());
    return { label: parts[0], value: parts[1] || parts[0] };
  }).filter((c) => c.label);
  return { text: cleanText, chips };
}

function respondText(text: string): AionChatResponse {
  return { messages: [{ type: 'text', text }] };
}

type WorkspaceSnapshot = {
  activeDealCount: number; pipelineValue: string; pendingFollowUps: number;
  pendingInsightCount: number;
  outstandingInvoiceCount: number; outstandingTotal: string; revenueThisMonth: string;
};

async function getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  try {
    const { getPendingInsights } = await import('@/app/(dashboard)/(features)/brain/actions/aion-insight-actions');
    const [pipeline, pulse, queue, insights] = await Promise.all([
      getDealPipeline().catch(() => null), getFinancialPulse().catch(() => null), getFollowUpQueue().catch(() => []),
      getPendingInsights(workspaceId, 50).catch(() => []),
    ]);
    return {
      activeDealCount: pipeline?.totalDeals ?? 0,
      pipelineValue: pipeline ? `$${Math.round((pipeline.totalWeightedValue ?? 0) / 100).toLocaleString()}` : 'unknown',
      pendingFollowUps: queue.length,
      pendingInsightCount: insights.length,
      outstandingInvoiceCount: pulse?.outstandingCount ?? 0,
      outstandingTotal: pulse ? `$${Math.round((pulse.outstandingTotal ?? 0) / 100).toLocaleString()}` : '$0',
      revenueThisMonth: pulse ? `$${Math.round((pulse.revenueThisMonth ?? 0) / 100).toLocaleString()}` : 'unknown',
    };
  } catch {
    return { activeDealCount: 0, pipelineValue: 'unknown', pendingFollowUps: 0, pendingInsightCount: 0, outstandingInvoiceCount: 0, outstandingTotal: '$0', revenueThisMonth: 'unknown' };
  }
}

async function getUserMemories(workspaceId: string, userId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .schema('cortex').from('aion_memory').select('fact')
      .eq('workspace_id', workspaceId).eq('user_id', userId)
      .order('updated_at', { ascending: false }).limit(10);
    return (data as Array<{ fact: string }> | null)?.map((m) => m.fact) ?? [];
  } catch { return []; }
}

async function getWorkspaceName(workspaceId: string): Promise<string> {
  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { data } = await system.from('workspaces').select('name').eq('id', workspaceId).maybeSingle();
    return (data as any)?.name ?? 'your workspace';
  } catch { return 'your workspace'; }
}
