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
} from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import {
  getOnboardingState,
  type AionChatRequest,
  type AionChatResponse,
  type AionMessageContent,
  type AionPageContext,
  type SuggestionChip,
  type OnboardingState,
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import { getFollowUpQueue } from '@/app/(dashboard)/(features)/crm/actions/follow-up-actions';
import { getDealPipeline } from '@/widgets/dashboard/api/get-deal-pipeline';
import { getFinancialPulse } from '@/widgets/dashboard/api/get-financial-pulse';
import { createCoreTools } from './tools/core';
import { createKnowledgeTools } from './tools/knowledge';
import { createActionTools } from './tools/actions';
import { createEntityTools } from './tools/entity';
import { createProductionTools } from './tools/production';
import { createAnalyticsTools, invokeCallMetric } from './tools/analytics';
import { createRefusalTools } from './tools/refusal';
import { createWriteTools } from './tools/writes';
import type { AionToolContext } from './tools/types';
import { isMobileSurface, stripVoiceIntentTools } from '../lib/surface-detection';
import { pickGreeting } from '../lib/greeting-catalog';
import { resolveWorkspaceStateLine } from '../lib/workspace-state-line';
import { resolveGreetingChips } from '../lib/greeting-chips';

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
  isMobile: boolean = false,
): Record<string, any> {
  // Always include core (voice config, memory, follow-ups, drafts) + knowledge (read-only lookups)
  const core = createCoreTools(toolCtx);
  const knowledge = createKnowledgeTools(toolCtx);
  const analytics = createAnalyticsTools(toolCtx);
  // Phase 3.4: record_refusal is wired wherever call_metric is wired — refusal
  // is the fallback path when the user asks for an out-of-registry metric.
  const refusal = createRefusalTools(toolCtx);

  let tools: Record<string, any>;
  switch (intent) {
    // Lightweight intents — core + knowledge only (no write/entity/production tools)
    case 'greeting':
    case 'rejection':
    case 'conversational':
      tools = { ...core, ...knowledge };
      break;

    // Simple lookup can ask for a scalar metric (revenue, AR, sync health)
    case 'simple_lookup':
      tools = { ...core, ...knowledge, ...analytics, ...refusal };
      break;

    // Draft requests — core has draft_follow_up + regenerate_draft; §3.5 write
    // tools (send_reply, schedule_followup, update_narrative) are also here
    // because drafting is cheap by design. The voice-intent gate downstream
    // strips send_reply on desktop.
    case 'draft_request':
      tools = { ...core, ...knowledge, ...createWriteTools(toolCtx) };
      break;

    // Config/teaching — core only (save_voice_config, save_memory, save_follow_up_rule)
    case 'config':
      tools = { ...core };
      break;

    // Write actions — need action + entity tools, plus knowledge for context lookups
    case 'write_action':
    case 'confirmation': {
      const actions = createActionTools(toolCtx);
      const entity = createEntityTools(toolCtx);
      const writes = createWriteTools(toolCtx);
      // Include production tools when on a deal/event page
      if (pageType === 'deal' || pageType === 'event') {
        const production = createProductionTools(toolCtx);
        tools = { ...core, ...knowledge, ...actions, ...entity, ...production, ...writes };
      } else {
        tools = { ...core, ...knowledge, ...actions, ...entity, ...writes };
      }
      break;
    }

    // Multi-step, analysis, strategic — full tool set (+ call_metric for analysis)
    case 'multi_step':
    case 'analysis':
    case 'strategic':
      tools = {
        ...core,
        ...knowledge,
        ...analytics,
        ...refusal,
        ...createActionTools(toolCtx),
        ...createEntityTools(toolCtx),
        ...createProductionTools(toolCtx),
        ...createWriteTools(toolCtx),
      };
      break;

    default:
      tools = { ...core, ...knowledge };
  }

  // Phase 3 §3.4 B3 — voice-intent tools (send_reply, future voice-only writes)
  // are stripped unless the request is verified mobile (header + UA). Even if
  // an intent classifier would include them, a desktop POST never surfaces
  // them. See src/app/api/aion/lib/surface-detection.ts.
  if (!isMobile) {
    stripVoiceIntentTools(tools);
  }

  return tools;
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

  // Normalize sessionId — general-scope chats use client-minted `chat-<uuid>`
  // pseudo-IDs (SessionContext.startNewChat). Those are never valid DB UUIDs,
  // so scope resolution + auto-title RPCs would throw. Treat them as null
  // server-side; scoped sessions (deal/event) use `resume_or_create_aion_session`
  // which returns real UUIDs and reaches this check unchanged.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const normalizedSessionId =
    body.sessionId && UUID_RE.test(body.sessionId) ? body.sessionId : undefined;

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

  // 6b. Phase 3.1: synthetic pill-edit short-circuit.
  // Pattern: `[arg-edit] <metricId> <argKey>=<value>` emitted by AnalyticsResultCard
  // when the user picks a new pill value. We re-run callMetric with the previous
  // args merged with the new one — no LLM invocation.
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'user') {
    const argEdit = parseArgEditMessage(lastMsg.content);
    if (argEdit) {
      return NextResponse.json(await handleArgEdit(workspaceId, argEdit));
    }
    // 6c. Phase 3.3: synthetic "open pin" short-circuit.
    // Pattern: `[open-pin] <pinId>` emitted by the Aion page when the user
    // arrives via /aion?openPin=<id>. We resolve the pin for the current user
    // and re-run callMetric with the stored metric_id + args, then emit an
    // analytics_result block with pinId set (so the "Update pin" affordance
    // lights up on the fresh card).
    const openPin = parseOpenPinMessage(lastMsg.content);
    if (openPin) {
      return NextResponse.json(await handleOpenPin(workspaceId, user.id, openPin));
    }
  }

  // 7. Build system prompt with workspace context + user identity
  const wsSnapshot = await getWorkspaceSnapshot(workspaceId);
  const userMemories = await getUserMemories(workspaceId, user.id);

  // 7b. Resolve session scope server-side and build a live record-context
  // block for deal-scoped sessions. Industry-standard pattern (Attio,
  // HubSpot, Linear, Salesforce, Pylon): scope lives on the session row,
  // record facts are re-fetched every turn — no caching across messages.
  // See docs/reference/aion-deal-chat-design.md §7.4.
  //
  // pageContext stays as a fallback for legacy sessions without scope, and
  // as the signal source for entity-type pages where no session has been
  // created yet (lobby, dashboards).
  let scopePrefix = '';
  if (normalizedSessionId) {
    const { resolveSessionScope, buildScopePrefix } = await import('../lib/scope-context');
    const scope = await resolveSessionScope(normalizedSessionId);
    if (scope) {
      scopePrefix = await buildScopePrefix(scope);
    }
  }

  const systemPrompt = scopePrefix + buildSystemPrompt(aionConfig, onboardingState, workspaceName, wsSnapshot, userName, userRole ?? 'viewer', userMemories, pageContext);

  // 8. Build the message history (with rolling summarization for long conversations)
  const allMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
  // Load existing session summary for continuity
  let existingSummary: string | null = null;
  if (normalizedSessionId) {
    try {
      const { data: session } = await supabase
        .schema('cortex')
        .from('aion_sessions')
        .select('conversation_summary')
        .eq('id', normalizedSessionId)
        .maybeSingle();
      existingSummary = session?.conversation_summary ?? null;
    } catch {}
  }

  const { summary, recentMessages, didSummarize } = await prepareConversationHistory(allMessages, existingSummary);

  // Persist summary after summarization (fire-and-forget)
  if (didSummarize && summary && normalizedSessionId) {
    const sessionId = normalizedSessionId; // capture for the async closure (TS can't narrow across closure boundaries)
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

  // 10a. Build only the tool sets needed for this intent (saves ~3k tokens on simple queries).
  // §3.4 B3: voice-intent tools (send_reply, future voice-only writes) are
  // stripped unless the request is a verified mobile POST (header + UA both
  // match). Desktop transcript POST can never surface them.
  const isMobile = isMobileSurface(req);
  const toolSets = buildToolsForIntent(intent, toolCtx, canWrite, pageContext?.type ?? null, isMobile);

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
    userId: user.id,
    sessionId: normalizedSessionId,
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

          // Text-delta routing: Sonnet's typical tool-call flow emits
          // preamble ("I'll search for that wedding deal") → tool-call →
          // tool-result → answer. We route the preamble text to a separate
          // `preamble:` stream channel so the client can render it as a
          // collapsible "thinking" header above the main answer instead of
          // mashing both into one run-on paragraph. Post-tool text goes to
          // the normal `text:` channel.
          //
          // If the model calls multiple tools in a turn ("I'll check X →
          // [tool] → Now I'll check Y → [tool] → Here's what I found"),
          // each pre-tool chunk adds to the preamble. The final post-tool
          // segment is the answer.
          let toolSeen = false;
          const preambleText: string[] = [];

          // Stream text deltas + tool call events via fullStream
          for await (const part of result.fullStream) {
            if (part.type === 'reasoning-delta') {
              // Extended thinking content — stream to client
              controller.enqueue(encoder.encode(`thinking:${(part as any).text ?? ''}\n`));
            } else if (part.type === 'text-delta') {
              const delta = (part as any).text ?? (part as any).delta ?? '';
              if (!toolSeen) {
                // Pre-tool text → preamble channel. Keep an accumulator so
                // we know the preamble content for the final structured
                // response assembly even if no tools end up being called.
                preambleText.push(delta);
                controller.enqueue(encoder.encode(`preamble:${delta}\n`));
              } else {
                collectedText.push(delta);
                controller.enqueue(encoder.encode(`text:${delta}\n`));
              }
            } else if (part.type === 'tool-call') {
              // First tool seen flips the routing: further text is the
              // post-tool answer, not preamble.
              if (!toolSeen) {
                // If we accumulated preamble but no answer text came yet,
                // signal the boundary so the client freezes the preamble
                // box and prepares for the answer.
                controller.enqueue(encoder.encode(`preamble-end:\n`));
              }
              toolSeen = true;
              toolsCalled.push(part.toolName);
              const label = part.toolName.replace(/_/g, ' ');
              controller.enqueue(encoder.encode(`tool:${label}\n`));
            } else if (part.type === 'tool-result') {
              collectedToolResults.push({ toolName: (part as any).toolName, output: (part as any).output });
            }
          }

          // Edge case: model emitted only preamble text and never finalized
          // with a post-tool answer. Demote the preamble to main content so
          // the UI isn't left with an empty answer block. This also covers
          // plain conversational turns that don't call tools at all — those
          // never see `preamble-end:` and have empty collectedText, so we
          // promote the preamble to main text.
          if (!toolSeen && preambleText.length > 0 && collectedText.length === 0) {
            const joined = preambleText.join('');
            collectedText.push(joined);
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

          // Fire-and-forget title generation — runs after the stream closes
          // so it never delays the response. The generator reads the session's
          // current title and silently bails if one is already set OR if the
          // user has locked it mid-generation. Only triggers when we have
          // both a user message and a meaningful assistant reply.
          if (normalizedSessionId && finalText.trim().length > 0) {
            const lastUser = messages.filter((m) => m.role === 'user').pop()?.content ?? '';
            if (lastUser.trim().length > 0) {
              const sessionId = normalizedSessionId;
              void import('../lib/generate-title').then(({ generateSessionTitle }) =>
                generateSessionTitle({
                  sessionId,
                  userMessage: lastUser,
                  assistantReply: finalText,
                }),
              );
            }
          }

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

        // Phase 3.1: call_metric emits either an analytics_result (scalar) or a data_table (table fallback).
        case 'call_metric': {
          if (data.analytics_result) {
            msgs.push(data.analytics_result as AionMessageContent);
          } else if (data.data_table) {
            msgs.push(data.data_table as AionMessageContent);
          } else if (data.error) {
            // Phase 3.4: if call_metric hit an unknown id or validation error,
            // we still surface a text block — Aion should generally call
            // record_refusal instead when a metric isn't in the registry.
            msgs.push({ type: 'text', text: data.error });
          }
          break;
        }

        // Phase 3.4: record_refusal emits a refusal block. Rendered by RefusalCard.
        case 'record_refusal': {
          if (data.refusal) {
            msgs.push(data.refusal as AionMessageContent);
          }
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
    `Voice: ${voice?.description || 'default (no workspace voice defined — use a clear, professional production-management register)'}`,
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
    '- For cross-deal pricing references ("what did we charge X last June", "what did past rooftops go for", "find similar deals"): use lookup_historical_deals. Pass client_name_query for fuzzy client lookup, similar_to_deal_id for structural matches (archetype + venue + month + headcount), or filters.date_range / filters.status for time-and-outcome scoping. When the tool returns truncated: true, acknowledge the result-count limit without speculating about hidden records.',
    '- For catalog pricing ("what do we charge for X", "do we sell Y", "list our rooftop packages"): use lookup_catalog. Returns name, category, default price, description, and the catalog id. Plain fuzzy search — combine with lookup_historical_deals when the user wants both default pricing AND what clients actually paid.',
    '',
    '=== RETRIEVAL ENVELOPE (every read tool) ===',
    'Every retrieval tool returns: { result, reason, searched, hint?, adjacent? }.',
    '- `result` is the data: an array, a single object, null, or a scalar. Read it directly.',
    '- `searched` is the substrate universe the query ran against (workspace-scoped): { deals, entities, messages_in_window, notes, catalog_items, memory_chunks }. NOT the number of matches — the inventory.',
    '- `reason` is why: "has_data" when result is populated, or a specific empty-state code (no_matching_deals, no_messages_from_entity, deal_not_found, workspace_empty, etc.).',
    '- `hint` is an optional one-liner from the tool (e.g. "Showing top 5 of 42 matches").',
    '- `adjacent` lists reach-across suggestions: related substrate you might offer ({kind, id, label}).',
    '',
    'EMPTY-STATE DISCIPLINE (non-negotiable):',
    'When `result` is empty or null, the FIRST sentence of your reply must name the substrate you actually looked at — using `searched`. Never say "I don\'t have any matching X" as if you searched exhaustively without saying how much there was. The substrate speaks first; the answer follows.',
    '',
    'Examples:',
    '- searched={deals:3, messages_in_window:47, notes:12, ...}, reason="no_matching_deals" for "Henderson" →',
    '  "I looked at your 3 deals, 47 messages, and 12 notes — nothing mentions Henderson. Is this someone you\'ve worked with, or a new lead?"',
    '- searched={deals:0, messages_in_window:0, ...}, reason="workspace_empty" →',
    '  "Nothing to search yet — no deals, no messages, no notes on file. Connect your inbox or add your first deal to get started."',
    '- searched={messages_in_window:0, ...}, reason="no_activity_in_window" for "what did Sarah say" →',
    '  "No messages in the last 90 days. Your inbox connection may be fresh — I\'ll have more as messages come in."',
    '- searched={deals:47, messages_in_window:1842, ...}, reason="no_closed_deals_yet" for "average deal size" →',
    '  "You have 47 deals in the pipeline but none closed yet — pattern stats activate after 5-10 closed deals. Want me to show the active ones instead?"',
    '- reason="entity_not_found" → "I don\'t see that entity in your workspace." (bounded ask — entity-level miss; don\'t dump the full substrate inventory for a lookup miss)',
    '',
    'Rules:',
    '- Mention only the substrate counts that matter for the question. A pricing question touches deals + catalog; a communication question touches messages + notes. Don\'t recite the full inventory every time.',
    '- When `adjacent` is present, offer the reach-across: "There\'s a thread from sarah.patel@gmail — want me to start a deal from it?"',
    '- Sentence case, no exclamation marks, production vocabulary. Don\'t editorialize the emptiness (no "Unfortunately...", no "Great question!").',
    '- Filled results: answer the question. You don\'t need to announce `searched` counts when result is populated — the inline <citation> tags carry the per-item trust.',
    '',
    '=== INLINE RECORD CITATIONS ===',
    'When you reference a deal, client/entity, or catalog package that you retrieved via a tool in this turn, emit the name as an inline citation tag instead of plain text. The client-side renders these as clickable pills with hover cards.',
    'Format: <citation kind="KIND" id="UUID">Display Name</citation>',
    'Allowed kinds: "deal" (from lookup_historical_deals), "entity" (a client / person / company / venue id), "catalog" (from lookup_catalog).',
    'Rules:',
    '- Only cite ids you retrieved from a tool in this conversation. Never fabricate an id.',
    '- Cite each record once per response — further references use the bare name.',
    '- Keep the display name under 60 characters.',
    '- Do NOT wrap numbers, dates, or prices in citation tags.',
    'Example: "The closest reference is <citation kind="deal" id="238cabce-1234-4abc-9def-000000000001">Henderson Holiday Party</citation> — same venue, 75 guests, $12,400 total."',
    '',
    '=== REGISTRY METRICS (call_metric) ===',
    'When the user asks for a single scalar business metric that maps to a registry ID, call `call_metric` with the metric_id and (if required) args. Do NOT compose multiple read tools into a ScoreCard when one registry metric covers the ask — call_metric renders a first-class analytics_result card with comparison, sparkline, pills, and provenance.',
    '',
    'Scalar registry IDs (use call_metric for these):',
    '- finance.revenue_collected — revenue received in a period. Args: period_start, period_end (YYYY-MM-DD).',
    '- finance.ar_aged_60plus — outstanding receivables aged 60+ days. No args.',
    '- finance.qbo_variance — count of invoices with QBO sync issues. No args.',
    '- finance.qbo_sync_health — QBO connection health. No args.',
    '',
    'Table registry IDs (use call_metric; renders as a data_table fallback in chat, full experience on the Reconciliation surface):',
    '- finance.unreconciled_payments — payments not reconciled with QBO. No args.',
    '- finance.invoice_variance — invoices with sync issues. No args.',
    '- finance.sales_tax_worksheet — sales tax by jurisdiction over a period. Args: period_start, period_end.',
    '- finance.1099_worksheet — per-vendor totals for a calendar year. Args: year.',
    '',
    'Prefer call_metric over freehand composition. The legacy get_revenue_summary tool is for the broad financial scorecard; call_metric is for precise single-metric answers.',
    '',
    '=== REFUSAL + CLARIFIERS (Phase 3.4) ===',
    'When the user asks for a metric NOT in the REGISTRY METRICS list, call `record_refusal` with the user\'s question, reason="metric_not_in_registry", an optional attempted_metric_id (pick the closest id if any), and up to 3 suggestions (related registry ids). Do not fabricate an answer.',
    'When the question is AMBIGUOUS (e.g. "how\'s revenue" could map to revenue_collected vs revenue_booked), do NOT pick silently. Emit a [chips: ...] line at the end of your text response with 2-3 disambiguation options. The existing suggestions pipeline resends the chip\'s value as a new user turn — one clarifier, then commit.',
    'State the limitation in one sentence. Never apologize at length. Offer the concrete next step.',
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
      // ═══════════════════════════════════════════════════════════════════
      // Configured workspaces run in PULL-MODE (design doc 2026-04-23).
      //
      // Cold-open no longer pushes a follow-up-queue nudge. The drumbeat
      // lives on ambient surfaces — lobby Today's Brief card, Sales
      // Dashboard cards, deal-card pinned proactive lines. All three are
      // live. See docs/reference/aion-greeting-identity-design.md.
      //
      // Greeting shape:
      //   1. Rotating warm line (Claude-style, time-of-day + weekday)
      //   2. Optional ambient state line (gated on ≥1 active deal, zero-
      //      content facts only)
      //   3. Contextual chip row (capability-teaching, never urgency)
      //
      // Teaching moments (edit-pattern detection, config learning) are a
      // separate axis and fire AFTER turns, not at greeting.
      //
      // markInsightsSurfaced() telemetry still fires here — pending
      // Sprint 3 migration to Brief-widget onMount (hazard §5.1).
      // ═══════════════════════════════════════════════════════════════════
      const responseMessages: AionMessageContent[] = [];
      const firstName = userName?.split(' ')[0] ?? null;

      // Page-aware warm greeting: when the user opens Aion ON a specific
      // record, use its title and capability chips for that record.
      if (pageContext?.type === 'deal' && pageContext.entityId) {
        try {
          const deal = await import('@/app/(dashboard)/(features)/crm/actions/get-deal').then(m => m.getDeal(pageContext.entityId!));
          if (deal) {
            const dealTitle = deal.title || 'this deal';
            responseMessages.push({ type: 'text', text: `Hey${name}. You're on ${dealTitle}.` });
            responseMessages.push({ type: 'suggestions', text: '', chips: resolveGreetingChips({ pageContext }) });
            logGreetingTelemetry('configured_pull_mode', 'deal', responseMessages.length);
            fireSurfacedTelemetry(workspaceId);
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
            responseMessages.push({ type: 'text', text: `Hey${name}. You're looking at ${entityName}.` });
            responseMessages.push({ type: 'suggestions', text: '', chips: resolveGreetingChips({ pageContext }) });
            logGreetingTelemetry('configured_pull_mode', 'entity', responseMessages.length);
            fireSurfacedTelemetry(workspaceId);
            return { messages: responseMessages };
          }
        } catch { /* fall through to default greeting */ }
      }

      if (pageContext?.type === 'event' && pageContext.entityId) {
        responseMessages.push({ type: 'text', text: `Hey${name}. You're on this show.` });
        responseMessages.push({ type: 'suggestions', text: '', chips: resolveGreetingChips({ pageContext }) });
        logGreetingTelemetry('configured_pull_mode', 'event', responseMessages.length);
        fireSurfacedTelemetry(workspaceId);
        return { messages: responseMessages };
      }

      // No pageContext — the pull-mode greeting. Warm line + optional
      // state line + contextual chips.
      const warmGreeting = pickGreeting({
        firstName,
        workspaceId: workspaceId ?? 'anon',
      });
      responseMessages.push({ type: 'text', text: warmGreeting });

      // State line — gated on ≥1 active deal per Q1 resolution. Zero-content
      // facts only. Renders as a SEPARATE text block, not concatenated.
      if (workspaceId) {
        try {
          const stateLine = await resolveWorkspaceStateLine(workspaceId);
          if (stateLine) {
            responseMessages.push({ type: 'text', text: stateLine.text });
          }
        } catch { /* non-blocking — pull-mode greeting works without it */ }
      }

      // Chip row — no pageContext branch. `isNewWorkspace` hint from
      // workspace snapshot (resolved earlier in the route; wire from
      // buildGreeting's caller by checking activeDealCount in the snapshot).
      // Here we pass undefined and let the resolver default to established
      // workspace chips, which are correct for every case except a true
      // day-0 workspace that hasn't made it to `configured` yet — those
      // still hit the no_voice/no_example branches.
      responseMessages.push({ type: 'suggestions', text: '', chips: resolveGreetingChips({ pageContext }) });

      logGreetingTelemetry('configured_pull_mode', pageContext?.type ?? 'lobby', responseMessages.length);
      fireSurfacedTelemetry(workspaceId);
      return { messages: responseMessages };
    }
  }
}

