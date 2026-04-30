'use server';

import { createClient } from '@/shared/api/supabase/server';

// =============================================================================
// Types
// =============================================================================

export type AionInsight = {
  id: string;
  triggerType: string;
  entityType: string;
  entityId: string;
  title: string;
  context: Record<string, unknown>;
  priority: number;
  suggestedAction: string | null;
  href: string | null;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  createdAt: string;
};

// =============================================================================
// Get pending insights for a workspace (ordered by priority desc)
// =============================================================================

export async function getPendingInsights(
  workspaceId: string,
  limit = 10,
): Promise<AionInsight[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .schema('cortex')
    .from('aion_insights')
    .select('id, trigger_type, entity_type, entity_id, title, context, priority, status, created_at')
    .eq('workspace_id', workspaceId)
    .in('status', ['pending', 'surfaced'])
    .order('priority', { ascending: false })
    .limit(limit);

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

// =============================================================================
// Dismiss an insight
// =============================================================================

export async function dismissInsight(
  insightId: string,
): Promise<{ success: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };

  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { data } = await system.schema('cortex').rpc('dismiss_aion_insight', {
      p_insight_id: insightId,
    });
    return { success: !!data };
  } catch {
    return { success: false };
  }
}

// =============================================================================
// Mark insights as surfaced (shown in greeting)
// =============================================================================

// AUTHZ-OK: low-impact UI state flip (pending→surfaced one-way; the column
// is read-gated by RLS so an attacker can't see what got flipped). TODO:
// add getUser() + workspace filter as defense-in-depth — not urgent given
// the impact ceiling is "user marks insights they couldn't read as already
// shown."
export async function markInsightsSurfaced(
  insightIds: string[],
): Promise<void> {
  if (insightIds.length === 0) return;

  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();

    await system
      .schema('cortex')
      .from('aion_insights')
      .update({ status: 'surfaced' })
      .in('id', insightIds)
      .eq('status', 'pending');
  } catch (err) {
    console.error('[aion-insights] Failed to mark insights as surfaced:', err);
  }
}
