'use server';

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getSystemClient } from '@/shared/api/supabase/system';
import { activeDomainsFor } from '@/shared/lib/metrics/domains';
import { domainForTrigger } from '@/app/api/aion/lib/insight-trigger-domains';

// Do NOT re-export `AionInsight` — Next 16 server-action registry throws
// `ReferenceError` on type-only re-exports from 'use server' files. Consumers
// import the type directly from `@/app/(dashboard)/(features)/aion/actions/aion-insight-actions`.
import type { AionInsight } from '@/app/(dashboard)/(features)/aion/actions/aion-insight-actions';

export type BriefData = {
  body: string;
  factsJson: Record<string, unknown>;
  generatedAt: string;
};

export type BriefAndInsights = {
  brief: BriefData | null;
  insights: AionInsight[];
  workspaceId: string | null;
};

/**
 * Fetch both the daily brief and pending insights in a single server action.
 *
 * Uses the system client because ops/cortex schemas are not exposed via
 * PostgREST — the authenticated client's .schema() calls silently fail.
 * Workspace scoping is enforced by the WHERE clause.
 *
 * When `cardIds` is provided, insight rows are stable-sorted so rows whose
 * trigger-domain is in the active layout's aggregate domain set come first.
 * Cross-domain rows stay visible below — no filtering. See
 * docs/reference/sales-brief-v2-design.md §6.4.
 */
export async function getBriefAndInsights(
  cardIds?: readonly string[],
): Promise<BriefAndInsights> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { brief: null, insights: [], workspaceId: null };

  // Fetch independently so one failure doesn't take down both
  const [brief, insightsRaw] = await Promise.all([
    fetchBrief(workspaceId).catch(() => null),
    fetchInsights(workspaceId).catch(() => []),
  ]);

  const insights = reorderInsightsByLayout(insightsRaw, cardIds ?? []);
  return { brief, insights, workspaceId };
}

// ── Reorder by layout domain ────────────────────────────────────────────────

/**
 * Stable-sort insights so layout-matching rows come first. Priority (DESC)
 * breaks ties inside each bucket. Matches the priority-first order the
 * original query returned when no cardIds are provided (Default preset /
 * legacy bento — activeDomainsFor(empty) returns the full non-meta set,
 * so every row "matches").
 *
 * Meta-domain triggers (currently none by default) always rank with the
 * cross-domain set since they have no specific domain to match against.
 */
function reorderInsightsByLayout(
  insights: AionInsight[],
  cardIds: readonly string[],
): AionInsight[] {
  if (insights.length <= 1) return insights;

  const activeDomains = activeDomainsFor(cardIds);

  // Partition into "layout-matching" and "cross-domain-only" while
  // preserving the original priority-DESC order inside each partition.
  const matching: AionInsight[] = [];
  const crossDomain: AionInsight[] = [];

  for (const insight of insights) {
    const domain = domainForTrigger(insight.triggerType);
    // meta triggers and unknown triggers fall into the cross-domain bucket
    // so they never displace layout-matching rows.
    if (domain !== 'meta' && activeDomains.has(domain)) {
      matching.push(insight);
    } else {
      crossDomain.push(insight);
    }
  }

  return [...matching, ...crossDomain];
}

// ── Internal ────────────────────────────────────────────────────────────────

async function fetchBrief(workspaceId: string): Promise<BriefData | null> {
  const system = getSystemClient();

  const { data, error } = await (system as unknown as {
    schema(s: string): {
      from(t: string): {
        select(cols: string): {
          eq(c: string, v: string): {
            order(c: string, o: { ascending: boolean }): {
              limit(n: number): {
                maybeSingle(): Promise<{
                  data: { body: string; facts_json: Record<string, unknown>; generated_at: string } | null;
                  error: unknown;
                }>;
              };
            };
          };
        };
      };
    };
  })
    .schema('ops')
    .from('daily_briefings')
    .select('body, facts_json, generated_at')
    .eq('workspace_id', workspaceId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.body) return null;
  return { body: data.body, factsJson: data.facts_json, generatedAt: data.generated_at };
}

async function fetchInsights(workspaceId: string): Promise<AionInsight[]> {
  const system = getSystemClient();

  const { data, error } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('id, trigger_type, entity_type, entity_id, title, context, priority, status, created_at')
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'surfaced'])
    .order('priority', { ascending: false })
    .limit(5);

  if (error || !data) return [];

  return (data as Array<{
    id: string;
    trigger_type: string;
    entity_type: string;
    entity_id: string;
    title: string;
    context: Record<string, unknown> | null;
    priority: number;
    status: string;
    created_at: string;
  }>).map((r) => {
    const ctx = (r.context ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      triggerType: r.trigger_type,
      entityType: r.entity_type,
      entityId: r.entity_id,
      title: r.title,
      context: ctx,
      priority: r.priority,
      suggestedAction: (ctx.suggestedAction as string | undefined) ?? null,
      href: (ctx.href as string | undefined) ?? null,
      urgency: (ctx.urgency as 'high' | 'medium' | 'low' | undefined) ?? 'low',
      status: r.status,
      createdAt: r.created_at,
    };
  });
}