/**
 * Fire-and-forget insight-surfaced telemetry. Keeps the lobby Today's Brief
 * widget's dedup path fed even though we no longer LIST insights in the
 * greeting (design doc §5.1). When Sprint 3 Wk 11 audit confirms the Brief
 * widget's onMount path is load-bearing on its own, this call can retire.
 */
function fireSurfacedTelemetry(workspaceId: string | undefined): void {
  if (!workspaceId) return;
  (async () => {
    try {
      const { getPendingInsights, markInsightsSurfaced } = await import('@/app/(dashboard)/(features)/aion/actions/aion-insight-actions');
      const insights = await getPendingInsights(workspaceId, 5);
      if (insights.length > 0) {
        const insightIds = insights.map((i: { id: string }) => i.id);
        markInsightsSurfaced(insightIds).catch(() => {});
      }
    } catch { /* insights not available yet — fine */ }
  })();
}

function logGreetingTelemetry(mode: string, surface: string, blocks: number): void {
  // Grepable log line. Migrates to ops.aion_events when Sprint 3 Wk 11 lands.
  console.log(`[aion.greeting] mode=${mode} surface=${surface} blocks=${blocks}`);
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

// =============================================================================
// Phase 3.1: synthetic `[arg-edit]` message handling
// =============================================================================

type ArgEdit = {
  metricId: string;
  argKey: string;
  rawValue: string;
};

/** Match `[arg-edit] <metricId> <argKey>=<value>`. Value runs to end-of-line. */
function parseArgEditMessage(content: string): ArgEdit | null {
  const match = content.match(/^\[arg-edit\]\s+(\S+)\s+([A-Za-z_][A-Za-z0-9_]*)=([\s\S]+)$/);
  if (!match) return null;
  return { metricId: match[1], argKey: match[2], rawValue: match[3].trim() };
}

/** Parse a JSON-encoded period object into { period_start, period_end }. */
function parsePeriodEdit(rawValue: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawValue) as { period_start?: unknown; period_end?: unknown };
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, unknown> = {};
    if (typeof parsed.period_start === 'string') out.period_start = parsed.period_start;
    if (typeof parsed.period_end === 'string') out.period_end = parsed.period_end;
    return out;
  } catch {
    return {};
  }
}

