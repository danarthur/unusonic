/**
 * Aion Conversational Chat Route — Tool-Calling Architecture
 *
 * POST /api/aion/chat
 * Body: { messages: AionChatMessage[], workspaceId: string }
 *
 * Thin orchestrator: auth, config, system prompt, tool assembly, generateText, response building.
 * Tool definitions live in ./tools/ modules; route-internal helpers live in ./route/.
 *
 * Returns: AionChatResponse { messages, configUpdates? }
 */

import { NextResponse } from 'next/server';
import { streamText, stepCountIs } from 'ai';
import { getModel, selectModelTier, classifyIntent, type RouterInput } from '../lib/models';
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
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import type { AionToolContext } from './tools/types';
import { isMobileSurface } from '../lib/surface-detection';
import { buildSystemPrompt, buildGreeting } from './route/prompts';
import { buildToolsForIntent } from './route/tools';
import {
  resolveTokenUsage,
  checkRateLimit,
  buildResponseFromResult,
  respondText,
} from './route/helpers';
import {
  parseArgEditMessage,
  parseOpenPinMessage,
  handleArgEdit,
  handleOpenPin,
} from './route/synthetic-messages';
import {
  getWorkspaceSnapshot,
  getUserMemories,
  getWorkspaceName,
} from './route/workspace-data';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

          // Log routing outcome — Wk 16 §3.10: thread the real token usage
          // from streamText's `usage` promise so the cost-per-seat metric has
          // grounded numbers. The promise resolves once the stream closes.
          const { inputTokens, outputTokens } = await resolveTokenUsage(result.usage);
          logOutcome({ toolsCalled, success: true, durationMs: 0, inputTokens, outputTokens });
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
