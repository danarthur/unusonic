'use server';

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getSystemClient } from '@/shared/api/supabase/system';

// Re-export so consumers don't need to import from the actions file directly
export type { AionInsight } from '@/app/(dashboard)/(features)/aion/actions/aion-insight-actions';
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
 */
export async function getBriefAndInsights(): Promise<BriefAndInsights> {
  const workspaceId = await getActiveWorkspaceId();
  console.log('[brief-debug] workspaceId:', workspaceId);
  if (!workspaceId) return { brief: null, insights: [], workspaceId: null };

  // Fetch independently so one failure doesn't take down both
  const [brief, insights] = await Promise.all([
    fetchBrief(workspaceId).catch((e) => { console.error('[brief-debug] fetchBrief error:', e); return null; }),
    fetchInsights(workspaceId).catch((e) => { console.error('[brief-debug] fetchInsights error:', e); return []; }),
  ]);

  console.log('[brief-debug] brief:', brief ? 'found' : 'null', 'insights:', insights.length);
  return { brief, insights, workspaceId };
}

// ── Internal ────────────────────────────────────────────────────────────────

async function fetchBrief(workspaceId: string): Promise<BriefData | null> {
  const system = getSystemClient();

  const { data, error } = await (system as any)
    .schema('ops')
    .from('daily_briefings')
    .select('body, facts_json, generated_at')
    .eq('workspace_id', workspaceId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('[brief-debug] fetchBrief result:', { data, error: error?.message ?? null });
  if (error || !data) return null;

  const row = data as { body: string; facts_json: Record<string, unknown>; generated_at: string };
  if (!row.body) return null;

  return { body: row.body, factsJson: row.facts_json, generatedAt: row.generated_at };
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

  console.log('[brief-debug] fetchInsights result:', { count: data?.length ?? 0, error: error?.message ?? null });
  if (error || !data) return [];

  return (data as any[]).map((r) => {
    const ctx = r.context ?? {};
    return {
      id: r.id,
      triggerType: r.trigger_type,
      entityType: r.entity_type,
      entityId: r.entity_id,
      title: r.title,
      context: ctx,
      priority: r.priority,
      suggestedAction: ctx.suggestedAction ?? null,
      href: ctx.href ?? null,
      urgency: ctx.urgency ?? 'low',
      status: r.status,
      createdAt: r.created_at,
    };
  });
}