/** Best-effort parse of an arbitrary raw value (JSON if possible, else string). */
function parseRawValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

/**
 * Build the args shape callMetric expects from a synthetic `[arg-edit]` message.
 *
 * Phase 3.1 note: the persisted chat history is free-text user + assistant
 * content; tool-result payloads are emitted over the stream but not replayed
 * verbatim in chat history. So we accept defaultArgs + the single edit; callers
 * that need non-default prior args should re-ask from scratch.
 */
function argsFromEdit(edit: ArgEdit): Record<string, unknown> {
  const { argKey, rawValue } = edit;
  if (argKey === 'period') return parsePeriodEdit(rawValue);
  if (argKey === 'year') {
    const n = Number(rawValue);
    return Number.isFinite(n) ? { year: Math.trunc(n) } : {};
  }
  return { [argKey]: parseRawValue(rawValue) };
}

async function handleArgEdit(
  workspaceId: string,
  edit: ArgEdit,
): Promise<AionChatResponse> {
  const nextArgs = argsFromEdit(edit);
  const result = await invokeCallMetric(workspaceId, edit.metricId, nextArgs);

  if (result.kind === 'error') {
    return respondText(result.message);
  }
  if (result.kind === 'analytics_result') {
    return { messages: [result.block as AionMessageContent] };
  }
  if (result.kind === 'data_table' && result.block) {
    return { messages: [result.block as AionMessageContent] };
  }
  return respondText('Could not resolve that metric edit.');
}

