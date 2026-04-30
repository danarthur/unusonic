/**
 * Aion chat route — small utility cluster.
 *
 * Split out of route.ts as part of the Phase 0.5 LOC trim:
 * - resolveTokenUsage: normalizes streamText's `usage` shape across SDK versions.
 * - checkRateLimit: in-memory sliding-window per-user rate limit.
 * - buildResponseFromResult: assembles structured AionChatResponse from
 *   collected stream text + tool results.
 * - respondText: tiny helper to wrap a plain string as an AionChatResponse.
 */

import type { AionConfig } from '@/app/(dashboard)/(features)/aion/actions/aion-config-actions';
import type {
  AionChatResponse,
  AionMessageContent,
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import { extractChips } from './prompts';

// =============================================================================
// Token-usage extraction — Wk 16 §3.10 cost-per-seat
// =============================================================================

/**
 * Resolve the streamText `usage` promise into a normalized
 * `{ inputTokens, outputTokens }` shape. The AI SDK shape varies across
 * versions (`promptTokens` / `completionTokens` vs `inputTokens` /
 * `outputTokens`); we accept either. Failures yield nulls so the caller can
 * still fire the outcome row.
 */
export async function resolveTokenUsage(usagePromise: PromiseLike<unknown>): Promise<{
  inputTokens: number | null;
  outputTokens: number | null;
}> {
  try {
    const u = (await usagePromise) as {
      inputTokens?: number;
      outputTokens?: number;
      promptTokens?: number;
      completionTokens?: number;
    };
    return {
      inputTokens: u.inputTokens ?? u.promptTokens ?? null,
      outputTokens: u.outputTokens ?? u.completionTokens ?? null,
    };
  } catch {
    return { inputTokens: null, outputTokens: null };
  }
}

// =============================================================================
// Per-user rate limiting (in-memory sliding window)
// =============================================================================

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, number[]>();

export function checkRateLimit(userId: string): boolean {
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
// Tiny text-response helper
// =============================================================================

export function respondText(text: string): AionChatResponse {
  return { messages: [{ type: 'text', text }] };
}

// =============================================================================
// Response builder — assembles structured AionChatResponse from stream output
// =============================================================================

export function buildResponseFromResult(
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