// =============================================================================
// Phase 3.3: synthetic `[open-pin]` message handling
// =============================================================================

/** Match `[open-pin] <pinId>`. Pin id runs to end-of-line (uuid-shaped). */
function parseOpenPinMessage(content: string): string | null {
  const match = content.match(/^\[open-pin\]\s+(\S+)\s*$/);
  return match ? match[1] : null;
}

async function handleOpenPin(
  workspaceId: string,
  userId: string,
  pinId: string,
): Promise<AionChatResponse> {
  // Import lazily — this path is only hit when the synthetic turn fires.
  const { loadPinToAion } = await import(
    '@/app/(dashboard)/(features)/aion/actions/open-pin'
  );
  // loadPinToAion re-resolves the user from cookies, which matches the caller
  // (this route is already authenticated). We pass the pinId verbatim; the
  // action filters by (workspace, user) so a cross-user pin id returns null.
  void userId; // user scoping is enforced inside loadPinToAion
  void workspaceId;

  const pin = await loadPinToAion(pinId);
  if (!pin) {
    return respondText('I couldn\'t open that pin — it may have been removed.');
  }

  const result = await invokeCallMetric(workspaceId, pin.metricId, pin.args);
  if (result.kind === 'error') {
    return respondText(result.message);
  }
  if (result.kind === 'analytics_result') {
    // Stamp the pinId onto the fresh result so the card renders with the
    // "Update pin" affordance lit. Phase 3.2's AnalyticsResultCard reads this.
    const block = { ...result.block, pinId: pin.pinId } as AionMessageContent;
    return { messages: [block] };
  }
  if (result.kind === 'data_table' && result.block) {
    return { messages: [result.block as AionMessageContent] };
  }
  return respondText('Could not reopen that pin.');
}

type WorkspaceSnapshot = {
  activeDealCount: number; pipelineValue: string; pendingFollowUps: number;
  pendingInsightCount: number;
  outstandingInvoiceCount: number; outstandingTotal: string; revenueThisMonth: string;
};

async function getWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  try {
    const { getPendingInsights } = await import('@/app/(dashboard)/(features)/aion/actions/aion-insight-actions');
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
